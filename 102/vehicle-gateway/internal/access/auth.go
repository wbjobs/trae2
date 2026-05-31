package access

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type AuthService struct {
	db                *gorm.DB
	redisClient       *redis.Client
	deviceCache       *sync.Map
	tokenTTL          time.Duration
	regionWhitelist   *RegionWhitelistManager
}

func NewAuthService(db *gorm.DB, redisClient *redis.Client) *AuthService {
	return &AuthService{
		db:          db,
		redisClient: redisClient,
		deviceCache: &sync.Map{},
		tokenTTL:    24 * time.Hour,
	}
}

func (s *AuthService) SetRegionWhitelist(whitelist *RegionWhitelistManager) {
	s.regionWhitelist = whitelist
}

func (s *AuthService) Authenticate(deviceID, token string) (*models.TerminalDevice, error) {
	if deviceID == "" || token == "" {
		return nil, errors.New("device_id and token required")
	}

	if device, ok := s.deviceCache.Load(deviceID); ok {
		d := device.(*models.TerminalDevice)
		if d.AuthToken == generateTokenHash(token) {
			if s.regionWhitelist != nil {
				if allowed, err := s.regionWhitelist.CheckAccess(deviceID, d.Region); !allowed {
					return nil, err
				}
			}
			return d, nil
		}
	}

	var device models.TerminalDevice
	err := s.db.Where("device_id = ?", deviceID).First(&device).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Warn("Device not found", zap.String("device_id", deviceID))
			return nil, errors.New("device not found")
		}
		return nil, err
	}

	if device.AuthToken != generateTokenHash(token) {
		logger.Warn("Invalid token", zap.String("device_id", deviceID))
		return nil, errors.New("invalid token")
	}

	if device.Status != models.DeviceStatusNormal {
		logger.Warn("Device not active",
			zap.String("device_id", deviceID),
			zap.Int32("status", device.Status))
		return nil, errors.New("device not active")
	}

	if s.regionWhitelist != nil {
		if allowed, err := s.regionWhitelist.CheckAccess(deviceID, device.Region); !allowed {
			logger.Warn("Device region access denied",
				zap.String("device_id", deviceID),
				zap.String("region", device.Region))
			return nil, err
		}
	}

	s.deviceCache.Store(deviceID, &device)

	return &device, nil
}

func (s *AuthService) ValidateDevice(deviceID string) (*models.TerminalDevice, error) {
	if deviceID == "" {
		return nil, errors.New("device_id required")
	}

	if device, ok := s.deviceCache.Load(deviceID); ok {
		d := device.(*models.TerminalDevice)
		if s.regionWhitelist != nil {
			if allowed, err := s.regionWhitelist.CheckAccess(deviceID, d.Region); !allowed {
				return nil, err
			}
		}
		return d, nil
	}

	var device models.TerminalDevice
	err := s.db.Where("device_id = ?", deviceID).First(&device).Error
	if err != nil {
		return nil, err
	}

	if s.regionWhitelist != nil {
		if allowed, err := s.regionWhitelist.CheckAccess(deviceID, device.Region); !allowed {
			return nil, err
		}
	}

	s.deviceCache.Store(deviceID, &device)

	return &device, nil
}

func (s *AuthService) SetDeviceOnline(deviceID, nodeID string) error {
	ctx := context.Background()
	key := models.CacheKeyOnlinePrefix + deviceID

	pipe := s.redisClient.Pipeline()
	pipe.Set(ctx, key, nodeID, 300*time.Second)
	pipe.HSet(ctx, models.CacheKeyDevicePrefix+deviceID, "online_status", models.OnlineStatusOnline)
	_, err := pipe.Exec(ctx)
	if err != nil {
		logger.Error("Set device online failed", zap.Error(err))
		return err
	}

	s.db.Model(&models.TerminalDevice{}).
		Where("device_id = ?", deviceID).
		Updates(map[string]interface{}{
			"online_status":  models.OnlineStatusOnline,
			"last_online_at": time.Now(),
		})

	return nil
}

func (s *AuthService) SetDeviceOffline(deviceID string) error {
	ctx := context.Background()
	key := models.CacheKeyOnlinePrefix + deviceID

	_, err := s.redisClient.Del(ctx, key).Result()
	if err != nil {
		logger.Error("Delete online key failed", zap.Error(err))
	}

	s.db.Model(&models.TerminalDevice{}).
		Where("device_id = ?", deviceID).
		Update("online_status", models.OnlineStatusOffline)

	s.deviceCache.Delete(deviceID)

	return nil
}

func (s *AuthService) Heartbeat(deviceID string) error {
	ctx := context.Background()
	key := models.CacheKeyOnlinePrefix + deviceID

	_, err := s.redisClient.Expire(ctx, key, 300*time.Second).Result()
	if err != nil {
		logger.Error("Heartbeat expire failed", zap.Error(err))
		return err
	}

	s.db.Model(&models.TerminalDevice{}).
		Where("device_id = ?", deviceID).
		Update("last_heartbeat", time.Now())

	return nil
}

func (s *AuthService) IsDeviceOnline(deviceID string) (bool, string, error) {
	ctx := context.Background()
	key := models.CacheKeyOnlinePrefix + deviceID

	nodeID, err := s.redisClient.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return false, "", nil
		}
		return false, "", err
	}

	return true, nodeID, nil
}

func generateTokenHash(token string) string {
	hash := sha256.Sum256([]byte(token + "vehicle_gateway_salt"))
	return hex.EncodeToString(hash[:])
}

func GenerateToken(deviceID string) string {
	data := deviceID + time.Now().String()
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:16])
}
