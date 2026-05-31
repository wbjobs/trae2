package federated

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

type SlowQueryLogEntry struct {
	QueryID     string        `json:"query_id"`
	UserID      string        `json:"user_id"`
	SQL         string        `json:"sql"`
	StartTime   time.Time     `json:"start_time"`
	EndTime     time.Time     `json:"end_time"`
	Duration    time.Duration `json:"duration_ms"`
	RowCount    int           `json:"row_count"`
	SourceCount int           `json:"source_count"`
	Sources     []string      `json:"sources"`
	IsCacheHit  bool          `json:"is_cache_hit"`
	Error       string        `json:"error,omitempty"`
	Timestamp   time.Time     `json:"timestamp"`
}

type SlowQueryLogger struct {
	threshold      time.Duration
	logs           []*SlowQueryLogEntry
	maxLogs        int
	mu             sync.RWMutex
	writers        []io.Writer
	enabled        bool
	logFilePath    string
	fileWriter     *os.File
	callback       func(*SlowQueryLogEntry)
	stats          SlowQueryStats
}

type SlowQueryStats struct {
	TotalQueries     int64
	SlowQueries      int64
	AvgDuration      time.Duration
	MaxDuration      time.Duration
	MinDuration      time.Duration
	TotalDuration    time.Duration
	CacheHits        int64
	CacheMisses      int64
	ErrorCount       int64
}

type SlowLogOption func(*SlowQueryLogger)

func WithThreshold(threshold time.Duration) SlowLogOption {
	return func(l *SlowQueryLogger) {
		l.threshold = threshold
	}
}

func WithMaxLogs(max int) SlowLogOption {
	return func(l *SlowQueryLogger) {
		l.maxLogs = max
	}
}

func WithLogFile(path string) SlowLogOption {
	return func(l *SlowQueryLogger) {
		l.logFilePath = path
	}
}

func WithCallback(cb func(*SlowQueryLogEntry)) SlowLogOption {
	return func(l *SlowQueryLogger) {
		l.callback = cb
	}
}

func WithSlowLogEnabled(enabled bool) SlowLogOption {
	return func(l *SlowQueryLogger) {
		l.enabled = enabled
	}
}

func NewSlowQueryLogger(opts ...SlowLogOption) *SlowQueryLogger {
	l := &SlowQueryLogger{
		threshold: 1000 * time.Millisecond,
		maxLogs:   10000,
		logs:      make([]*SlowQueryLogEntry, 0),
		enabled:   true,
	}
	for _, opt := range opts {
		opt(l)
	}
	if l.logFilePath != "" {
		l.openLogFile()
	}
	return l
}

func (l *SlowQueryLogger) openLogFile() error {
	if l.logFilePath == "" {
		return nil
	}
	f, err := os.OpenFile(l.logFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	l.fileWriter = f
	l.writers = append(l.writers, f)
	return nil
}

func (l *SlowQueryLogger) Close() error {
	if l.fileWriter != nil {
		return l.fileWriter.Close()
	}
	return nil
}

func (l *SlowQueryLogger) Log(entry *SlowQueryLogEntry) {
	if !l.enabled || entry == nil {
		return
	}

	if entry.Duration < l.threshold {
		l.updateStats(entry)
		return
	}

	entry.Timestamp = time.Now()

	l.mu.Lock()
	l.logs = append(l.logs, entry)
	if len(l.logs) > l.maxLogs {
		trim := len(l.logs) - l.maxLogs
		l.logs = l.logs[trim:]
	}
	l.updateStats(entry)
	l.mu.Unlock()

	l.writeToWriters(entry)

	if l.callback != nil {
		l.callback(entry)
	}
}

func (l *SlowQueryLogger) updateStats(entry *SlowQueryLogEntry) {
	l.stats.TotalQueries++

	if entry.Duration >= l.threshold {
		l.stats.SlowQueries++
	}

	l.stats.TotalDuration += entry.Duration
	l.stats.AvgDuration = l.stats.TotalDuration / time.Duration(l.stats.TotalQueries)

	if entry.Duration > l.stats.MaxDuration {
		l.stats.MaxDuration = entry.Duration
	}
	if l.stats.MinDuration == 0 || entry.Duration < l.stats.MinDuration {
		l.stats.MinDuration = entry.Duration
	}

	if entry.IsCacheHit {
		l.stats.CacheHits++
	} else {
		l.stats.CacheMisses++
	}

	if entry.Error != "" {
		l.stats.ErrorCount++
	}
}

func (l *SlowQueryLogger) writeToWriters(entry *SlowQueryLogEntry) {
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	line := string(data) + "\n"

	for _, w := range l.writers {
		w.Write([]byte(line))
	}
}

func (l *SlowQueryLogger) GetLogs(limit int) []*SlowQueryLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if limit <= 0 || limit >= len(l.logs) {
		result := make([]*SlowQueryLogEntry, len(l.logs))
		copy(result, l.logs)
		return result
	}

	start := len(l.logs) - limit
	result := make([]*SlowQueryLogEntry, limit)
	copy(result, l.logs[start:])
	return result
}

