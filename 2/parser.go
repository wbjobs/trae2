package federated

import (
	"fmt"
	"regexp"
	"strings"
)

type SQLParser struct {
	sourceAliasMap map[string]string
}

func NewSQLParser() *SQLParser {
	return &SQLParser{
		sourceAliasMap: make(map[string]string),
	}
}

func (p *SQLParser) Parse(sql string) (*FederatedQuery, error) {
	sql = strings.TrimSpace(sql)
	sql = p.stripComments(sql)

	if sql == "" {
		return nil, fmt.Errorf("empty query")
	}

	fq := &FederatedQuery{}

	if strings.Contains(strings.ToUpper(sql), "UNION") {
		return p.parseUnion(sql)
	}

	parts := p.splitSQL(sql)

	subQueries, err := p.extractSubQueries(parts)
	if err != nil {
		return nil, err
	}
	fq.SubQueries = subQueries

	joins, err := p.extractJoins(parts)
	if err != nil {
		return nil, err
	}
	fq.Joins = joins

	columns, err := p.extractColumns(parts)
	if err != nil {
		return nil, err
	}
	fq.Columns = columns

	whereFilters, err := p.extractWhereFilters(parts)
	if err != nil {
		return nil, err
	}
	fq.WhereFilters = whereFilters

	groupBy, err := p.extractGroupBy(parts)
	if err != nil {
		return nil, err
	}
	fq.GroupBy = groupBy

	having, err := p.extractHaving(parts)
	if err != nil {
		return nil, err
	}
	fq.Having = having

	orderBy, err := p.extractOrderBy(parts)
	if err != nil {
		return nil, err
	}
	fq.GlobalOrderBy = orderBy

	limit, offset, err := p.extractLimitOffset(parts)
	if err != nil {
		return nil, err
	}
	fq.GlobalLimit = limit
	fq.GlobalOffset = offset

	return fq, nil
}

func (p *SQLParser) parseUnion(sql string) (*FederatedQuery, error) {
	fq := &FederatedQuery{}

	unionParts := p.splitUnion(sql)
	if len(unionParts) < 2 {
		return nil, fmt.Errorf("invalid UNION syntax")
	}

	fq.UnionAll = strings.Contains(strings.ToUpper(sql), "UNION ALL")
	if fq.UnionAll {
		fq.UnionType = "UNION ALL"
	} else {
		fq.UnionType = "UNION"
	}

	cleanedParts := make([]string, 0, len(unionParts))
	for _, part := range unionParts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(strings.ToUpper(part), "UNION") {
			continue
		}
		cleanedParts = append(cleanedParts, part)
	}

	for i, part := range cleanedParts {
		subFq, err := p.Parse(part)
		if err != nil {
			return nil, fmt.Errorf("parse union part %d: %w", i+1, err)
		}
		fq.SubQueries = append(fq.SubQueries, subFq.SubQueries...)
	}

	return fq, nil
}

