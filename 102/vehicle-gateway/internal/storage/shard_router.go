package storage

import (
	"context"
	"fmt"
	"hash/fnv"
	"strings"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

type ShardStrategy string

const (
	ShardByRegion   ShardStrategy = "region"
	ShardByTime     ShardStrategy = "time"
	ShardByDevice   ShardStrategy = "device"
	ShardByRegionTime ShardStrategy = "region_time"
	ShardByDeviceTime ShardStrategy = "device_time"
)

type DBShard struct {
	Name     string
	DB       *gorm.DB
	ReadOnly bool
	Weight   int
	Region   string
}

type ShardRouter struct {
	config       models.MultiDBConfig
	shards       map[string]*DBShard
	regionShards map[string][]*DBShard
	timeShards   map[string][]*DBShard
	deviceShards []*DBShard
	defaultShard *DBShard
	mu           sync.RWMutex
	strategy     ShardStrategy
}

func NewShardRouter(config models.MultiDBConfig) (*ShardRouter, error) {
	if !config.Enabled {
		return nil, nil
	}

	router := &ShardRouter{
		config:       config,
		shards:       make(map[string]*DBShard),
		regionShards: make(map[string][]*DBShard),
		timeShards:   make(map[string][]*DBShard),
		strategy:     ShardStrategy(config.Strategy),
	}

	if err := router.initShards(config); err != nil {
		return nil, err
	}

	logger.Info("Shard router initialized",
		zap.String("strategy", string(router.strategy)),
		zap.Int("shard_count", len(router.shards)))

	return router, nil
}

func (r *ShardRouter) initShards(config models.MultiDBConfig) error {
	for region, dbConfig := range config.RegionDatabases {
		shard, err := r.createShard(dbConfig)
		if err != nil {
			logger.Error("Create region shard failed",
				zap.String("region", region),
				zap.Error(err))
			return err
		}
		r.shards[shard.Name] = shard
		r.regionShards[region] = append(r.regionShards[region], shard)

		if r.defaultShard == nil {
			r.defaultShard = shard
		}
	}

	for i, dbConfig := range config.ShardDatabases {
		shard, err := r.createShard(dbConfig)
		if err != nil {
			logger.Error("Create shard failed",
				zap.Int("index", i),
				zap.Error(err))
			return err
		}
		r.shards[shard.Name] = shard
		r.deviceShards = append(r.deviceShards, shard)

		if r.defaultShard == nil {
			r.defaultShard = shard
		}
	}

	if len(r.shards) == 0 {
		return fmt.Errorf("no database shards configured")
	}

	r.initTimeShards()

	return nil
}

func (r *ShardRouter) createShard(config models.DBInstanceConfig) (*DBShard, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		config.User, config.Password, config.Host, config.Port, config.DBName)

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

	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(1 * time.Hour)

	return &DBShard{
		Name:     config.Name,
		DB:       db,
		ReadOnly: config.ReadOnly,
		Weight:   config.Weight,
		Region:   config.Region,
	}, nil
}

func (r *ShardRouter) initTimeShards() {
	now := time.Now()
	for i := 0; i < r.config.MonthRetention; i++ {
		month := now.AddDate(0, -i, 0)
		monthKey := month.Format("200601")

		shards := make([]*DBShard, 0, len(r.regionShards)+len(r.deviceShards))

		for _, regionShards := range r.regionShards {
			shards = append(shards, regionShards...)
		}

		shards = append(shards, r.deviceShards...)

		if len(shards) > 0 {
			r.timeShards[monthKey] = shards
		}
	}
}

func (r *ShardRouter) Route(data *models.VehicleData) (*DBShard, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tableName := r.getTableName(data)
	shard, err := r.getShard(data)
	return shard, tableName, err
}

