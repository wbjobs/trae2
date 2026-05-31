package ssh

import (
	"cluster-ops-tool/pkg/config"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHClient struct {
	Server config.Server
	Client *ssh.Client
	mu     sync.Mutex
}

type ExecResult struct {
	ServerName string
	Host       string
	Command    string
	Stdout     string
	Stderr     string
	ExitCode   int
	Error      error
	Duration   time.Duration
	RetryCount int
}

type ExecOptions struct {
	Timeout         time.Duration
	MaxRetries      int
	RetryDelay      time.Duration
	ReconnectDelay  time.Duration
	MaxReconnects   int
	AutoReconnect   bool
}

var (
	DefaultExecOptions = ExecOptions{
		Timeout:         300 * time.Second,
		MaxRetries:      3,
		RetryDelay:      2 * time.Second,
		ReconnectDelay:  2 * time.Second,
		MaxReconnects:   5,
	}
	clientPool     = make(map[string]*SSHClient)
	clientPoolInfo = make(map[string]*ClientInfo)
	poolMu         sync.Mutex
)

type ClientInfo struct {
	ConnectedAt  time.Time
	LastUsedAt   time.Time
	Reconnects   int
	Failures     int
	MaxIdleTime  time.Duration
}

func connectionMonitor() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		poolMu.Lock()
		now := time.Now()
		for key, info := range clientPoolInfo {
			if now.Sub(info.LastUsedAt) > info.MaxIdleTime {
				if client, ok := clientPool[key]; ok {
					client.Close()
					delete(clientPool, key)
				}
				delete(clientPoolInfo, key)
			}
		}
		poolMu.Unlock()
	}
}

func init() {
	go connectionMonitor()
}

func GetConnectionStats() map[string]interface{} {
	poolMu.Lock()
	defer poolMu.Unlock()

	stats := make(map[string]interface{})
	stats["total_connections"] = len(clientPool)

	connStats := make([]map[string]interface{}, 0)
	for key, info := range clientPoolInfo {
		connStats = append(connStats, map[string]interface{
			"address":      key,
			"connected_at": info.ConnectedAt,
			"last_used":    info.LastUsedAt,
			"reconnects":   info.Reconnects,
			"failures":     info.Failures,
			"idle_seconds": time.Since(info.LastUsedAt).Seconds(),
		})
	}
	stats["connections"] = connStats

	return stats
}

func NewSSHClientWithTimeout(server config.Server, timeout time.Duration) (*SSHClient, error) {
	var authMethod ssh.AuthMethod
	var err error

	if server.KeyFile != "" {
		authMethod, err = getKeyAuth(server.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("读取密钥文件失败: %v", err)
		}
	} else if server.Password != "" {
		authMethod = ssh.Password(server.Password)
	} else {
		return nil, fmt.Errorf("未提供认证方式")
	}

	config := &ssh.ClientConfig{
		User:            server.User,
		Auth:            []ssh.AuthMethod{authMethod},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         timeout,
	}

	addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, err
	}

	return &SSHClient{
		Server: server,
		Client: client,
	}, nil
}

func NewSSHClient(server config.Server) (*SSHClient, error) {
	return NewSSHClientWithTimeout(server, 30*time.Second)
}

func GetOrCreateClient(server config.Server) (*SSHClient, error) {
	return GetOrCreateClientWithOptions(server, 5, 2*time.Second)
}

