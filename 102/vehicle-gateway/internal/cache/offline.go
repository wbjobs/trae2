package cache

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"
	"vehicle-gateway/pkg/pool"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type OfflineData struct {
	MessageID   string    `json:"message_id"`
	DeviceID    string    `json:"device_id"`
	Data        []byte    `json:"data"`
	Timestamp   time.Time `json:"timestamp"`
	RetryCount  int       `json:"retry_count"`
	Compressed  bool      `json:"compressed"`
	DataLength  int       `json:"data_length"`
}

type OfflineCache struct {
	redisClient      *redis.Client
	dataTTL          time.Duration
	maxSize          int
	compressEnabled  bool
	compressMinSize  int
	retryQueueSize   int
	maxRetryAttempts int
	workerPool       *pool.Pool
	ctx              context.Context
	cancel           context.CancelFunc
	wg               sync.WaitGroup
	cleanupInterval  time.Duration
	deadLetterQueue  string
}

func NewOfflineCache(redisClient *redis.Client, cfg models.CacheConfig) *OfflineCache {
	ctx, cancel := context.WithCancel(context.Background())

	return &OfflineCache{
		redisClient:      redisClient,
		dataTTL:          time.Duration(cfg.OfflineDataTTL) * time.Second,
		maxSize:          cfg.MaxOfflineSize,
		compressEnabled:  cfg.CompressEnabled,
		compressMinSize:  cfg.CompressMinSize,
		retryQueueSize:   cfg.RetryQueueSize,
		maxRetryAttempts: cfg.RetryMaxAttempts,
		workerPool:       pool.New(5, cfg.RetryQueueSize),
		ctx:              ctx,
		cancel:           cancel,
		cleanupInterval:  5 * time.Minute,
		deadLetterQueue:  "offline:dead_letter",
	}
}

func (c *OfflineCache) Store(deviceID string, data []byte) error {
	if c.maxSize > 0 {
		size, err := c.redisClient.LLen(c.ctx, models.CacheKeyOfflineQueue).Result()
		if err == nil && int(size) >= c.maxSize {
			logger.Warn("Offline cache queue full, dropping data")
			return errors.New("offline cache queue full")
	}

	offlineData := &OfflineData{
		MessageID:  generateMessageID(),
		DeviceID:   deviceID,
		Data:       data,
		Timestamp: time.Now(),
		RetryCount:  0,
	}

	var dataBytes, err := json.Marshal(offlineData)
	if err != nil {
		return err
	}

	if c.compressEnabled && len(dataBytes) > c.compressMinSize {
		compressedData, err := compress(dataBytes)
		if err == nil {
			offlineData.Data = compressedData
			offlineData.Compressed = true
			offlineData.DataLength = len(dataBytes)
			dataBytes, _ = json.Marshal(offlineData)
		}
	}

	err = c.redisClient.RPush(c.ctx, models.CacheKeyOfflineQueue, dataBytes).Err()
	if err != nil {
		logger.Error("Store offline data failed", zap.Error(err))
		return err
	}

	return nil
}

func (c *OfflineCache) Get(count int) ([]*OfflineData, error) {
	results, err := c.redisClient.LRange(c.ctx, models.CacheKeyOfflineQueue, 0, int64(count)-1).Result()
	if err != nil {
		return nil, err
	}

	dataList := make([]*OfflineData, 0, len(results))
	for _, result := range results {
		var data OfflineData
		if err := json.Unmarshal([]byte(result), &data); err != nil {
			logger.Error("Unmarshal offline data failed", zap.Error(err))
			continue
		}

		if data.Compressed {
			decompressed, err := decompress(data.Data)
			if err != nil {
				logger.Error("Decompress offline data failed", zap.Error(err))
				continue
			}
			data.Data = decompressed
		}

		dataList = append(dataList, &data)
	}

	return dataList, nil
}

func (c *OfflineCache) Remove(count int) error {
	_, err := c.redisClient.LTrim(c.ctx, models.CacheKeyOfflineQueue, int64(count), -1).Result()
	return err
}

func (c *OfflineCache) GetAndRemove(count int) ([]*OfflineData, error) {
	pipe := c.redisClient.TxPipeline()
	results := pipe.LRange(c.ctx, models.CacheKeyOfflineQueue, 0, int64(count)-1)
	pipe.LTrim(c.ctx, models.CacheKeyOfflineQueue, int64(count), -1)

	_, err := pipe.Exec(c.ctx)
	if err != nil {
		return nil, err
	}

	dataList := make([]*OfflineData, 0)
	for _, result := range results.Val() {
		var data OfflineData
		if err := json.Unmarshal([]byte(result), &data); err != nil {
			continue
		}

		if data.Compressed {
			decompressed, err := decompress(data.Data)
			if err != nil {
				logger.Error("Decompress offline data failed", zap.Error(err))
				continue
			}
			data.Data = decompressed
		}

		dataList = append(dataList, &data)
	}

	return dataList, nil
}

func (c *OfflineCache) Retry(data *OfflineData) error {
	data.RetryCount++
	if data.RetryCount > c.maxRetryAttempts {
		logger.Warn("Max retry attempts reached",
			zap.String("message_id", data.MessageID),
			zap.Int("retry_count", data.RetryCount))
		return errors.New("max retry attempts reached")
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	return c.redisClient.RPush(c.ctx, models.CacheKeyOfflineQueue, dataBytes).Err()
}

func (c *OfflineCache) Size() (int64, error) {
	return c.redisClient.LLen(c.ctx, models.CacheKeyOfflineQueue).Result()
}

func (c *OfflineCache) StartRetryWorker(handler func(*OfflineData) error) {
	c.wg.Add(1)
	go c.retryLoop(handler)
}

func (c *OfflineCache) retryLoop(handler func(*OfflineData) error) {
	defer c.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			c.processRetryQueue(handler)
		}
	}
}

