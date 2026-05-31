package federated

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "github.com/lib/pq"
	_ "github.com/go-sql-driver/mysql"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type BaseDataSource struct {
	name       string
	sourceType DataSourceType
	mu         sync.RWMutex
	connected  bool
}

func (b *BaseDataSource) Name() string {
	return b.name
}

func (b *BaseDataSource) Type() DataSourceType {
	return b.sourceType
}

func (b *BaseDataSource) IsConnected() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.connected
}

func (b *BaseDataSource) setConnected(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.connected = v
}

type MySQLDataSource struct {
	BaseDataSource
	db        *sql.DB
	host      string
	port      int
	user      string
	password  string
	database  string
	params    map[string]string
}

type MySQLConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
	Params   map[string]string
}

func NewMySQLDataSource(name string, cfg MySQLConfig) *MySQLDataSource {
	return &MySQLDataSource{
		BaseDataSource: BaseDataSource{
			name:       name,
			sourceType: SourceMySQL,
		},
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		database: cfg.Database,
		params:   cfg.Params,
	}
}

func (m *MySQLDataSource) Connect(ctx context.Context) error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
		m.user, m.password, m.host, m.port, m.database)

	if len(m.params) > 0 {
		dsn += "?"
		i := 0
		for k, v := range m.params {
			if i > 0 {
				dsn += "&"
			}
			dsn += fmt.Sprintf("%s=%s", k, v)
			i++
		}
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("mysql connect: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return fmt.Errorf("mysql ping: %w", err)
	}

	m.db = db
	m.setConnected(true)
	return nil
}

func (m *MySQLDataSource) Close() error {
	if m.db != nil {
		err := m.db.Close()
		m.setConnected(false)
		return err
	}
	return nil
}

func (m *MySQLDataSource) Ping(ctx context.Context) error {
	if m.db == nil {
		return fmt.Errorf("mysql source %s not connected", m.name)
	}
	return m.db.PingContext(ctx)
}

func (m *MySQLDataSource) Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error) {
	start := time.Now()

	if m.db == nil {
		return nil, fmt.Errorf("mysql source %s not connected", m.name)
	}

	rows, err := m.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("mysql query: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("mysql get columns: %w", err)
	}

	var resultRows []Row
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range columns {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("mysql scan row: %w", err)
		}

		row := make(Row)
		for i, col := range columns {
			val := values[i]
			if b, ok := val.([]byte); ok {
				val = string(b)
			}
			row[col] = val
		}
		resultRows = append(resultRows, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mysql rows iteration: %w", err)
	}

	return &QueryResult{
		Rows:      resultRows,
		Columns:   columns,
		RowCount:  len(resultRows),
		Source:    m.name,
		QueryTime: time.Since(start),
	}, nil
}

type PostgreSQLDataSource struct {
	BaseDataSource
	db       *sql.DB
	host     string
	port     int
	user     string
	password string
	database string
	sslMode  string
	params   map[string]string
}

type PostgreSQLConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
	SSLMode  string
	Params   map[string]string
}

func NewPostgreSQLDataSource(name string, cfg PostgreSQLConfig) *PostgreSQLDataSource {
	sslMode := cfg.SSLMode
	if sslMode == "" {
		sslMode = "disable"
	}
	return &PostgreSQLDataSource{
		BaseDataSource: BaseDataSource{
			name:       name,
			sourceType: SourcePostgreSQL,
		},
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		database: cfg.Database,
		sslMode:  sslMode,
		params:   cfg.Params,
	}
}

func (pg *PostgreSQLDataSource) Connect(ctx context.Context) error {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		pg.host, pg.port, pg.user, pg.password, pg.database, pg.sslMode)

	for k, v := range pg.params {
		dsn += fmt.Sprintf(" %s=%s", k, v)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("postgresql connect: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return fmt.Errorf("postgresql ping: %w", err)
	}

	pg.db = db
	pg.setConnected(true)
	return nil
}

func (pg *PostgreSQLDataSource) Close() error {
	if pg.db != nil {
		err := pg.db.Close()
		pg.setConnected(false)
		return err
	}
	return nil
}

func (pg *PostgreSQLDataSource) Ping(ctx context.Context) error {
	if pg.db == nil {
		return fmt.Errorf("postgresql source %s not connected", pg.name)
	}
	return pg.db.PingContext(ctx)
}

func (pg *PostgreSQLDataSource) Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error) {
	start := time.Now()

	if pg.db == nil {
		return nil, fmt.Errorf("postgresql source %s not connected", pg.name)
	}

	rows, err := pg.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgresql query: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("postgresql get columns: %w", err)
	}

	var resultRows []Row
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range columns {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("postgresql scan row: %w", err)
		}

		row := make(Row)
		for i, col := range columns {
			val := values[i]
			if b, ok := val.([]byte); ok {
				val = string(b)
			}
			row[col] = val
		}
		resultRows = append(resultRows, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgresql rows iteration: %w", err)
	}

	return &QueryResult{
		Rows:      resultRows,
		Columns:   columns,
		RowCount:  len(resultRows),
		Source:    pg.name,
		QueryTime: time.Since(start),
	}, nil
}

type MongoDBDataSource struct {
	BaseDataSource
	client    *mongo.Client
	host      string
	port      int
	user      string
	password  string
	database  string
	uri       string
	replicaSet string
}

