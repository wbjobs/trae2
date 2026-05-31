package access

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type RegionWhitelistManager struct {
	config      models.RegionWhitelistConfig
	redisClient *redis.Client
	deviceRegions *sync.Map
	ctx         context.Context
}

func NewRegionWhitelistManager(config models.RegionWhitelistConfig, redisClient *redis.Client) *RegionWhitelistManager {
	manager := &RegionWhitelistManager{
		config:      config,
		redisClient: redisClient,
		deviceRegions: &sync.Map{},
		ctx:         context.Background(),
	}

	if config.Enabled {
		manager.initDeviceRegions()
		go manager.startSyncRoutine()
	}

	return manager
}

func (m *RegionWhitelistManager) initDeviceRegions() {
	if m.config.Mode == "config" && len(m.config.DeviceRegionMap) > 0 {
		for deviceID, region := range m.config.DeviceRegionMap {
			m.deviceRegions.Store(deviceID, region)
		}
		logger.Info("Region whitelist initialized from config",
			zap.Int("device_count", len(m.config.DeviceRegionMap)))
	}
}

func (m *RegionWhitelistManager) startSyncRoutine() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		<-ticker.C
		if m.redisClient != nil {
			m.syncFromRedis()
		}
	}
}

func (m *RegionWhitelistManager) syncFromRedis() {
	key := "region:whitelist:devices"
	results, err := m.redisClient.HGetAll(m.ctx, key).Result()
	if err != nil {
		logger.Error("Sync region whitelist from redis failed", zap.Error(err))
		return
	}

	count := 0
	for deviceID, region := range results {
		if region != "" {
			m.deviceRegions.Store(deviceID, region)
			count++
		}
	}

	logger.Debug("Region whitelist synced from redis", zap.Int("count", count))
}

func (m *RegionWhitelistManager) CheckAccess(deviceID, region string) (bool, error) {
	if !m.config.Enabled {
		return true, nil
	}

	deviceRegion, ok := m.getDeviceRegion(deviceID)
	if !ok {
		if m.config.Mode == "strict" {
			logger.Warn("Device not in region whitelist",
				zap.String("device_id", deviceID))
			return false, errors.New("device not in region whitelist")
		}
		return m.isDefaultAllowedRegion(region), nil
	}

	if strings.HasPrefix(deviceRegion, "!") {
		forbiddenRegion := strings.TrimPrefix(deviceRegion, "!")
		if region == forbiddenRegion {
			logger.Warn("Device forbidden from region",
				zap.String("device_id", deviceID),
				zap.String("region", region))
			return false, errors.New("device forbidden from region: " + region)
		}
		return true, nil
	}

	if deviceRegion != "*" && deviceRegion != region {
		logger.Warn("Device region mismatch",
			zap.String("device_id", deviceID),
			zap.String("device_region", deviceRegion),
			zap.String("request_region", region))
		return false, errors.New("device region mismatch")
	}

	return true, nil
}

func (m *RegionWhitelistManager) getDeviceRegion(deviceID string) (string, bool) {
	if region, ok := m.deviceRegions.Load(deviceID); ok {
		return region.(string), true
	}

	if m.redisClient != nil {
		key := "region:whitelist:devices"
		region, err := m.redisClient.HGet(m.ctx, key, deviceID).Result()
		if err == nil && region != "" {
			m.deviceRegions.Store(deviceID, region)
			return region, true
		}
	}

	return "", false
}

func (m *RegionWhitelistManager) isDefaultAllowedRegion(region string) bool {
	if len(m.config.DefaultAllowRegions) == 0 {
		return true
	}

	for _, allowed := range m.config.DefaultAllowRegions {
		if allowed == "*" || allowed == region {
			return true
		}
	}
	return false
}

func (m *RegionWhitelistManager) AddDevice(deviceID, region string) error {
	m.deviceRegions.Store(deviceID, region)

	if m.redisClient != nil {
		key := "region:whitelist:devices"
		return m.redisClient.HSet(m.ctx, key, deviceID, region).Err()
	}

	return nil
}

func (m *RegionWhitelistManager) RemoveDevice(deviceID string) error {
	m.deviceRegions.Delete(deviceID)

	if m.redisClient != nil {
		key := "region:whitelist:devices"
		return m.redisClient.HDel(m.ctx, key, deviceID).Err()
	}

	return nil
}

func (m *RegionWhitelistManager) GetDeviceRegion(deviceID string) (string, bool) {
	return m.getDeviceRegion(deviceID)
}

func (m *RegionWhitelistManager) BatchAddDevices(deviceRegionMap map[string]string) error {
	for deviceID, region := range deviceRegionMap {
		m.deviceRegions.Store(deviceID, region)
	}

	if m.redisClient != nil && len(deviceRegionMap) > 0 {
		key := "region:whitelist:devices"
		pipe := m.redisClient.Pipeline()
		for deviceID, region := range deviceRegionMap {
			pipe.HSet(m.ctx, key, deviceID, region)
		}
		_, err := pipe.Exec(m.ctx)
		return err
	}

	return nil
}

func (m *RegionWhitelistManager) GetAllDevices() map[string]string {
	result := make(map[string]string)
	m.deviceRegions.Range(func(key, value interface{}) bool {
		result[key.(string)] = value.(string)
		return true
	})
	return result
}
