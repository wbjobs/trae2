package cluster

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"db-inspector/pkg/config"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

type ConnectionResult struct {
	NodeName string
	Cluster  string
	DB       *sql.DB
	Duration time.Duration
	Err      error
}

type Connector struct {
	cfg           *config.InspectionConfig
	parallel      int
	timeout       time.Duration
	globalSem     chan struct{}
	retryCount    int
	retryDelay    time.Duration
	connCache     map[string]*PooledConnection
	cacheMu       sync.RWMutex
	healthCheck   bool
	keepAliveInt  time.Duration
	maxConnAge    time.Duration
}

type PooledConnection struct {
	db          *sql.DB
	node        config.DBNode
	clusterName string
	createdAt   time.Time
	lastUsed    time.Time
	lastCheck   time.Time
	isValid     bool
	mu          sync.Mutex
}

func NewConnector(cfg *config.InspectionConfig) *Connector {
	parallel := cfg.ParallelConns
	if parallel <= 0 {
		parallel = 5
	}
	timeout := time.Duration(cfg.ConnectTimeout) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	retryCount := cfg.RetryCount
	if retryCount <= 0 {
		retryCount = 2
	}
	retryDelay := time.Duration(cfg.RetryDelayMs) * time.Millisecond
	if retryDelay <= 0 {
		retryDelay = 500 * time.Millisecond
	}
	keepAlive := 30 * time.Second
	maxAge := 10 * time.Minute
	return &Connector{
		cfg:          cfg,
		parallel:     parallel,
		timeout:      timeout,
		globalSem:    make(chan struct{}, parallel),
		retryCount:   retryCount,
		retryDelay:   retryDelay,
		connCache:    make(map[string]*PooledConnection),
		healthCheck:  true,
		keepAliveInt: keepAlive,
		maxConnAge:   maxAge,
	}
}

func (c *Connector) SetHealthCheck(enabled bool) {
	c.healthCheck = enabled
}

func (c *Connector) cacheKey(cluster, node string) string {
	return fmt.Sprintf("%s/%s", cluster, node)
}

func (c *Connector) GetConnection(cluster string, node config.DBNode) (*sql.DB, error) {
	return c.GetConnectionWithContext(context.Background(), cluster, node)
}

func (c *Connector) GetConnectionWithContext(ctx context.Context, cluster string, node config.DBNode) (*sql.DB, error) {
	key := c.cacheKey(cluster, node.Name)

	c.cacheMu.RLock()
	pooled, exists := c.connCache[key]
	c.cacheMu.RUnlock()

	if exists {
		if c.isValidConnection(pooled) {
			pooled.mu.Lock()
			pooled.lastUsed = time.Now()
			pooled.mu.Unlock()
			return pooled.db, nil
		}
		c.invalidateConnection(key)
	}

	c.globalSem <- struct{}{}
	defer func() { <-c.globalSem }()

	db, err := c.ConnectNodeWithContext(ctx, node)
	if err != nil {
		return nil, err
	}

	pooled = &PooledConnection{
		db:          db,
		node:        node,
		clusterName: cluster,
		createdAt:   time.Now(),
		lastUsed:    time.Now(),
		lastCheck:   time.Now(),
		isValid:     true,
	}

	c.cacheMu.Lock()
	c.connCache[key] = pooled
	c.cacheMu.Unlock()

	return db, nil
}

