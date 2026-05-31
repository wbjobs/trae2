package main

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"os/signal"
	"syscall"
	"time"
	"vehicle-gateway/internal/access"
	"vehicle-gateway/internal/cache"
	"vehicle-gateway/internal/cluster"
	"vehicle-gateway/internal/codec"
	"vehicle-gateway/internal/flowctrl"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/internal/router"
	"vehicle-gateway/internal/storage"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"github.com/jinzhu/configor"
	"go.uber.org/zap"
)

var (
	configFile = flag.String("config", "configs/config.yaml", "config file path")
)

type GatewayServer struct {
	config        *models.Config
	redisClient   *redis.Client
	storage       *storage.MySQLStorage
	authService   *access.AuthService
	tcpServer     *access.TCPServer
	httpServer    *access.HTTPServer
	codecService  *codec.CodecService
	flowController *flowctrl.FlowController
	offlineCache  *cache.OfflineCache
	deviceCache   *cache.DeviceDataCache
	clusterManager *cluster.ClusterManager
}

func NewGatewayServer(config *models.Config) *GatewayServer {
	return &GatewayServer{
		config: config,
	}
}

func (s *GatewayServer) Init() error {
	if err := logger.Init(s.config.Log); err != nil {
		return err
	}

	if err := s.initRedis(); err != nil {
		logger.Error("Init redis failed", zap.Error(err))
		return err
	}

	storage, err := storage.NewMySQLStorage(s.config.Database)
	if err != nil {
		logger.Error("Init storage failed", zap.Error(err))
		return err
	}
	s.storage = storage

	s.authService = access.NewAuthService(storage.GetDB(), s.redisClient)

	s.codecService = codec.NewCodecService()

	s.flowController = flowctrl.NewFlowController(s.config.FlowCtrl, s.redisClient)

	s.offlineCache = cache.NewOfflineCache(s.redisClient, s.config.Cache)

	s.deviceCache = cache.NewDeviceDataCache(s.redisClient)

	s.clusterManager = cluster.NewClusterManager(s.redisClient, s.config.Cluster, s.config.Server)

	regionWhitelist := access.NewRegionWhitelistManager(s.config.Cluster.RegionWhitelist, s.redisClient)
	s.authService.SetRegionWhitelist(regionWhitelist)

	s.initTCPServer()

	s.initHTTPServer()

	return nil
}

