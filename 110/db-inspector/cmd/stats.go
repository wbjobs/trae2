package cmd

import (
	"fmt"
	"os"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"
	"db-inspector/pkg/slowquery"
	"db-inspector/pkg/stats"

	"github.com/spf13/cobra"
)

var statsOutput string

var statsCmd = &cobra.Command{
	Use:   "stats",
	Short: "统计性能指标",
	Long:  "对慢查询进行性能统计，计算 P50/P95/P99 延迟、耗时分布、评分分布等指标。",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}

		conn := cluster.NewConnector(cfg)
		fetcher := slowquery.NewFetcher(cfg)
		analyzer := analysis.NewAnalyzer()
		statistician := stats.NewStatistician()

		allResults := conn.ConnectAll()
		defer cluster.CloseAllMap(allResults)

		allRecords := make(map[string][]slowquery.SlowQueryRecord)
		allAnalysis := make(map[string][]analysis.AnalysisResult)

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
				allRecords[clusterName] = append(allRecords[clusterName], records...)
				ar := analyzer.Analyze(records)
				allAnalysis[clusterName] = append(allAnalysis[clusterName], ar...)
			}
		}

		globalStats := statistician.ComputeGlobalStats(allRecords, allAnalysis)
		output := statistician.FormatGlobalStats(globalStats)

		if statsOutput != "" {
			if err := os.WriteFile(statsOutput, []byte(output), 0644); err != nil {
				return fmt.Errorf("写入输出文件失败: %w", err)
			}
			fmt.Printf("统计结果已写入: %s\n", statsOutput)
		} else {
			fmt.Print(output)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(statsCmd)
	statsCmd.Flags().StringVarP(&statsOutput, "output", "o", "", "输出到文件")
}
