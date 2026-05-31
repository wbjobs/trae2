package database

import (
	"context"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DBConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
	MaxConns int    `mapstructure:"max_conns"`
}

type PacketRecord struct {
	ID          int64
	PacketType  string
	ProtocolVer int
	DeviceType  int
	DeviceID    uint32
	CmdID       uint16
	DataLen     int
	RawData     []byte
	Metadata    map[string]interface{}
	IsValid     bool
	ErrorMsg    string
	ReceivedAt  time.Time
	CreatedAt   time.Time
}

type ClusterNode struct {
	ID          string
	Address     string
	Status      string
	Load        int
	LastHeartbeat time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Database struct {
	pool *pgxpool.Pool
	ctx  context.Context
}

func NewDatabase(config *DBConfig) (*Database, error) {
	ctx := context.Background()
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		config.User, config.Password, config.Host, config.Port, config.DBName, config.SSLMode)

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	poolConfig.MaxConns = int32(config.MaxConns)
	poolConfig.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}

	db := &Database{
		pool: pool,
		ctx:  ctx,
	}

	if err := db.InitTables(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *Database) InitTables() error {
	sql := `
	CREATE TABLE IF NOT EXISTS packets (
		id BIGSERIAL PRIMARY KEY,
		packet_type VARCHAR(50) NOT NULL,
		protocol_ver INTEGER,
		device_type INTEGER,
		device_id BIGINT,
		cmd_id INTEGER,
		data_len INTEGER,
		raw_data BYTEA,
		metadata JSONB,
		is_valid BOOLEAN DEFAULT TRUE,
		error_msg TEXT,
		received_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS cluster_nodes (
		id VARCHAR(100) PRIMARY KEY,
		address VARCHAR(255) NOT NULL,
		status VARCHAR(50) NOT NULL,
		load INTEGER DEFAULT 0,
		last_heartbeat TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS error_packets (
		id BIGSERIAL PRIMARY KEY,
		packet_type VARCHAR(50),
		raw_data BYTEA,
		error_type VARCHAR(100),
		error_msg TEXT,
		received_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_packets_device_id ON packets(device_id);
	CREATE INDEX IF NOT EXISTS idx_packets_received_at ON packets(received_at);
	CREATE INDEX IF NOT EXISTS idx_packets_is_valid ON packets(is_valid);
	CREATE INDEX IF NOT EXISTS idx_cluster_nodes_status ON cluster_nodes(status);
	`
	_, err := db.pool.Exec(db.ctx, sql)
	return err
}

func (db *Database) InsertPacket(record *PacketRecord) (int64, error) {
	var id int64
	sql := `
	INSERT INTO packets (
		packet_type, protocol_ver, device_type, device_id, cmd_id,
		data_len, raw_data, metadata, is_valid, error_msg, received_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	RETURNING id
	`

	err := db.pool.QueryRow(db.ctx, sql,
		record.PacketType,
		record.ProtocolVer,
		record.DeviceType,
		record.DeviceID,
		record.CmdID,
		record.DataLen,
		record.RawData,
		record.Metadata,
		record.IsValid,
		record.ErrorMsg,
		record.ReceivedAt,
	).Scan(&id)

	return id, err
}

func (db *Database) InsertErrorPacket(packetType string, rawData []byte, errorType, errorMsg string, receivedAt time.Time) (int64, error) {
	var id int64
	sql := `
	INSERT INTO error_packets (packet_type, raw_data, error_type, error_msg, received_at)
	VALUES ($1, $2, $3, $4, $5)
	RETURNING id
	`
	err := db.pool.QueryRow(db.ctx, sql, packetType, rawData, errorType, errorMsg, receivedAt).Scan(&id)
	return id, err
}

func (db *Database) RegisterClusterNode(node *ClusterNode) error {
	sql := `
	INSERT INTO cluster_nodes (id, address, status, load, last_heartbeat)
	VALUES ($1, $2, $3, $4, $5)
	ON CONFLICT (id) DO UPDATE SET
		address = EXCLUDED.address,
		status = EXCLUDED.status,
		load = EXCLUDED.load,
		last_heartbeat = EXCLUDED.last_heartbeat,
		updated_at = CURRENT_TIMESTAMP
	`
	_, err := db.pool.Exec(db.ctx, sql, node.ID, node.Address, node.Status, node.Load, node.LastHeartbeat)
	return err
}

func (db *Database) UpdateNodeHeartbeat(nodeID string, load int) error {
	sql := `
	UPDATE cluster_nodes 
	SET last_heartbeat = CURRENT_TIMESTAMP, load = $2, updated_at = CURRENT_TIMESTAMP
	WHERE id = $1
	`
	_, err := db.pool.Exec(db.ctx, sql, nodeID, load)
	return err
}