func (c *Connector) isValidConnection(pooled *PooledConnection) bool {
	pooled.mu.Lock()
	defer pooled.mu.Unlock()

	if !pooled.isValid {
		return false
	}

	if time.Since(pooled.createdAt) > c.maxConnAge {
		pooled.db.Close()
		pooled.isValid = false
		return false
	}

	if !c.healthCheck {
		return true
	}

	if time.Since(pooled.lastCheck) < c.keepAliveInt {
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	if err := pooled.db.PingContext(ctx); err != nil {
		pooled.db.Close()
		pooled.isValid = false
		return false
	}

	pooled.lastCheck = time.Now()
	return true
}

func (c *Connector) invalidateConnection(key string) {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	if pooled, exists := c.connCache[key]; exists {
		pooled.mu.Lock()
		if pooled.isValid {
			pooled.db.Close()
			pooled.isValid = false
		}
		pooled.mu.Unlock()
		delete(c.connCache, key)
	}
}

func (c *Connector) Reconnect(ctx context.Context, cluster string, node config.DBNode) (*sql.DB, error) {
	key := c.cacheKey(cluster, node.Name)
	c.invalidateConnection(key)
	return c.GetConnectionWithContext(ctx, cluster, node)
}

func (c *Connector) ReconnectAll(ctx context.Context) error {
	c.cacheMu.Lock()
	keys := make([]string, 0, len(c.connCache))
	nodes := make([]config.DBNode, 0, len(c.connCache))
	clusters := make([]string, 0, len(c.connCache))
	for key, pooled := range c.connCache {
		keys = append(keys, key)
		nodes = append(nodes, pooled.node)
		clusters = append(clusters, pooled.clusterName)
		pooled.mu.Lock()
		if pooled.isValid {
			pooled.db.Close()
			pooled.isValid = false
		}
		pooled.mu.Unlock()
	}
	c.connCache = make(map[string]*PooledConnection)
	c.cacheMu.Unlock()

	var firstErr error
	for i, key := range keys {
		_, err := c.GetConnectionWithContext(ctx, clusters[i], nodes[i])
		if err != nil && firstErr == nil {
			firstErr = fmt.Errorf("%s: %w", key, err)
		}
	}
	return firstErr
}

func (c *Connector) CloseAllCached() {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	for key, pooled := range c.connCache {
		pooled.mu.Lock()
		if pooled.isValid {
			pooled.db.Close()
			pooled.isValid = false
		}
		pooled.mu.Unlock()
		delete(c.connCache, key)
	}
}

func (c *Connector) HealthCheckCached() map[string][]HealthStatus {
	c.cacheMu.RLock()
	keys := make([]string, 0, len(c.connCache))
	pooledConns := make([]*PooledConnection, 0, len(c.connCache))
	for key, pooled := range c.connCache {
		keys = append(keys, key)
		pooledConns = append(pooledConns, pooled)
	}
	c.cacheMu.RUnlock()

	results := make([]HealthStatus, len(keys))
	var wg sync.WaitGroup
	sem := make(chan struct{}, c.parallel)

	for i, pooled := range pooledConns {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, p *PooledConnection) {
			defer wg.Done()
			defer func() { <-sem }()
			start := time.Now()
			valid := c.isValidConnection(p)
			p.mu.Lock()
			defer p.mu.Unlock()
			results[idx] = HealthStatus{
				NodeName: p.node.Name,
				Cluster:  p.clusterName,
				Healthy:  valid,
				Latency:  time.Since(start),
				Err:      nil,
			}
			if !valid {
				results[idx].Err = fmt.Errorf("connection invalid")
			}
		}(i, pooled)
	}
	wg.Wait()

	statusMap := make(map[string][]HealthStatus)
	for _, r := range results {
		statusMap[r.Cluster] = append(statusMap[r.Cluster], r)
	}
	return statusMap
}

func (c *Connector) GetCacheStats() (int, int) {
	c.cacheMu.RLock()
	defer c.cacheMu.RUnlock()
	total := len(c.connCache)
	valid := 0
	for _, p := range c.connCache {
		p.mu.Lock()
		if p.isValid {
			valid++
		}
		p.mu.Unlock()
	}
	return total, valid
}

func (c *Connector) ConnectNode(node config.DBNode) (*sql.DB, error) {
	return c.ConnectNodeWithContext(context.Background(), node)
}

func (c *Connector) ConnectNodeWithContext(ctx context.Context, node config.DBNode) (*sql.DB, error) {
	dsn := node.DSN()
	if dsn == "" {
		return nil, fmt.Errorf("unsupported db type: %s", node.Type)
	}
	driver := string(node.Type)
	if driver == "sqlite" {
		driver = "sqlite3"
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open connection to %s: %w", node.Name, err)
	}
	maxOpen := c.parallel * 3
	if maxOpen < 10 {
		maxOpen = 10
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxOpen / 2)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	var lastErr error
	for attempt := 0; attempt <= c.retryCount; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				db.Close()
				return nil, ctx.Err()
			case <-time.After(c.retryDelay):
			}
		}
		pingCtx, cancel := context.WithTimeout(ctx, c.timeout)
		lastErr = db.PingContext(pingCtx)
		cancel()
		if lastErr == nil {
			return db, nil
		}
	}
	db.Close()
	return nil, fmt.Errorf("ping %s (%s:%d) after %d retries: %w", node.Name, node.Host, node.Port, c.retryCount, lastErr)
}

