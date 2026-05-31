package suggest

import (
	"fmt"
	"sort"
	"strings"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/stats"
)

type Priority string

const (
	PriorityImmediate Priority = "IMMEDIATE"
	PriorityHigh      Priority = "HIGH"
	PriorityMedium    Priority = "MEDIUM"
	PriorityLow       Priority = "LOW"
)

type Suggestion struct {
	Rule     string   `json:"rule"`
	Priority Priority `json:"priority"`
	Title    string   `json:"title"`
	Content  string   `json:"content"`
	SQLHint  string   `json:"sql_hint,omitempty"`
}

type Report struct {
	ClusterName string       `json:"cluster"`
	NodeName    string       `json:"node,omitempty"`
	Score       int          `json:"score"`
	Suggestions []Suggestion `json:"suggestions"`
	Summary     string       `json:"summary"`
}

type Advisor struct{}

func NewAdvisor() *Advisor {
	return &Advisor{}
}

func (a *Advisor) Generate(analysisResults []analysis.AnalysisResult) []Report {
	reports := make([]Report, 0, len(analysisResults))
	groupByCluster := make(map[string][]analysis.AnalysisResult)
	for _, ar := range analysisResults {
		key := ar.Record.ClusterName
		groupByCluster[key] = append(groupByCluster[key], ar)
	}
	for cluster, results := range groupByCluster {
		report := a.generateClusterReport(cluster, results)
		reports = append(reports, report)
	}
	sort.Slice(reports, func(i, j int) bool { return reports[i].Score < reports[j].Score })
	return reports
}

func (a *Advisor) generateClusterReport(cluster string, results []analysis.AnalysisResult) Report {
	report := Report{
		ClusterName: cluster,
		Suggestions: make([]Suggestion, 0),
	}
	totalScore := 0
	for _, ar := range results {
		totalScore += ar.Score
		for _, issue := range ar.Issues {
			suggestion := a.issueToSuggestion(issue, ar)
			report.Suggestions = append(report.Suggestions, suggestion)
		}
	}
	if len(results) > 0 {
		report.Score = totalScore / len(results)
	}
	report.Suggestions = a.deduplicate(report.Suggestions)
	sort.Slice(report.Suggestions, func(i, j int) bool {
		return priorityOrder(report.Suggestions[i].Priority) < priorityOrder(report.Suggestions[j].Priority)
	})
	report.Summary = a.buildSummary(&report)
	return report
}

func (a *Advisor) issueToSuggestion(issue analysis.AnalysisIssue, ar analysis.AnalysisResult) Suggestion {
	s := Suggestion{
		Rule:    issue.Rule,
		Title:   issue.Message,
		Content: issue.Detail,
	}
	switch issue.Rule {
	case "SELECT_STAR":
		s.Priority = PriorityMedium
		s.SQLHint = "将 SELECT * 替换为具体列名，只查询需要的字段"
	case "NO_WHERE":
		s.Priority = PriorityImmediate
		s.SQLHint = "添加 WHERE 条件限制查询范围，避免全表扫描"
	case "ORDER_BY_NO_WHERE":
		s.Priority = PriorityMedium
		s.SQLHint = "为 ORDER BY 列创建索引，或添加 WHERE 条件减少排序数据量"
	case "LIKE_PREFIX_WILDCARD":
		s.Priority = PriorityHigh
		s.SQLHint = "考虑使用全文索引(FULLTEXT)或反向索引，避免 LIKE '%xxx' 前缀通配符"
	case "SUBQUERY":
		s.Priority = PriorityMedium
		s.SQLHint = "将子查询改写为 JOIN，减少临时表创建"
	case "CARTESIAN_JOIN":
		s.Priority = PriorityImmediate
		s.SQLHint = "为 JOIN 添加 ON 条件，避免笛卡尔积"
	case "OR_CONDITION":
		s.Priority = PriorityLow
		s.SQLHint = "考虑使用 UNION ALL 替代 OR，或确保 OR 两列都有索引"
	case "NOT_IN":
		s.Priority = PriorityMedium
		s.SQLHint = "将 NOT IN 替换为 NOT EXISTS 或 LEFT JOIN ... WHERE ... IS NULL"
	case "GROUP_BY_NO_WHERE":
		s.Priority = PriorityMedium
		s.SQLHint = "为 GROUP BY 列添加索引，或添加 WHERE 条件减少分组数据量"
	case "HAVING_NO_WHERE":
		s.Priority = PriorityLow
		s.SQLHint = "将过滤条件从 HAVING 移到 WHERE 中提前过滤"
	case "DISTINCT":
		s.Priority = PriorityLow
		s.SQLHint = "检查业务逻辑是否可以避免使用 DISTINCT，优化查询结构"
	case "UNION_WITHOUT_ALL":
		s.Priority = PriorityLow
		s.SQLHint = "如果确认无重复数据，将 UNION 改为 UNION ALL 避免去重排序"
	case "FUNCTION_ON_COLUMN":
		s.Priority = PriorityHigh
		s.SQLHint = "避免在索引列上使用函数，改为常量比较或在应用层处理转换"
	case "LARGE_IN_CLAUSE":
		s.Priority = PriorityMedium
		s.SQLHint = "将大量 IN 值改为临时表 JOIN 查询，或分批查询"
	case "FULL_TABLE_SCAN":
		s.Priority = PriorityImmediate
		s.SQLHint = fmt.Sprintf("为查询添加合适的索引，当前 SQL: %.80s...", ar.Record.SQLText)
	case "HIGH_ROWS_RATIO":
		s.Priority = PriorityHigh
		s.SQLHint = "优化查询条件使其更精确，或添加覆盖索引减少回表次数"
	case "MEDIUM_ROWS_RATIO":
		s.Priority = PriorityMedium
		s.SQLHint = "检查查询条件是否可以进一步优化，添加更精确的过滤条件"
	default:
		s.Priority = PriorityLow
	}
	return s
}

