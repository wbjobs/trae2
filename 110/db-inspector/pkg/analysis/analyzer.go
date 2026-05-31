package analysis

import (
	"fmt"
	"regexp"
	"strings"

	"db-inspector/pkg/slowquery"
)

type Severity string

const (
	SeverityCritical Severity = "CRITICAL"
	SeverityHigh     Severity = "HIGH"
	SeverityMedium   Severity = "MEDIUM"
	SeverityLow      Severity = "LOW"
	SeverityInfo     Severity = "INFO"
)

type AnalysisIssue struct {
	Rule     string   `json:"rule"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
	Detail   string   `json:"detail,omitempty"`
}

type AnalysisResult struct {
	Record     slowquery.SlowQueryRecord `json:"record"`
	Issues     []AnalysisIssue           `json:"issues"`
	Score      int                       `json:"score"`
	Summary    string                    `json:"summary"`
	Fingerprint string                   `json:"fingerprint"`
}

type Analyzer struct{}

func NewAnalyzer() *Analyzer {
	return &Analyzer{}
}

func (a *Analyzer) Analyze(records []slowquery.SlowQueryRecord) []AnalysisResult {
	results := make([]AnalysisResult, 0, len(records))
	for _, record := range records {
		result := a.analyzeOne(record)
		results = append(results, result)
	}
	return results
}

func (a *Analyzer) analyzeOne(record slowquery.SlowQueryRecord) AnalysisResult {
	result := AnalysisResult{
		Record:      record,
		Score:       100,
		Fingerprint: fingerprintSQL(record.SQLText),
	}
	sqlUpper := strings.ToUpper(strings.TrimSpace(record.SQLText))
	a.checkSelectAll(&result, sqlUpper)
	a.checkNoWhere(&result, sqlUpper)
	a.checkOrderByWithoutIndex(&result, sqlUpper)
	a.checkLikePrefix(&result, record.SQLText)
	a.checkSubquery(&result, sqlUpper)
	a.checkCartesianJoin(&result, sqlUpper)
	a.checkOrCondition(&result, sqlUpper)
	a.checkNotIn(&result, sqlUpper)
	a.checkGroupByWithoutIndex(&result, sqlUpper)
	a.checkHaving(&result, sqlUpper)
	a.checkDistinct(&result, sqlUpper)
	a.checkUnion(&result, sqlUpper)
	a.checkImplicitConversion(&result, sqlUpper)
	a.checkLargeInClause(&result, record.SQLText)
	a.checkFullScanFromExplain(&result, record)
	a.checkRowsRatio(&result, record)
	a.calculateScore(&result)
	result.Summary = a.buildSummary(&result)
	return result
}

func (a *Analyzer) checkSelectAll(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "SELECT *") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "SELECT_STAR",
			Severity: SeverityMedium,
			Message:  "避免使用 SELECT *",
			Detail:   "查询返回所有列，增加了网络传输和内存消耗，建议只查询需要的列",
		})
	}
}

func (a *Analyzer) checkNoWhere(result *AnalysisResult, sqlUpper string) {
	if (strings.HasPrefix(sqlUpper, "SELECT") || strings.HasPrefix(sqlUpper, "DELETE") || strings.HasPrefix(sqlUpper, "UPDATE")) &&
		!strings.Contains(sqlUpper, "WHERE") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "NO_WHERE",
			Severity: SeverityHigh,
			Message:  "语句缺少 WHERE 条件",
			Detail:   "没有 WHERE 条件的查询会扫描全表，可能导致性能问题和锁范围过大",
		})
	}
}

func (a *Analyzer) checkOrderByWithoutIndex(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "ORDER BY") && !strings.Contains(sqlUpper, "WHERE") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "ORDER_BY_NO_WHERE",
			Severity: SeverityMedium,
			Message:  "ORDER BY 无 WHERE 条件",
			Detail:   "没有 WHERE 过滤的 ORDER BY 需要对全表排序，请确保排序列有索引",
		})
	}
}

func (a *Analyzer) checkLikePrefix(result *AnalysisResult, sqlUpper string) {
	re := regexp.MustCompile(`LIKE\s+'%`)
	if re.MatchString(sqlUpper) {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "LIKE_PREFIX_WILDCARD",
			Severity: SeverityHigh,
			Message:  "LIKE 使用前缀通配符",
			Detail:   "LIKE '%xxx' 模式无法使用索引，考虑使用全文索引或调整查询模式",
		})
	}
}

