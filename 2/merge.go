package federated

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
)

type ResultMerger struct {
	mu sync.RWMutex
}

func NewResultMerger() *ResultMerger {
	return &ResultMerger{}
}

func (m *ResultMerger) Merge(fq *FederatedQuery, results map[string]*QueryResult, qc *QueryContext) (*QueryResult, error) {
	if len(results) == 0 {
		return &QueryResult{
			Rows:    []Row{},
			Columns: []string{},
		}, nil
	}

	if len(fq.Joins) > 0 {
		return m.mergeWithJoins(fq, results, qc)
	}

	if fq.UnionType != "" {
		return m.mergeWithUnion(fq, results, qc)
	}

	if len(results) == 1 {
		for _, r := range results {
			return m.applyPostProcessing(fq, r, qc)
		}
	}

	return m.mergeCrossJoin(fq, results, qc)
}

func (m *ResultMerger) mergeWithJoins(fq *FederatedQuery, results map[string]*QueryResult, qc *QueryContext) (*QueryResult, error) {
	subQueries := fq.SubQueries
	if len(subQueries) == 0 {
		return nil, fmt.Errorf("no subqueries defined")
	}

	aliasToIndex := make(map[string]int)
	for i, sq := range subQueries {
		alias := sq.Alias
		if alias == "" {
			alias = sq.Table
		}
		aliasToIndex[alias] = i
	}

	var currentResult *QueryResult
	firstAlias := subQueries[0].Alias
	if firstAlias == "" {
		firstAlias = subQueries[0].Table
	}
	firstResult, ok := results[firstAlias]
	if !ok {
		return nil, fmt.Errorf("result for alias %s not found", firstAlias)
	}
	currentResult = firstResult

	for joinIdx, join := range fq.Joins {
		leftAlias := join.LeftAlias
		rightAlias := join.RightAlias

		if leftAlias == "" {
			leftAlias = firstAlias
		}

		if rightAlias == "" {
			if joinIdx+1 < len(subQueries) {
				rightAlias = subQueries[joinIdx+1].Alias
				if rightAlias == "" {
					rightAlias = subQueries[joinIdx+1].Table
				}
			} else {
				for alias := range aliasToIndex {
					if alias != firstAlias {
						rightAlias = alias
						break
					}
				}
			}
		}

		rightResult, ok := results[rightAlias]
		if !ok {
			return nil, fmt.Errorf("result for alias %s not found (available aliases: %v)", rightAlias, getResultKeys(results))
		}

		merged, err := m.performJoin(currentResult, rightResult, leftAlias, rightAlias, join)
		if err != nil {
			return nil, fmt.Errorf("join %s with %s: %w", leftAlias, rightAlias, err)
		}
		currentResult = merged
	}

	return m.applyPostProcessing(fq, currentResult, qc)
}

func getResultKeys(results map[string]*QueryResult) []string {
	keys := make([]string, 0, len(results))
	for k := range results {
		keys = append(keys, k)
	}
	return keys
}

