package slowquery

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"db-inspector/pkg/config"
)

type SlowQueryRecord struct {
	ClusterName  string        `json:"cluster"`
	NodeName     string        `json:"node"`
	Schema       string        `json:"schema"`
	SQLText      string        `json:"sql_text"`
	QueryTime    time.Duration `json:"query_time"`
	LockTime     time.Duration `json:"lock_time"`
	RowsSent     int64         `json:"rows_sent"`
	RowsExamined int64         `json:"rows_examined"`
	Timestamp    time.Time     `json:"timestamp"`
	Explain      string        `json:"explain,omitempty"`
}

type Fetcher struct {
	cfg *config.InspectionConfig
}

func NewFetcher(cfg *config.InspectionConfig) *Fetcher {
	return &Fetcher{cfg: cfg}
}

func parseMySQLTimeDuration(s string) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" || s == "00:00:00" {
		return 0
	}
	parts := strings.Split(s, ":")
	var hours, minutes int
	var seconds float64
	switch len(parts) {
	case 3:
		hours, _ = strconv.Atoi(parts[0])
		minutes, _ = strconv.Atoi(parts[1])
		seconds, _ = strconv.ParseFloat(parts[2], 64)
	case 2:
		minutes, _ = strconv.Atoi(parts[0])
		seconds, _ = strconv.ParseFloat(parts[1], 64)
	default:
		d, err := time.ParseDuration(s)
		if err != nil {
			return 0
		}
		return d
	}
	totalSeconds := float64(hours)*3600 + float64(minutes)*60 + seconds
	return time.Duration(totalSeconds * float64(time.Second))
}

func (f *Fetcher) FetchMySQL(db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	return f.FetchMySQLWithContext(context.Background(), db, nodeName, clusterName)
}

func (f *Fetcher) FetchMySQLWithContext(ctx context.Context, db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	threshold := f.cfg.SlowQuery.ThresholdMs
	topN := f.cfg.SlowQuery.TopN
	if topN <= 0 {
		topN = 20
	}
	windowHours := f.cfg.SlowLogWindow
	if windowHours <= 0 {
		windowHours = 24
	}

	query := fmt.Sprintf(`
		SELECT
			COALESCE(db, '') as schema_name,
			sql_text,
			query_time,
			lock_time,
			rows_sent,
			rows_examined,
			start_time
		FROM mysql.slow_log
		WHERE query_time >= %d / 1000
		  AND start_time >= NOW() - INTERVAL %d HOUR
		ORDER BY query_time DESC
		LIMIT %d
	`, threshold, windowHours, topN)

	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()

	rows, err := db.QueryContext(queryCtx, query)
	if err != nil {
		return f.fetchMySQLFromProcesslistWithContext(ctx, db, nodeName, clusterName)
	}
	defer rows.Close()

	return f.scanMySQLRows(rows, clusterName, nodeName), nil
}

func (f *Fetcher) scanMySQLRows(rows *sql.Rows, clusterName string, nodeName string) []SlowQueryRecord {
	maxSQLLen := f.cfg.MaxSQLTextLen
	if maxSQLLen <= 0 {
		maxSQLLen = 4096
	}
	var records []SlowQueryRecord
	for rows.Next() {
		var schemaName string
		var sqlText sql.RawBytes
		var queryTime, lockTime string
		var rowsSent, rowsExamined int64
		var startTime time.Time
		if err := rows.Scan(&schemaName, &sqlText, &queryTime, &lockTime, &rowsSent, &rowsExamined, &startTime); err != nil {
			continue
		}
		qt := parseMySQLTimeDuration(queryTime)
		lt := parseMySQLTimeDuration(lockTime)
		sqlStr := string(sqlText)
		if len(sqlStr) > maxSQLLen {
			sqlStr = sqlStr[:maxSQLLen] + fmt.Sprintf("... (truncated, original %d bytes)", len(sqlText))
		}
		records = append(records, SlowQueryRecord{
			ClusterName:  clusterName,
			NodeName:     nodeName,
			Schema:       schemaName,
			SQLText:      sqlStr,
			QueryTime:    qt,
			LockTime:     lt,
			RowsSent:     rowsSent,
			RowsExamined: rowsExamined,
			Timestamp:    startTime,
		})
	}
	return records
}

func (f *Fetcher) fetchMySQLFromProcesslist(db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	return f.fetchMySQLFromProcesslistWithContext(context.Background(), db, nodeName, clusterName)
}

