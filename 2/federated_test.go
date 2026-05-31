package federated

import (
	"fmt"
	"testing"
	"time"
)

func TestBuildJoinKeyFix(t *testing.T) {
	conditions := []JoinCondition{
		{LeftColumn: "u.id", RightColumn: "o.user_id", Operator: "="},
	}

	leftRow := Row{
		"u.id":   123,
		"u.name": "test",
		"id":     456,
	}

	key := buildJoinKey(leftRow, "u", conditions, false)
	if key != "123" {
		t.Errorf("Expected left key '123', got '%s'", key)
	}

	rightRow := Row{
		"o.user_id": 123,
		"o.amount":  100,
		"user_id":   789,
	}

	key2 := buildJoinKey(rightRow, "o", conditions, true)
	if key2 != "123" {
		t.Errorf("Expected right key '123', got '%s'", key2)
	}

	t.Logf("Left key: %s, Right key: %s", key, key2)
	t.Log("Field mapping fix verified successfully")
}

func TestBuildIndexFix(t *testing.T) {
	conditions := []JoinCondition{
		{LeftColumn: "id", RightColumn: "user_id", Operator: "="},
	}

	rightRows := []Row{
		{"user_id": 1, "amount": 100},
		{"user_id": 2, "amount": 200},
		{"user_id": 1, "amount": 150},
	}

	index := buildIndex(rightRows, "o", conditions, true)

	if len(index) != 2 {
		t.Errorf("Expected 2 unique keys in index, got %d", len(index))
	}

	if len(index["1"]) != 2 {
		t.Errorf("Expected 2 rows for user_id=1, got %d", len(index["1"]))
	}

	t.Log("Index building fix verified successfully")
}