func (m *ResultMerger) performJoin(left, right *QueryResult, leftAlias, rightAlias string, joinSpec *JoinSpec) (*QueryResult, error) {
	if left == nil || right == nil {
		return nil, fmt.Errorf("null result in join")
	}

	conditions := joinSpec.Conditions
	if len(conditions) == 0 {
		return m.crossJoin(left, right, leftAlias, rightAlias)
	}

	leftRows := left.Rows
	rightRows := right.Rows

	joinKeys := make([]string, len(conditions))
	for i, cond := range conditions {
		joinKeys[i] = cond.LeftColumn
	}

	rightIndex := buildIndex(rightRows, rightAlias, conditions, true)

	var mergedRows []Row
	for _, leftRow := range leftRows {
		key := buildJoinKey(leftRow, leftAlias, conditions, false)
		matchedRows, found := rightIndex[key]

		switch joinSpec.Type {
		case InnerJoin:
			if found {
				for _, rightRow := range matchedRows {
					mergedRows = append(mergedRows, mergeRows(leftRow, rightRow, leftAlias, rightAlias))
				}
			}
		case LeftJoin:
			if found {
				for _, rightRow := range matchedRows {
					mergedRows = append(mergedRows, mergeRows(leftRow, rightRow, leftAlias, rightAlias))
				}
			} else {
				nullRight := makeNullRow(right.Columns, rightAlias)
				mergedRows = append(mergedRows, mergeRows(leftRow, nullRight, leftAlias, rightAlias))
			}
		case RightJoin:
			if found {
				for _, rightRow := range matchedRows {
					mergedRows = append(mergedRows, mergeRows(leftRow, rightRow, leftAlias, rightAlias))
				}
			}
		case FullJoin:
			if found {
				for _, rightRow := range matchedRows {
					mergedRows = append(mergedRows, mergeRows(leftRow, rightRow, leftAlias, rightAlias))
				}
			} else {
				nullRight := makeNullRow(right.Columns, rightAlias)
				mergedRows = append(mergedRows, mergeRows(leftRow, nullRight, leftAlias, rightAlias))
			}
		}
	}

	if joinSpec.Type == RightJoin || joinSpec.Type == FullJoin {
		matchedRightKeys := make(map[string]bool)
		for _, leftRow := range leftRows {
			key := buildJoinKey(leftRow, leftAlias, conditions, false)
			matchedRightKeys[key] = true
		}

		nullLeft := makeNullRow(left.Columns, leftAlias)
		for _, rightRow := range rightRows {
			key := buildJoinKey(rightRow, rightAlias, conditions, true)
			if !matchedRightKeys[key] {
				mergedRows = append(mergedRows, mergeRows(nullLeft, rightRow, leftAlias, rightAlias))
			}
		}
	}

	columns := mergeColumns(left.Columns, right.Columns, leftAlias, rightAlias)

	return &QueryResult{
		Rows:     mergedRows,
		Columns:  columns,
		RowCount: len(mergedRows),
	}, nil
}

func buildIndex(rows []Row, alias string, conditions []JoinCondition, isRightSide bool) map[string][]Row {
	index := make(map[string][]Row)
	for _, row := range rows {
		key := buildJoinKey(row, alias, conditions, isRightSide)
		index[key] = append(index[key], row)
	}
	return index
}

func buildJoinKey(row Row, alias string, conditions []JoinCondition, isRightSide bool) string {
	var keyBuilder strings.Builder
	for i, cond := range conditions {
		if i > 0 {
			keyBuilder.WriteString("||")
		}
		var col string
		if isRightSide {
			col = cond.RightColumn
		} else {
			col = cond.LeftColumn
		}

		var val interface{}
		var found bool

		if alias != "" {
			qualifiedCol := alias + "." + col
			if strings.HasPrefix(col, alias+".") {
				qualifiedCol = col
				col = strings.TrimPrefix(col, alias+".")
			}
			val, found = row[qualifiedCol]
			if !found {
				val, found = row[col]
			}
		} else {
			val, found = row[col]
		}

		if found {
			fmt.Fprintf(&keyBuilder, "%v", val)
		}
	}
	return keyBuilder.String()
}

func mergeRows(left, right Row, leftAlias, rightAlias string) Row {
	merged := make(Row)
	for k, v := range left {
		if leftAlias != "" {
			merged[leftAlias+"."+k] = v
		}
		merged[k] = v
	}
	for k, v := range right {
		if rightAlias != "" {
			merged[rightAlias+"."+k] = v
		}
		if _, exists := merged[k]; !exists {
			merged[k] = v
		}
	}
	return merged
}

func makeNullRow(columns []string, alias string) Row {
	nullRow := make(Row)
	for _, col := range columns {
		nullRow[col] = nil
	}
	return nullRow
}

