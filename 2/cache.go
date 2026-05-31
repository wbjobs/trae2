package federated

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

type CacheEntry struct {
	Key        string
	Result     *QueryResult
	PageSize   int
	PageNum    int
	TotalRows  int
	CreatedAt  time.Time
	ExpiresAt  time.Time
	HitCount   int
	LastHitAt  time.Time
	QuerySQL   string
	UserID     string
}

type CacheStats struct {
	Hits        int64
	Misses      int64
	Evictions   int64
	TotalEntries int
	TotalSize   int64
	HitRate     float64
}

type PageCache struct {
	entries     map[string]*CacheEntry
	lruList     []string
	maxEntries  int
	maxSize     int64
	currentSize int64
	defaultTTL  time.Duration
	mu          sync.RWMutex
	stats       CacheStats
	enabled     bool
}

type CacheOption func(*PageCache)

func WithMaxEntries(max int) CacheOption {
	return func(c *PageCache) {
		c.maxEntries = max
	}
}

func WithMaxSize(size int64) CacheOption {
	return func(c *PageCache) {
		c.maxSize = size
	}
}

func WithDefaultTTL(ttl time.Duration) CacheOption {
	return func(c *PageCache) {
		c.defaultTTL = ttl
	}
}

func WithEnabled(enabled bool) CacheOption {
	return func(c *PageCache) {
		c.enabled = enabled
	}
}

func NewPageCache(opts ...CacheOption) *PageCache {
	c := &PageCache{
		entries:    make(map[string]*CacheEntry),
		lruList:    make([]string, 0),
		maxEntries: 1000,
		maxSize:    100 * 1024 * 1024,
		defaultTTL: 5 * time.Minute,
		enabled:    true,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func (c *PageCache) GenerateKey(sql string, userID string, pageSize, pageNum int) string {
	base := fmt.Sprintf("%s:%s:%d:%d", sql, userID, pageSize, pageNum)
	hash := sha256.Sum256([]byte(base))
	return hex.EncodeToString(hash[:])
}

func (c *PageCache) Get(key string) (*CacheEntry, bool) {
	if !c.enabled {
		return nil, false
	}

	c.mu.RLock()
	entry, exists := c.entries[key]
	c.mu.RUnlock()

	if !exists {
		c.mu.Lock()
		c.stats.Misses++
		c.mu.Unlock()
		return nil, false
	}

	if time.Now().After(entry.ExpiresAt) {
		c.mu.Lock()
		c.deleteEntry(key)
		c.stats.Misses++
		c.mu.Unlock()
		return nil, false
	}

	c.mu.Lock()
	entry.HitCount++
	entry.LastHitAt = time.Now()
	c.updateLRU(key)
	c.stats.Hits++
	c.mu.Unlock()

	return entry, true
}

func (c *PageCache) Set(key string, result *QueryResult, sql string, userID string, pageSize, pageNum int, ttl ...time.Duration) error {
	if !c.enabled {
		return nil
	}

	entryTTL := c.defaultTTL
	if len(ttl) > 0 {
		entryTTL = ttl[0]
	}

	entrySize := c.estimateSize(result)

	c.mu.Lock()
	defer c.mu.Unlock()

	if existing, exists := c.entries[key]; exists {
		c.currentSize -= c.estimateSize(existing.Result)
		c.deleteEntry(key)
	}

	for c.currentSize+entrySize > c.maxSize && len(c.entries) > 0 {
		c.evictLRU()
	}

	for len(c.entries) >= c.maxEntries && len(c.entries) > 0 {
		c.evictLRU()
	}

	entry := &CacheEntry{
		Key:       key,
		Result:    result,
		PageSize:  pageSize,
		PageNum:   pageNum,
		TotalRows: result.RowCount,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(entryTTL),
		HitCount:  0,
		LastHitAt: time.Now(),
		QuerySQL:  sql,
		UserID:    userID,
	}

	c.entries[key] = entry
	c.lruList = append(c.lruList, key)
	c.currentSize += entrySize

	return nil
}

func (c *PageCache) Delete(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.deleteEntry(key)
}

func (c *PageCache) deleteEntry(key string) bool {
	entry, exists := c.entries[key]
	if !exists {
		return false
	}

	c.currentSize -= c.estimateSize(entry.Result)
	delete(c.entries, key)

	for i, k := range c.lruList {
		if k == key {
			c.lruList = append(c.lruList[:i], c.lruList[i+1:]...)
			break
		}
	}

	return true
}

func (c *PageCache) updateLRU(key string) {
	for i, k := range c.lruList {
		if k == key {
			c.lruList = append(c.lruList[:i], c.lruList[i+1:]...)
			break
		}
	}
	c.lruList = append(c.lruList, key)
}

func (c *PageCache) evictLRU() {
	if len(c.lruList) == 0 {
		return
	}

	key := c.lruList[0]
	c.deleteEntry(key)
	c.stats.Evictions++
}

func (c *PageCache) estimateSize(result *QueryResult) int64 {
	if result == nil {
		return 0
	}
	size := int64(len(result.Columns) * 8)
	for _, row := range result.Rows {
		size += int64(len(row) * 32)
	}
	return size
}

func (c *PageCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries = make(map[string]*CacheEntry)
	c.lruList = make([]string, 0)
	c.currentSize = 0
}

func (c *PageCache) GetStats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	stats := c.stats
	stats.TotalEntries = len(c.entries)
	stats.TotalSize = c.currentSize
	total := stats.Hits + stats.Misses
	if total > 0 {
		stats.HitRate = float64(stats.Hits) / float64(total)
	}
	return stats
}

func (c *PageCache) Enable() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.enabled = true
}