func (r *ShardRouter) getShard(data *models.VehicleData) (*DBShard, error) {
	switch r.strategy {
	case ShardByRegion:
		return r.getShardByRegion(data.Region)
	case ShardByTime:
		return r.getShardByTime(data.Timestamp)
	case ShardByDevice:
		return r.getShardByDevice(data.DeviceID)
	case ShardByRegionTime:
		return r.getShardByRegionAndTime(data.Region, data.Timestamp)
	case ShardByDeviceTime:
		return r.getShardByDeviceAndTime(data.DeviceID, data.Timestamp)
	default:
		return r.defaultShard, nil
	}
}

func (r *ShardRouter) getTableName(data *models.VehicleData) string {
	baseTable := "vehicle_data"

	switch r.strategy {
	case ShardByTime, ShardByRegionTime, ShardByDeviceTime:
		monthSuffix := data.Timestamp.Format("200601")
		return fmt.Sprintf("%s_%s", baseTable, monthSuffix)
	default:
		if r.config.ShardCount > 0 {
			shardIndex := r.getDeviceShardIndex(data.DeviceID)
			return fmt.Sprintf("%s_%02d", baseTable, shardIndex)
		}
		return baseTable
	}
}

func (r *ShardRouter) getShardByRegion(region string) (*DBShard, error) {
	shards, ok := r.regionShards[region]
	if !ok || len(shards) == 0 {
		return r.defaultShard, nil
	}
	return r.selectShardByWeight(shards), nil
}

func (r *ShardRouter) getShardByTime(t time.Time) (*DBShard, error) {
	monthKey := t.Format("200601")
	shards, ok := r.timeShards[monthKey]
	if !ok || len(shards) == 0 {
		return r.defaultShard, nil
	}
	return r.selectShardByWeight(shards), nil
}

func (r *ShardRouter) getShardByDevice(deviceID string) (*DBShard, error) {
	if len(r.deviceShards) == 0 {
		return r.defaultShard, nil
	}

	index := r.getDeviceShardIndex(deviceID) % len(r.deviceShards)
	return r.deviceShards[index], nil
}

func (r *ShardRouter) getShardByRegionAndTime(region string, t time.Time) (*DBShard, error) {
	shards, ok := r.regionShards[region]
	if !ok || len(shards) == 0 {
		return r.defaultShard, nil
	}
	return r.selectShardByWeight(shards), nil
}

func (r *ShardRouter) getShardByDeviceAndTime(deviceID string, t time.Time) (*DBShard, error) {
	return r.getShardByDevice(deviceID)
}

func (r *ShardRouter) getDeviceShardIndex(deviceID string) int {
	if r.config.ShardCount <= 0 {
		return 0
	}

	h := fnv.New32a()
	h.Write([]byte(deviceID))
	return int(h.Sum32() % uint32(r.config.ShardCount))
}

func (r *ShardRouter) selectShardByWeight(shards []*DBShard) *DBShard {
	if len(shards) == 0 {
		return r.defaultShard
	}

	totalWeight := 0
	for _, shard := range shards {
		if !shard.ReadOnly {
			totalWeight += shard.Weight
		}
	}

	if totalWeight == 0 {
		return shards[0]
	}

	randomWeight := uint32(time.Now().UnixNano()) % uint32(totalWeight)
	for _, shard := range shards {
		if shard.ReadOnly {
			continue
		}
		randomWeight -= uint32(shard.Weight)
		if randomWeight <= 0 {
			return shard
		}
	}

	return shards[0]
}

func (r *ShardRouter) GetAllShards() []*DBShard {
	r.mu.RLock()
	defer r.mu.RUnlock()

	shards := make([]*DBShard, 0, len(r.shards))
	for _, shard := range r.shards {
		shards = append(shards, shard)
	}
	return shards
}

func (r *ShardRouter) GetReadShards() []*DBShard {
	r.mu.RLock()
	defer r.mu.RUnlock()

	shards := make([]*DBShard, 0, len(r.shards))
	for _, shard := range r.shards {
		shards = append(shards, shard)
	}
	return shards
}

