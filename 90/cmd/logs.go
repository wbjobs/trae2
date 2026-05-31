package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	logsGroup  string
	logsServer string
	logsLines  int
	logsFollow bool
	logsOutput string
	logsTail   bool
)

var logsCmd = &cobra.Command{
	Use:   "logs",
	Short: "日志拉取模块",
	Long:  `拉取远程服务器日志文件`,
}

var logsFetchCmd = &cobra.Command{
	Use:   "fetch",
	Short: "拉取远程日志",
	Long:  `从远程服务器拉取日志文件内容`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runLogsFetch,
}

var logsDownloadCmd = &cobra.Command{
	Use:   "download",
	Short: "下载日志文件",
	Long:  `下载远程服务器日志文件到本地，支持进度显示`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runLogsDownload,
}

var logsGrepCmd = &cobra.Command{
	Use:   "grep",
	Short: "搜索日志内容",
	Long:  `在远程日志文件中搜索指定内容`,
	Args:  cobra.MinimumNArgs(2),
	Run:   runLogsGrep,
}

func init() {
	rootCmd.AddCommand(logsCmd)
	logsCmd.AddCommand(logsFetchCmd)
	logsCmd.AddCommand(logsDownloadCmd)
	logsCmd.AddCommand(logsGrepCmd)

	logsFetchCmd.Flags().StringVarP(&logsGroup, "group", "g", "", "指定服务器组")
	logsFetchCmd.Flags().StringVarP(&logsServer, "server", "s", "", "指定服务器名称")
	logsFetchCmd.Flags().IntVarP(&logsLines, "lines", "n", 100, "显示行数")
	logsFetchCmd.Flags().BoolVarP(&logsFollow, "follow", "f", false, "实时跟踪日志")
	logsFetchCmd.Flags().BoolVarP(&logsTail, "tail", "t", true, "使用tail方式读取")

	logsDownloadCmd.Flags().StringVarP(&logsGroup, "group", "g", "", "指定服务器组")
	logsDownloadCmd.Flags().StringVarP(&logsServer, "server", "s", "", "指定服务器名称")
	logsDownloadCmd.Flags().StringVarP(&logsOutput, "output", "o", "./logs", "输出目录")

	logsGrepCmd.Flags().StringVarP(&logsGroup, "group", "g", "", "指定服务器组")
	logsGrepCmd.Flags().StringVarP(&logsServer, "server", "s", "", "指定服务器名称")
	logsGrepCmd.Flags().IntVarP(&logsLines, "lines", "n", 5, "匹配前后行数")
}

func runLogsFetch(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	logPath := args[0]

	var servers []config.Server
	if logsServer != "" {
		server := config.GetServerByName(logsServer)
		if server == nil {
			color.Red("未找到服务器: %s\n", logsServer)
			return
		}
		servers = []config.Server{*server}
	} else {
		servers = config.GetServersByGroup(logsGroup)
	}

	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	for _, server := range servers {
		color.Cyan("\n=== %s [%s] - %s ===\n", server.Name, server.Host, logPath)

		client, err := ssh.GetOrCreateClient(server)
		if err != nil {
			color.Red("连接失败: %v\n", err)
			continue
		}

		if logsFollow {
			streamLogs(client, logPath, logsLines)
		} else {
			opts := ssh.ExecOptions{
				Timeout:    60 * time.Second,
				MaxRetries: 1,
				RetryDelay: 1 * time.Second,
			}

			var tailCmd string
			if logsTail {
				tailCmd = fmt.Sprintf("tail -n %d %s 2>&1", logsLines, logPath)
			} else {
				tailCmd = fmt.Sprintf("cat %s 2>&1 | head -n %d", logPath, logsLines)
			}

			result := client.ExecuteWithOptions(tailCmd, opts)
			if result.Error != nil {
				color.Red("执行失败: %v\n", result.Error)
			} else {
				if result.Stdout != "" {
					fmt.Print(result.Stdout)
				}
				if result.Stderr != "" {
					color.Yellow(result.Stderr)
				}
			}
		}
	}

	ssh.CloseAllClients()
}

func streamLogs(client *ssh.SSHClient, logPath string, lines int) {
	color.Yellow("实时跟踪模式: 按 Ctrl+C 退出\n")

	stdoutChan := make(chan string, 100)
	stderrChan := make(chan string, 100)
	doneChan := make(chan error, 1)

	cmd := fmt.Sprintf("tail -f -n %d %s 2>&1", lines, logPath)

	go client.StreamExecute(cmd, stdoutChan, stderrChan, doneChan)

	for {
		select {
		case data, ok := <-stdoutChan:
			if !ok {
				stdoutChan = nil
				continue
			}
			fmt.Print(data)
		case data, ok := <-stderrChan:
			if !ok {
				stderrChan = nil
				continue
			}
			color.Yellow(data)
		case err, ok := <-doneChan:
			if ok && err != nil {
				color.Red("\n连接中断: %v\n", err)
			}
			return
		}
	}
}

