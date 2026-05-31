package access

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type HTTPServer struct {
	addr        string
	engine      *gin.Engine
	server      *http.Server
	authService *AuthService
	dataHandler func(*models.UnifiedMessage) error
}

func NewHTTPServer(addr string, authService *AuthService) *HTTPServer {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(gin.Logger())

	return &HTTPServer{
		addr:        addr,
		engine:      engine,
		authService: authService,
	}
}

func (s *HTTPServer) SetDataHandler(handler func(*models.UnifiedMessage) error) {
	s.dataHandler = handler
}

func (s *HTTPServer) SetupRoutes() {
	api := s.engine.Group("/api/v1")
	{
		api.POST("/auth/login", s.handleLogin)
		api.POST("/data/upload", s.authMiddleware(), s.handleDataUpload)
		api.POST("/heartbeat", s.authMiddleware(), s.handleHeartbeat)
		api.GET("/health", s.handleHealth)
	}
}

func (s *HTTPServer) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			c.Abort()
			return
		}

		token := parts[1]
		deviceID := c.GetHeader("X-Device-ID")
		if deviceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "device id required"})
			c.Abort()
			return
		}

		device, err := s.authService.Authenticate(deviceID, token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		c.Set("device", device)
		c.Next()
	}
}

func (s *HTTPServer) handleLogin(c *gin.Context) {
	var req struct {
		DeviceID string `json:"device_id" binding:"required"`
		Token    string `json:"token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device, err := s.authService.Authenticate(req.DeviceID, req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	if err := s.authService.SetDeviceOnline(req.DeviceID, "http"); err != nil {
		logger.Warn("Set device online failed", zap.Error(err))
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": gin.H{
			"device_id":     device.DeviceID,
			"plate_number":  device.PlateNumber,
			"region":        device.Region,
			"protocol_type": device.ProtocolType,
		},
	})
}

func (s *HTTPServer) handleDataUpload(c *gin.Context) {
	device := c.MustGet("device").(*models.TerminalDevice)

	var req struct {
		MsgType string          `json:"msg_type" binding:"required"`
		Data    json.RawMessage `json:"data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg := &models.UnifiedMessage{
		Header: models.MessageHeader{
			MessageID:    generateMessageID(),
			DeviceID:     device.DeviceID,
			PlateNumber:  device.PlateNumber,
			Region:       device.Region,
			ProtocolType: models.ProtocolHTTP,
			MsgType:      req.MsgType,
			Timestamp:    time.Now(),
			Version:      models.CurrentVersion,
		},
		Body: req.Data,
	}

	if s.dataHandler != nil {
		if err := s.dataHandler(msg); err != nil {
			logger.Error("Handle data failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": gin.H{
			"message_id": msg.Header.MessageID,
		},
	})
}

func (s *HTTPServer) handleHeartbeat(c *gin.Context) {
	device := c.MustGet("device").(*models.TerminalDevice)

	if err := s.authService.Heartbeat(device.DeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "heartbeat failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
	})
}

func (s *HTTPServer) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"timestamp": time.Now().Unix(),
	})
}

func (s *HTTPServer) Start() error {
	s.SetupRoutes()

	s.server = &http.Server{
		Addr:         s.addr,
		Handler:      s.engine,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	logger.Info("HTTP server started", zap.String("addr", s.addr))

	go func() {
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	return nil
}

func (s *HTTPServer) Stop() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.server.Shutdown(ctx)
}

func (s *HTTPServer) GetEngine() *gin.Engine {
	return s.engine
}

func generateMessageID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}