func (r *ShardRouter) GetWriteShards() []*DBShard {
	r.mu.RLock()
	defer r.mu.RUnlock()

	shards := make([]*DBShard, 0)
	for _, shard := range r.shards {
		if !shard.ReadOnly {
			shards = append(shards, shard)
		}
	}
	return shards
}

func (r *ShardRouter) GetShardByName(name string) (*DBShard, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	shard, ok := r.shards[name]
	return shard, ok
}

func (r *ShardRouter) GetShardForRead(region string, deviceID string, t time.Time) (*DBShard, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	switch r.strategy {
	case ShardByRegion:
		return r.getShardByRegion(region)
	case ShardByTime:
		return r.getShardByTime(t)
	case ShardByDevice, ShardByDeviceTime:
		return r.getShardByDevice(deviceID)
	case ShardByRegionTime:
		return r.getShardByRegion(region)
	default:
		return r.defaultShard, nil
	}
}

func (r *ShardRouter) EnsureTableForTime(t time.Time) error {
	monthSuffix := t.Format("200601")
	baseTables := []string{"vehicle_data"}

	for _, shard := range r.GetAllShards() {
		for _, baseTable := range baseTables {
			tableName := fmt.Sprintf("%s_%s", baseTable, monthSuffix)
			err := shard.DB.Exec(fmt.Sprintf(`
				CREATE TABLE IF NOT EXISTS %s LIKE %s
			`, tableName, baseTable)).Error
			if err != nil && !strings.Contains(err.Error(), "already exists") {
				logger.Error("Create monthly table failed",
					zap.String("table", tableName),
					zap.String("shard", shard.Name),
					zap.Error(err))
			}
		}
	}

	return nil
}

func (r *ShardRouter) PurgeOldData(retentionDays int) error {
	if retentionDays <= 0 {
		return nil
	}

	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)

	for _, shard := range r.GetAllShards() {
		year := cutoffTime.Year()
		month := int(cutoffTime.Month())

		for {
			monthSuffix := fmt.Sprintf("%04d%02d", year, month)
			tableName := fmt.Sprintf("vehicle_data_%s", monthSuffix)

			err := shard.DB.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName)).Error
			if err != nil {
				logger.Error("Drop old table failed",
					zap.String("table", tableName),
					zap.String("shard", shard.Name),
					zap.Error(err))
			} else {
				logger.Info("Purged old data table",
					zap.String("table", tableName),
					zap.String("shard", shard.Name))
			}

			month--
			if month < 1 {
				month = 12
				year--
			}

			if year < cutoffTime.Year()-1 {
				break
			}
		}
	}

	return nil
}

func (r *ShardRouter) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, shard := range r.shards {
		if shard.DB != nil {
			sqlDB, _ := shard.DB.DB()
			if sqlDB != nil {
				sqlDB.Close()
			}
		}
	}

	r.shards = make(map[string]*DBShard)
	r.regionShards = make(map[string][]*DBShard)
	r.timeShards = make(map[string][]*DBShard)
	r.deviceShards = nil
	r.defaultShard = nil
}

func (r *ShardRouter) GetStrategy() ShardStrategy {
	return r.strategy
}

func (r *ShardRouter) HealthCheck(ctx context.Context) map[string]error {
	results := make(map[string]error)

	for name, shard := range r.shards {
		sqlDB, err := shard.DB.DB()
		if err != nil {
			results[name] = err
			continue
		}

		if err := sqlDB.PingContext(ctx); err != nil {
			results[name] = err
		}
	}

	return results
}

func (r *ShardRouter) GetStats() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return map[string]interface{}{
		"strategy":        string(r.strategy),
		"total_shards":    len(r.shards),
		"region_shards":   len(r.regionShards),
		"time_shards":     len(r.timeShards),
		"device_shards":   len(r.deviceShards),
		"default_shard":   r.defaultShard.Name,
	}
}
