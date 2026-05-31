package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	influxdb2api "github.com/influxdata/influxdb-client-go/v2/api"
	_ "github.com/go-sql-driver/mysql"
)

const (
	DefaultBatchSize    = 100
	DefaultFlushInterval = 5 * time.Second
	DefaultMaxRetries   = 3
	DefaultRetryDelay   = 1 * time.Second
	DefaultBufferSize   = 10000
)

type Device struct {
	ID          int       `json:"id"`
	DeviceID    string    `json:"device_id"`
	DeviceName  string    `json:"device_name"`
	Protocol    string    `json:"protocol"`
	Address     string    `json:"address"`
	Status      string    `json:"status"`
	LastOnline  time.Time `json:"last_online"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type DataPoint struct {
	GatewayID  string                 `json:"gateway_id"`
	DeviceID   string                 `json:"device_id"`
	Protocol   string                 `json:"protocol"`
	Tags       map[string]string      `json:"tags"`
	Fields     map[string]interface{} `json:"fields"`
	Timestamp  time.Time              `json:"timestamp"`
}

type DBOperator struct {
	mysqlClient    *sql.DB
	influxClient   influxdb2.Client
	influxWriter   influxdb2api.WriteAPI
	ctx            context.Context
	cancel         context.CancelFunc
	
	buffer         []*DataPoint
	bufferMu       sync.Mutex
	bufferSize     int
	maxBatchSize   int
	flushInterval  time.Duration
	maxRetries     int
	retryDelay     time.Duration
	
	flushTicker    *time.Ticker
	doneChan       chan struct{}
	wg             sync.WaitGroup
}

func NewDBOperator(cfg *GatewayConfig) (*DBOperator, error) {
	ctx, cancel := context.WithCancel(context.Background())
	
	op := &DBOperator{
		ctx:           ctx,
		cancel:        cancel,
		buffer:        make([]*DataPoint, 0, DefaultBufferSize),
		bufferSize:    DefaultBufferSize,
		maxBatchSize:  DefaultBatchSize,
		flushInterval: DefaultFlushInterval,
		maxRetries:    DefaultMaxRetries,
		retryDelay:    DefaultRetryDelay,
		doneChan:      make(chan struct{}),
	}

	if err := op.initMySQL(&cfg.MySQL); err != nil {
		cancel()
		return nil, fmt.Errorf("init mysql failed: %w", err)
	}

	if err := op.initInfluxDB(&cfg.InfluxDB); err != nil {
		cancel()
		return nil, fmt.Errorf("init influxdb failed: %w", err)
	}

	op.startBatchProcessor()
	return op, nil
}

func (d *DBOperator) initMySQL(cfg *MySQLConfig) error {
	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		return err
	}

	db.SetMaxOpenConns(cfg.MaxOpen)
	db.SetMaxIdleConns(cfg.MaxIdle)
	db.SetConnMaxLifetime(time.Hour)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping mysql failed: %w", err)
	}

	d.mysqlClient = db
	log.Println("MySQL connected successfully")
	return d.initDeviceTable()
}

func (d *DBOperator) initDeviceTable() error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS devices (
		id INT AUTO_INCREMENT PRIMARY KEY,
		device_id VARCHAR(64) NOT NULL UNIQUE,
		device_name VARCHAR(128) NOT NULL,
		protocol VARCHAR(32) NOT NULL,
		address VARCHAR(128) NOT NULL,
		status VARCHAR(32) DEFAULT 'offline',
		last_online DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_device_id (device_id),
		INDEX idx_protocol (protocol)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`

	_, err := d.mysqlClient.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("create devices table failed: %w", err)
	}
	return nil
}

