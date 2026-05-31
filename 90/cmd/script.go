package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"cluster-ops-tool/pkg/storage"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	scriptFile   string
	scriptPath   string
	scriptConcurrency int
	scriptTimeout int
	scriptSave bool
	scriptEnv string
	scriptVars string
)

type ScriptStep struct {
	Name    string   `yaml:"name"`
	Command string   `yaml:"command"`
	Desc    string   `yaml:"desc"`
	Timeout int      `yaml:"timeout"`
	Retry   int      `yaml:"retry"`
	Ignore  bool     `yaml:"ignore_error"`
	Env     []string `yaml:"env"`
}

type ScriptTask struct {
	Name        string       `yaml:"name"`
	Description string       `yaml:"description"`
	Group       string       `yaml:"group"`
	Servers     string       `yaml:"servers"`
	Concurrency int          `yaml:"concurrency"`
	Timeout     int          `yaml:"timeout"`
	Steps       []ScriptStep `yaml:"steps"`
}

var scriptCmd = &cobra.Command{
	Use:   "script",
	Short: "运维指令脚本批量执行",
	Long:  `从YAML脚本文件中定义的运维指令，支持多步骤批量执行`,
}

var scriptRunCmd = &cobra.Command{
	Use:   "run",
	Short: "执行运维脚本",
	Long:  `执行YAML格式定义的运维脚本`,
	Run:   runScriptRun,
}

var scriptUploadCmd = &cobra.Command{
	Use:   "upload",
	Short: "上传脚本到远程服务器",
	Long:  `上传本地脚本文件到远程服务器`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runScriptUpload,
}

var scriptExampleCmd = &cobra.Command{
	Use:   "example",
	Short: "生成示例脚本",
	Long:  `生成YAML格式的示例运维脚本`,
	Run:   runScriptExample,
}

func init() {
	rootCmd.AddCommand(scriptCmd)
	scriptCmd.AddCommand(scriptRunCmd)
	scriptCmd.AddCommand(scriptUploadCmd)
	scriptCmd.AddCommand(scriptExampleCmd)

	scriptRunCmd.Flags().StringVarP(&scriptFile, "file", "f", "", "脚本文件路径")
	scriptRunCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组，覆盖脚本配置")
	scriptRunCmd.Flags().StringVarP(&groupServers, "servers", "s", "", "指定服务器，覆盖脚本配置")
	scriptRunCmd.Flags().IntVarP(&scriptConcurrency, "concurrency", "n", 0, "并发数，覆盖脚本配置")
	scriptRunCmd.Flags().IntVarP(&scriptTimeout, "timeout", "t", 0, "超时时间，覆盖脚本配置")
	scriptRunCmd.Flags().BoolVarP(&scriptSave, "save", "S", true, "保存执行结果")
	scriptRunCmd.Flags().StringVarP(&scriptEnv, "env", "e", "", "环境变量，多个用逗号分隔")
	scriptRunCmd.Flags().StringVarP(&scriptVars, "vars", "v", "", "变量替换，格式: key1=val1,key2=val2")

	scriptUploadCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组")
	scriptUploadCmd.Flags().StringVarP(&groupServers, "servers", "s", "", "指定服务器名称")
	scriptUploadCmd.Flags().StringVarP(&scriptPath, "remote-path", "p", "/tmp", "远程目标路径")
}