func (l *SlowQueryLogger) GetStats() SlowQueryStats {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.stats
}

func (l *SlowQueryLogger) Clear() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.logs = make([]*SlowQueryLogEntry, 0)
	l.stats = SlowQueryStats{}
}

func (l *SlowQueryLogger) Enable() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.enabled = true
}

func (l *SlowQueryLogger) Disable() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.enabled = false
}

func (l *SlowQueryLogger) SetThreshold(threshold time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.threshold = threshold
}

func (l *SlowQueryLogger) GetThreshold() time.Duration {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.threshold
}

func (l *SlowQueryLogger) AddWriter(w io.Writer) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.writers = append(l.writers, w)
}

func (l *SlowQueryLogger) GetTopSlowQueries(limit int) []*SlowQueryLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if len(l.logs) == 0 {
		return nil
	}

	sorted := make([]*SlowQueryLogEntry, len(l.logs))
	copy(sorted, l.logs)

	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].Duration > sorted[i].Duration {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	if limit > 0 && limit < len(sorted) {
		return sorted[:limit]
	}
	return sorted
}

type QueryTracker struct {
	logger    *SlowQueryLogger
	queryID   string
	userID    string
	sql       string
	startTime time.Time
	sources   []string
}

func (l *SlowQueryLogger) StartTrack(queryID, userID, sql string) *QueryTracker {
	return &QueryTracker{
		logger:    l,
		queryID:   queryID,
		userID:    userID,
		sql:       sql,
		startTime: time.Now(),
		sources:   make([]string, 0),
	}
}

func (t *QueryTracker) AddSource(source string) {
	t.sources = append(t.sources, source)
}

func (t *QueryTracker) End(rowCount int, isCacheHit bool, err error) {
	if t.logger == nil {
		return
	}

	endTime := time.Now()
	duration := endTime.Sub(t.startTime)

	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	entry := &SlowQueryLogEntry{
		QueryID:     t.queryID,
		UserID:      t.userID,
		SQL:         t.sql,
		StartTime:   t.startTime,
		EndTime:     endTime,
		Duration:    duration,
		RowCount:    rowCount,
		SourceCount: len(t.sources),
		Sources:     t.sources,
		IsCacheHit:  isCacheHit,
		Error:       errMsg,
	}

	t.logger.Log(entry)
}

func (s SlowQueryStats) String() string {
	return fmt.Sprintf(
		"Total: %d, Slow: %d (%.2f%%), Avg: %v, Max: %v, Cache Hit: %.2f%%, Errors: %d",
		s.TotalQueries,
		s.SlowQueries,
		float64(s.SlowQueries)/float64(s.TotalQueries)*100,
		s.AvgDuration.Round(time.Millisecond),
		s.MaxDuration.Round(time.Millisecond),
		float64(s.CacheHits)/float64(s.TotalQueries)*100,
		s.ErrorCount,
	)
}

func (e *SlowQueryLogEntry) String() string {
	return fmt.Sprintf(
		"[%s] User=%s, Duration=%v, Rows=%d, Sources=%d, SQL: %s",
		e.Timestamp.Format(time.RFC3339),
		e.UserID,
		e.Duration.Round(time.Millisecond),
		e.RowCount,
		e.SourceCount,
		truncateString(e.SQL, 100),
	)
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
