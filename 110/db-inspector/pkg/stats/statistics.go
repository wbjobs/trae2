package stats

import (
	"fmt"
	"sort"
	"time"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/slowquery"
)

type TimeBucket string

const (
	BucketMinute TimeBucket = "1min"
	BucketHour   TimeBucket = "1hour"
	BucketDay    TimeBucket = "1day"
)

type QueryTimeDistribution struct {
	Range  string `json:"range"`
	Count  int    `json:"count"`
	MinMs  int64  `json:"min_ms"`
	MaxMs  int64  `json:"max_ms"`
	AvgMs  int64  `json:"avg_ms"`
	TotalMs int64 `json:"total_ms"`
}

type ClusterStats struct {
	ClusterName      string                 `json:"cluster"`
	TotalQueries     int                    `json:"total_queries"`
	AvgQueryTimeMs   int64                  `json:"avg_query_time_ms"`
	MaxQueryTimeMs   int64                  `json:"max_query_time_ms"`
	MinQueryTimeMs   int64                  `json:"min_query_time_ms"`
	P50QueryTimeMs   int64                  `json:"p50_query_time_ms"`
	P95QueryTimeMs   int64                  `json:"p95_query_time_ms"`
	P99QueryTimeMs   int64                  `json:"p99_query_time_ms"`
	TotalLockTimeMs  int64                  `json:"total_lock_time_ms"`
	TotalRowsSent    int64                  `json:"total_rows_sent"`
	TotalRowsExamined int64                 `json:"total_rows_examined"`
	AvgRowsRatio     float64                `json:"avg_rows_ratio"`
	TopSlowQueries   []slowquery.SlowQueryRecord `json:"top_slow_queries"`
	TimeDistribution []QueryTimeDistribution `json:"time_distribution"`
	ScoreDistribution map[string]int         `json:"score_distribution"`
}

type GlobalStats struct {
	TotalClusters    int                    `json:"total_clusters"`
	TotalNodes       int                    `json:"total_nodes"`
	TotalQueries     int                    `json:"total_queries"`
	OverallAvgTimeMs int64                  `json:"overall_avg_time_ms"`
	OverallMaxTimeMs int64                  `json:"overall_max_time_ms"`
	ClusterStats     []ClusterStats         `json:"cluster_stats"`
	TopSlowQueries   []slowquery.SlowQueryRecord `json:"top_slow_queries"`
}

type Statistician struct{}

func NewStatistician() *Statistician {
	return &Statistician{}
}

func (s *Statistician) ComputeClusterStats(records []slowquery.SlowQueryRecord, analysisResults []analysis.AnalysisResult) ClusterStats {
	if len(records) == 0 {
		return ClusterStats{}
	}
	stats := ClusterStats{
		ClusterName:      records[0].ClusterName,
		TotalQueries:     len(records),
		MinQueryTimeMs:   -1,
		ScoreDistribution: make(map[string]int),
	}
	var totalQueryTime, totalLockTime int64
	var totalRowsSent, totalRowsExamined int64
	queryTimes := make([]int64, 0, len(records))
	for _, r := range records {
		qtMs := r.QueryTime.Milliseconds()
		ltMs := r.LockTime.Milliseconds()
		queryTimes = append(queryTimes, qtMs)
		totalQueryTime += qtMs
		totalLockTime += ltMs
		totalRowsSent += r.RowsSent
		totalRowsExamined += r.RowsExamined
		if qtMs > stats.MaxQueryTimeMs {
			stats.MaxQueryTimeMs = qtMs
		}
		if stats.MinQueryTimeMs < 0 || qtMs < stats.MinQueryTimeMs {
			stats.MinQueryTimeMs = qtMs
		}
	}
	stats.AvgQueryTimeMs = totalQueryTime / int64(len(records))
	stats.TotalLockTimeMs = totalLockTime
	stats.TotalRowsSent = totalRowsSent
	stats.TotalRowsExamined = totalRowsExamined
	if totalRowsSent > 0 {
		stats.AvgRowsRatio = float64(totalRowsExamined) / float64(totalRowsSent)
	}
	sort.Slice(queryTimes, func(i, j int) bool { return queryTimes[i] < queryTimes[j] })
	stats.P50QueryTimeMs = percentile(queryTimes, 50)
	stats.P95QueryTimeMs = percentile(queryTimes, 95)
	stats.P99QueryTimeMs = percentile(queryTimes, 99)
	stats.TimeDistribution = s.computeTimeDistribution(records)
	sorted := make([]slowquery.SlowQueryRecord, len(records))
	copy(sorted, records)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].QueryTime > sorted[j].QueryTime })
	topN := 10
	if len(sorted) < topN {
		topN = len(sorted)
	}
	stats.TopSlowQueries = sorted[:topN]
	for _, ar := range analysisResults {
		if ar.Record.ClusterName == stats.ClusterName {
			if ar.Score >= 80 {
				stats.ScoreDistribution["good(80-100)"]++
			} else if ar.Score >= 50 {
				stats.ScoreDistribution["warning(50-79)"]++
			} else {
				stats.ScoreDistribution["critical(0-49)"]++
			}
		}
	}
	return stats
}