func GetOrCreateClientWithOptions(server config.Server, maxReconnects int, reconnectDelay time.Duration) (*SSHClient, error) {
	poolMu.Lock()
	defer poolMu.Unlock()

	key := fmt.Sprintf("%s:%d", server.Host, server.Port)

	if client, ok := clientPool[key]; ok {
		if err := client.Ping(); err == nil {
			if info, ok := clientPoolInfo[key]; ok {
				info.LastUsedAt = time.Now()
			}
			return client, nil
		}

		info := clientPoolInfo[key]
		if info != nil && info.Reconnects < maxReconnects {
			info.Reconnects++
			info.Failures++
			poolMu.Unlock()
			time.Sleep(reconnectDelay)
			poolMu.Lock()

			newClient, err := NewSSHClientWithTimeout(server, 30*time.Second)
			if err == nil {
				client.Close()
				clientPool[key] = newClient
				info.ConnectedAt = time.Now()
				info.LastUsedAt = time.Now()
				return newClient, nil
			}
		}

		client.Close()
		delete(clientPool, key)
		delete(clientPoolInfo, key)
	}

	client, err := NewSSHClientWithTimeout(server, 30*time.Second)
	if err != nil {
		return nil, err
	}

	clientPool[key] = client
	clientPoolInfo[key] = &ClientInfo{
		ConnectedAt: time.Now(),
		LastUsedAt:  time.Now(),
		MaxIdleTime: 30 * time.Minute,
	}

	return client, nil
}

func (c *SSHClient) Ping() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, err := c.Client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	return session.Run("echo ping")
}

func getKeyAuth(keyFile string) (ssh.AuthMethod, error) {
	key, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, err
	}

	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, err
	}

	return ssh.PublicKeys(signer), nil
}

func (c *SSHClient) ExecuteWithOptions(cmd string, opts ExecOptions) *ExecResult {
	c.mu.Lock()
	defer c.mu.Unlock()

	start := time.Now()
	result := &ExecResult{
		ServerName: c.Server.Name,
		Host:       c.Server.Host,
		Command:    cmd,
	}

	var lastErr error
	for retry := 0; retry <= opts.MaxRetries; retry++ {
		result.RetryCount = retry

		session, err := c.Client.NewSession()
		if err != nil {
			lastErr = err
			if retry < opts.MaxRetries {
				time.Sleep(opts.RetryDelay)
				continue
			}
			result.Error = fmt.Errorf("创建会话失败(重试%d次): %v", retry, err)
			result.Duration = time.Since(start)
			return result
		}

		ctx, cancel := context.WithTimeout(context.Background(), opts.Timeout)
		defer cancel()

		done := make(chan struct{})
		var execErr error

		go func() {
			defer close(done)
			defer session.Close()

			stdout, err := session.StdoutPipe()
			if err != nil {
				execErr = err
				return
			}

			stderr, err := session.StderrPipe()
			if err != nil {
				execErr = err
				return
			}

			if err := session.Start(cmd); err != nil {
				execErr = err
				return
			}

			stdoutBytes, _ := io.ReadAll(stdout)
			stderrBytes, _ := io.ReadAll(stderr)

			result.Stdout = string(stdoutBytes)
			result.Stderr = string(stderrBytes)

			if err := session.Wait(); err != nil {
				if exitErr, ok := err.(*ssh.ExitError); ok {
					result.ExitCode = exitErr.ExitStatus()
				} else {
					execErr = err
				}
			}
		}()

		select {
		case <-done:
			if execErr == nil {
				result.Duration = time.Since(start)
				return result
			}
			lastErr = execErr
		case <-ctx.Done():
			session.Close()
			lastErr = fmt.Errorf("命令执行超时(%.0fs)", opts.Timeout.Seconds())
		}

		if retry < opts.MaxRetries {
			time.Sleep(opts.RetryDelay)
		}
	}

	result.Error = lastErr
	result.Duration = time.Since(start)
	return result
}

func (c *SSHClient) Execute(cmd string) *ExecResult {
	return c.ExecuteWithOptions(cmd, DefaultExecOptions)
}

func (c *SSHClient) StreamExecute(cmd string, stdoutChan, stderrChan chan<- string, doneChan chan<- error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, err := c.Client.NewSession()
	if err != nil {
		doneChan <- err
		return
	}
	defer session.Close()

	stdout, err := session.StdoutPipe()
	if err != nil {
		doneChan <- err
		return
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		doneChan <- err
		return
	}

	if err := session.Start(cmd); err != nil {
		doneChan <- err
		return
	}

	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				stdoutChan <- string(buf[:n])
			}
			if err != nil {
				break
			}
		}
	}()

	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stderr.Read(buf)
			if n > 0 {
				stderrChan <- string(buf[:n])
			}
			if err != nil {
				break
			}
		}
	}()

	err = session.Wait()
	doneChan <- err
}