func (c *OfflineCache) processRetryQueue(handler func(*OfflineData) error) {
	dataList, err := c.GetAndRemove(100)
	if err != nil {
		logger.Error("Get offline data failed", zap.Error(err))
		return
	}

	for _, data := range dataList {
		data := data
		c.workerPool.Submit(func() {
			if err := handler(data); err != nil {
				if err := c.Retry(data); err != nil {
					logger.Error("Retry offline data failed", zap.Error(err))
				}
			}
		})
	}
}

func (c *OfflineCache) StartCleanupWorker() {
	c.wg.Add(1)
	go c.cleanupLoop()
}

func (c *OfflineCache) cleanupLoop() {
	defer c.wg.Done()

	ticker := time.NewTicker(c.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			expiredCount, maxRetryCount, err := c.CleanupExpired()
			if err != nil {
				logger.Error("Cleanup expired data failed", zap.Error(err))
			} else if expiredCount > 0 || maxRetryCount > 0 {
				logger.Info("Cleaned up offline data",
					zap.Int("expired", expiredCount),
					zap.Int("max_retry", maxRetryCount))
			}
		}
	}
}

func (c *OfflineCache) CleanupExpired() (int, int, error) {
	queueKey := models.CacheKeyOfflineQueue
	now := time.Now()
	expiredCount := 0
	maxRetryCount := 0

	results, err := c.redisClient.LRange(c.ctx, queueKey, 0, -1).Result()
	if err != nil {
		return 0, 0, err
	}

	if len(results) == 0 {
		return 0, 0, nil
	}

	var validData []interface{}
	var deadLetterData []interface{}

	for _, item := range results {
		var data OfflineData
		if err := json.Unmarshal([]byte(item), &data); err != nil {
			continue
		}

		isExpired := now.Sub(data.Timestamp) > c.dataTTL
		exceededMaxRetry := data.RetryCount >= c.maxRetryAttempts

		if isExpired {
			expiredCount++
			deadLetterData = append(deadLetterData, item)
		} else if exceededMaxRetry {
			maxRetryCount++
			deadLetterData = append(deadLetterData, item)
		} else {
			validData = append(validData, item)
		}
	}

	if len(validData) != len(results) {
		pipe := c.redisClient.TxPipeline()
		pipe.Del(c.ctx, queueKey)
		if len(validData) > 0 {
			pipe.RPush(c.ctx, queueKey, validData...)
		}
		if len(deadLetterData) > 0 {
			pipe.RPush(c.ctx, c.deadLetterQueue, deadLetterData...)
			pipe.LTrim(c.ctx, c.deadLetterQueue, -10000, -1)
		}
		_, err = pipe.Exec(c.ctx)
		if err != nil {
			return 0, 0, err
		}
	}

	return expiredCount, maxRetryCount, nil
}

func (c *OfflineCache) CleanupDeadLetter() (int, error) {
	result, err := c.redisClient.Del(c.ctx, c.deadLetterQueue).Result()
	return int(result), err
}

func (c *OfflineCache) Stop() {
	c.cancel()
	c.wg.Wait()
	c.workerPool.Close()
}

func compress(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(data); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func decompress(data []byte) ([]byte, error) {
	buf := bytes.NewBuffer(data)
	gz, err := gzip.NewReader(buf)
	if err != nil {
		return nil, err
	}
	defer gz.Close()

	return io.ReadAll(gz)
}

func generateMessageID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

type DeviceDataCache struct {
	redisClient *redis.Client
	ctx         context.Context
}

func NewDeviceDataCache(redisClient *redis.Client) *DeviceDataCache {
	return &DeviceDataCache{
		redisClient: redisClient,
		ctx:         context.Background(),
	}
}

func (c *DeviceDataCache) GetLastLocation(deviceID string) (*models.LocationData, error) {
	key := fmt.Sprintf("%s%s:last_location", models.CacheKeyDevicePrefix, deviceID)
	data, err := c.redisClient.Get(c.ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var loc models.LocationData
	if err := json.Unmarshal(data, &loc); err != nil {
		return nil, err
	}

	return &loc, nil
}

func (c *DeviceDataCache) SetLastLocation(deviceID string, loc *models.LocationData) error {
	key := fmt.Sprintf("%s%s:last_location", models.CacheKeyDevicePrefix, deviceID)
	data, err := json.Marshal(loc)
	if err != nil {
		return err
	}

	return c.redisClient.Set(c.ctx, key, data, 24*time.Hour).Err()
}

func (c *DeviceDataCache) GetDevice(deviceID string) (*models.TerminalDevice, error) {
	key := fmt.Sprintf("%s%s:info", models.CacheKeyDevicePrefix, deviceID)
	data, err := c.redisClient.Get(c.ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var device models.TerminalDevice
	if err := json.Unmarshal(data, &device); err != nil {
		return nil, err
	}

	return &device, nil
}

func (c *DeviceDataCache) SetDevice(device *models.TerminalDevice) error {
	key := fmt.Sprintf("%s%s:info", models.CacheKeyDevicePrefix, device.DeviceID)
	data, err := json.Marshal(device)
	if err != nil {
		return err
	}

	return c.redisClient.Set(c.ctx, key, data, 1*time.Hour).Err()
}

func (c *DeviceDataCache) DeleteDevice(deviceID string) error {
	key := fmt.Sprintf("%s%s:info", models.CacheKeyDevicePrefix, deviceID)
	return c.redisClient.Del(c.ctx, key).Err()
}
