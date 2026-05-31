package storage

import (
	"context"
	"fmt"
	"hash/fnv"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"
	"vehicle-gateway/pkg/pool"

	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

type MySQLStorage struct {
	db               *gorm.DB
	shardRouter      *ShardRouter
	multiDBEnabled   bool
	batchSize        int
	flushInterval    time.Duration
	dataQueue        chan *models.VehicleData
	workerPool       *pool.Pool
	ctx              context.Context
	cancel           context.CancelFunc
	wg               sync.WaitGroup
	shardingEnabled  bool
	shardCount       int
	tableCreator     *sync.Map
}

func NewMySQLStorage(cfg models.DatabaseConfig) (*MySQLStorage, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.DBName)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Silent),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Second)

	ctx, cancel := context.WithCancel(context.Background())

	storage := &MySQLStorage{
		db:              db,
		multiDBEnabled:  cfg.MultiDB.Enabled,
		batchSize:       cfg.BatchSize,
		flushInterval:   time.Duration(cfg.FlushInterval) * time.Second,
		dataQueue:       make(chan *models.VehicleData, cfg.BatchSize*10),
		workerPool:      pool.New(5, cfg.BatchSize*2),
		ctx:             ctx,
		cancel:          cancel,
		shardingEnabled: cfg.ShardingEnabled,
		shardCount:      cfg.ShardCount,
		tableCreator:    &sync.Map{},
	}

	if cfg.MultiDB.Enabled {
		shardRouter, err := NewShardRouter(cfg.MultiDB)
		if err != nil {
			logger.Error("Init shard router failed", zap.Error(err))
			return nil, err
		}
		storage.shardRouter = shardRouter
		logger.Info("Multi-database sharding enabled",
			zap.String("strategy", cfg.MultiDB.Strategy),
			zap.Int("shard_count", cfg.MultiDB.ShardCount))
	}

	if err := storage.InitTables(); err != nil {
		return nil, err
	}

	return storage, nil
}

func (s *MySQLStorage) InitTables() error {
	tables := []interface{}{
		&models.TerminalDevice{},
	}

	for _, table := range tables {
		if err := s.db.AutoMigrate(table); err != nil {
			return err
		}
	}

	if s.shardingEnabled {
		for i := 0; i < s.shardCount; i++ {
			tableName := fmt.Sprintf("vehicle_data_%02d", i)
			if err := s.db.Table(tableName).AutoMigrate(&models.VehicleData{}); err != nil {
				logger.Error("Create shard table failed",
					zap.String("table", tableName),
					zap.Error(err))
			}
		}
	} else {
		if err := s.db.AutoMigrate(&models.VehicleData{}); err != nil {
			return err
		}
	}

	logger.Info("Database tables initialized")
	return nil
}

func (s *MySQLStorage) getShardIndex(deviceID string) int {
	if !s.shardingEnabled {
		return 0
	}

	h := fnv.New32a()
	h.Write([]byte(deviceID))
	return int(h.Sum32() % uint32(s.shardCount))
}

func (s *MySQLStorage) getTableName(data *models.VehicleData) string {
	if s.multiDBEnabled && s.shardRouter != nil {
		_, tableName, _ := s.shardRouter.Route(data)
		return tableName
	}

	if !s.shardingEnabled {
		return "vehicle_data"
	}
	idx := s.getShardIndex(data.DeviceID)
	return fmt.Sprintf("vehicle_data_%02d", idx)
}

func (s *MySQLStorage) getDBForWrite(data *models.VehicleData) *gorm.DB {
	if s.multiDBEnabled && s.shardRouter != nil {
		shard, _, err := s.shardRouter.Route(data)
		if err == nil && shard != nil {
			s.ensureTableExists(shard.DB, s.getTableName(data))
			return shard.DB
		}
	}
	return s.db
}

func (s *MySQLStorage) ensureTableExists(db *gorm.DB, tableName string) {
	if _, ok := s.tableCreator.LoadOrStore(tableName, true); !ok {
		go func() {
			err := db.Exec(fmt.Sprintf(`
				CREATE TABLE IF NOT EXISTS %s LIKE vehicle_data
			`, tableName)).Error
			if err != nil {
				logger.Debug("Ensure table exists",
					zap.String("table", tableName),
					zap.Error(err))
			} else {
				logger.Info("Created data table", zap.String("table", tableName))
			}
		}()
	}
}

func (s *MySQLStorage) Save(data *models.VehicleData) error {
	db := s.getDBForWrite(data)
	tableName := s.getTableName(data)

	if s.multiDBEnabled {
		s.ensureTableExists(db, tableName)
	}

	return db.Table(tableName).Create(data).Error
}

func (s *MySQLStorage) SaveBatch(dataList []*models.VehicleData) error {
	if len(dataList) == 0 {
		return nil
	}

	type shardData struct {
		db     *gorm.DB
		shards map[string][]*models.VehicleData
	}

	shardedData := make(map[string]*shardData)

	for _, data := range dataList {
		tableName := s.getTableName(data)
		db := s.getDBForWrite(data)

		key := fmt.Sprintf("%p_%s", db, tableName)
		if _, ok := shardedData[key]; !ok {
			shardedData[key] = &shardData{
				db:     db,
				shards: make(map[string][]*models.VehicleData),
			}
		}
		shardedData[key].shards[tableName] = append(shardedData[key].shards[tableName], data)

		if s.multiDBEnabled {
			s.ensureTableExists(db, tableName)
		}
	}

	var wg sync.WaitGroup
	var errMu sync.Mutex
	var firstErr error

	for _, sd := range shardedData {
		sd := sd
		for tableName, data := range sd.shards {
			tableName := tableName
			data := data
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := sd.db.Table(tableName).Create(data).Error; err != nil {
					errMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					errMu.Unlock()
					logger.Error("Batch save failed",
						zap.String("table", tableName),
						zap.Error(err))
				}
			}()
		}
	}

	wg.Wait()
	return firstErr
}