func (s *Statistician) ComputeGlobalStats(
	allRecords map[string][]slowquery.SlowQueryRecord,
	allAnalysis map[string][]analysis.AnalysisResult,
) GlobalStats {
	global := GlobalStats{
		TotalClusters: len(allRecords),
	}
	var totalQueryTime, totalMaxTime int64
	var totalQueries int
	allTopQueries := make([]slowquery.SlowQueryRecord, 0)
	for clusterName, records := range allRecords {
		global.TotalNodes += countDistinctNodes(records)
		totalQueries += len(records)
		var clusterAR []analysis.AnalysisResult
		if ar, ok := allAnalysis[clusterName]; ok {
			clusterAR = ar
		}
		cs := s.ComputeClusterStats(records, clusterAR)
		global.ClusterStats = append(global.ClusterStats, cs)
		for _, r := range records {
			totalQueryTime += r.QueryTime.Milliseconds()
			if r.QueryTime.Milliseconds() > totalMaxTime {
				totalMaxTime = r.QueryTime.Milliseconds()
			}
		}
		allTopQueries = append(allTopQueries, cs.TopSlowQueries...)
	}
	global.TotalQueries = totalQueries
	if totalQueries > 0 {
		global.OverallAvgTimeMs = totalQueryTime / int64(totalQueries)
	}
	global.OverallMaxTimeMs = totalMaxTime
	sort.Slice(allTopQueries, func(i, j int) bool { return allTopQueries[i].QueryTime > allTopQueries[j].QueryTime })
	topN := 20
	if len(allTopQueries) < topN {
		topN = len(allTopQueries)
	}
	global.TopSlowQueries = allTopQueries[:topN]
	return global
}

func (s *Statistician) computeTimeDistribution(records []slowquery.SlowQueryRecord) []QueryTimeDistribution {
	buckets := map[string]*QueryTimeDistribution{
		"0-100ms":      {Range: "0-100ms"},
		"100-500ms":    {Range: "100-500ms"},
		"500ms-1s":     {Range: "500ms-1s"},
		"1s-5s":        {Range: "1s-5s"},
		"5s-10s":       {Range: "5s-10s"},
		"10s-30s":      {Range: "10s-30s"},
		"30s+":         {Range: "30s+"},
	}
	for _, r := range records {
		qtMs := r.QueryTime.Milliseconds()
		var bucket string
		switch {
		case qtMs < 100:
			bucket = "0-100ms"
		case qtMs < 500:
			bucket = "100-500ms"
		case qtMs < 1000:
			bucket = "500ms-1s"
		case qtMs < 5000:
			bucket = "1s-5s"
		case qtMs < 10000:
			bucket = "5s-10s"
		case qtMs < 30000:
			bucket = "10s-30s"
		default:
			bucket = "30s+"
		}
		b := buckets[bucket]
		b.Count++
		b.TotalMs += qtMs
		if b.MinMs == 0 || qtMs < b.MinMs {
			b.MinMs = qtMs
		}
		if qtMs > b.MaxMs {
			b.MaxMs = qtMs
		}
	}
	for _, b := range buckets {
		if b.Count > 0 {
			b.AvgMs = b.TotalMs / int64(b.Count)
		}
	}
	result := make([]QueryTimeDistribution, 0, len(buckets))
	for _, key := range []string{"0-100ms", "100-500ms", "500ms-1s", "1s-5s", "5s-10s", "10s-30s", "30s+"} {
		result = append(result, *buckets[key])
	}
	return result
}