func (c *Connector) ConnectCluster(cluster config.Cluster) []ConnectionResult {
	return c.ConnectClusterWithContext(context.Background(), cluster)
}

func (c *Connector) ConnectClusterWithContext(ctx context.Context, cluster config.Cluster) []ConnectionResult {
	results := make([]ConnectionResult, len(cluster.Nodes))
	var wg sync.WaitGroup
	for i, node := range cluster.Nodes {
		wg.Add(1)
		c.globalSem <- struct{}{}
		go func(idx int, n config.DBNode) {
			defer wg.Done()
			defer func() { <-c.globalSem }()
			start := time.Now()
			db, err := c.ConnectNodeWithContext(ctx, n)
			results[idx] = ConnectionResult{
				NodeName: n.Name,
				Cluster:  cluster.Name,
				DB:       db,
				Duration: time.Since(start),
				Err:      err,
			}
		}(i, node)
	}
	wg.Wait()
	return results
}

func (c *Connector) ConnectAll() map[string][]ConnectionResult {
	return c.ConnectAllWithContext(context.Background())
}

func (c *Connector) ConnectAllWithContext(ctx context.Context) map[string][]ConnectionResult {
	allResults := make(map[string][]ConnectionResult)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, cluster := range c.cfg.Clusters {
		wg.Add(1)
		go func(cl config.Cluster) {
			defer wg.Done()
			results := c.ConnectClusterWithContext(ctx, cl)
			mu.Lock()
			allResults[cl.Name] = results
			mu.Unlock()
		}(cluster)
	}
	wg.Wait()
	return allResults
}

func (c *Connector) ConnectAllSequential() map[string][]ConnectionResult {
	allResults := make(map[string][]ConnectionResult)
	for _, cluster := range c.cfg.Clusters {
		results := c.ConnectCluster(cluster)
		allResults[cluster.Name] = results
	}
	return allResults
}

func CloseDB(db *sql.DB) error {
	if db != nil {
		return db.Close()
	}
	return nil
}

func CloseAll(results []ConnectionResult) {
	for i := range results {
		if results[i].DB != nil {
			results[i].DB.Close()
			results[i].DB = nil
		}
	}
}

func CloseAllMap(allResults map[string][]ConnectionResult) {
	for _, results := range allResults {
		CloseAll(results)
	}
}

type HealthStatus struct {
	NodeName string
	Cluster  string
	Healthy  bool
	Latency  time.Duration
	Err      error
}

func (c *Connector) HealthCheck(cluster config.Cluster) []HealthStatus {
	statuses := make([]HealthStatus, len(cluster.Nodes))
	var wg sync.WaitGroup
	for i, node := range cluster.Nodes {
		wg.Add(1)
		c.globalSem <- struct{}{}
		go func(idx int, n config.DBNode) {
			defer wg.Done()
			defer func() { <-c.globalSem }()
			start := time.Now()
			db, err := c.ConnectNode(n)
			if err != nil {
				statuses[idx] = HealthStatus{
					NodeName: n.Name,
					Cluster:  cluster.Name,
					Healthy:  false,
					Latency:  time.Since(start),
					Err:      err,
				}
				return
			}
			pingCtx, cancel := context.WithTimeout(context.Background(), c.timeout)
			pingErr := db.PingContext(pingCtx)
			cancel()
			db.Close()
			if pingErr != nil {
				statuses[idx] = HealthStatus{
					NodeName: n.Name,
					Cluster:  cluster.Name,
					Healthy:  false,
					Latency:  time.Since(start),
					Err:      pingErr,
				}
				return
			}
			statuses[idx] = HealthStatus{
				NodeName: n.Name,
				Cluster:  cluster.Name,
				Healthy:  true,
				Latency:  time.Since(start),
			}
		}(i, node)
	}
	wg.Wait()
	return statuses
}

func (c *Connector) HealthCheckAll() map[string][]HealthStatus {
	allStatuses := make(map[string][]HealthStatus)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, cluster := range c.cfg.Clusters {
		wg.Add(1)
		go func(cl config.Cluster) {
			defer wg.Done()
			statuses := c.HealthCheck(cl)
			mu.Lock()
			allStatuses[cl.Name] = statuses
			mu.Unlock()
		}(cluster)
	}
	wg.Wait()
	return allStatuses
}
