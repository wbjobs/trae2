package federated

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type DataSourceType string

const (
	SourceMySQL      DataSourceType = "mysql"
	SourcePostgreSQL DataSourceType = "postgresql"
	SourceMongoDB    DataSourceType = "mongodb"
)

type Row map[string]interface{}

type QueryResult struct {
	Rows       []Row
	Columns    []string
	RowCount   int
	Source     string
	QueryTime  time.Duration
	Err        error
}

type DataSource interface {
	Type() DataSourceType
	Name() string
	Connect(ctx context.Context) error
	Close() error
	Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error)
	Ping(ctx context.Context) error
}

type JoinType int

const (
	InnerJoin JoinType = iota
	LeftJoin
	RightJoin
	FullJoin
)

type JoinCondition struct {
	LeftColumn  string
	RightColumn string
	Operator    string
}

type SubQuery struct {
	Source    string
	Database  string
	Table     string
	Columns   []string
	Where     string
	Alias     string
	Limit     int
	Offset    int
	OrderBy   []OrderClause
}

type OrderClause struct {
	Column string
	Desc   bool
}

type FederatedQuery struct {
	SubQueries    []*SubQuery
	Joins         []*JoinSpec
	UnionType     string
	UnionAll      bool
	GlobalOrderBy []OrderClause
	GlobalLimit   int
	GlobalOffset  int
	Columns       []string
	WhereFilters  []string
	GroupBy       []string
	Having        string
}

type JoinSpec struct {
	LeftAlias     string
	RightAlias    string
	Type          JoinType
	Conditions    []JoinCondition
}

type ExecutionPlan struct {
	Query       *FederatedQuery
	SourcePlans map[string]*SourcePlan
	MergePlan   *MergePlan
}

type SourcePlan struct {
	SourceName string
	Query      string
	Args       []interface{}
	DependsOn  []string
}

type MergePlan struct {
	Strategy    string
	JoinSpecs   []*JoinSpec
	UnionAll    bool
	OrderBy     []OrderClause
	Limit       int
	Offset      int
	Columns     []string
	GroupBy     []string
	Having      string
}

type FederatedEngine struct {
	dataSources map[string]DataSource
	parser      *SQLParser
	merger      *ResultMerger
	auth        *AuthManager
	cache       *PageCache
	slowLogger  *SlowQueryLogger
	useCache    bool
	useSlowLog  bool
	mu          sync.RWMutex
}

type QueryContext struct {
	Context    context.Context
	UserID     string
	Roles      []string
	QueryID    string
	StartTime  time.Time
	MaxRows    int
	Timeout    time.Duration
}

type EngineOption func(*FederatedEngine)

func WithAuthManager(auth *AuthManager) EngineOption {
	return func(e *FederatedEngine) {
		e.auth = auth
	}
}

func WithParser(p *SQLParser) EngineOption {
	return func(e *FederatedEngine) {
		e.parser = p
	}
}

func WithMerger(m *ResultMerger) EngineOption {
	return func(e *FederatedEngine) {
		e.merger = m
	}
}

func WithCache(cache *PageCache) EngineOption {
	return func(e *FederatedEngine) {
		e.cache = cache
		e.useCache = true
	}
}

func WithSlowLogger(logger *SlowQueryLogger) EngineOption {
	return func(e *FederatedEngine) {
		e.slowLogger = logger
		e.useSlowLog = true
	}
}

func WithCacheEnabled(enabled bool) EngineOption {
	return func(e *FederatedEngine) {
		e.useCache = enabled
	}
}

func WithSlowLogEnabled(enabled bool) EngineOption {
	return func(e *FederatedEngine) {
		e.useSlowLog = enabled
	}
}

func NewFederatedEngine(opts ...EngineOption) *FederatedEngine {
	e := &FederatedEngine{
		dataSources: make(map[string]DataSource),
		useCache:    true,
		useSlowLog:  true,
	}
	for _, opt := range opts {
		opt(e)
	}
	if e.parser == nil {
		e.parser = NewSQLParser()
	}
	if e.merger == nil {
		e.merger = NewResultMerger()
	}
	if e.auth == nil {
		e.auth = NewAuthManager()
	}
	if e.cache == nil {
		e.cache = NewPageCache()
	}
	if e.slowLogger == nil {
		e.slowLogger = NewSlowQueryLogger()
	}
	return e
}

func (e *FederatedEngine) RegisterDataSource(ds DataSource) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	name := ds.Name()
	if _, exists := e.dataSources[name]; exists {
		return fmt.Errorf("data source %s already registered", name)
	}
	e.dataSources[name] = ds
	return nil
}

func (e *FederatedEngine) UnregisterDataSource(name string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if ds, exists := e.dataSources[name]; exists {
		ds.Close()
		delete(e.dataSources, name)
	}
}

func (e *FederatedEngine) GetDataSource(name string) (DataSource, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	ds, ok := e.dataSources[name]
	return ds, ok
}

func (e *FederatedEngine) ListDataSources() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	names := make([]string, 0, len(e.dataSources))
	for name := range e.dataSources {
		names = append(names, name)
	}
	return names
}