func mergeColumns(leftCols, rightCols []string, leftAlias, rightAlias string) []string {
	seen := make(map[string]bool)
	var result []string

	for _, col := range leftCols {
		if !seen[col] {
			seen[col] = true
			result = append(result, col)
		}
	}
	for _, col := range rightCols {
		if !seen[col] {
			seen[col] = true
			result = append(result, col)
		}
	}
	return result
}

func (m *ResultMerger) crossJoin(left, right *QueryResult, leftAlias, rightAlias string) (*QueryResult, error) {
	var mergedRows []Row
	for _, leftRow := range left.Rows {
		for _, rightRow := range right.Rows {
			mergedRows = append(mergedRows, mergeRows(leftRow, rightRow, leftAlias, rightAlias))
		}
	}
	columns := mergeColumns(left.Columns, right.Columns, leftAlias, rightAlias)
	return &QueryResult{
		Rows:     mergedRows,
		Columns:  columns,
		RowCount: len(mergedRows),
	}, nil
}

func (m *ResultMerger) mergeCrossJoin(fq *FederatedQuery, results map[string]*QueryResult, qc *QueryContext) (*QueryResult, error) {
	var resultAliases []string
	for alias := range results {
		resultAliases = append(resultAliases, alias)
	}

	if len(resultAliases) == 0 {
		return &QueryResult{Rows: []Row{}, Columns: []string{}}, nil
	}

	current := results[resultAliases[0]]
	for i := 1; i < len(resultAliases); i++ {
		next := results[resultAliases[i]]
		merged, err := m.crossJoin(current, next, resultAliases[i-1], resultAliases[i])
		if err != nil {
			return nil, err
		}
		current = merged
	}

	return m.applyPostProcessing(fq, current, qc)
}

func (m *ResultMerger) mergeWithUnion(fq *FederatedQuery, results map[string]*QueryResult, qc *QueryContext) (*QueryResult, error) {
	var allRows []Row
	var allColumns []string
	seenCols := make(map[string]bool)

	for _, result := range results {
		for _, col := range result.Columns {
			if !seenCols[col] {
				seenCols[col] = true
				allColumns = append(allColumns, col)
			}
		}
		allRows = append(allRows, result.Rows...)
	}

	if !fq.UnionAll {
		allRows = deduplicateRows(allRows)
	}

	return m.applyPostProcessing(fq, &QueryResult{
		Rows:    allRows,
		Columns: allColumns,
	}, qc)
}

func deduplicateRows(rows []Row) []Row {
	seen := make(map[string]bool)
	var result []Row
	for _, row := range rows {
		key := rowToKey(row)
		if !seen[key] {
			seen[key] = true
			result = append(result, row)
		}
	}
	return result
}

func rowToKey(row Row) string {
	var sb strings.Builder
	keys := make([]string, 0, len(row))
	for k := range row {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Fprintf(&sb, "%s=%v|", k, row[k])
	}
	return sb.String()
}

func (m *ResultMerger) applyPostProcessing(fq *FederatedQuery, result *QueryResult, qc *QueryContext) (*QueryResult, error) {
	if result == nil {
		return nil, fmt.Errorf("null result for post processing")
	}

	rows := result.Rows

	if len(fq.WhereFilters) > 0 {
		filtered, err := applyFilters(rows, fq.WhereFilters)
		if err != nil {
			return nil, fmt.Errorf("filter error: %w", err)
		}
		rows = filtered
	}

	if len(fq.GroupBy) > 0 {
		rows = applyGroupBy(rows, fq.GroupBy, fq.Columns)
	}

	if fq.Having != "" {
		rows = applyHaving(rows, fq.Having)
	}

	if len(fq.GlobalOrderBy) > 0 {
		rows = applyOrderBy(rows, fq.GlobalOrderBy)
	}

	if fq.GlobalOffset > 0 {
		if fq.GlobalOffset < len(rows) {
			rows = rows[fq.GlobalOffset:]
		} else {
			rows = []Row{}
		}
	}

	if fq.GlobalLimit > 0 && fq.GlobalLimit < len(rows) {
		rows = rows[:fq.GlobalLimit]
	}

	rows = applyColumnSelection(rows, fq.Columns)

	result.Rows = rows
	result.RowCount = len(rows)
	if len(result.Columns) == 0 && len(fq.Columns) > 0 {
		result.Columns = fq.Columns
	}

	return result, nil
}