func (c *PageCache) Disable() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.enabled = false
}

func (c *PageCache) IsEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *PageCache) InvalidateByUser(userID string) int {
	c.mu.Lock()
	defer c.mu.Unlock()

	count := 0
	for key, entry := range c.entries {
		if entry.UserID == userID {
			c.deleteEntry(key)
			count++
		}
	}
	return count
}

func (c *PageCache) InvalidateByPattern(pattern string) int {
	c.mu.Lock()
	defer c.mu.Unlock()

	count := 0
	for key, entry := range c.entries {
		if c.matchPattern(pattern, entry.QuerySQL) {
			c.deleteEntry(key)
			count++
		}
	}
	return count
}

func (c *PageCache) matchPattern(pattern, str string) bool {
	if pattern == "*" {
		return true
	}
	return len(str) >= len(pattern) && str[:len(pattern)] == pattern
}

func (c *PageCache) GetHotEntries(limit int) []*CacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entries := make([]*CacheEntry, 0, len(c.entries))
	for _, entry := range c.entries {
		entries = append(entries, entry)
	}

	for i := 0; i < len(entries); i++ {
		for j := i + 1; j < len(entries); j++ {
			if entries[j].HitCount > entries[i].HitCount {
				entries[i], entries[j] = entries[j], entries[i]
			}
		}
	}

	if limit > 0 && limit < len(entries) {
		return entries[:limit]
	}
	return entries
}

type CachedQueryResult struct {
	*QueryResult
	Cached    bool
	CacheKey  string
	HitCount  int
	CachedAt  time.Time
	ExpiresAt time.Time
}

func (c *PageCache) ExecuteWithCache(
	sql string,
	userID string,
	pageSize, pageNum int,
	executor func() (*QueryResult, error),
) (*CachedQueryResult, error) {
	key := c.GenerateKey(sql, userID, pageSize, pageNum)

	if entry, found := c.Get(key); found {
		return &CachedQueryResult{
			QueryResult: entry.Result,
			Cached:      true,
			CacheKey:    key,
			HitCount:    entry.HitCount,
			CachedAt:    entry.CreatedAt,
			ExpiresAt:   entry.ExpiresAt,
		}, nil
	}

	result, err := executor()
	if err != nil {
		return nil, err
	}

	c.Set(key, result, sql, userID, pageSize, pageNum)

	return &CachedQueryResult{
		QueryResult: result,
		Cached:      false,
		CacheKey:    key,
		HitCount:    0,
		CachedAt:    time.Now(),
		ExpiresAt:   time.Now().Add(c.defaultTTL),
	}, nil
}