func (s *Statistician) FormatClusterStats(stats ClusterStats) string {
	out := fmt.Sprintf("=== 集群: %s ===\n", stats.ClusterName)
	out += fmt.Sprintf("慢查询总数: %d\n", stats.TotalQueries)
	out += fmt.Sprintf("平均耗时: %dms | 最大耗时: %dms | 最小耗时: %dms\n",
		stats.AvgQueryTimeMs, stats.MaxQueryTimeMs, stats.MinQueryTimeMs)
	out += fmt.Sprintf("P50: %dms | P95: %dms | P99: %dms\n",
		stats.P50QueryTimeMs, stats.P95QueryTimeMs, stats.P99QueryTimeMs)
	out += fmt.Sprintf("总锁等待: %dms | 总发送行: %d | 总扫描行: %d\n",
		stats.TotalLockTimeMs, stats.TotalRowsSent, stats.TotalRowsExamined)
	if stats.AvgRowsRatio > 0 {
		out += fmt.Sprintf("平均扫描/返回比: %.1f:1\n", stats.AvgRowsRatio)
	}
	out += "\n耗时分布:\n"
	for _, d := range stats.TimeDistribution {
		out += fmt.Sprintf("  %-10s: %d 条 (avg=%dms, max=%dms)\n", d.Range, d.Count, d.AvgMs, d.MaxMs)
	}
	out += "\n评分分布:\n"
	for k, v := range stats.ScoreDistribution {
		out += fmt.Sprintf("  %s: %d 条\n", k, v)
	}
	if len(stats.TopSlowQueries) > 0 {
		out += "\nTop 慢查询:\n"
		for i, q := range stats.TopSlowQueries {
			out += fmt.Sprintf("  #%d [%s/%s] %v - %.50s...\n",
				i+1, q.ClusterName, q.NodeName, q.QueryTime, q.SQLText)
		}
	}
	return out
}

func (s *Statistician) FormatGlobalStats(stats GlobalStats) string {
	out := "========== 全局性能统计 ==========\n"
	out += fmt.Sprintf("集群数: %d | 节点数: %d | 慢查询总数: %d\n",
		stats.TotalClusters, stats.TotalNodes, stats.TotalQueries)
	out += fmt.Sprintf("全局平均耗时: %dms | 全局最大耗时: %dms\n",
		stats.OverallAvgTimeMs, stats.OverallMaxTimeMs)
	out += "\n"
	for _, cs := range stats.ClusterStats {
		out += s.FormatClusterStats(cs)
		out += "\n"
	}
	return out
}

func percentile(sorted []int64, p int) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := (p * len(sorted)) / 100
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func countDistinctNodes(records []slowquery.SlowQueryRecord) int {
	seen := make(map[string]bool)
	for _, r := range records {
		seen[r.NodeName] = true
	}
	return len(seen)
}

func FormatDuration(d time.Duration) string {
	if d < time.Millisecond {
		return fmt.Sprintf("%dμs", d.Microseconds())
	}
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	return fmt.Sprintf("%.1fm", d.Minutes())
}
