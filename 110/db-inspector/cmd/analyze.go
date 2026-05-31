package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"
	"db-inspector/pkg/slowquery"

	"github.com/spf13/cobra"
)

var (
	analyzeOutput string
	analyzeFormat string
)

var analyzeCmd = &cobra.Command{
	Use:   "analyze",
	Short: "分析 SQL 性能",
	Long:  "对抓取到的慢查询语句进行 SQL 性能分析，检测潜在问题并评分。",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}

		conn := cluster.NewConnector(cfg)
		fetcher := slowquery.NewFetcher(cfg)
		analyzer := analysis.NewAnalyzer()

		allResults := conn.ConnectAll()
		defer cluster.CloseAllMap(allResults)

		var allAnalysis []analysis.AnalysisResult
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
				analysisResults := analyzer.Analyze(records)
				allAnalysis = append(allAnalysis, analysisResults...)
				fmt.Fprintf(os.Stdout, "[INFO] %s/%s: 分析 %d 条慢查询\n", clusterName, cr.NodeName, len(records))
			}
		}

		if len(allAnalysis) == 0 {
			fmt.Println("无可分析的慢查询记录")
			return nil
		}

		if analyzeOutput != "" {
			if err := writeAnalysisOutput(allAnalysis); err != nil {
				return err
			}
			fmt.Printf("分析结果已写入: %s\n", analyzeOutput)
		} else {
			printAnalysisResults(allAnalysis)
		}
		return nil
	},
}

func printAnalysisResults(results []analysis.AnalysisResult) {
	for i, ar := range results {
		fmt.Printf("\n=== SQL 分析 #%d ===\n", i+1)
		fmt.Printf("集群: %s | 节点: %s | 评分: %d\n", ar.Record.ClusterName, ar.Record.NodeName, ar.Score)
		fmt.Printf("SQL: %.100s...\n", ar.Record.SQLText)
		fmt.Printf("指纹: %s\n", ar.Fingerprint)
		fmt.Printf("汇总: %s\n", ar.Summary)
		if len(ar.Issues) > 0 {
			fmt.Println("问题列表:")
			for j, issue := range ar.Issues {
				fmt.Printf("  %d. [%s] %s: %s\n", j+1, issue.Severity, issue.Rule, issue.Message)
				if issue.Detail != "" {
					fmt.Printf("     详情: %s\n", issue.Detail)
				}
			}
		} else {
			fmt.Println("未发现明显问题")
		}
	}
}

func writeAnalysisOutput(results []analysis.AnalysisResult) error {
	switch analyzeFormat {
	case "json":
		data, err := json.MarshalIndent(results, "", "  ")
		if err != nil {
			return fmt.Errorf("JSON 序列化失败: %w", err)
		}
		return os.WriteFile(analyzeOutput, data, 0644)
	default:
		f, err := os.Create(analyzeOutput)
		if err != nil {
			return err
		}
		defer f.Close()
		for i, ar := range results {
			fmt.Fprintf(f, "=== SQL 分析 #%d ===\n", i+1)
			fmt.Fprintf(f, "集群: %s | 节点: %s | 评分: %d\n", ar.Record.ClusterName, ar.Record.NodeName, ar.Score)
			fmt.Fprintf(f, "SQL: %s\n\n", ar.Record.SQLText)
		}
		return nil
	}
}

func init() {
	rootCmd.AddCommand(analyzeCmd)
	analyzeCmd.Flags().StringVarP(&analyzeOutput, "output", "o", "", "输出到文件")
	analyzeCmd.Flags().StringVarP(&analyzeFormat, "format", "f", "text", "输出格式: text|json")
}
