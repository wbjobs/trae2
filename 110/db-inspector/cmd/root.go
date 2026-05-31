package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var cfgFile string

var rootCmd = &cobra.Command{
	Use:   "db-inspector",
	Short: "数据库集群慢查询巡检命令行工具",
	Long: `db-inspector 是一套数据库集群慢查询巡检命令行工具集，
支持批量连接 MySQL/PostgreSQL/SQLite 集群，
抓取慢查询语句、分析 SQL 性能、统计执行耗时、生成优化建议。`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "db-inspector.yaml", "配置文件路径")
}