func (a *Advisor) deduplicate(suggestions []Suggestion) []Suggestion {
	seen := make(map[string]bool)
	result := make([]Suggestion, 0, len(suggestions))
	for _, s := range suggestions {
		key := s.Rule
		if !seen[key] {
			seen[key] = true
			result = append(result, s)
		}
	}
	return result
}

func (a *Advisor) buildSummary(report *Report) string {
	immediate, high, medium, low := 0, 0, 0, 0
	for _, s := range report.Suggestions {
		switch s.Priority {
		case PriorityImmediate:
			immediate++
		case PriorityHigh:
			high++
		case PriorityMedium:
			medium++
		case PriorityLow:
			low++
		}
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("集群 [%s] 综合评分: %d/100\n", report.ClusterName, report.Score))
	b.WriteString(fmt.Sprintf("优化建议: 紧急(%d) | 高(%d) | 中(%d) | 低(%d)\n", immediate, high, medium, low))
	if immediate > 0 {
		b.WriteString("\n⚠ 存在紧急优化项，请优先处理！\n")
	}
	if report.Score < 50 {
		b.WriteString("\n❌ 该集群 SQL 质量较差，需要重点优化\n")
	} else if report.Score < 80 {
		b.WriteString("\n⚡ 该集群 SQL 质量一般，建议按优先级逐步优化\n")
	} else {
		b.WriteString("\n✅ 该集群 SQL 质量较好，可关注中低优先级建议\n")
	}
	return b.String()
}

func (a *Advisor) FormatReport(report Report) string {
	var b strings.Builder
	b.WriteString(strings.Repeat("=", 60))
	b.WriteString("\n")
	b.WriteString(report.Summary)
	b.WriteString("\n")
	if len(report.Suggestions) > 0 {
		b.WriteString("详细优化建议:\n")
		b.WriteString(strings.Repeat("-", 40))
		b.WriteString("\n")
		for i, s := range report.Suggestions {
			b.WriteString(fmt.Sprintf("\n[%d] [%s] %s\n", i+1, s.Priority, s.Title))
			b.WriteString(fmt.Sprintf("    规则: %s\n", s.Rule))
			b.WriteString(fmt.Sprintf("    说明: %s\n", s.Content))
			if s.SQLHint != "" {
				b.WriteString(fmt.Sprintf("    建议: %s\n", s.SQLHint))
			}
		}
	}
	return b.String()
}

func (a *Advisor) FormatGlobalReport(reports []Report, globalStats stats.GlobalStats) string {
	var b strings.Builder
	b.WriteString(strings.Repeat("=", 60))
	b.WriteString("\n")
	b.WriteString("       数据库集群慢查询巡检优化报告\n")
	b.WriteString(strings.Repeat("=", 60))
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("巡检集群数: %d | 慢查询总数: %d\n",
		globalStats.TotalClusters, globalStats.TotalQueries))
	b.WriteString(fmt.Sprintf("全局平均耗时: %dms | 全局最大耗时: %dms\n\n",
		globalStats.OverallAvgTimeMs, globalStats.OverallMaxTimeMs))
	for _, report := range reports {
		b.WriteString(a.FormatReport(report))
		b.WriteString("\n")
	}
	return b.String()
}

func priorityOrder(p Priority) int {
	switch p {
	case PriorityImmediate:
		return 0
	case PriorityHigh:
		return 1
	case PriorityMedium:
		return 2
	case PriorityLow:
		return 3
	default:
		return 4
	}
}
