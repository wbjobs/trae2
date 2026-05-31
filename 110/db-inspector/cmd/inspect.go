package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/cluster"
	"db-inspector/pkg/config"
	"db-inspector/pkg/history"
	"db-inspector/pkg/report"
	"db-inspector/pkg/slowquery"
	"db-inspector/pkg/stats"
	"db-inspector/pkg/suggest"

	"github.com/spf13/cobra"
)

var (
	inspectGroups     []string
	inspectClusters   []string
	inspectOutputDir  string
	inspectNoHTML     bool
	inspectNoHistory  bool
	inspectNoSuggest  bool
	inspectTimeout    int
	inspectReconnect  bool
)

var inspectCmd = &cobra.Command{
	Use:   "inspect",
	Short: "执行完整巡检流程",
	Long: `执行完整巡检流程：连接测试 -> 慢查询抓取 -> SQL 分析 -> 性能统计 -> 优化建议 -> 生成 HTML 报告。
支持按分组或指定集群进行巡检，结果自动存入历史记录。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		startedAt := time.Now()
		inspectID := fmt.Sprintf("inspect-%s", startedAt.Format("20060102-150405"))
		fmt.Fprintf(os.Stdout, "[INFO] 开始巡检: %s\n", inspectID)

		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}

		var targetClusters []config.Cluster
		if len(inspectGroups) > 0 {
			targetClusters, err = config.FilterClustersByGroup(cfg, inspectGroups)
			if err != nil {
				return fmt.Errorf("过滤分组失败: %w", err)
			}
			fmt.Fprintf(os.Stdout, "[INFO] 巡检分组: %v (%d 个集群)\n", inspectGroups, len(targetClusters))
		} else if len(inspectClusters) > 0 {
			for _, name := range inspectClusters {
				for _, c := range cfg.Clusters {
					if c.Name == name {
						targetClusters = append(targetClusters, c)
						break
					}
				}
			}
			fmt.Fprintf(os.Stdout, "[INFO] 指定集群: %v\n", inspectClusters)
		} else {
			targetClusters = cfg.Clusters
			fmt.Fprintf(os.Stdout, "[INFO] 巡检全部集群: %d 个\n", len(targetClusters))
		}

		if len(targetClusters) == 0 {
			return fmt.Errorf("没有可巡检的集群")
		}

		conn := cluster.NewConnector(cfg)
		defer conn.CloseAllCached()

		if inspectReconnect {
			fmt.Fprintln(os.Stdout, "[INFO] 强制重连所有节点...")
			if err := conn.ReconnectAll(cmd.Context()); err != nil {
				fmt.Fprintf(os.Stderr, "[WARN] 重连失败: %v\n", err)
			}
		}

		conn.SetHealthCheck(true)
		healthStatuses := make(map[string][]cluster.HealthStatus)
		for _, c := range targetClusters {
			hs := conn.HealthCheck(c)
			healthStatuses[c.Name] = hs
			total, healthy := len(hs), 0
			for _, s := range hs {
				if s.Healthy {
					healthy++
				}
			}
			fmt.Fprintf(os.Stdout, "[INFO] 集群 %s: %d/%d 节点可用\n", c.Name, healthy, total)
		}

		fetcher := slowquery.NewFetcher(cfg)
		analyzer := analysis.NewAnalyzer()
		statistician := stats.NewStatistician()
		advisor := suggest.NewAdvisor()

		allRecords := make(map[string][]slowquery.SlowQueryRecord)
		allAnalysis := make(map[string][]analysis.AnalysisResult)
		var allAnalysisFlat []analysis.AnalysisResult

		for _, c := range targetClusters {
			for _, node := range c.Nodes {
				db, err := conn.GetConnectionWithContext(cmd.Context(), c.Name, node)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[WARN] 获取 %s/%s 连接失败: %v\n", c.Name, node.Name, err)
					continue
				}
				records, err := fetcher.FetchWithContext(cmd.Context(), db, node.Type, node.Name, c.Name)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[WARN] 抓取 %s/%s 慢查询失败: %v\n", c.Name, node.Name, err)
					continue
				}
				if cfg.SlowQuery.IncludeExplain {
					for i, r := range records {
						explain, err := fetcher.FetchExplainWithContext(cmd.Context(), db, node.Type, r.SQLText)
						if err == nil {
							records[i].Explain = explain
						}
					}
				}
				allRecords[c.Name] = append(allRecords[c.Name], records...)
				ar := analyzer.Analyze(records)
				allAnalysis[c.Name] = append(allAnalysis[c.Name], ar...)
				allAnalysisFlat = append(allAnalysisFlat, ar...)
				fmt.Fprintf(os.Stdout, "[INFO] %s/%s: %d 条慢查询\n", c.Name, node.Name, len(records))
			}
		}

		globalStats := statistician.ComputeGlobalStats(allRecords, allAnalysis)

		var reports []suggest.Report
		if !inspectNoSuggest {
			reports = advisor.Generate(allAnalysisFlat)
		}

		finishedAt := time.Now()
		fmt.Fprintf(os.Stdout, "[INFO] 巡检完成，耗时: %v\n", finishedAt.Sub(startedAt))

		outputDir := inspectOutputDir
		if outputDir == "" {
			outputDir = cfg.OutputDir
		}
		if outputDir == "" {
			outputDir = "./reports"
		}
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			return fmt.Errorf("创建输出目录失败: %w", err)
		}

		var reportPath, htmlReportPath string

		if !inspectNoSuggest {
			reportPath = filepath.Join(outputDir, fmt.Sprintf("%s-report.txt", inspectID))
			txtReport := advisor.FormatGlobalReport(reports, globalStats)
			if err := os.WriteFile(reportPath, []byte(txtReport), 0644); err != nil {
				fmt.Fprintf(os.Stderr, "[WARN] 写入文本报告失败: %v\n", err)
			} else {
				fmt.Fprintf(os.Stdout, "[INFO] 文本报告: %s\n", reportPath)
			}
		}

		if !inspectNoHTML {
			gen, err := report.NewGenerator()
			if err != nil {
				fmt.Fprintf(os.Stderr, "[WARN] 初始化报告生成器失败: %v\n", err)
			} else {
				htmlReportPath = filepath.Join(outputDir, fmt.Sprintf("%s-report.html", inspectID))
				reportData := report.BuildReportData(globalStats, reports, allAnalysisFlat, healthStatuses)
				if err := gen.GenerateHTML(reportData, htmlReportPath); err != nil {
					fmt.Fprintf(os.Stderr, "[WARN] 生成 HTML 报告失败: %v\n", err)
				} else {
					fmt.Fprintf(os.Stdout, "[INFO] HTML 报告: %s\n", htmlReportPath)
				}
			}
		}

		if !inspectNoHistory {
			historyStore := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
			summary := history.NewSummary(inspectID, startedAt, finishedAt, inspectGroups, globalStats, reports)
			summary.ReportPath = reportPath
			summary.HTMLReportPath = htmlReportPath

			record := history.InspectionRecord{
				Summary:     summary,
				GlobalStats: globalStats,
				Reports:     reports,
				AllAnalysis: allAnalysisFlat,
			}
			if path, err := historyStore.Save(record); err != nil {
				fmt.Fprintf(os.Stderr, "[WARN] 保存历史记录失败: %v\n", err)
			} else {
				fmt.Fprintf(os.Stdout, "[INFO] 历史记录: %s\n", path)
			}
		}

		fmt.Fprintln(os.Stdout)
		fmt.Fprintf(os.Stdout, "========== 巡检结果汇总 ==========\n")
		fmt.Fprintf(os.Stdout, "巡检ID: %s\n", inspectID)
		fmt.Fprintf(os.Stdout, "集群数: %d | 节点数: %d | 慢查询: %d\n",
			globalStats.TotalClusters, globalStats.TotalNodes, globalStats.TotalQueries)
		fmt.Fprintf(os.Stdout, "平均耗时: %dms | 最大耗时: %dms\n",
			globalStats.OverallAvgTimeMs, globalStats.OverallMaxTimeMs)
		if !inspectNoSuggest {
			totalIssues := 0
			for _, r := range reports {
				totalIssues += len(r.Suggestions)
			}
			fmt.Fprintf(os.Stdout, "优化建议: %d 条\n", totalIssues)
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(inspectCmd)
	inspectCmd.Flags().StringSliceVarP(&inspectGroups, "group", "g", nil, "按分组巡检 (多个用逗号分隔)")
	inspectCmd.Flags().StringSliceVar(&inspectClusters, "cluster", nil, "指定集群巡检 (多个用逗号分隔)")
	inspectCmd.Flags().StringVarP(&inspectOutputDir, "output", "o", "", "输出目录 (覆盖配置)")
	inspectCmd.Flags().BoolVar(&inspectNoHTML, "no-html", false, "不生成 HTML 报告")
	inspectCmd.Flags().BoolVar(&inspectNoHistory, "no-history", false, "不保存历史记录")
	inspectCmd.Flags().BoolVar(&inspectNoSuggest, "no-suggest", false, "不生成优化建议")
	inspectCmd.Flags().IntVar(&inspectTimeout, "timeout", 0, "全局超时(秒)")
	inspectCmd.Flags().BoolVar(&inspectReconnect, "reconnect", false, "巡检前强制重连所有节点")
}