func (s *MySQLStorage) AsyncSave(data *models.VehicleData) {
	select {
	case s.dataQueue <- data:
	default:
		logger.Warn("Data queue full, dropping data",
			zap.String("device_id", data.DeviceID))
	}
}

func (s *MySQLStorage) StartBatchWriter() {
	s.wg.Add(1)
	go s.batchWriterLoop()
}

func (s *MySQLStorage) batchWriterLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.flushInterval)
	defer ticker.Stop()

	buffer := make([]*models.VehicleData, 0, s.batchSize)

	for {
		select {
		case <-s.ctx.Done():
			if len(buffer) > 0 {
				s.flushBuffer(buffer)
			}
			return
		case data := <-s.dataQueue:
			buffer = append(buffer, data)
			if len(buffer) >= s.batchSize {
				s.flushBuffer(buffer)
				buffer = buffer[:0]
			}
		case <-ticker.C:
			if len(buffer) > 0 {
				s.flushBuffer(buffer)
				buffer = buffer[:0]
			}
		}
	}
}

func (s *MySQLStorage) flushBuffer(buffer []*models.VehicleData) {
	if len(buffer) == 0 {
		return
	}

	dataCopy := make([]*models.VehicleData, len(buffer))
	copy(dataCopy, buffer)

	s.workerPool.Submit(func() {
		if err := s.SaveBatch(dataCopy); err != nil {
			logger.Error("Flush buffer failed", zap.Error(err))
		}
	})
}

func (s *MySQLStorage) GetDevice(deviceID string) (*models.TerminalDevice, error) {
	var device models.TerminalDevice
	err := s.db.Where("device_id = ?", deviceID).First(&device).Error
	if err != nil {
		return nil, err
	}
	return &device, nil
}

func (s *MySQLStorage) CreateDevice(device *models.TerminalDevice) error {
	return s.db.Create(device).Error
}

func (s *MySQLStorage) UpdateDevice(device *models.TerminalDevice) error {
	return s.db.Save(device).Error
}

func (s *MySQLStorage) GetDeviceList(region string, page, pageSize int) ([]*models.TerminalDevice, int64, error) {
	var devices []*models.TerminalDevice
	var total int64

	query := s.db.Model(&models.TerminalDevice{})
	if region != "" {
		query = query.Where("region = ?", region)
	}

	query.Count(&total)
	err := query.Offset((page - 1) * pageSize).Limit(pageSize).Find(&devices).Error

	return devices, total, err
}

func (s *MySQLStorage) getDBForRead(deviceID string, region string, t time.Time) (*gorm.DB, string, error) {
	if s.multiDBEnabled && s.shardRouter != nil {
		shard, err := s.shardRouter.GetShardForRead(region, deviceID, t)
		if err != nil {
			return s.db, s.getDefaultTableName(deviceID), err
		}

		tableName := s.getTableName(&models.VehicleData{DeviceID: deviceID, Timestamp: t, Region: region})
		return shard.DB, tableName, nil
	}

	tableName := s.getDefaultTableName(deviceID)
	return s.db, tableName, nil
}

func (s *MySQLStorage) getDefaultTableName(deviceID string) string {
	if !s.shardingEnabled {
		return "vehicle_data"
	}
	idx := s.getShardIndex(deviceID)
	return fmt.Sprintf("vehicle_data_%02d", idx)
}

func (s *MySQLStorage) GetVehicleData(deviceID string, region string, startTime, endTime time.Time, page, pageSize int) ([]*models.VehicleData, int64, error) {
	var data []*models.VehicleData
	var total int64

	db, tableName, err := s.getDBForRead(deviceID, region, startTime)
	if err != nil {
		logger.Warn("Get shard for read failed, using default",
			zap.String("device_id", deviceID),
			zap.Error(err))
	}

	query := db.Table(tableName).Where("device_id = ? AND timestamp >= ? AND timestamp <= ?",
		deviceID, startTime, endTime)

	query.Count(&total)
	err = query.Order("timestamp DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&data).Error

	return data, total, err
}

func (s *MySQLStorage) GetLastLocation(deviceID string, region string) (*models.VehicleData, error) {
	var data models.VehicleData
	now := time.Now()
	db, tableName, err := s.getDBForRead(deviceID, region, now)
	if err != nil {
		logger.Warn("Get shard for read failed, using default",
			zap.String("device_id", deviceID),
			zap.Error(err))
	}
	err = db.Table(tableName).Where("device_id = ?", deviceID).
		Order("timestamp DESC").First(&data).Error
	if err != nil {
		return nil, err
	}
	return &data, nil
}

func (s *MySQLStorage) QueueLength() int {
	return len(s.dataQueue)
}

func (s *MySQLStorage) Stop() {
	s.cancel()
	s.wg.Wait()
	s.workerPool.Close()

	if s.shardRouter != nil {
		s.shardRouter.Close()
	}
}

func (s *MySQLStorage) GetShardRouter() *ShardRouter {
	return s.shardRouter
}

func (s *MySQLStorage) GetMultiDBEnabled() bool {
	return s.multiDBEnabled
}

func (s *MySQLStorage) GetDB() *gorm.DB {
	return s.db
}