func applyFilters(rows []Row, filters []string) ([]Row, error) {
	var result []Row
	for _, row := range rows {
		matched := true
		for _, filter := range filters {
			if !evaluateFilter(row, filter) {
				matched = false
				break
			}
		}
		if matched {
			result = append(result, row)
		}
	}
	return result, nil
}

func evaluateFilter(row Row, filter string) bool {
	filter = strings.TrimSpace(filter)

	if strings.Contains(filter, "AND") {
		parts := splitFilter(filter, "AND")
		for _, part := range parts {
			if !evaluateFilter(row, strings.TrimSpace(part)) {
				return false
			}
		}
		return true
	}

	if strings.Contains(filter, "OR") {
		parts := splitFilter(filter, "OR")
		for _, part := range parts {
			if evaluateFilter(row, strings.TrimSpace(part)) {
				return true
			}
		}
		return false
	}

	return evaluateSimpleCondition(row, filter)
}

func splitFilter(filter, keyword string) []string {
	upperFilter := strings.ToUpper(filter)
	kw := strings.ToUpper(keyword)
	var parts []string
	var current strings.Builder
	i := 0
	for i < len(upperFilter) {
		if strings.HasPrefix(upperFilter[i:], kw) {
			parts = append(parts, current.String())
			current.Reset()
			i += len(kw)
			continue
		}
		current.WriteByte(filter[i])
		i++
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

func evaluateSimpleCondition(row Row, cond string) bool {
	re := regexp.MustCompile(`(\w+)\s*(=|<>|!=|>|<|>=|<=|LIKE|IN)\s*(.+)`)
	matches := re.FindStringSubmatch(cond)
	if len(matches) < 4 {
		return true
	}

	col := matches[1]
	op := matches[2]
	valStr := strings.TrimSpace(matches[3])
	valStr = strings.Trim(valStr, "'\"")

	rowVal, ok := row[col]
	if !ok {
		for k, v := range row {
			if strings.HasSuffix(k, "."+col) {
				rowVal = v
				ok = true
				break
			}
		}
	}
	if !ok {
		return false
	}

	switch strings.ToUpper(op) {
	case "=":
		return fmt.Sprintf("%v", rowVal) == valStr
	case "<>", "!=":
		return fmt.Sprintf("%v", rowVal) != valStr
	case ">":
		return compareValues(rowVal, valStr) > 0
	case "<":
		return compareValues(rowVal, valStr) < 0
	case ">=":
		return compareValues(rowVal, valStr) >= 0
	case "<=":
		return compareValues(rowVal, valStr) <= 0
	case "LIKE":
		return likeMatch(fmt.Sprintf("%v", rowVal), valStr)
	case "IN":
		return inMatch(fmt.Sprintf("%v", rowVal), valStr)
	default:
		return true
	}
}

func compareValues(a, b interface{}) int {
	aFloat, aOk := toFloat(a)
	bFloat, bOk := toFloat(b)
	if aOk && bOk {
		switch {
		case aFloat < bFloat:
			return -1
		case aFloat > bFloat:
			return 1
		default:
			return 0
		}
	}
	aStr := fmt.Sprintf("%v", a)
	bStr := fmt.Sprintf("%v", b)
	if aStr < bStr {
		return -1
	} else if aStr > bStr {
		return 1
	}
	return 0
}

func toFloat(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case int32:
		return float64(val), true
	default:
		return 0, false
	}
}

func likeMatch(s, pattern string) bool {
	pattern = strings.ReplaceAll(pattern, "%", ".*")
	pattern = strings.ReplaceAll(pattern, "_", ".")
	re := regexp.MustCompile("^" + pattern + "$")
	return re.MatchString(s)
}

func inMatch(s, list string) bool {
	list = strings.Trim(list, "()")
	items := strings.Split(list, ",")
	for _, item := range items {
		item = strings.TrimSpace(item)
		item = strings.Trim(item, "'\"")
		if s == item {
			return true
		}
	}
	return false
}

func applyGroupBy(rows []Row, groupCols []string, selectCols []string) []Row {
	groups := make(map[string][]Row)
	for _, row := range rows {
		key := buildGroupKey(row, groupCols)
		groups[key] = append(groups[key], row)
	}

	var result []Row
	for _, group := range groups {
		if len(group) > 0 {
			aggregated := aggregateGroup(group, selectCols)
			result = append(result, aggregated)
		}
	}
	return result
}

func buildGroupKey(row Row, groupCols []string) string {
	var sb strings.Builder
	for i, col := range groupCols {
		if i > 0 {
			sb.WriteString("||")
		}
		val, ok := row[col]
		if ok {
			fmt.Fprintf(&sb, "%v", val)
		}
	}
	return sb.String()
}

func aggregateGroup(group []Row, selectCols []string) Row {
	if len(group) == 0 {
		return Row{}
	}

	result := make(Row)
	for _, col := range selectCols {
		upperCol := strings.ToUpper(col)

		if strings.HasPrefix(upperCol, "COUNT(") {
			result[col] = len(group)
			continue
		}
		if strings.HasPrefix(upperCol, "SUM(") {
			inner := col[4 : len(col)-1]
			sum := 0.0
			for _, row := range group {
				if v, ok := toFloat(row[inner]); ok {
					sum += v
				}
			}
			result[col] = sum
			continue
		}
		if strings.HasPrefix(upperCol, "AVG(") {
			inner := col[4 : len(col)-1]
			sum := 0.0
			count := 0
			for _, row := range group {
				if v, ok := toFloat(row[inner]); ok {
					sum += v
					count++
				}
			}
			if count > 0 {
				result[col] = sum / float64(count)
			} else {
				result[col] = nil
			}
			continue
		}
		if strings.HasPrefix(upperCol, "MIN(") {
			inner := col[4 : len(col)-1]
			var minVal interface{}
			for _, row := range group {
				if v, ok := row[inner]; ok {
					if minVal == nil || compareValues(v, minVal) < 0 {
						minVal = v
					}
				}
			}
			result[col] = minVal
			continue
		}
		if strings.HasPrefix(upperCol, "MAX(") {
			inner := col[4 : len(col)-1]
			var maxVal interface{}
			for _, row := range group {
				if v, ok := row[inner]; ok {
					if maxVal == nil || compareValues(v, maxVal) > 0 {
						maxVal = v
					}
				}
			}
			result[col] = maxVal
			continue
		}

		result[col] = group[0][col]
	}
	return result
}

func applyHaving(rows []Row, having string) []Row {
	var result []Row
	for _, row := range rows {
		if evaluateFilter(row, having) {
			result = append(result, row)
		}
	}
	return result
}

func applyOrderBy(rows []Row, orderClauses []OrderClause) []Row {
	sort.SliceStable(rows, func(i, j int) bool {
		for _, oc := range orderClauses {
			valI := rows[i][oc.Column]
			valJ := rows[j][oc.Column]

			if valI == nil && valJ == nil {
				continue
			}
			if valI == nil {
				return !oc.Desc
			}
			if valJ == nil {
				return oc.Desc
			}

			comp := compareValues(valI, valJ)
			if comp != 0 {
				if oc.Desc {
					return comp > 0
				}
				return comp < 0
			}
		}
		return false
	})
	return rows
}

func applyColumnSelection(rows []Row, columns []string) []Row {
	if len(columns) == 0 || (len(columns) == 1 && columns[0] == "*") {
		return rows
	}

	var result []Row
	for _, row := range rows {
		selected := make(Row)
		for _, col := range columns {
			if val, ok := row[col]; ok {
				selected[col] = val
			} else {
				for k, v := range row {
					if strings.HasSuffix(k, "."+col) || strings.HasSuffix(k, "."+strings.Split(col, ".")[0]) {
						selected[col] = v
						break
					}
				}
			}
		}
		result = append(result, selected)
	}
	return result
}

func (m *ResultMerger) SortResults(results map[string]*QueryResult, orderClauses []OrderClause) map[string]*QueryResult {
	sorted := make(map[string]*QueryResult)
	for alias, result := range results {
		sorted[alias] = &QueryResult{
			Rows:     applyOrderBy(result.Rows, orderClauses),
			Columns:  result.Columns,
			RowCount: result.RowCount,
			Source:   result.Source,
		}
	}
	return sorted
}

func (m *ResultMerger) LimitResults(results map[string]*QueryResult, limit, offset int) map[string]*QueryResult {
	limited := make(map[string]*QueryResult)
	for alias, result := range results {
		rows := result.Rows
		if offset > 0 && offset < len(rows) {
			rows = rows[offset:]
		}
		if limit > 0 && limit < len(rows) {
			rows = rows[:limit]
		}
		limited[alias] = &QueryResult{
			Rows:     rows,
			Columns:  result.Columns,
			RowCount: len(rows),
			Source:   result.Source,
		}
	}
	return limited
}

type MergeStats struct {
	TotalRows   int
	SourceCount int
	MergeTime   int64
	JoinCount   int
	UnionCount  int
}

func (m *ResultMerger) ComputeStats(results map[string]*QueryResult, fq *FederatedQuery) MergeStats {
	stats := MergeStats{
		SourceCount: len(results),
		JoinCount:   len(fq.Joins),
	}
	if fq.UnionType != "" {
		stats.UnionCount = len(fq.SubQueries)
	}
	for _, r := range results {
		stats.TotalRows += r.RowCount
	}
	return stats
}

func (m *ResultMerger) ValidateResults(results map[string]*QueryResult) error {
	for alias, result := range results {
		if result.Err != nil {
			return fmt.Errorf("source %s error: %w", alias, result.Err)
		}
		for _, row := range result.Rows {
			for col := range row {
				_ = col
			}
		}
	}
	return nil
}

func ConvertToMaps(rows []Row) []map[string]interface{} {
	result := make([]map[string]interface{}, len(rows))
	for i, row := range rows {
		result[i] = make(map[string]interface{})
		for k, v := range row {
			result[i][k] = v
		}
	}
	return result
}

func FilterByColumns(rows []Row, columns []string) []Row {
	if len(columns) == 0 {
		return rows
	}
	result := make([]Row, len(rows))
	for i, row := range rows {
		filtered := make(Row)
		for _, col := range columns {
			for k, v := range row {
				if k == col || strings.HasSuffix(k, "."+col) {
					filtered[col] = v
					break
				}
			}
		}
		result[i] = filtered
	}
	return result
}

func DistinctRows(rows []Row, columns []string) []Row {
	seen := make(map[string]bool)
	var result []Row
	for _, row := range rows {
		var key strings.Builder
		for _, col := range columns {
			if v, ok := row[col]; ok {
				fmt.Fprintf(&key, "%v|", v)
			} else {
				for k, v := range row {
					if strings.HasSuffix(k, "."+col) {
						fmt.Fprintf(&key, "%v|", v)
						break
					}
				}
			}
		}
		k := key.String()
		if !seen[k] {
			seen[k] = true
			result = append(result, row)
		}
	}
	return result
}

type MergeStrategy int

const (
	HashJoinStrategy MergeStrategy = iota
	NestedLoopJoinStrategy
	SortMergeJoinStrategy
)

func (m *ResultMerger) SetStrategy(strategy MergeStrategy) {
}