func (a *Analyzer) checkSubquery(result *AnalysisResult, sqlUpper string) {
	selectCount := strings.Count(sqlUpper, "SELECT ")
	if selectCount > 1 {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "SUBQUERY",
			Severity: SeverityMedium,
			Message:  "检测到子查询",
			Detail:   "子查询可能导致临时表创建和多次扫描，建议改写为 JOIN",
		})
	}
}

func (a *Analyzer) checkCartesianJoin(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "JOIN") && !strings.Contains(sqlUpper, "ON") && !strings.Contains(sqlUpper, "WHERE") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "CARTESIAN_JOIN",
			Severity: SeverityCritical,
			Message:  "笛卡尔积 JOIN",
			Detail:   "JOIN 无 ON 条件，将产生笛卡尔积，导致结果集爆炸式增长",
		})
	}
}

func (a *Analyzer) checkOrCondition(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, " OR ") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "OR_CONDITION",
			Severity: SeverityLow,
			Message:  "使用 OR 条件",
			Detail:   "OR 条件可能导致索引失效，考虑使用 UNION ALL 替代",
		})
	}
}

func (a *Analyzer) checkNotIn(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "NOT IN") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "NOT_IN",
			Severity: SeverityMedium,
			Message:  "使用 NOT IN",
			Detail:   "NOT IN 可能导致全表扫描且对 NULL 值处理异常，建议使用 NOT EXISTS 或 LEFT JOIN 替代",
		})
	}
}

func (a *Analyzer) checkGroupByWithoutIndex(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "GROUP BY") && !strings.Contains(sqlUpper, "WHERE") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "GROUP_BY_NO_WHERE",
			Severity: SeverityMedium,
			Message:  "GROUP BY 无 WHERE 条件",
			Detail:   "没有 WHERE 过滤的 GROUP BY 需要全表扫描和排序，请确保分组列有索引",
		})
	}
}

func (a *Analyzer) checkHaving(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "HAVING") && !strings.Contains(sqlUpper, "WHERE") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "HAVING_NO_WHERE",
			Severity: SeverityLow,
			Message:  "HAVING 替代 WHERE 过滤",
			Detail:   "建议使用 WHERE 进行行级过滤，HAVING 应仅用于分组后过滤聚合结果",
		})
	}
}

func (a *Analyzer) checkDistinct(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "DISTINCT") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "DISTINCT",
			Severity: SeverityLow,
			Message:  "使用 DISTINCT",
			Detail:   "DISTINCT 需要排序去重操作，检查是否可以通过优化查询逻辑避免使用",
		})
	}
}

func (a *Analyzer) checkUnion(result *AnalysisResult, sqlUpper string) {
	if strings.Contains(sqlUpper, "UNION ") && !strings.Contains(sqlUpper, "UNION ALL") {
		result.Issues = append(result.Issues, AnalysisIssue{
			Rule:     "UNION_WITHOUT_ALL",
			Severity: SeverityLow,
			Message:  "使用 UNION 而非 UNION ALL",
			Detail:   "UNION 会进行去重排序操作，如果确定无重复数据请使用 UNION ALL",
		})
	}
}

func (a *Analyzer) checkImplicitConversion(result *AnalysisResult, sqlUpper string) {
	funcs := []string{"CAST(", "CONVERT(", "IFNULL(", "COALESCE("}
	for _, fn := range funcs {
		if strings.Contains(sqlUpper, fn) {
			result.Issues = append(result.Issues, AnalysisIssue{
				Rule:     "FUNCTION_ON_COLUMN",
				Severity: SeverityMedium,
				Message:  "列上使用函数",
				Detail:   "在查询列上使用函数会导致索引失效，建议在应用层处理类型转换",
			})
			break
		}
	}
}

