package cmd

import (
	"fmt"
	"os"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"
	"db-inspector/pkg/slowquery"
	"db-inspector/pkg/stats"
	"db-inspector/pkg/suggest"

	"github.com/spf13/cobra"
)

var suggestOutput string

var suggestCmd = &cobra.Command{
	Use:   "suggest",
	Short: "生成优化建议",
	Long:  "基于慢查询分析结果，生成数据库优化建议报告，包含索引建议、SQL 改写建议等。",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}

		conn := cluster.NewConnector(cfg)
		fetcher := slowquery.NewFetcher(cfg)
		analyzer := analysis.NewAnalyzer()
		statistician := stats.NewStatistician()
		advisor := suggest.NewAdvisor()

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
				if cfg.SlowQuery.IncludeExplain {
					for i, r := range records {
						explain, err := fetcher.FetchExplain(cr.DB, nodeCfg.Type, r.SQLText)
						if err == nil {
							records[i].Explain = explain
						}
					}
				}
				allRecords[clusterName] = append(allRecords[clusterName], records...)
				ar := analyzer.Analyze(records)
				allAnalysis[clusterName] = append(allAnalysis[clusterName], ar...)
			}
		}

		var allAnalysisFlat []analysis.AnalysisResult
		for _, ar := range allAnalysis {
			allAnalysisFlat = append(allAnalysisFlat, ar...)
		}

		reports := advisor.Generate(allAnalysisFlat)
		globalStats := statistician.ComputeGlobalStats(allRecords, allAnalysis)
		output := advisor.FormatGlobalReport(reports, globalStats)

		if suggestOutput != "" {
			if err := os.WriteFile(suggestOutput, []byte(output), 0644); err != nil {
				return fmt.Errorf("写入输出文件失败: %w", err)
			}
			fmt.Printf("优化报告已写入: %s\n", suggestOutput)
		} else {
			fmt.Print(output)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(suggestCmd)
	suggestCmd.Flags().StringVarP(&suggestOutput, "output", "o", "", "输出到文件")
}
