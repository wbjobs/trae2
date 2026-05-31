package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	execGroup       string
	execServer      string
	execConcurrency int
	execTimeout     int
	execRetries     int
	execSaveResult  bool
)

var execCmd = &cobra.Command{
	Use:   "exec",
	Short: "批量执行命令",
	Long:  `在多台服务器上批量执行命令`,
}

var execRunCmd = &cobra.Command{
	Use:   "run",
	Short: "执行命令",
	Long:  `在指定服务器上执行命令`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runExecCommand,
}

func init() {
	rootCmd.AddCommand(execCmd)
	execCmd.AddCommand(execRunCmd)

	execRunCmd.Flags().StringVarP(&execGroup, "group", "g", "", "指定服务器组")
	execRunCmd.Flags().StringVarP(&execServer, "server", "s", "", "指定服务器名称")
	execRunCmd.Flags().IntVarP(&execConcurrency, "concurrency", "n", 10, "并发数")
	execRunCmd.Flags().IntVarP(&execTimeout, "timeout", "t", 300, "命令超时时间(秒)")
	execRunCmd.Flags().IntVarP(&execRetries, "retries", "r", 3, "失败重试次数")
	execRunCmd.Flags().BoolVarP(&execSaveResult, "save", "S", true, "保存执行结果")
}

func runExecCommand(cmd *cobra.Command, args []string) {
	servers, err := getTargetServers(execGroup, execServer)
	if err != nil {
		color.Red("%v\n", err)
		return
	}

	command := strings.Join(args, " ")

	opts := ssh.ExecOptions{
		Timeout:        time.Duration(execTimeout) * time.Second,
		MaxRetries:     execRetries,
		RetryDelay:     2 * time.Second,
		ReconnectDelay: 2 * time.Second,
		MaxReconnects:  3,
		AutoReconnect:  true,
	}

	executeBatchCommand(servers, command, opts, execConcurrency, execSaveResult, execGroup)
}