func (db *Database) GetActiveNodes() ([]*ClusterNode, error) {
	sql := `
	SELECT id, address, status, load, last_heartbeat, created_at, updated_at
	FROM cluster_nodes
	WHERE status = 'active' AND last_heartbeat > NOW() - INTERVAL '30 seconds'
	ORDER BY load
	`
	rows, err := db.pool.Query(db.ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []*ClusterNode
	for rows.Next() {
		node := &ClusterNode{}
		err := rows.Scan(&node.ID, &node.Address, &node.Status, &node.Load, 
			&node.LastHeartbeat, &node.CreatedAt, &node.UpdatedAt)
		if err != nil {
			return nil, err
		}
		nodes = append(nodes, node)
	}

	return nodes, nil
}

func (db *Database) GetPacketByID(id int64) (*PacketRecord, error) {
	sql := `
	SELECT id, packet_type, protocol_ver, device_type, device_id, cmd_id,
		data_len, raw_data, metadata, is_valid, error_msg, received_at, created_at
	FROM packets WHERE id = $1
	`

	record := &PacketRecord{}
	err := db.pool.QueryRow(db.ctx, sql, id).Scan(
		&record.ID, &record.PacketType, &record.ProtocolVer, &record.DeviceType,
		&record.DeviceID, &record.CmdID, &record.DataLen, &record.RawData,
		&record.Metadata, &record.IsValid, &record.ErrorMsg, &record.ReceivedAt, &record.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (db *Database) QueryPackets(deviceID uint32, startTime, endTime time.Time, limit int) ([]*PacketRecord, error) {
	sql := `
	SELECT id, packet_type, protocol_ver, device_type, device_id, cmd_id,
		data_len, raw_data, metadata, is_valid, error_msg, received_at, created_at
	FROM packets
	WHERE device_id = $1 AND received_at BETWEEN $2 AND $3
	ORDER BY received_at DESC
	LIMIT $4
	`

	rows, err := db.pool.Query(db.ctx, sql, deviceID, startTime, endTime, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []*PacketRecord
	for rows.Next() {
		record := &PacketRecord{}
		err := rows.Scan(
			&record.ID, &record.PacketType, &record.ProtocolVer, &record.DeviceType,
			&record.DeviceID, &record.CmdID, &record.DataLen, &record.RawData,
			&record.Metadata, &record.IsValid, &record.ErrorMsg, &record.ReceivedAt, &record.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, nil
}

func (db *Database) Close() {
	if db.pool != nil {
		db.pool.Close()
	}
}

func HexString(data []byte) string {
	return hex.EncodeToString(data)
}

func (db *Database) QueryPacketsPaged(deviceID *uint32, packetType string, startTime, endTime time.Time, offset, limit int) ([]*PacketRecord, int64, error) {
	countSQL := `
	SELECT COUNT(*) FROM packets
	WHERE received_at BETWEEN $1 AND $2
	`
	args := []interface{}{startTime, endTime}
	argIdx := 3

	if deviceID != nil {
		countSQL += fmt.Sprintf(" AND device_id = $%d", argIdx)
		args = append(args, *deviceID)
		argIdx++
	}
	if packetType != "" {
		countSQL += fmt.Sprintf(" AND packet_type = $%d", argIdx)
		args = append(args, packetType)
		argIdx++
	}

	var total int64
	if err := db.pool.QueryRow(db.ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	dataSQL := `
	SELECT id, packet_type, protocol_ver, device_type, device_id, cmd_id,
		data_len, raw_data, metadata, is_valid, error_msg, received_at, created_at
	FROM packets
	WHERE received_at BETWEEN $1 AND $2
	`
	args = []interface{}{startTime, endTime}
	argIdx = 3

	if deviceID != nil {
		dataSQL += fmt.Sprintf(" AND device_id = $%d", argIdx)
		args = append(args, *deviceID)
		argIdx++
	}
	if packetType != "" {
		dataSQL += fmt.Sprintf(" AND packet_type = $%d", argIdx)
		args = append(args, packetType)
		argIdx++
	}

	dataSQL += fmt.Sprintf(" ORDER BY received_at DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := db.pool.Query(db.ctx, dataSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []*PacketRecord
	for rows.Next() {
		record := &PacketRecord{}
		err := rows.Scan(
			&record.ID, &record.PacketType, &record.ProtocolVer, &record.DeviceType,
			&record.DeviceID, &record.CmdID, &record.DataLen, &record.RawData,
			&record.Metadata, &record.IsValid, &record.ErrorMsg, &record.ReceivedAt, &record.CreatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		records = append(records, record)
	}

	return records, total, nil
}

func (db *Database) InsertPacketsBatch(records []*PacketRecord) error {
	if len(records) == 0 {
		return nil
	}

	tx, err := db.pool.Begin(db.ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(db.ctx)

	batchSize := 1000
	for i := 0; i < len(records); i += batchSize {
		end := i + batchSize
		if end > len(records) {
			end = len(records)
		}
		batch := records[i:end]

		valueStrings := make([]string, 0, len(batch))
		valueArgs := make([]interface{}, 0, len(batch)*11)

		for j, r := range batch {
			base := j * 11
			valueStrings = append(valueStrings, fmt.Sprintf(
				"($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
				base+1, base+2, base+3, base+4, base+5,
				base+6, base+7, base+8, base+9, base+10, base+11,
			))
			valueArgs = append(valueArgs,
				r.PacketType, r.ProtocolVer, r.DeviceType, r.DeviceID,
				r.CmdID, r.DataLen, r.RawData, r.Metadata,
				r.IsValid, r.ErrorMsg, r.ReceivedAt,
			)
		}

		sql := `
		INSERT INTO packets (
			packet_type, protocol_ver, device_type, device_id, cmd_id,
			data_len, raw_data, metadata, is_valid, error_msg, received_at
		) VALUES 
		` + strings.Join(valueStrings, ",")

		if _, err := tx.Exec(db.ctx, sql, valueArgs...); err != nil {
			return err
		}
	}

	return tx.Commit(db.ctx)
}