func (c *SSHClient) DownloadFileWithProgress(remotePath, localPath string, progressChan chan<- int64) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, err := c.Client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	sizeResult := c.Execute(fmt.Sprintf("stat -c %%s %s 2>/dev/null || wc -c < %s", remotePath, remotePath))
	if sizeResult.Error != nil {
		return fmt.Errorf("获取文件大小失败: %v", sizeResult.Error)
	}

	reader, err := session.StdoutPipe()
	if err != nil {
		return err
	}

	if err := session.Start(fmt.Sprintf("cat %s", remotePath)); err != nil {
		return err
	}

	if err := os.MkdirAll(localPath[:len(localPath)-len(filepath.Base(localPath))], 0755); err != nil {
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer localFile.Close()

	buf := make([]byte, 64*1024)
	var total int64

	for {
		n, err := reader.Read(buf)
		if n > 0 {
			if _, err := localFile.Write(buf[:n]); err != nil {
				return err
			}
			total += int64(n)
			if progressChan != nil {
				progressChan <- total
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	return session.Wait()
}

func (c *SSHClient) DownloadFile(remotePath, localPath string) error {
	return c.DownloadFileWithProgress(remotePath, localPath, nil)
}

func (c *SSHClient) Close() error {
	poolMu.Lock()
	key := fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
	delete(clientPool, key)
	poolMu.Unlock()

	if c.Client != nil {
		return c.Client.Close()
	}
	return nil
}

func CloseAllClients() {
	poolMu.Lock()
	defer poolMu.Unlock()

	for key, client := range clientPool {
		client.Close()
		delete(clientPool, key)
	}
}

func ConnectAndExecute(server config.Server, cmd string) *ExecResult {
	return ConnectAndExecuteWithOptions(server, cmd, DefaultExecOptions)
}

func ConnectAndExecuteWithOptions(server config.Server, cmd string, opts ExecOptions) *ExecResult {
	var lastErr error
	var lastResult *ExecResult

	for attempt := 0; attempt <= opts.MaxReconnects; attempt++ {
		client, err := GetOrCreateClientWithOptions(server, opts.MaxReconnects, opts.ReconnectDelay)
		if err != nil {
			lastErr = err
			if attempt < opts.MaxReconnects {
				time.Sleep(opts.ReconnectDelay)
				continue
			}
			return &ExecResult{
				ServerName: server.Name,
				Host:       server.Host,
				Command:    cmd,
				Error:      fmt.Errorf("连接失败(重试%d次): %v", attempt, err),
				RetryCount: attempt,
			}
		}

		result := client.ExecuteWithOptions(cmd, opts)
		if result.Error == nil || !opts.AutoReconnect {
			return result
		}

		lastResult = result
		lastErr = result.Error

		if attempt < opts.MaxReconnects {
			time.Sleep(opts.ReconnectDelay)
		}
	}

	if lastResult != nil {
		return lastResult
	}

	return &ExecResult{
		ServerName: server.Name,
		Host:       server.Host,
		Command:    cmd,
		Error:      lastErr,
		RetryCount: opts.MaxReconnects,
	}
}

func BatchExecute(servers []config.Server, cmd string, opts ExecOptions, concurrency int, progressCallback func(current, total int, result *ExecResult)) ([]*ExecResult, int, int) {
	semaphore := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex

	results := make([]*ExecResult, 0, len(servers))
	successCount := 0
	failCount := 0
	current := 0

	for _, server := range servers {
		wg.Add(1)
		go func(s config.Server) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			result := ConnectAndExecuteWithOptions(s, cmd, opts)

			mu.Lock()
			current++
			results = append(results, result)
			if result.Error == nil {
				successCount++
			} else {
				failCount++
			}
			if progressCallback != nil {
				progressCallback(current, len(servers), result)
			}
			mu.Unlock()
		}(server)
	}

	wg.Wait()
	return results, successCount, failCount
}
