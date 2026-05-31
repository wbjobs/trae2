package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"

	"github.com/spf13/cobra"
)

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "测试集群连接状态",
	Long:  "批量测试配置文件中所有数据库集群的连接状态，显示延迟和健康信息。",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}
		conn := cluster.NewConnector(cfg)
		allStatuses := conn.HealthCheckAll()

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "集群\t节点\t状态\t延迟\t错误")
		fmt.Fprintln(w, "----\t----\t----\t----\t----")
		totalHealthy := 0
		totalNodes := 0
		for _, statuses := range allStatuses {
			for _, s := range statuses {
				totalNodes++
				status := "✓ 正常"
				if !s.Healthy {
					status = "✗ 异常"
				} else {
					totalHealthy++
				}
				errMsg := ""
				if s.Err != nil {
					errMsg = s.Err.Error()
					if len(errMsg) > 60 {
						errMsg = errMsg[:60] + "..."
					}
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
					s.Cluster, s.NodeName, status, s.Latency, errMsg)
			}
		}
		w.Flush()
		fmt.Printf("\n连接汇总: %d/%d 节点正常\n", totalHealthy, totalNodes)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(connectCmd)
}