func runLogsDownload(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	logPath := args[0]

	var servers []config.Server
	if logsServer != "" {
		server := config.GetServerByName(logsServer)
		if server == nil {
			color.Red("未找到服务器: %s\n", logsServer)
			return
		}
		servers = []config.Server{*server}
	} else {
		servers = config.GetServersByGroup(logsGroup)
	}

	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	if err := os.MkdirAll(logsOutput, 0755); err != nil {
		color.Red("创建输出目录失败: %v\n", err)
		return
	}

	color.Cyan("开始下载日志文件: %s\n", logPath)
	color.Cyan("输出目录: %s\n\n", logsOutput)

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 3)

	for _, server := range servers {
		wg.Add(1)
		go func(s config.Server) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			downloadLogWithProgress(s, logPath)
		}(server)
	}

	wg.Wait()
	ssh.CloseAllClients()
	color.Cyan("\n下载完成\n")
}

func downloadLogWithProgress(server config.Server, logPath string) {
	client, err := ssh.GetOrCreateClient(server)
	if err != nil {
		color.Red("[%s] 连接失败: %v\n", server.Name, err)
		return
	}

	sizeResult := client.Execute(fmt.Sprintf("stat -c %%s %s 2>/dev/null", logPath))
	var fileSize int64 = -1
	if sizeResult.Error == nil {
		sizeStr := strings.TrimSpace(sizeResult.Stdout)
		if size, err := parseInt64(sizeStr); err == nil {
			fileSize = size
		}
	}

	timestamp := time.Now().Format("20060102-150405")
	fileName := fmt.Sprintf("%s_%s_%s", server.Name, timestamp, filepath.Base(logPath))
	localPath := filepath.Join(logsOutput, fileName)

	progressChan := make(chan int64, 10)
	errChan := make(chan error, 1)

	go func() {
		errChan <- client.DownloadFileWithProgress(logPath, localPath, progressChan)
	}()

	var lastProgress int64
	lastUpdate := time.Now()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case progress, ok := <-progressChan:
			if !ok {
				continue
			}
			now := time.Now()
			if now.Sub(lastUpdate) > 500*time.Millisecond || progress == fileSize {
				printProgress(server.Name, progress, fileSize)
				lastProgress = progress
				lastUpdate = now
			}
		case err := <-errChan:
			if err != nil {
				color.Red("\n[%s] 下载失败: %v\n", server.Name, err)
			} else {
				color.Green("\n[%s] 下载成功: %s", server.Name, localPath)
				if fileSize > 0 {
					color.Green(" (%s)", formatSize(fileSize))
				}
				fmt.Println()
			}
			return
		case <-ticker.C:
		}
	}
}

func printProgress(serverName string, current, total int64) {
	var percent float64
	if total > 0 {
		percent = float64(current) / float64(total) * 100
		fmt.Printf("\r[%s] 下载进度: %s / %s (%.1f%%)",
			serverName, formatSize(current), formatSize(total), percent)
	} else {
		fmt.Printf("\r[%s] 下载进度: %s", serverName, formatSize(current))
	}
}

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func parseInt64(s string) (int64, error) {
	var result int64
	_, err := fmt.Sscanf(s, "%d", &result)
	return result, err
}

func runLogsGrep(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	pattern := args[0]
	logPath := args[1]

	var servers []config.Server
	if logsServer != "" {
		server := config.GetServerByName(logsServer)
		if server == nil {
			color.Red("未找到服务器: %s\n", logsServer)
			return
		}
		servers = []config.Server{*server}
	} else {
		servers = config.GetServersByGroup(logsGroup)
	}

	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	color.Cyan("在日志中搜索: %s\n\n", pattern)

	for _, server := range servers {
		color.Cyan("=== %s [%s] ===\n", server.Name, server.Host)

		client, err := ssh.GetOrCreateClient(server)
		if err != nil {
			color.Red("连接失败: %v\n", err)
			continue
		}

		opts := ssh.ExecOptions{
			Timeout:    120 * time.Second,
			MaxRetries: 1,
			RetryDelay: 1 * time.Second,
		}

		grepCmd := fmt.Sprintf("grep -n -C %d '%s' %s 2>&1 | head -n 200", logsLines, pattern, logPath)
		result := client.ExecuteWithOptions(grepCmd, opts)

		if result.Error != nil && result.ExitCode != 1 {
			color.Red("搜索失败: %v\n", result.Error)
		} else if result.Stdout != "" {
			fmt.Print(result.Stdout)
			if strings.Count(result.Stdout, "\n") >= 199 {
				color.Yellow("\n... 结果过多，已截断\n")
			}
		} else {
			color.Yellow("未找到匹配内容\n")
		}

		if result.Stderr != "" {
			color.Red(result.Stderr)
		}

		fmt.Println()
	}

	ssh.CloseAllClients()
}