func (f *Fetcher) fetchMySQLFromProcesslistWithContext(ctx context.Context, db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	query := `
		SELECT
			COALESCE(DATABASE(), '') as schema_name,
			INFO as sql_text,
			TIME as query_seconds,
			0 as lock_seconds,
			0 as rows_sent,
			0 as rows_examined,
			NOW() as start_time
		FROM information_schema.PROCESSLIST
		WHERE COMMAND != 'Daemon'
		  AND TIME >= ?
		  AND INFO IS NOT NULL
		  AND INFO NOT LIKE 'SELECT%'
		ORDER BY TIME DESC
		LIMIT ?
	`
	thresholdSec := float64(f.cfg.SlowQuery.ThresholdMs) / 1000.0
	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()
	rows, err := db.QueryContext(queryCtx, query, thresholdSec, f.cfg.SlowQuery.TopN)
	if err != nil {
		return nil, fmt.Errorf("query processlist on %s: %w", nodeName, err)
	}
	defer rows.Close()

	maxSQLLen := f.cfg.MaxSQLTextLen
	if maxSQLLen <= 0 {
		maxSQLLen = 4096
	}
	var records []SlowQueryRecord
	for rows.Next() {
		var schemaName string
		var sqlText sql.RawBytes
		var querySeconds float64
		var lockSeconds float64
		var rowsSent, rowsExamined int64
		var startTime time.Time
		if err := rows.Scan(&schemaName, &sqlText, &querySeconds, &lockSeconds, &rowsSent, &rowsExamined, &startTime); err != nil {
			continue
		}
		sqlStr := string(sqlText)
		if len(sqlStr) > maxSQLLen {
			sqlStr = sqlStr[:maxSQLLen] + fmt.Sprintf("... (truncated, original %d bytes)", len(sqlText))
		}
		records = append(records, SlowQueryRecord{
			ClusterName:  clusterName,
			NodeName:     nodeName,
			Schema:       schemaName,
			SQLText:      sqlStr,
			QueryTime:    time.Duration(querySeconds * float64(time.Second)),
			LockTime:     time.Duration(lockSeconds * float64(time.Second)),
			RowsSent:     rowsSent,
			RowsExamined: rowsExamined,
			Timestamp:    startTime,
		})
	}
	return records, nil
}

func (f *Fetcher) FetchPostgres(db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	return f.FetchPostgresWithContext(context.Background(), db, nodeName, clusterName)
}

func (f *Fetcher) FetchPostgresWithContext(ctx context.Context, db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	topN := f.cfg.SlowQuery.TopN
	if topN <= 0 {
		topN = 20
	}

	query := fmt.Sprintf(`
		SELECT
			c.datname as schema_name,
			pg_stat_statements.query as sql_text,
			pg_stat_statements.mean_exec_time as mean_ms,
			pg_stat_statements.total_exec_time as total_ms,
			pg_stat_statements.rows as rows_sent,
			pg_stat_statements.calls as calls
		FROM pg_stat_statements
		JOIN pg_database c ON pg_stat_statements.dbid = c.oid
		WHERE pg_stat_statements.mean_exec_time >= %d
		ORDER BY pg_stat_statements.mean_exec_time DESC
		LIMIT %d
	`, f.cfg.SlowQuery.ThresholdMs, topN)

	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()

	rows, err := db.QueryContext(queryCtx, query)
	if err != nil {
		return f.fetchPostgresFromActivityWithContext(ctx, db, nodeName, clusterName)
	}
	defer rows.Close()

	maxSQLLen := f.cfg.MaxSQLTextLen
	if maxSQLLen <= 0 {
		maxSQLLen = 4096
	}
	var records []SlowQueryRecord
	for rows.Next() {
		var schemaName string
		var sqlText sql.RawBytes
		var meanMs, totalMs float64
		var rowsSent, calls int64
		if err := rows.Scan(&schemaName, &sqlText, &meanMs, &totalMs, &rowsSent, &calls); err != nil {
			continue
		}
		sqlStr := string(sqlText)
		if len(sqlStr) > maxSQLLen {
			sqlStr = sqlStr[:maxSQLLen] + fmt.Sprintf("... (truncated, original %d bytes)", len(sqlText))
		}
		records = append(records, SlowQueryRecord{
			ClusterName:  clusterName,
			NodeName:     nodeName,
			Schema:       schemaName,
			SQLText:      sqlStr,
			QueryTime:    time.Duration(meanMs * float64(time.Millisecond)),
			LockTime:     0,
			RowsSent:     rowsSent,
			RowsExamined: rowsSent,
			Timestamp:    time.Now(),
		})
	}
	return records, nil
}

func (f *Fetcher) fetchPostgresFromActivity(db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	return f.fetchPostgresFromActivityWithContext(context.Background(), db, nodeName, clusterName)
}

