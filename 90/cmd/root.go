package cmd

import (
	"github.com/spf13/cobra"
)

var (
	configFile string
)

var rootCmd = &cobra.Command{
	Use:   "cluster-ops",
	Short: "服务器集群运维批量管控工具集",
	Long: `服务器集群运维批量管控命令行工具集，提供集群连接、批量指令执行、
资源状态采集、日志拉取、配置管理和异常告警等功能。`,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&configFile, "config", "c", "config.yaml", "配置文件路径")
}
