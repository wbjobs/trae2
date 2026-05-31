package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"
	"db-inspector/pkg/slowquery"

	"github.com/spf13/cobra"
)

var (
	slowQueryTopN     int
	slowQueryThreshold int64
	slowQueryOutput   string
	slowQueryFormat   string
)

var slowQueryCmd = &cobra.Command{
	Use:   "slowquery",
	Short: "抓取慢查询语句",
	Long:  "从配置的数据库集群中抓取慢查询语句，支持 MySQL 和 PostgreSQL。",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}
		if slowQueryTopN > 0 {
			cfg.SlowQuery.TopN = slowQueryTopN
		}
		if slowQueryThreshold > 0 {
			cfg.SlowQuery.ThresholdMs = slowQueryThreshold
		}

		conn := cluster.NewConnector(cfg)
		fetcher := slowquery.NewFetcher(cfg)
		allResults := conn.ConnectAll()
		defer cluster.CloseAllMap(allResults)

		var allRecords []slowquery.SlowQueryRecord
		for clusterName, results := range allResults {
			for _, cr := range results {
				if cr.Err != nil {
					fmt.Fprintf(os.Stderr, "[WARN] 连接 %s/%s 失败: %v\n", clusterName, cr.NodeName, cr.Err)
					continue
				}
				var nodeCfg config.DBNode
				for _, c := range cfg.Clusters {
					if c.Name == clusterName {
						for _, n := range c.Nodes {
							if n.Name == cr.NodeName {
								nodeCfg = n
								break
							}
						}
					}
				}
				records, err := fetcher.Fetch(cr.DB, nodeCfg.Type, cr.NodeName, clusterName)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[WARN] 抓取 %s/%s 慢查询失败: %v\n", clusterName, cr.NodeName, err)
					continue
				}
				if cfg.SlowQuery.IncludeExplain {
					for i, r := range records {
						explain, err := fetcher.FetchExplain(cr.DB, nodeCfg.Type, r.SQLText)
						if err == nil {
							records[i].Explain = explain
						}
					}
				}
				allRecords = append(allRecords, records...)
				fmt.Fprintf(os.Stdout, "[INFO] %s/%s: 抓取到 %d 条慢查询\n", clusterName, cr.NodeName, len(records))
			}
		}

		if len(allRecords) == 0 {
			fmt.Println("未抓取到慢查询记录")
			return nil
		}

		if slowQueryOutput != "" {
			if err := writeSlowQueryOutput(allRecords); err != nil {
				return err
			}
			fmt.Printf("结果已写入: %s\n", slowQueryOutput)
		} else {
			printSlowQueryResults(allRecords)
		}
		return nil
	},
}

func printSlowQueryResults(records []slowquery.SlowQueryRecord) {
	for i, r := range records {
		fmt.Printf("\n--- 慢查询 #%d ---\n", i+1)
		fmt.Printf("集群: %s | 节点: %s | 库: %s\n", r.ClusterName, r.NodeName, r.Schema)
		fmt.Printf("耗时: %v | 锁等待: %v\n", r.QueryTime, r.LockTime)
		fmt.Printf("发送行: %d | 扫描行: %d\n", r.RowsSent, r.RowsExamined)
		fmt.Printf("时间: %s\n", r.Timestamp.Format(time.DateTime))
		fmt.Printf("SQL: %s\n", r.SQLText)
		if r.Explain != "" {
			fmt.Printf("EXPLAIN:\n%s\n", r.Explain)
		}
	}
}

func writeSlowQueryOutput(records []slowquery.SlowQueryRecord) error {
	switch slowQueryFormat {
	case "json":
		data, err := json.MarshalIndent(records, "", "  ")
		if err != nil {
			return fmt.Errorf("JSON 序列化失败: %w", err)
		}
		return os.WriteFile(slowQueryOutput, data, 0644)
	default:
		f, err := os.Create(slowQueryOutput)
		if err != nil {
			return err
		}
		defer f.Close()
		for i, r := range records {
			fmt.Fprintf(f, "--- 慢查询 #%d ---\n", i+1)
			fmt.Fprintf(f, "集群: %s | 节点: %s | 库: %s\n", r.ClusterName, r.NodeName, r.Schema)
			fmt.Fprintf(f, "耗时: %v | 锁等待: %v\n", r.QueryTime, r.LockTime)
			fmt.Fprintf(f, "发送行: %d | 扫描行: %d\n", r.RowsSent, r.RowsExamined)
			fmt.Fprintf(f, "时间: %s\n", r.Timestamp.Format(time.DateTime))
			fmt.Fprintf(f, "SQL: %s\n\n", r.SQLText)
		}
		return nil
	}
}

func init() {
	rootCmd.AddCommand(slowQueryCmd)
	slowQueryCmd.Flags().IntVarP(&slowQueryTopN, "top", "n", 0, "抓取 Top N 慢查询 (覆盖配置)")
	slowQueryCmd.Flags().Int64VarP(&slowQueryThreshold, "threshold", "t", 0, "慢查询阈值(ms) (覆盖配置)")
	slowQueryCmd.Flags().StringVarP(&slowQueryOutput, "output", "o", "", "输出到文件")
	slowQueryCmd.Flags().StringVarP(&slowQueryFormat, "format", "f", "text", "输出格式: text|json")
}