type MongoDBConfig struct {
	Host       string
	Port       int
	User       string
	Password   string
	Database   string
	URI        string
	ReplicaSet string
}

func NewMongoDBDataSource(name string, cfg MongoDBConfig) *MongoDBDataSource {
	return &MongoDBDataSource{
		BaseDataSource: BaseDataSource{
			name:       name,
			sourceType: SourceMongoDB,
		},
		host:       cfg.Host,
		port:       cfg.Port,
		user:       cfg.User,
		password:   cfg.Password,
		database:   cfg.Database,
		uri:        cfg.URI,
		replicaSet: cfg.ReplicaSet,
	}
}

func (m *MongoDBDataSource) Connect(ctx context.Context) error {
	uri := m.uri
	if uri == "" {
		if m.user != "" {
			uri = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s",
				m.user, m.password, m.host, m.port, m.database)
		} else {
			uri = fmt.Sprintf("mongodb://%s:%d/%s",
				m.host, m.port, m.database)
		}
	}

	if m.replicaSet != "" {
		uri += fmt.Sprintf("?replicaSet=%s", m.replicaSet)
	}

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("mongodb connect: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		client.Disconnect(ctx)
		return fmt.Errorf("mongodb ping: %w", err)
	}

	m.client = client
	m.setConnected(true)
	return nil
}

func (m *MongoDBDataSource) Close() error {
	if m.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := m.client.Disconnect(ctx)
		m.setConnected(false)
		return err
	}
	return nil
}

func (m *MongoDBDataSource) Ping(ctx context.Context) error {
	if m.client == nil {
		return fmt.Errorf("mongodb source %s not connected", m.name)
	}
	return m.client.Ping(ctx, nil)
}

func (m *MongoDBDataSource) Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error) {
	start := time.Now()

	if m.client == nil {
		return nil, fmt.Errorf("mongodb source %s not connected", m.name)
	}

	var pipeline bson.A
	if err := bson.UnmarshalExtJSON([]byte(query), true, &pipeline); err != nil {
		return nil, fmt.Errorf("mongodb parse query: %w", err)
	}

	db := m.client.Database(m.database)

	collectionName := m.extractCollectionName(pipeline)
	if collectionName == "" {
		return nil, fmt.Errorf("mongodb cannot extract collection from pipeline")
	}

	collection := db.Collection(collectionName)

	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("mongodb aggregate: %w", err)
	}
	defer cursor.Close(ctx)

	var resultRows []Row
	columnsSet := make(map[string]bool)
	var columns []string

	for cursor.Next(ctx) {
		var raw bson.M
		if err := cursor.Decode(&raw); err != nil {
			return nil, fmt.Errorf("mongodb decode: %w", err)
		}

		row := make(Row)
		for k, v := range raw {
			if !columnsSet[k] {
				columnsSet[k] = true
				columns = append(columns, k)
			}
			row[k] = convertBSONValue(v)
		}
		resultRows = append(resultRows, row)
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("mongodb cursor: %w", err)
	}

	return &QueryResult{
		Rows:      resultRows,
		Columns:   columns,
		RowCount:  len(resultRows),
		Source:    m.name,
		QueryTime: time.Since(start),
	}, nil
}

func (m *MongoDBDataSource) extractCollectionName(pipeline bson.A) string {
	for _, stage := range pipeline {
		if stageMap, ok := stage.(bson.M); ok {
			if _, ok := stageMap["$collStats"]; ok {
				return ""
			}
		}
	}
	return ""
}

func convertBSONValue(v interface{}) interface{} {
	switch val := v.(type) {
	case bson.ObjectId:
		return val.Hex()
	case bson.M:
		result := make(map[string]interface{})
		for k, v := range val {
			result[k] = convertBSONValue(v)
		}
		return result
	case bson.A:
		result := make([]interface{}, len(val))
		for i, item := range val {
			result[i] = convertBSONValue(item)
		}
		return result
	case time.Time:
		return val
	default:
		return v
	}
}

type DataSourceManager struct {
	engine *FederatedEngine
	mu     sync.RWMutex
}

func NewDataSourceManager(engine *FederatedEngine) *DataSourceManager {
	return &DataSourceManager{
		engine: engine,
	}
}

func (m *DataSourceManager) Register(ds DataSource) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.engine.RegisterDataSource(ds)
}

func (m *DataSourceManager) Unregister(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.engine.UnregisterDataSource(name)
}

func (m *DataSourceManager) Get(name string) (DataSource, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.engine.GetDataSource(name)
}

func (m *DataSourceManager) List() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.engine.ListDataSources()
}

func (m *DataSourceManager) TestConnection(ctx context.Context, name string) error {
	ds, ok := m.Get(name)
	if !ok {
		return fmt.Errorf("data source %s not found", name)
	}
	return ds.Ping(ctx)
}

func (m *DataSourceManager) ConnectAll(ctx context.Context) map[string]error {
	results := make(map[string]error)
	for _, name := range m.List() {
		ds, ok := m.Get(name)
		if !ok {
			results[name] = fmt.Errorf("not found")
			continue
		}
		if !ds.(interface{ IsConnected() bool }).IsConnected() {
			if err := ds.Connect(ctx); err != nil {
				results[name] = err
			}
		}
	}
	return results
}
