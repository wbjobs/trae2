package cmd

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"text/tabwriter"

	"db-inspector/pkg/config"
	"db-inspector/pkg/history"

	"github.com/spf13/cobra"
)

var (
	historyDate    string
	historyCluster string
	historyGroup   string
	historyLimit   int
	historyOutput  string
)

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "管理历史巡检记录",
	Long:  "查询、查看、删除历史巡检记录，支持按日期、集群、分组过滤。",
}

var historyListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出历史巡检记录",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		store := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
		summaries, err := store.List(historyDate, historyCluster, historyGroup, historyLimit)
		if err != nil {
			return fmt.Errorf("查询历史记录失败: %w", err)
		}
		if len(summaries) == 0 {
			fmt.Println("暂无历史记录")
			return nil
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\t日期\t耗时\t集群\t节点\t慢查询\t问题\t报告")
		fmt.Fprintln(w, "--\t----\t----\t----\t----\t------\t----\t----")
		for _, s := range summaries {
			dateStr := s.StartedAt.Format("2006-01-02 15:04:05")
			duration := fmt.Sprintf("%ds", s.DurationMs/1000)
			hasReport := "✓"
			if s.HTMLReportPath == "" {
				hasReport = "-"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d/%d\t%d\t%d\t%s\n",
				s.ID, dateStr, duration, s.TotalClusters, s.HealthyNodes, s.TotalNodes,
				s.TotalSlowQueries, s.IssuesCount, hasReport)
		}
		w.Flush()
		return nil
	},
}

var historyShowCmd = &cobra.Command{
	Use:   "show [record-id]",
	Short: "查看历史记录详情",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		store := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
		record, err := store.Load(args[0])
		if err != nil {
			return err
		}
		s := record.Summary
		fmt.Printf("巡检ID: %s\n", s.ID)
		fmt.Printf("开始时间: %s | 结束时间: %s | 耗时: %dms\n",
			s.StartedAt.Format("2006-01-02 15:04:05"),
			s.FinishedAt.Format("2006-01-02 15:04:05"),
			s.DurationMs)
		if len(s.Groups) > 0 {
			fmt.Printf("巡检分组: %v\n", s.Groups)
		}
		fmt.Printf("集群: %d | 节点: %d/%d | 慢查询: %d\n",
			s.TotalClusters, s.HealthyNodes, s.TotalNodes, s.TotalSlowQueries)
		fmt.Printf("平均耗时: %dms | 最大耗时: %dms\n", s.AvgResponseMs, s.MaxResponseMs)
		fmt.Printf("高优先级问题: %d | 总优化建议: %d\n", s.IssuesCount, s.OptimizationCount)
		if s.ReportPath != "" {
			fmt.Printf("文本报告: %s\n", s.ReportPath)
		}
		if s.HTMLReportPath != "" {
			fmt.Printf("HTML报告: %s\n", s.HTMLReportPath)
		}
		if len(record.GlobalStats.ClusterStats) > 0 {
			fmt.Println("\n各集群统计:")
			for _, cs := range record.GlobalStats.ClusterStats {
				fmt.Printf("  %s: %d 条慢查询, P50=%dms, P95=%dms\n",
					cs.ClusterName, cs.TotalQueries, cs.P50QueryTimeMs, cs.P95QueryTimeMs)
			}
		}
		if len(record.Reports) > 0 {
			fmt.Println("\n优化建议摘要:")
			for _, r := range record.Reports {
				fmt.Printf("  %s [评分: %d]: %d 条建议\n", r.ClusterName, r.Score, len(r.Suggestions))
			}
		}
		return nil
	},
}

var historyDeleteCmd = &cobra.Command{
	Use:   "delete [record-id]",
	Short: "删除历史记录",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		store := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
		if err := store.Delete(args[0]); err != nil {
			return err
		}
		fmt.Printf("已删除历史记录: %s\n", args[0])
		return nil
	},
}

var historyStatsCmd = &cobra.Command{
	Use:   "stats",
	Short: "查看历史记录统计",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		store := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
		total, size, err := store.Stats()
		if err != nil {
			return fmt.Errorf("统计失败: %w", err)
		}
		fmt.Printf("历史记录总数: %d\n", total)
		fmt.Printf("占用空间: %s\n", formatBytes(size))
		fmt.Printf("存储目录: %s\n", cfg.HistoryDir)
		fmt.Printf("保留天数: %d 天\n", cfg.HistoryRetentionDays)
		return nil
	},
}

var historyCleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Short: "清理过期历史记录",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		store := history.NewStore(cfg.HistoryDir, cfg.HistoryRetentionDays)
		if err := store.Cleanup(); err != nil {
			return fmt.Errorf("清理失败: %w", err)
		}
		fmt.Printf("已清理超过 %d 天的历史记录\n", cfg.HistoryRetentionDays)
		return nil
	},
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return strconv.FormatInt(b, 10) + " B"
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func init() {
	rootCmd.AddCommand(historyCmd)
	historyCmd.AddCommand(historyListCmd)
	historyCmd.AddCommand(historyShowCmd)
	historyCmd.AddCommand(historyDeleteCmd)
	historyCmd.AddCommand(historyStatsCmd)
	historyCmd.AddCommand(historyCleanupCmd)

	historyListCmd.Flags().StringVarP(&historyDate, "date", "d", "", "日期过滤 (如 2026-05-28)")
	historyListCmd.Flags().StringVar(&historyCluster, "cluster", "", "集群过滤")
	historyListCmd.Flags().StringVarP(&historyGroup, "group", "g", "", "分组过滤")
	historyListCmd.Flags().IntVarP(&historyLimit, "limit", "n", 50, "返回数量限制")
	historyShowCmd.Flags().StringVarP(&historyOutput, "output", "o", "", "输出报告到文件")
}