func runScriptRun(cmd *cobra.Command, args []string) {
	if scriptFile == "" {
		color.Red("请指定脚本文件路径: -f script.yaml\n")
		return
	}

	data, err := os.ReadFile(scriptFile)
	if err != nil {
		color.Red("读取脚本文件失败: %v\n", err)
		return
	}

	var task ScriptTask
	if err := yaml.Unmarshal(data, &task); err != nil {
		color.Red("解析脚本失败: %v\n", err)
		return
	}

	targetGroup := task.Group
	if groupName != "" {
		targetGroup = groupName
	}

	targetServers := task.Servers
	if groupServers != "" {
		targetServers = groupServers
	}

	servers, err := getTargetServers(targetGroup, targetServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	concurrency := task.Concurrency
	if scriptConcurrency > 0 {
		concurrency = scriptConcurrency
	}
	if concurrency == 0 {
		concurrency = 5
	}

	globalTimeout := task.Timeout
	if scriptTimeout > 0 {
		globalTimeout = scriptTimeout
	}
	if globalTimeout == 0 {
		globalTimeout = 300
	}

	scriptVars := parseScriptVars(scriptVars)

	color.Cyan("执行脚本: %s\n", task.Name)
	if task.Description != "" {
		color.Cyan("描述: %s\n", task.Description)
	}
	color.Cyan("目标服务器: %d 台\n", len(servers))
	color.Cyan("并发数: %d, 全局超时: %ds\n\n", concurrency, globalTimeout)
	color.Cyan("执行步骤: %d 个\n\n", len(task.Steps))

	batchID := storage.GenerateID()
	startTime := time.Now()

	allRecords := make([]storage.ExecRecord, 0)
	successCount := 0
	failCount := 0

	for stepIdx, step := range task.Steps {
		color.Cyan("\n[步骤 %d/%d] %s\n", stepIdx+1, len(task.Steps), step.Name)
		if step.Desc != "" {
			color.Cyan("  描述: %s\n", step.Desc)
		}

		command := replaceVars(step.Command, scriptVars)

		timeout := step.Timeout
		if timeout == 0 {
			timeout = globalTimeout
		}

		retry := step.Retry
		if retry == 0 {
			retry = 1
		}

		opts := ssh.ExecOptions{
			Timeout:        time.Duration(timeout) * time.Second,
			MaxRetries:     retry,
			RetryDelay:     2 * time.Second,
			ReconnectDelay: 2 * time.Second,
			MaxReconnects:  3,
			AutoReconnect:  true,
		}

		stepStart := time.Now()
		results, stepSuccess, stepFail := ssh.BatchExecute(servers, command, opts, concurrency,
			func(current, total int, result *ssh.ExecResult) {
				color.Cyan("  [%d/%d] %s [%s] ", current, total, result.ServerName, result.Host)
				if result.Error != nil {
					color.Red("失败: %v\n", result.Error)
				} else {
					color.Green("成功 (%.2fs)\n", result.Duration.Seconds())
				}
			})

		color.Cyan("  步骤完成: 成功 %d, 失败 %d, 耗时 %.2fs\n", stepSuccess, stepFail, time.Since(stepStart).Seconds())

		serverMap := make(map[string]config.Server)
		for _, s := range servers {
			serverMap[s.Name] = s
		}

		for i, r := range results {
			errStr := ""
			if r.Error != nil {
				errStr = r.Error.Error()
			}
			record := storage.ExecRecord{
				ID:         fmt.Sprintf("%s_step%d_%d", batchID, stepIdx+1, i),
				Timestamp:  stepStart,
				Command:    r.Command,
				ServerName: r.ServerName,
				Host:       r.Host,
				Group:      serverMap[r.ServerName].Group,
				Stdout:     r.Stdout,
				Stderr:     r.Stderr,
				ExitCode:   r.ExitCode,
				Error:      errStr,
				Duration:   r.Duration.Seconds(),
				RetryCount: r.RetryCount,
				Success:    r.Error == nil,
			}
			allRecords = append(allRecords, record)

			if r.Error == nil {
				successCount++
			} else {
				failCount++
			}

			if r.Error != nil && !step.Ignore {
				color.Red("  步骤 %d 执行失败，终止脚本执行\n", stepIdx+1)
				saveScriptResult(batchID, task, servers, allRecords, successCount, failCount, startTime)
				return
			}
		}

		if len(results) > 0 && results[0].Stdout != "" {
			fmt.Printf("  输出示例:\n")
			lines := strings.Split(results[0].Stdout, "\n")
			for i := 0; i < len(lines) && i < 3; i++ {
				if lines[i] != "" {
					fmt.Printf("    %s\n", lines[i])
				}
			}
		}
	}

	ssh.CloseAllClients()

	color.Cyan("\n========================================\n")
	color.Cyan("脚本执行完成\n")
	color.Cyan("总步骤: %d\n", len(task.Steps))
	color.Cyan("成功: %d, 失败: %d\n", successCount, failCount)
	color.Cyan("总耗时: %.2fs\n", time.Since(startTime).Seconds())

	if scriptSave {
		saveScriptResult(batchID, task, servers, allRecords, successCount, failCount, startTime)
		color.Cyan("批次ID: %s\n", batchID)
	}
}

func parseScriptVars(varsStr string) map[string]string {
	vars := make(map[string]string)
	if varsStr == "" {
		return vars
	}

	pairs := strings.Split(varsStr, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 {
			vars[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}
	return vars
}

func replaceVars(s string, vars map[string]string) string {
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

func saveScriptResult(batchID string, task ScriptTask, servers []config.Server, records []storage.ExecRecord, success, failed int, startTime time.Time) {
	store := storage.DefaultStorage()

	batch := &storage.BatchRecord{
		BatchID:   batchID,
		Timestamp: startTime,
		Command:   task.Name,
		Group:     groupName,
		ServerCount: len(servers),
		Success:   success,
		Failed:    failed,
		Records:   records,
	}

	if err := store.SaveBatch(batch); err != nil {
		color.Red("保存结果失败: %v\n", err)
	}
}

func runScriptUpload(cmd *cobra.Command, args []string) {
	localPath := args[0]
	servers, err := getTargetServers(groupName, groupServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	fileInfo, err := os.Stat(localPath)
	if err != nil {
		color.Red("读取本地文件失败: %v\n", err)
		return
	}

	color.Cyan("上传文件: %s (%s) 到 %d 台服务器\n", localPath, formatSize(fileInfo.Size()), len(servers))

	for _, server := range servers {
		color.Cyan("\n=== %s [%s] ===\n", server.Name, server.Host)

		client, err := ssh.GetOrCreateClient(server)
		if err != nil {
			color.Red("连接失败: %v\n", err)
			continue
		}

		data, err := os.Open(localPath)
		if err != nil {
			color.Red("读取文件失败: %v\n", err)
			client.Close()
			continue
		}

		fileContent, err := io.ReadAll(data)
		data.Close()
		if err != nil {
			color.Red("读取文件失败: %v\n", err)
			client.Close()
			continue
		}

		encoded := base64.StdEncoding.EncodeToString(fileContent)
		remoteFile := filepath.Join(scriptPath, filepath.Base(localPath))

		uploadCmd := fmt.Sprintf("echo '%s' | base64 -d > %s && chmod +x %s", encoded, remoteFile, remoteFile)

		opts := ssh.ExecOptions{
			Timeout: 60 * time.Second,
			MaxRetries: 1,
		}

		result := client.ExecuteWithOptions(uploadCmd, opts)
		if result.Error != nil {
			color.Red("上传失败: %v\n", result.Error)
		} else {
			color.Green("上传成功: %s\n", remoteFile)
		}

		client.Close()
	}

	ssh.CloseAllClients()
}

func runScriptExample(cmd *cobra.Command, args []string) {
	example := `name: 服务器健康检查脚本
description: 批量检查服务器健康状态
group: web
servers: ""
concurrency: 5
timeout: 300

steps:
  - name: 检查磁盘空间
    desc: 检查根分区磁盘使用率
    command: df -h / | awk 'NR==2 {print $5}'
    timeout: 30
    retry: 1
    ignore_error: false

  - name: 检查内存使用
    desc: 检查内存使用率
    command: free -m | awk 'NR==2 {printf "%.1f%%\n", $3/$2*100}'
    timeout: 10

  - name: 检查CPU负载
    desc: 检查1分钟平均负载
    command: cat /proc/loadavg | awk '{print $1}'
    timeout: 10

  - name: 检查服务状态
    desc: 检查Nginx服务是否运行
    command: systemctl is-active nginx || echo "not running"
    timeout: 10
    ignore_error: true

  - name: 检查端口监听
    desc: 检查80端口是否监听
    command: ss -tlnp | grep :80 || echo "port 80 not listening"
    timeout: 10
    ignore_error: true
`

	fmt.Print(example)

	if err := os.WriteFile("example_script.yaml", []byte(example), 0644); err != nil {
		color.Red("保存示例文件失败: %v\n", err)
	} else {
		color.Green("\n示例脚本已保存为 example_script.yaml\n")
	}
}