func (s *GatewayServer) initRedis() error {
	if s.config.Redis.ClusterMode {
		s.redisClient = redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:        s.config.Redis.ClusterAddrs,
			Password:     s.config.Redis.Password,
			PoolSize:     s.config.Redis.PoolSize,
			MinIdleConns: s.config.Redis.MinIdleConns,
			DialTimeout:  time.Duration(s.config.Redis.DialTimeout) * time.Second,
			ReadTimeout:  time.Duration(s.config.Redis.ReadTimeout) * time.Second,
			WriteTimeout: time.Duration(s.config.Redis.WriteTimeout) * time.Second,
		})
	} else {
		s.redisClient = redis.NewClient(&redis.Options{
			Addr:         s.config.Redis.Addr,
			Password:     s.config.Redis.Password,
			DB:           s.config.Redis.DB,
			PoolSize:     s.config.Redis.PoolSize,
			MinIdleConns: s.config.Redis.MinIdleConns,
			DialTimeout:  time.Duration(s.config.Redis.DialTimeout) * time.Second,
			ReadTimeout:  time.Duration(s.config.Redis.ReadTimeout) * time.Second,
			WriteTimeout: time.Duration(s.config.Redis.WriteTimeout) * time.Second,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.redisClient.Ping(ctx).Err(); err != nil {
		return err
	}

	logger.Info("Redis connected")
	return nil
}

func (s *GatewayServer) initTCPServer() {
	s.tcpServer = access.NewTCPServer(s.config.Server.TCPAddr, s.config.Server.MaxConnections)
	s.tcpServer.SetHandler(s.handleTCPData)
}

func (s *GatewayServer) initHTTPServer() {
	s.httpServer = access.NewHTTPServer(s.config.Server.HTTPAddr, s.authService)
	s.httpServer.SetDataHandler(s.handleMessage)
}

func (s *GatewayServer) handleTCPData(conn *access.Connection, data []byte) {
	if !s.flowController.Allow(conn.DeviceID, conn.RemoteIP) {
		logger.Debug("Rate limited", zap.String("device_id", conn.DeviceID))
		return
	}

	jtMsg, err := s.codecService.DecodeJT808(data)
	if err != nil {
		logger.Debug("Decode JT808 failed", zap.Error(err))
		return
	}

	if conn.DeviceID == "" {
		device, err := s.authService.ValidateDevice(jtMsg.TerminalID)
		if err != nil {
			logger.Warn("Validate device failed", zap.Error(err))
			return
		}

		conn.SetDevice(device.DeviceID, device.ProtocolType)
		s.tcpServer.GetConnectionManager().BindDevice(device.DeviceID, conn)

		if err := s.authService.SetDeviceOnline(device.DeviceID, s.config.Server.NodeID); err != nil {
			logger.Warn("Set device online failed", zap.Error(err))
		}
	}

	device, err := s.authService.ValidateDevice(conn.DeviceID)
	if err != nil {
		logger.Warn("Validate device failed", zap.Error(err))
		return
	}

	msg, err := s.codecService.ConvertToUnified(jtMsg, device)
	if err != nil {
		logger.Warn("Convert to unified message failed", zap.Error(err))
		return
	}

	if err := s.handleMessage(msg); err != nil {
		logger.Error("Handle message failed", zap.Error(err))
		s.flowController.RecordFailure()
	} else {
		s.flowController.RecordSuccess()
	}
}

func (s *GatewayServer) handleMessage(msg *models.UnifiedMessage) error {
	logger.Debug("Received message",
		zap.String("device_id", msg.Header.DeviceID),
		zap.String("msg_type", msg.Header.MsgType))

	if s.clusterManager != nil && s.config.Cluster.Enabled {
		multiRouter := s.clusterManager.GetMultiLevelRouter()
		if multiRouter != nil {
			targetNode, routeLevel, err := multiRouter.Route(msg, s.config.Server.NodeID)
			if err != nil {
				logger.Warn("Multi-level route message failed", zap.Error(err))
			} else if targetNode != nil {
				if targetNode.ID == s.config.Server.NodeID {
					logger.Debug("Process message locally",
						zap.String("device_id", msg.Header.DeviceID),
						zap.String("route_level", string(routeLevel)))
				} else {
					logger.Debug("Forward message to",
						zap.String("node_id", targetNode.ID),
						zap.String("address", targetNode.Address),
						zap.String("route_level", string(routeLevel)))
					return nil
				}
			}
		} else {
			targetNode, err := s.clusterManager.GetMessageRouter().Route(msg)
			if err != nil {
				logger.Warn("Route message failed", zap.Error(err))
			} else if targetNode != nil && targetNode.ID != s.config.Server.NodeID {
				logger.Debug("Forward message to",
					zap.String("node_id", targetNode.ID),
					zap.String("address", targetNode.Address))
				return nil
			}
		}
	}

	vehicleData, err := s.codecService.ConvertToVehicleData(msg)
	if err != nil {
		return err
	}

	s.storage.AsyncSave(vehicleData)

	if msg.Header.MsgType == models.MsgTypeLocation {
		if parsed, ok := msg.Body.(*codec.ParsedLocation); ok && parsed.Location != nil {
			s.deviceCache.SetLastLocation(msg.Header.DeviceID, parsed.Location)
		}
	}

	return nil
}

func (s *GatewayServer) Start() error {
	if err := s.clusterManager.Start(); err != nil {
		logger.Error("Start cluster manager failed", zap.Error(err))
		return err
	}

	s.storage.StartBatchWriter()

	s.offlineCache.StartRetryWorker(s.handleOfflineData)
	s.offlineCache.StartCleanupWorker()

	if err := s.tcpServer.Start(); err != nil {
		logger.Error("Start TCP server failed", zap.Error(err))
		return err
	}

	if err := s.httpServer.Start(); err != nil {
		logger.Error("Start HTTP server failed", zap.Error(err))
		return err
	}

	logger.Info("Gateway server started",
		zap.String("node_id", s.config.Server.NodeID),
		zap.String("http_addr", s.config.Server.HTTPAddr),
		zap.String("tcp_addr", s.config.Server.TCPAddr))

	return nil
}

func (s *GatewayServer) handleOfflineData(data *cache.OfflineData) error {
	var msg models.UnifiedMessage
	if err := json.Unmarshal(data.Data, &msg); err != nil {
		return err
	}

	return s.handleMessage(&msg)
}

func (s *GatewayServer) Stop() {
	logger.Info("Stopping gateway server...")

	s.tcpServer.Stop()
	s.httpServer.Stop()

	s.clusterManager.Stop()

	s.offlineCache.Stop()

	s.storage.Stop()

	if s.redisClient != nil {
		s.redisClient.Close()
	}

	logger.Sync()

	logger.Info("Gateway server stopped")
}

func main() {
	flag.Parse()

	var config models.Config
	if err := configor.Load(&config, *configFile); err != nil {
		panic(err)
	}

	server := NewGatewayServer(&config)
	if err := server.Init(); err != nil {
		panic(err)
	}

	if err := server.Start(); err != nil {
		panic(err)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	server.Stop()
}