func TestAuthorizeQuerySecurity(t *testing.T) {
	auth := NewAuthManager()

	fq := &FederatedQuery{
		SubQueries: []*SubQuery{
			{Source: "mysql", Database: "test", Table: "users"},
		},
	}

	tests := []struct {
		name    string
		qc      *QueryContext
		wantErr bool
	}{
		{
			name:    "nil QueryContext should fail",
			qc:      nil,
			wantErr: true,
		},
		{
			name:    "empty UserID should fail",
			qc:      &QueryContext{UserID: ""},
			wantErr: true,
		},
		{
			name:    "unknown user should fail",
			qc:      &QueryContext{UserID: "unknown"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := auth.AuthorizeQuery(tt.qc, fq)
			if (err != nil) != tt.wantErr {
				t.Errorf("AuthorizeQuery() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				t.Logf("Got expected error: %v", err)
			}
		})
	}

	t.Log("Security fix verified successfully")
}

func TestAuthorizeSubQueryPermission(t *testing.T) {
	auth := NewAuthManager()

	user := &User{
		ID:       "test_user",
		Username: "Test User",
		Roles:    []string{"reader"},
		Active:   true,
	}
	auth.AddUser("default", user)

	readerRole := &Role{
		Name: "reader",
		Permissions: []*Permission{
			{Resource: "mysql.*.*", Action: "SELECT", Effect: "allow"},
			{Resource: "pg.secret.*", Action: "*", Effect: "deny"},
		},
	}
	auth.AddRole("default", readerRole)
	auth.AssignRole("default", "test_user", "reader")

	fq := &FederatedQuery{
		SubQueries: []*SubQuery{
			{Source: "mysql", Database: "test", Table: "users"},
		},
	}

	err := auth.AuthorizeQuery(&QueryContext{UserID: "test_user"}, fq)
	if err != nil {
		t.Errorf("Expected no error for mysql access, got: %v", err)
	}

	fq2 := &FederatedQuery{
		SubQueries: []*SubQuery{
			{Source: "pg", Database: "secret", Table: "data"},
		},
	}

	err2 := auth.AuthorizeQuery(&QueryContext{UserID: "test_user"}, fq2)
	if err2 == nil {
		t.Error("Expected error for denied pg.secret access, got nil")
	} else {
		t.Logf("Got expected access denied: %v", err2)
	}

	t.Log("Permission check fix verified successfully")
}

func TestPageCacheBasic(t *testing.T) {
	cache := NewPageCache(WithMaxEntries(100))

	result := &QueryResult{
		Rows:     []Row{{"id": 1, "name": "test"}},
		Columns:  []string{"id", "name"},
		RowCount: 1,
	}

	key := cache.GenerateKey("SELECT * FROM users", "user1", 10, 1)
	cache.Set(key, result, "SELECT * FROM users", "user1", 10, 1)

	entry, found := cache.Get(key)
	if !found {
		t.Error("Expected cache hit, got miss")
	}
	if entry.Result.RowCount != 1 {
		t.Errorf("Expected 1 row, got %d", entry.Result.RowCount)
	}

	stats := cache.GetStats()
	if stats.Hits != 1 || stats.Misses != 0 {
		t.Errorf("Expected 1 hit, 0 misses, got %d hits, %d misses", stats.Hits, stats.Misses)
	}

	t.Log("Page cache basic operations verified")
}

func TestPageCacheLRUEviction(t *testing.T) {
	cache := NewPageCache(WithMaxEntries(3))

	for i := 0; i < 5; i++ {
		result := &QueryResult{RowCount: i + 1}
		key := cache.GenerateKey(fmt.Sprintf("query_%d", i), "user1", 10, 1)
		cache.Set(key, result, fmt.Sprintf("query_%d", i), "user1", 10, 1)
	}

	stats := cache.GetStats()
	if stats.TotalEntries != 3 {
		t.Errorf("Expected 3 entries after eviction, got %d", stats.TotalEntries)
	}
	if stats.Evictions != 2 {
		t.Errorf("Expected 2 evictions, got %d", stats.Evictions)
	}

	t.Log("LRU eviction verified")
}

func TestSlowQueryLogger(t *testing.T) {
	logger := NewSlowQueryLogger(
		WithThreshold(100*time.Millisecond),
		WithMaxLogs(100),
	)

	tracker := logger.StartTrack("q1", "user1", "SELECT * FROM users")
	tracker.AddSource("mysql")
	time.Sleep(150 * time.Millisecond)
	tracker.End(100, false, nil)

	logs := logger.GetLogs(10)
	if len(logs) != 1 {
		t.Errorf("Expected 1 slow query log, got %d", len(logs))
	}

	stats := logger.GetStats()
	if stats.SlowQueries != 1 {
		t.Errorf("Expected 1 slow query, got %d", stats.SlowQueries)
	}

	t.Logf("Slow query logged: %s", logs[0].String())
	t.Log("Slow query logger verified")
}

func TestSlowQueryFastNotLogged(t *testing.T) {
	logger := NewSlowQueryLogger(WithThreshold(500 * time.Millisecond))

	tracker := logger.StartTrack("q1", "user1", "SELECT * FROM users")
	time.Sleep(50 * time.Millisecond)
	tracker.End(100, false, nil)

	logs := logger.GetLogs(10)
	if len(logs) != 0 {
		t.Errorf("Expected 0 slow query logs for fast query, got %d", len(logs))
	}

	stats := logger.GetStats()
	if stats.TotalQueries != 1 || stats.SlowQueries != 0 {
		t.Errorf("Expected 1 total, 0 slow, got %d total, %d slow", stats.TotalQueries, stats.SlowQueries)
	}

	t.Log("Fast queries correctly not logged")
}

func TestFederatedEngineWithCache(t *testing.T) {
	engine := NewFederatedEngine(
		WithCacheEnabled(true),
		WithSlowLogEnabled(true),
	)

	if engine.GetCache() == nil {
		t.Error("Expected cache to be initialized")
	}
	if engine.GetSlowLogger() == nil {
		t.Error("Expected slow logger to be initialized")
	}

	cacheStats := engine.GetCacheStats()
	if cacheStats.Hits != 0 {
		t.Errorf("Expected 0 cache hits initially, got %d", cacheStats.Hits)
	}

	slowStats := engine.GetSlowLogStats()
	if slowStats.TotalQueries != 0 {
		t.Errorf("Expected 0 queries initially, got %d", slowStats.TotalQueries)
	}

	t.Log("Federated engine with cache and slow log initialized successfully")
}

func TestCacheKeyGeneration(t *testing.T) {
	cache := NewPageCache()

	key1 := cache.GenerateKey("SELECT * FROM users", "user1", 10, 1)
	key2 := cache.GenerateKey("SELECT * FROM users", "user1", 10, 1)
	key3 := cache.GenerateKey("SELECT * FROM users", "user1", 10, 2)
	key4 := cache.GenerateKey("SELECT * FROM users", "user2", 10, 1)

	if key1 != key2 {
		t.Error("Same query should generate same key")
	}
	if key1 == key3 {
		t.Error("Different page number should generate different key")
	}
	if key1 == key4 {
		t.Error("Different user should generate different key")
	}

	t.Log("Cache key generation verified")
}