func (d *DBOperator) initInfluxDB(cfg *InfluxDBConfig) error {
	client := influxdb2.NewClientWithOptions(cfg.URL, cfg.Token,
		influxdb2.DefaultOptions().
			SetBatchSize(uint(d.maxBatchSize)).
			SetFlushInterval(uint(d.flushInterval.Milliseconds())).
			SetRetryBufferLimit(uint(d.bufferSize)).
			SetMaxRetries(uint(d.maxRetries)))
	
	d.influxClient = client
	d.influxWriter = client.WriteAPI(cfg.Org, cfg.Bucket)

	d.influxWriter.SetWriteCallback(func(result influxdb2api.WriteResult) {
		if result.Err != nil {
			log.Printf("InfluxDB async write error: %v", result.Err)
		}
	})

	ctx, cancel := context.WithTimeout(d.ctx, 10*time.Second)
	defer cancel()

	health, err := client.Health(ctx)
	if err != nil {
		return fmt.Errorf("influxdb health check failed: %w", err)
	}

	if health.Status != "pass" {
		return fmt.Errorf("influxdb not healthy: %s", health.Status)
	}

	log.Println("InfluxDB connected successfully")
	return nil
}

func (d *DBOperator) startBatchProcessor() {
	d.flushTicker = time.NewTicker(d.flushInterval)
	d.wg.Add(1)
	
	go func() {
		defer d.wg.Done()
		for {
			select {
			case <-d.flushTicker.C:
				d.flushBuffer()
			case <-d.doneChan:
				d.flushBuffer()
				return
			}
		}
	}()
	
	log.Println("Batch processor started")
}

func (d *DBOperator) flushBuffer() {
	d.bufferMu.Lock()
	
	if len(d.buffer) == 0 {
		d.bufferMu.Unlock()
		return
	}
	
	batch := make([]*DataPoint, len(d.buffer))
	copy(batch, d.buffer)
	d.buffer = d.buffer[:0]
	d.bufferMu.Unlock()

	if err := d.writeBatchWithRetry(batch); err != nil {
		log.Printf("Batch write failed after retries: %v", err)
		d.requeueFailedPoints(batch)
	}
}

func (d *DBOperator) writeBatchWithRetry(points []*DataPoint) error {
	var lastErr error
	
	for attempt := 0; attempt < d.maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(d.retryDelay * time.Duration(attempt))
			log.Printf("Retrying batch write, attempt %d/%d", attempt+1, d.maxRetries)
		}
		
		err := d.writeBatch(points)
		if err == nil {
			return nil
		}
		
		lastErr = err
		log.Printf("Batch write attempt %d failed: %v", attempt+1, err)
	}
	
	return fmt.Errorf("batch write failed after %d attempts: %w", d.maxRetries, lastErr)
}

func (d *DBOperator) writeBatch(points []*DataPoint) error {
	if d.influxWriter == nil {
		return fmt.Errorf("influxdb writer not initialized")
	}

	for _, point := range points {
		p := influxdb2.NewPointWithMeasurement("sensor_data")
		p.AddTag("gateway_id", point.GatewayID)
		p.AddTag("device_id", point.DeviceID)
		p.AddTag("protocol", point.Protocol)

		for k, v := range point.Tags {
			p.AddTag(k, v)
		}

		for k, v := range point.Fields {
			if v != nil {
				p.AddField(k, v)
			}
		}

		if point.Timestamp.IsZero() {
			p.SetTime(time.Now())
		} else {
			p.SetTime(point.Timestamp)
		}

		d.influxWriter.WritePoint(p)
	}

	return nil
}

func (d *DBOperator) requeueFailedPoints(points []*DataPoint) {
	d.bufferMu.Lock()
	defer d.bufferMu.Unlock()

	available := d.bufferSize - len(d.buffer)
	if available <= 0 {
		log.Printf("Buffer full, dropping %d failed points", len(points))
		return
	}

	if len(points) > available {
		points = points[:available]
		log.Printf("Buffer limited, keeping only %d of %d failed points", available, len(points))
	}

	d.buffer = append(d.buffer, points...)
}