func (a *Analyzer) checkLargeInClause(result *AnalysisResult, sqlText string) {
	re := regexp.MustCompile(`(?i)IN\s*\(`)
	matches := re.FindAllStringIndex(sqlText, -1)
	for _, match := range matches {
		start := match[0]
		rest := sqlText[start:]
		end := strings.Index(rest, ")")
		if end > 0 {
			inner := rest[3:end]
			commaCount := strings.Count(inner, ",")
			if commaCount > 100 {
				result.Issues = append(result.Issues, AnalysisIssue{
					Rule:     "LARGE_IN_CLAUSE",
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("IN 子句包含过多值 (%d)", commaCount+1),
					Detail:   "IN 子句值过多可能导致查询计划不优，建议使用临时表或 JOIN 替代",
				})
				break
			}
		}
	}
}

func (a *Analyzer) checkFullScanFromExplain(result *AnalysisResult, record slowquery.SlowQueryRecord) {
	if record.Explain != "" {
		explainUpper := strings.ToUpper(record.Explain)
		if strings.Contains(explainUpper, "FULL TABLE SCAN") ||
			strings.Contains(explainUpper, "SEQ SCAN") ||
			strings.Contains(explainUpper, "ALL") {
			result.Issues = append(result.Issues, AnalysisIssue{
				Rule:     "FULL_TABLE_SCAN",
				Severity: SeverityHigh,
				Message:  "EXPLAIN 显示全表扫描",
				Detail:   "查询执行计划显示全表扫描，建议添加合适的索引",
			})
		}
	}
}

func (a *Analyzer) checkRowsRatio(result *AnalysisResult, record slowquery.SlowQueryRecord) {
	if record.RowsExamined > 0 && record.RowsSent > 0 {
		ratio := float64(record.RowsExamined) / float64(record.RowsSent)
		if ratio > 1000 {
			result.Issues = append(result.Issues, AnalysisIssue{
				Rule:     "HIGH_ROWS_RATIO",
				Severity: SeverityHigh,
				Message:  fmt.Sprintf("扫描行数/返回行数比率过高 (%.0f:1)", ratio),
				Detail:   "扫描了大量行但只返回少量数据，说明索引效率低或查询条件不够精确",
			})
		} else if ratio > 100 {
			result.Issues = append(result.Issues, AnalysisIssue{
				Rule:     "MEDIUM_ROWS_RATIO",
				Severity: SeverityMedium,
				Message:  fmt.Sprintf("扫描行数/返回行数比率较高 (%.0f:1)", ratio),
				Detail:   "扫描行数远大于返回行数，考虑优化查询条件或添加索引",
			})
		}
	}
}

func (a *Analyzer) calculateScore(result *AnalysisResult) {
	deduction := 0
	for _, issue := range result.Issues {
		switch issue.Severity {
		case SeverityCritical:
			deduction += 30
		case SeverityHigh:
			deduction += 20
		case SeverityMedium:
			deduction += 10
		case SeverityLow:
			deduction += 5
		case SeverityInfo:
			deduction += 2
		}
	}
	result.Score = 100 - deduction
	if result.Score < 0 {
		result.Score = 0
	}
}

func (a *Analyzer) buildSummary(result *AnalysisResult) string {
	critical, high, medium, low := 0, 0, 0, 0
	for _, issue := range result.Issues {
		switch issue.Severity {
		case SeverityCritical:
			critical++
		case SeverityHigh:
			high++
		case SeverityMedium:
			medium++
		case SeverityLow:
			low++
		}
	}
	return fmt.Sprintf("评分: %d | 严重: %d | 高: %d | 中: %d | 低: %d",
		result.Score, critical, high, medium, low)
}

func fingerprintSQL(sqlText string) string {
	sql := strings.TrimSpace(sqlText)
	re := numReplacer.ReplaceAllString(sql, "?")
	re = strings.ReplaceAll(re, "'", "?")
	return truncate(re, 200)
}

var numReplacer = regexp.MustCompile(`\b\d+\b`)

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
