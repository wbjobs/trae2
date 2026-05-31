package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"cluster-ops-tool/pkg/storage"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	groupName      string
	groupServers   string
	groupTimeout   int
	groupRetries   int
	groupConcurrency int
	groupAutoReconnect bool
	groupSaveResult bool
)

var groupCmd = &cobra.Command{
	Use:   "group",
	Short: "节点分组批量操作",
	Long:  `按分组执行批量操作，支持指定分组或多分组并行执行`,
}

var groupListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出所有分组",
	Long:  `列出所有服务器分组及其包含的服务器`,
	Run:   runGroupList,
}

var groupExecCmd = &cobra.Command{
	Use:   "exec",
	Short: "按分组批量执行命令",
	Long:  `在指定分组的所有服务器上批量执行命令`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runGroupExec,
}

var groupRebootCmd = &cobra.Command{
	Use:   "reboot",
	Short: "按分组重启服务器",
	Long:  `重启指定分组的所有服务器`,
	Run:   runGroupReboot,
}

var groupShutdownCmd = &cobra.Command{
	Use:   "shutdown",
	Short: "按分组关闭服务器",
	Long:  `关闭指定分组的所有服务器`,
	Run:   runGroupShutdown,
}

var groupServiceCmd = &cobra.Command{
	Use:   "service",
	Short: "按分组管理服务",
	Long:  `管理指定分组服务器上的服务`,
	Args:  cobra.MinimumNArgs(2),
	Run:   runGroupService,
}

func init() {
	rootCmd.AddCommand(groupCmd)
	groupCmd.AddCommand(groupListCmd)
	groupCmd.AddCommand(groupExecCmd)
	groupCmd.AddCommand(groupRebootCmd)
	groupCmd.AddCommand(groupShutdownCmd)
	groupCmd.AddCommand(groupServiceCmd)

	groupExecCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组，多个用逗号分隔")
	groupExecCmd.Flags().StringVarP(&groupServers, "servers", "s", "", "指定服务器名称，多个用逗号分隔")
	groupExecCmd.Flags().IntVarP(&groupTimeout, "timeout", "t", 300, "命令超时时间(秒)")
	groupExecCmd.Flags().IntVarP(&groupRetries, "retries", "r", 3, "失败重试次数")
	groupExecCmd.Flags().IntVarP(&groupConcurrency, "concurrency", "n", 10, "并发数")
	groupExecCmd.Flags().BoolVarP(&groupAutoReconnect, "auto-reconnect", "a", true, "自动重连")
	groupExecCmd.Flags().BoolVarP(&groupSaveResult, "save", "S", true, "保存执行结果")

	groupRebootCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组")
	groupRebootCmd.Flags().IntVarP(&groupTimeout, "timeout", "t", 60, "超时时间(秒)")
	groupRebootCmd.Flags().IntVarP(&groupConcurrency, "concurrency", "n", 5, "并发数")
	groupRebootCmd.Flags().BoolVarP(&groupSaveResult, "save", "S", true, "保存执行结果")

	groupShutdownCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组")
	groupShutdownCmd.Flags().IntVarP(&groupTimeout, "timeout", "t", 60, "超时时间(秒)")
	groupShutdownCmd.Flags().IntVarP(&groupConcurrency, "concurrency", "n", 5, "并发数")
	groupShutdownCmd.Flags().BoolVarP(&groupSaveResult, "save", "S", true, "保存执行结果")

	groupServiceCmd.Flags().StringVarP(&groupName, "group", "g", "", "指定服务器组")
	groupServiceCmd.Flags().StringVarP(&groupServers, "servers", "s", "", "指定服务器名称")
	groupServiceCmd.Flags().IntVarP(&groupTimeout, "timeout", "t", 60, "超时时间(秒)")
	groupServiceCmd.Flags().IntVarP(&groupConcurrency, "concurrency", "n", 10, "并发数")
	groupServiceCmd.Flags().BoolVarP(&groupSaveResult, "save", "S", true, "保存执行结果")
}