func (d *DBOperator) GetDevice(deviceID string) (*Device, error) {
	query := `SELECT id, device_id, device_name, protocol, address, status, last_online, created_at, updated_at 
	          FROM devices WHERE device_id = ?`
	
	var device Device
	err := d.mysqlClient.QueryRow(query, deviceID).Scan(
		&device.ID, &device.DeviceID, &device.DeviceName, &device.Protocol,
		&device.Address, &device.Status, &device.LastOnline, &device.CreatedAt, &device.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &device, nil
}

func (d *DBOperator) SaveDevice(device *Device) error {
	existing, err := d.GetDevice(device.DeviceID)
	if err != nil {
		return err
	}

	if existing == nil {
		query := `INSERT INTO devices (device_id, device_name, protocol, address, status, last_online) 
		          VALUES (?, ?, ?, ?, ?, ?)`
		_, err := d.mysqlClient.Exec(query, device.DeviceID, device.DeviceName, 
			device.Protocol, device.Address, device.Status, device.LastOnline)
		return err
	}

	query := `UPDATE devices SET device_name=?, protocol=?, address=?, status=?, last_online=? 
	          WHERE device_id=?`
	_, err = d.mysqlClient.Exec(query, device.DeviceName, device.Protocol,
		device.Address, device.Status, device.LastOnline, device.DeviceID)
	return err
}

func (d *DBOperator) UpdateDeviceStatus(deviceID, status string) error {
	query := `UPDATE devices SET status=?, last_online=NOW() WHERE device_id=?`
	_, err := d.mysqlClient.Exec(query, status, deviceID)
	return err
}

func (d *DBOperator) GetAllDevices() ([]*Device, error) {
	query := `SELECT id, device_id, device_name, protocol, address, status, last_online, created_at, updated_at 
	          FROM devices`
	
	rows, err := d.mysqlClient.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*Device
	for rows.Next() {
		var device Device
		err := rows.Scan(&device.ID, &device.DeviceID, &device.DeviceName, 
			&device.Protocol, &device.Address, &device.Status, &device.LastOnline,
			&device.CreatedAt, &device.UpdatedAt)
		if err != nil {
			return nil, err
		}
		devices = append(devices, &device)
	}
	return devices, nil
}

func (d *DBOperator) WriteTimeSeries(point *DataPoint) error {
	if point == nil {
		return fmt.Errorf("nil data point")
	}

	d.bufferMu.Lock()
	if len(d.buffer) >= d.bufferSize {
		d.bufferMu.Unlock()
		log.Println("Warning: buffer full, triggering flush")
		d.flushBuffer()
		
		d.bufferMu.Lock()
		if len(d.buffer) >= d.bufferSize {
			d.bufferMu.Unlock()
			return fmt.Errorf("buffer overflow after flush, dropping point")
		}
	}
	
	d.buffer = append(d.buffer, point)
	shouldFlush := len(d.buffer) >= d.maxBatchSize
	d.bufferMu.Unlock()

	if shouldFlush {
		d.flushBuffer()
	}

	return nil
}

func (d *DBOperator) WriteTimeSeriesBatch(points []*DataPoint) error {
	for _, point := range points {
		if err := d.WriteTimeSeries(point); err != nil {
			log.Printf("Write point to buffer failed: %v", err)
		}
	}
	return nil
}

func (d *DBOperator) Close() error {
	log.Println("Closing database operator...")
	
	close(d.doneChan)
	d.wg.Wait()
	
	if d.flushTicker != nil {
		d.flushTicker.Stop()
	}
	
	d.flushBuffer()
	
	if d.influxWriter != nil {
		d.influxWriter.Flush()
	}
	
	if d.mysqlClient != nil {
		if err := d.mysqlClient.Close(); err != nil {
			log.Printf("Close mysql failed: %v", err)
		}
	}
	
	if d.influxClient != nil {
		d.influxClient.Close()
	}
	
	d.cancel()
	log.Println("Database connections closed")
	return nil
}