func (p *SQLParser) splitUnion(sql string) []string {
	upperSQL := strings.ToUpper(sql)
	var parts []string
	var current strings.Builder
	inParens := 0
	i := 0
	for i < len(upperSQL) {
		ch := upperSQL[i]
		switch ch {
		case '(':
			inParens++
			current.WriteByte(sql[i])
		case ')':
			inParens--
			current.WriteByte(sql[i])
		case ' ':
			if inParens == 0 && i+6 <= len(upperSQL) && upperSQL[i:i+5] == "UNION" {
				rest := strings.TrimSpace(upperSQL[i+5:])
				trimLen := len(upperSQL[i+5:]) - len(strings.TrimLeft(upperSQL[i+5:], " \t"))
				if !strings.HasPrefix(rest, "SELECT") {
					current.WriteByte(sql[i])
					i++
					continue
				}
				parts = append(parts, current.String())
				current.Reset()
				parts = append(parts, sql[i:i+5+trimLen+1])
				i += 5 + trimLen
				continue
			}
			current.WriteByte(sql[i])
		default:
			current.WriteByte(sql[i])
		}
		i++
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

func (p *SQLParser) stripComments(sql string) string {
	re := regexp.MustCompile(`--[^\n]*`)
	sql = re.ReplaceAllString(sql, "")
	re2 := regexp.MustCompile(`/\*.*?\*/`)
	sql = re2.ReplaceAllString(sql, "")
	return sql
}

func (p *SQLParser) splitSQL(sql string) map[string]string {
	parts := make(map[string]string)
	upperSQL := strings.ToUpper(sql)

	keywords := []string{"SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "ON"}

	for _, kw := range keywords {
		idx := strings.Index(upperSQL, " "+kw+" ")
		if idx == -1 {
			idx = strings.Index(upperSQL, kw+" ")
			if idx == 0 {
				idx = 0
			} else {
				continue
			}
		}
		if idx > 0 {
			parts["before_"+strings.ReplaceAll(kw, " ", "_")] = sql[:idx]
		}
		parts[strings.ReplaceAll(kw, " ", "_")] = sql[idx+len(kw):]
	}

	fromIdx := strings.Index(upperSQL, "FROM")
	if fromIdx >= 0 {
		parts["FROM"] = sql[fromIdx+4:]
		parts["SELECT"] = sql[6:fromIdx]
	}

	return parts
}

func (p *SQLParser) extractSubQueries(parts map[string]string) ([]*SubQuery, error) {
	var subQueries []*SubQuery

	fromSQL, ok := parts["FROM"]
	if !ok {
		return nil, fmt.Errorf("no FROM clause found")
	}
	fromSQL = strings.TrimSpace(fromSQL)

	joinStart := p.findJoinStart(fromSQL)
	if joinStart > 0 {
		fromPart := strings.TrimSpace(fromSQL[:joinStart])
		sq, err := p.parseTableRef(fromPart)
		if err != nil {
			return nil, err
		}
		subQueries = append(subQueries, sq)
	} else {
		sq, err := p.parseTableRef(fromSQL)
		if err != nil {
			return nil, err
		}
		subQueries = append(subQueries, sq)
	}

	for kw, val := range parts {
		if strings.HasPrefix(kw, "JOIN") || strings.Contains(kw, "JOIN") {
			joinSQ, err := p.parseJoinTable(val)
			if err != nil {
				return nil, err
			}
			if joinSQ != nil {
				subQueries = append(subQueries, joinSQ)
			}
		}
	}

	return subQueries, nil
}

func (p *SQLParser) findJoinStart(sql string) int {
	upperSQL := strings.ToUpper(sql)
	joinKeywords := []string{" JOIN ", " INNER JOIN ", " LEFT JOIN ", " RIGHT JOIN ", " FULL JOIN "}
	earliest := -1
	for _, kw := range joinKeywords {
		idx := strings.Index(upperSQL, kw)
		if idx >= 0 && (earliest == -1 || idx < earliest) {
			earliest = idx
		}
	}
	return earliest
}

func (p *SQLParser) parseTableRef(ref string) (*SubQuery, error) {
	ref = strings.TrimSpace(ref)
	aliasIdx := p.findAliasBoundary(ref)

	var tableName, alias string
	if aliasIdx > 0 {
		tableName = strings.TrimSpace(ref[:aliasIdx])
		alias = strings.TrimSpace(ref[aliasIdx:])
	} else {
		tableName = ref
	}

	sq := &SubQuery{
		Alias: alias,
	}

	source, database, table, err := p.parseQualifiedName(tableName)
	if err != nil {
		return nil, err
	}
	sq.Source = source
	sq.Database = database
	sq.Table = table

	if alias == "" {
		sq.Alias = table
	}

	return sq, nil
}

func (p *SQLParser) parseJoinTable(val string) (*SubQuery, error) {
	val = strings.TrimSpace(val)
	if val == "" {
		return nil, nil
	}

	upperVal := strings.ToUpper(val)
	onIdx := strings.Index(upperVal, "ON")
	joinPart := val
	if onIdx > 0 {
		joinPart = strings.TrimSpace(val[:onIdx])
	}

	joinPart = strings.TrimSpace(joinPart)
	aliasIdx := p.findAliasBoundary(joinPart)

	var tableName, alias string
	if aliasIdx > 0 {
		tableName = strings.TrimSpace(joinPart[:aliasIdx])
		alias = strings.TrimSpace(joinPart[aliasIdx:])
	} else {
		tableName = joinPart
	}

	sq := &SubQuery{
		Alias: alias,
	}

	source, database, table, err := p.parseQualifiedName(tableName)
	if err != nil {
		return nil, err
	}
	sq.Source = source
	sq.Database = database
	sq.Table = table

	if alias == "" {
		sq.Alias = table
	}

	return sq, nil
}

func (p *SQLParser) findAliasBoundary(s string) int {
	trimmed := strings.TrimSpace(s)
	upperTrimmed := strings.ToUpper(trimmed)

	if len(trimmed) > 3 && (upperTrimmed[:3] == "AS " || (len(trimmed) > 2 && upperTrimmed[:2] == "AS")) {
		rest := strings.TrimSpace(trimmed[2:])
		idx := len(s) - len(rest)
		return idx
	}

	parts := strings.Fields(trimmed)
	if len(parts) >= 2 {
		lastPart := parts[len(parts)-1]
		secondLast := parts[len(parts)-2]
		if !strings.Contains(secondLast, ".") && !strings.ContainsAny(secondLast, "()") {
			if !strings.Contains(lastPart, ".") && !strings.ContainsAny(lastPart, "()") {
				idx := strings.LastIndex(s, " "+lastPart)
				if idx > 0 {
					return idx + 1
				}
			}
		}
	}

	return -1
}

func (p *SQLParser) parseQualifiedName(name string) (source string, database string, table string, err error) {
	parts := strings.Split(name, ".")
	switch len(parts) {
	case 1:
		return "", "", parts[0], nil
	case 2:
		return parts[0], "", parts[1], nil
	case 3:
		return parts[0], parts[1], parts[2], nil
	default:
		return "", "", "", fmt.Errorf("invalid qualified name: %s", name)
	}
}

func (p *SQLParser) extractJoins(parts map[string]string) ([]*JoinSpec, error) {
	var joins []*JoinSpec

	for kw, val := range parts {
		if strings.HasPrefix(kw, "JOIN") || strings.Contains(kw, "JOIN") {
			upperVal := strings.ToUpper(val)
			onIdx := strings.Index(upperVal, "ON")
			if onIdx < 0 {
				continue
			}

			tablePart := strings.TrimSpace(val[:onIdx])
			onPart := strings.TrimSpace(val[onIdx+2:])

			rightAlias := p.extractTableAlias(tablePart)

			joinSpec := &JoinSpec{
				Type:       p.resolveJoinType(kw),
				RightAlias: rightAlias,
			}

			conditions, err := p.parseJoinConditions(onPart)
			if err != nil {
				return nil, err
			}
			joinSpec.Conditions = conditions

			if len(conditions) > 0 {
				joinSpec.LeftAlias = p.extractAliasFromColumn(conditions[0].LeftColumn)
			}

			joins = append(joins, joinSpec)
		}
	}

	return joins, nil
}

func (p *SQLParser) extractTableAlias(tablePart string) string {
	tablePart = strings.TrimSpace(tablePart)
	aliasIdx := p.findAliasBoundary(tablePart)
	if aliasIdx > 0 {
		return strings.TrimSpace(tablePart[aliasIdx:])
	}

	parts := strings.Split(strings.TrimSpace(tablePart), ".")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return ""
}

func (p *SQLParser) extractAliasFromColumn(col string) string {
	if idx := strings.Index(col, "."); idx > 0 {
		return col[:idx]
	}
	return ""
}

func (p *SQLParser) resolveJoinType(kw string) JoinType {
	upperKW := strings.ToUpper(kw)
	switch {
	case strings.Contains(upperKW, "LEFT"):
		return LeftJoin
	case strings.Contains(upperKW, "RIGHT"):
		return RightJoin
	case strings.Contains(upperKW, "FULL"):
		return FullJoin
	default:
		return InnerJoin
	}
}

func (p *SQLParser) parseJoinConditions(onSQL string) ([]JoinCondition, error) {
	var conditions []JoinCondition

	andParts := p.splitByKeyword(onSQL, "AND")
	for _, part := range andParts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		re := regexp.MustCompile(`(\w+(?:\.\w+)?)\s*(=|<>|!=|>|<|>=|<=)\s*(\w+(?:\.\w+)?)`)
		matches := re.FindStringSubmatch(part)
		if len(matches) >= 4 {
			conditions = append(conditions, JoinCondition{
				LeftColumn:  matches[1],
				Operator:    matches[2],
				RightColumn: matches[3],
			})
		}
	}

	return conditions, nil
}

func (p *SQLParser) splitByKeyword(s string, keyword string) []string {
	upperS := strings.ToUpper(s)
	kw := strings.ToUpper(keyword)
	var parts []string
	var current strings.Builder
	i := 0
	for i < len(upperS) {
		if strings.HasPrefix(upperS[i:], kw) {
			if i == 0 || s[i-1] == ' ' || s[i-1] == '\n' {
				parts = append(parts, current.String())
				current.Reset()
				i += len(kw)
				continue
			}
		}
		current.WriteByte(s[i])
		i++
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

func (p *SQLParser) extractColumns(parts map[string]string) ([]string, error) {
	selectSQL, ok := parts["SELECT"]
	if !ok {
		return nil, nil
	}
	selectSQL = strings.TrimSpace(selectSQL)
	if selectSQL == "*" {
		return []string{"*"}, nil
	}

	cols := strings.Split(selectSQL, ",")
	result := make([]string, 0, len(cols))
	for _, col := range cols {
		col = strings.TrimSpace(col)
		if col != "" {
			result = append(result, col)
		}
	}
	return result, nil
}

func (p *SQLParser) extractWhereFilters(parts map[string]string) ([]string, error) {
	whereSQL, ok := parts["WHERE"]
	if !ok {
		return nil, nil
	}
	whereSQL = strings.TrimSpace(whereSQL)
	if whereSQL == "" {
		return nil, nil
	}

	andParts := p.splitByKeyword(whereSQL, "AND")
	result := make([]string, 0, len(andParts))
	for _, part := range andParts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result, nil
}

func (p *SQLParser) extractGroupBy(parts map[string]string) ([]string, error) {
	groupBySQL, ok := parts["GROUP_BY"]
	if !ok {
		return nil, nil
	}
	groupBySQL = strings.TrimSpace(groupBySQL)
	if groupBySQL == "" {
		return nil, nil
	}

	cols := strings.Split(groupBySQL, ",")
	result := make([]string, 0, len(cols))
	for _, col := range cols {
		col = strings.TrimSpace(col)
		if col != "" {
			result = append(result, col)
		}
	}
	return result, nil
}

func (p *SQLParser) extractHaving(parts map[string]string) (string, error) {
	havingSQL, ok := parts["HAVING"]
	if !ok {
		return "", nil
	}
	return strings.TrimSpace(havingSQL), nil
}

func (p *SQLParser) extractOrderBy(parts map[string]string) ([]OrderClause, error) {
	orderBySQL, ok := parts["ORDER_BY"]
	if !ok {
		return nil, nil
	}
	orderBySQL = strings.TrimSpace(orderBySQL)
	if orderBySQL == "" {
		return nil, nil
	}

	parts := strings.Split(orderBySQL, ",")
	result := make([]OrderClause, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		upperPart := strings.ToUpper(part)
		desc := strings.HasSuffix(upperPart, " DESC")
		asc := strings.HasSuffix(upperPart, " ASC")
		col := part
		if desc {
			col = strings.TrimSpace(part[:len(part)-5])
		} else if asc {
			col = strings.TrimSpace(part[:len(part)-4])
		}
		result = append(result, OrderClause{
			Column: col,
			Desc:   desc,
		})
	}
	return result, nil
}

func (p *SQLParser) extractLimitOffset(parts map[string]string) (int, int, error) {
	limit := 0
	offset := 0

	if limitSQL, ok := parts["LIMIT"]; ok {
		limitSQL = strings.TrimSpace(limitSQL)
		if limitSQL != "" {
			fmt.Sscanf(limitSQL, "%d", &limit)
		}
	}

	if offsetSQL, ok := parts["OFFSET"]; ok {
		offsetSQL = strings.TrimSpace(offsetSQL)
		if offsetSQL != "" {
			fmt.Sscanf(offsetSQL, "%d", &offset)
		}
	}

	return limit, offset, nil
}

func (p *SQLParser) BuildSourceSQL(sq *SubQuery) string {
	var sb strings.Builder

	sb.WriteString("SELECT ")

	if len(sq.Columns) > 0 {
		for i, col := range sq.Columns {
			if i > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString(col)
		}
	} else {
		sb.WriteString("*")
	}

	sb.WriteString(" FROM ")
	if sq.Database != "" {
		sb.WriteString(sq.Database)
		sb.WriteString(".")
	}
	sb.WriteString(sq.Table)

	if sq.Where != "" {
		sb.WriteString(" WHERE ")
		sb.WriteString(sq.Where)
	}

	if len(sq.OrderBy) > 0 {
		sb.WriteString(" ORDER BY ")
		for i, ob := range sq.OrderBy {
			if i > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString(ob.Column)
			if ob.Desc {
				sb.WriteString(" DESC")
			}
		}
	}

	if sq.Limit > 0 {
		sb.WriteString(" LIMIT ")
		fmt.Fprintf(&sb, "%d", sq.Limit)
	}

	if sq.Offset > 0 {
		sb.WriteString(" OFFSET ")
		fmt.Fprintf(&sb, "%d", sq.Offset)
	}

	return sb.String()
}