func (f *Fetcher) fetchPostgresFromActivityWithContext(ctx context.Context, db *sql.DB, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	thresholdSec := float64(f.cfg.SlowQuery.ThresholdMs) / 1000.0
	query := `
		SELECT
			datname as schema_name,
			query as sql_text,
			EXTRACT(EPOCH FROM (now() - query_start)) as query_seconds,
			now() as start_time
		FROM pg_stat_activity
		WHERE state = 'active'
		  AND query NOT LIKE '%%pg_stat%%'
		  AND EXTRACT(EPOCH FROM (now() - query_start)) >= $1
		ORDER BY query_start ASC
		LIMIT $2
	`
	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()
	rows, err := db.QueryContext(queryCtx, query, thresholdSec, f.cfg.SlowQuery.TopN)
	if err != nil {
		return nil, fmt.Errorf("query pg_stat_activity on %s: %w", nodeName, err)
	}
	defer rows.Close()

	maxSQLLen := f.cfg.MaxSQLTextLen
	if maxSQLLen <= 0 {
		maxSQLLen = 4096
	}
	var records []SlowQueryRecord
	for rows.Next() {
		var schemaName string
		var sqlText sql.RawBytes
		var querySeconds float64
		var startTime time.Time
		if err := rows.Scan(&schemaName, &sqlText, &querySeconds, &startTime); err != nil {
			continue
		}
		sqlStr := string(sqlText)
		if len(sqlStr) > maxSQLLen {
			sqlStr = sqlStr[:maxSQLLen] + fmt.Sprintf("... (truncated, original %d bytes)", len(sqlText))
		}
		records = append(records, SlowQueryRecord{
			ClusterName: clusterName,
			NodeName:    nodeName,
			Schema:      schemaName,
			SQLText:     sqlStr,
			QueryTime:   time.Duration(querySeconds * float64(time.Second)),
			Timestamp:   startTime,
		})
	}
	return records, nil
}

func (f *Fetcher) FetchExplain(db *sql.DB, dbType config.DBType, sqlText string) (string, error) {
	return f.FetchExplainWithContext(context.Background(), db, dbType, sqlText)
}

func (f *Fetcher) FetchExplainWithContext(ctx context.Context, db *sql.DB, dbType config.DBType, sqlText string) (string, error) {
	cleanSQL := strings.TrimSpace(sqlText)
	if cleanSQL == "" {
		return "", fmt.Errorf("empty sql text")
	}
	if strings.HasPrefix(strings.ToUpper(cleanSQL), "EXPLAIN") {
		return "", fmt.Errorf("skipping EXPLAIN on already-explained SQL")
	}
	switch dbType {
	case config.MySQL:
		return f.fetchMySQLExplainWithContext(ctx, db, cleanSQL)
	case config.Postgres:
		return f.fetchPostgresExplainWithContext(ctx, db, cleanSQL)
	default:
		return "", fmt.Errorf("explain not supported for %s", dbType)
	}
}

func (f *Fetcher) fetchMySQLExplain(db *sql.DB, sqlText string) (string, error) {
	return f.fetchMySQLExplainWithContext(context.Background(), db, sqlText)
}

func (f *Fetcher) fetchMySQLExplainWithContext(ctx context.Context, db *sql.DB, sqlText string) (string, error) {
	explainSQL := "EXPLAIN " + sqlText
	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()
	rows, err := db.QueryContext(queryCtx, explainSQL)
	if err != nil {
		return "", fmt.Errorf("explain query: %w", err)
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var result strings.Builder
	result.WriteString(strings.Join(cols, "\t"))
	result.WriteString("\n")

	for rows.Next() {
		values := make([]any, len(cols))
		valuePtrs := make([]any, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}
		for i, v := range values {
			if i > 0 {
				result.WriteString("\t")
			}
			if v != nil {
				result.WriteString(fmt.Sprintf("%v", v))
			}
		}
		result.WriteString("\n")
	}
	return result.String(), nil
}

func (f *Fetcher) fetchPostgresExplain(db *sql.DB, sqlText string) (string, error) {
	return f.fetchPostgresExplainWithContext(context.Background(), db, sqlText)
}

func (f *Fetcher) fetchPostgresExplainWithContext(ctx context.Context, db *sql.DB, sqlText string) (string, error) {
	explainSQL := "EXPLAIN " + sqlText
	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(f.cfg.ReadTimeout)*time.Second)
	defer cancel()
	rows, err := db.QueryContext(queryCtx, explainSQL)
	if err != nil {
		return "", fmt.Errorf("explain query: %w", err)
	}
	defer rows.Close()

	var result strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			continue
		}
		result.WriteString(line)
		result.WriteString("\n")
	}
	return result.String(), nil
}

func (f *Fetcher) Fetch(db *sql.DB, dbType config.DBType, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	return f.FetchWithContext(context.Background(), db, dbType, nodeName, clusterName)
}

func (f *Fetcher) FetchWithContext(ctx context.Context, db *sql.DB, dbType config.DBType, nodeName string, clusterName string) ([]SlowQueryRecord, error) {
	switch dbType {
	case config.MySQL:
		return f.FetchMySQLWithContext(ctx, db, nodeName, clusterName)
	case config.Postgres:
		return f.FetchPostgresWithContext(ctx, db, nodeName, clusterName)
	default:
		return nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
}