func (e *FederatedEngine) ParseQuery(sql string) (*FederatedQuery, error) {
	return e.parser.Parse(sql)
}

func (e *FederatedEngine) Execute(qc *QueryContext, sql string) (*QueryResult, error) {
	result, err := e.ExecuteWithCache(qc, sql, 0, 0)
	if err != nil {
		return nil, err
	}
	return result.QueryResult, nil
}

func (e *FederatedEngine) ExecuteWithCache(qc *QueryContext, sql string, pageSize, pageNum int) (*CachedQueryResult, error) {
	if qc == nil {
		qc = &QueryContext{
			Context:   context.Background(),
			StartTime: time.Now(),
			MaxRows:   10000,
			Timeout:   30 * time.Second,
		}
	}
	if qc.Context == nil {
		qc.Context = context.Background()
	}
	if qc.Timeout > 0 {
		var cancel context.CancelFunc
		qc.Context, cancel = context.WithTimeout(qc.Context, qc.Timeout)
		defer cancel()
	}

	var tracker *QueryTracker
	if e.useSlowLog && e.slowLogger != nil {
		tracker = e.slowLogger.StartTrack(qc.QueryID, qc.UserID, sql)
	}

	executor := func() (*QueryResult, error) {
		parsed, err := e.parser.Parse(sql)
		if err != nil {
			return nil, fmt.Errorf("parse error: %w", err)
		}

		if e.auth != nil {
			if err := e.auth.AuthorizeQuery(qc, parsed); err != nil {
				return nil, fmt.Errorf("authorization failed: %w", err)
			}
		}

		results, err := e.executeSubQueries(qc, parsed, tracker)
		if err != nil {
			return nil, fmt.Errorf("execution error: %w", err)
		}

		merged, err := e.merger.Merge(parsed, results, qc)
		if err != nil {
			return nil, fmt.Errorf("merge error: %w", err)
		}

		return merged, nil
	}

	var result *CachedQueryResult
	var err error

	if e.useCache && e.cache != nil {
		result, err = e.cache.ExecuteWithCache(sql, qc.UserID, pageSize, pageNum, executor)
	} else {
		var rawResult *QueryResult
		rawResult, err = executor()
		if err == nil {
			result = &CachedQueryResult{
				QueryResult: rawResult,
				Cached:      false,
			}
		}
	}

	if tracker != nil {
		rowCount := 0
		if result != nil && result.QueryResult != nil {
			rowCount = result.RowCount
		}
		isCacheHit := result != nil && result.Cached
		tracker.End(rowCount, isCacheHit, err)
	}

	return result, err
}

func (e *FederatedEngine) executeSubQueries(qc *QueryContext, fq *FederatedQuery, tracker *QueryTracker) (map[string]*QueryResult, error) {
	results := make(map[string]*QueryResult)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error

	for _, sq := range fq.SubQueries {
		wg.Add(1)
		go func(sq *SubQuery) {
			defer wg.Done()

			ds, ok := e.GetDataSource(sq.Source)
			if !ok {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("data source %s not found", sq.Source)
				}
				mu.Unlock()
				return
			}

			if tracker != nil {
				tracker.AddSource(sq.Source)
			}

			sql := e.buildSourceQuery(sq)
			result, err := ds.Query(qc.Context, sql)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("query on %s: %w", sq.Source, err)
				}
				mu.Unlock()
				return
			}

			mu.Lock()
			alias := sq.Alias
			if alias == "" {
				alias = sq.Table
			}
			results[alias] = result
			mu.Unlock()
		}(sq)
	}

	wg.Wait()

	if firstErr != nil {
		return results, firstErr
	}
	return results, nil
}

func (e *FederatedEngine) buildSourceQuery(sq *SubQuery) string {
	return e.parser.BuildSourceSQL(sq)
}

func (e *FederatedEngine) GetCache() *PageCache {
	return e.cache
}

func (e *FederatedEngine) GetSlowLogger() *SlowQueryLogger {
	return e.slowLogger
}

func (e *FederatedEngine) EnableCache() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.useCache = true
}

func (e *FederatedEngine) DisableCache() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.useCache = false
}

func (e *FederatedEngine) EnableSlowLog() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.useSlowLog = true
}

func (e *FederatedEngine) DisableSlowLog() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.useSlowLog = false
}

func (e *FederatedEngine) ClearCache() {
	if e.cache != nil {
		e.cache.Clear()
	}
}

func (e *FederatedEngine) GetCacheStats() CacheStats {
	if e.cache != nil {
		return e.cache.GetStats()
	}
	return CacheStats{}
}

func (e *FederatedEngine) GetSlowLogStats() SlowQueryStats {
	if e.slowLogger != nil {
		return e.slowLogger.GetStats()
	}
	return SlowQueryStats{}
}

func (e *FederatedEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for name, ds := range e.dataSources {
		if err := ds.Close(); err != nil {
			return fmt.Errorf("close data source %s: %w", name, err)
		}
	}
	e.dataSources = make(map[string]DataSource)

	if e.slowLogger != nil {
		e.slowLogger.Close()
	}
	return nil
}