func runGroupList(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	groupMap := make(map[string][]config.Server)
	for _, s := range config.GlobalConfig.Servers {
		groupMap[s.Group] = append(groupMap[s.Group], s)
	}

	color.Cyan("%-15s %-10s %s\n", "分组", "服务器数", "服务器列表")
	color.Cyan(strings.Repeat("-", 80))

	groupNames := make([]string, 0, len(groupMap))
	for name := range groupMap {
		groupNames = append(groupNames, name)
	}
	sort.Strings(groupNames)

	for _, name := range groupNames {
		servers := groupMap[name]
		serverNames := make([]string, len(servers))
		for i, s := range servers {
			serverNames[i] = fmt.Sprintf("%s(%s)", s.Name, s.Host)
		}
		fmt.Printf("%-15s %-10d %s\n", name, len(servers), strings.Join(serverNames, ", "))
	}

	color.Cyan("\n共 %d 个分组, %d 台服务器\n", len(groupMap), len(config.GlobalConfig.Servers))
}

func runGroupExec(cmd *cobra.Command, args []string) {
	servers, err := getTargetServers(groupName, groupServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	command := strings.Join(args, " ")

	opts := ssh.ExecOptions{
		Timeout:        time.Duration(groupTimeout) * time.Second,
		MaxRetries:     groupRetries,
		RetryDelay:     2 * time.Second,
		ReconnectDelay: 2 * time.Second,
		MaxReconnects:  3,
		AutoReconnect:  groupAutoReconnect,
	}

	executeBatchCommand(servers, command, opts, groupConcurrency, groupSaveResult, groupName)
}

func runGroupReboot(cmd *cobra.Command, args []string) {
	servers, err := getTargetServers(groupName, groupServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	color.Yellow("警告: 即将重启 %d 台服务器，请确认！\n", len(servers))
	color.Yellow("按 Ctrl+C 取消，5 秒后继续...\n")
	time.Sleep(5 * time.Second)

	opts := ssh.ExecOptions{
		Timeout:        time.Duration(groupTimeout) * time.Second,
		MaxRetries:     0,
		RetryDelay:     2 * time.Second,
		ReconnectDelay: 2 * time.Second,
		MaxReconnects:  1,
		AutoReconnect:  false,
	}

	executeBatchCommand(servers, "reboot", opts, groupConcurrency, groupSaveResult, groupName)
}

func runGroupShutdown(cmd *cobra.Command, args []string) {
	servers, err := getTargetServers(groupName, groupServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	color.Red("警告: 即将关闭 %d 台服务器，此操作不可恢复！\n", len(servers))
	color.Red("按 Ctrl+C 取消，10 秒后继续...\n")
	time.Sleep(10 * time.Second)

	opts := ssh.ExecOptions{
		Timeout:        time.Duration(groupTimeout) * time.Second,
		MaxRetries:     0,
		RetryDelay:     2 * time.Second,
		ReconnectDelay: 2 * time.Second,
		MaxReconnects:  1,
		AutoReconnect:  false,
	}

	executeBatchCommand(servers, "shutdown now", opts, groupConcurrency, groupSaveResult, groupName)
}

func runGroupService(cmd *cobra.Command, args []string) {
	action := args[0]
	serviceName := args[1]

	servers, err := getTargetServers(groupName, groupServers)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	validActions := map[string]bool{"start": true, "stop": true, "restart": true, "status": true, "enable": true, "disable": true}
	if !validActions[action] {
		color.Red("不支持的操作: %s，支持的操作: start/stop/restart/status/enable/disable\n", action)
		return
	}

	var command string
	if action == "status" {
		command = fmt.Sprintf("systemctl status %s", serviceName)
	} else {
		command = fmt.Sprintf("systemctl %s %s", action, serviceName)
	}

	opts := ssh.ExecOptions{
		Timeout:        time.Duration(groupTimeout) * time.Second,
		MaxRetries:     1,
		RetryDelay:     2 * time.Second,
		ReconnectDelay: 2 * time.Second,
		MaxReconnects:  2,
		AutoReconnect:  true,
	}

	executeBatchCommand(servers, command, opts, groupConcurrency, groupSaveResult, groupName)
}

func getTargetServers(groupStr, serverStr string) ([]config.Server, error) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		return nil, fmt.Errorf("加载配置文件失败: %v", err)
	}

	var servers []config.Server

	if serverStr != "" {
		serverNames := strings.Split(serverStr, ",")
		for _, name := range serverNames {
			name = strings.TrimSpace(name)
			server := config.GetServerByName(name)
			if server == nil {
				color.Yellow("未找到服务器: %s\n", name)
				continue
			}
			servers = append(servers, *server)
		}
	} else if groupStr != "" {
		groupNames := strings.Split(groupStr, ",")
		for _, g := range groupNames {
			g = strings.TrimSpace(g)
			groupServers := config.GetServersByGroup(g)
			if len(groupServers) == 0 {
				color.Yellow("未找到分组: %s\n", g)
				continue
			}
			servers = append(servers, groupServers...)
		}
	} else {
		return nil, fmt.Errorf("请指定分组 (-g) 或服务器 (-s)")
	}

	if len(servers) == 0 {
		return nil, fmt.Errorf("未找到目标服务器")
	}

	return servers, nil
}

func executeBatchCommand(servers []config.Server, command string, opts ssh.ExecOptions, concurrency int, saveResult bool, groupName string) {
	color.Cyan("在 %d 台服务器上执行命令: %s\n", len(servers), command)
	color.Cyan("超时: %ds, 重试: %d, 并发: %d, 自动重连: %v\n\n",
		int(opts.Timeout.Seconds()), opts.MaxRetries, concurrency, opts.AutoReconnect)

	startTime := time.Now()
	batchID := storage.GenerateID()

	results, successCount, failCount := ssh.BatchExecute(servers, command, opts, concurrency,
		func(current, total int, result *ssh.ExecResult) {
			color.Cyan("[%d/%d] %s [%s] ", current, total, result.ServerName, result.Host)
			if result.Error != nil {
				color.Red("失败: %v\n", result.Error)
			} else {
				color.Green("成功 (%.2fs)\n", result.Duration.Seconds())
			}
		})

	ssh.CloseAllClients()

	color.Cyan("\n执行完成: 成功 %d 台, 失败 %d 台, 总耗时: %.2fs\n",
		successCount, failCount, time.Since(startTime).Seconds())

	if saveResult {
		go saveBatchResult(batchID, command, groupName, servers, results, successCount, failCount, startTime)
	}

	fmt.Println()
	for i, result := range results {
		if result.Error != nil || result.Stdout != "" || result.Stderr != "" {
			color.Cyan("\n[%d] === %s [%s] ===\n", i+1, result.ServerName, result.Host)
			if result.Error != nil {
				color.Red("错误: %v\n", result.Error)
			}
			if result.Stdout != "" {
				fmt.Print(result.Stdout)
			}
			if result.Stderr != "" {
				color.Yellow(result.Stderr)
			}
			if result.RetryCount > 0 {
				color.Yellow("重试次数: %d\n", result.RetryCount)
			}
		}
	}

	if saveResult {
		color.Cyan("\n批次ID: %s (结果已保存)\n", batchID)
	}
}

func saveBatchResult(batchID, command, groupName string, servers []config.Server, results []*ssh.ExecResult, success, failed int, startTime time.Time) {
	store := storage.DefaultStorage()

	records := make([]storage.ExecRecord, len(results))
	serverMap := make(map[string]config.Server)
	for _, s := range servers {
		serverMap[s.Name] = s
	}

	for i, r := range results {
		errStr := ""
		if r.Error != nil {
			errStr = r.Error.Error()
		}
		records[i] = storage.ExecRecord{
			ID:         fmt.Sprintf("%s_%d", batchID, i),
			Timestamp:  startTime,
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
	}

	batch := &storage.BatchRecord{
		BatchID:     batchID,
		Timestamp:   startTime,
		Command:     command,
		Group:       groupName,
		ServerCount: len(servers),
		Success:     success,
		Failed:      failed,
		Records:     records,
	}

	if err := store.SaveBatch(batch); err != nil {
		color.Red("保存结果失败: %v\n", err)
	}
}
