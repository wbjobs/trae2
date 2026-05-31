package api

import (
	"bytes"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"binary-parser-cluster/pkg/database"
	"binary-parser-cluster/pkg/loadbalancer"
	"binary-parser-cluster/pkg/logger"
	"binary-parser-cluster/pkg/protocol"
	"binary-parser-cluster/pkg/validator"
)

type APIServer struct {
	config            *APIConfig
	db                *database.Database
	batchWriter       *database.BatchWriter
	logger            *logger.PacketLogger
	loadBalancer      loadbalancer.LoadBalancer
	privateParser     *protocol.PrivateProtocolParser
	dynamicParser     *protocol.DynamicProtocolParser
	tcpValidator      *validator.TCPProtocolValidator
	privateValidator  *validator.PrivateProtocolValidator
	requestCount      int64
	nodeID            string
}

type APIConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	Mode         string `mapstructure:"mode"`
	NodeID       string `mapstructure:"node_id"`
	EnableCluster bool  `mapstructure:"enable_cluster"`
}

type ParseRequest struct {
	ProtocolType string `json:"protocol_type" binding:"required,oneof=serial tcp private"`
	Data         string `json:"data" binding:"required"`
	Source       string `json:"source"`
}

type ParseResponse struct {
	Success   bool                   `json:"success"`
	Message   string                 `json:"message,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	PacketID  int64                  `json:"packet_id,omitempty"`
	ProcessedBy string               `json:"processed_by"`
}

type ClusterForwardRequest struct {
	NodeID       string `json:"node_id"`
	ProtocolType string `json:"protocol_type"`
	Data         string `json:"data"`
	Source       string `json:"source"`
}

func NewAPIServer(config *APIConfig, db *database.Database, log *logger.PacketLogger, lb loadbalancer.LoadBalancer) *APIServer {
	s := &APIServer{
		config:           config,
		db:               db,
		logger:           log,
		loadBalancer:     lb,
		nodeID:           config.NodeID,
		privateParser:    protocol.NewPrivateProtocolParser(&protocol.PrivateConfig{HeaderLen: 13, MaxPacketLen: 4096}),
		tcpValidator:     validator.NewTCPProtocolValidator(17, 65535),
		privateValidator: validator.NewPrivateProtocolValidator(15, 4096),
	}

	if db != nil {
		s.batchWriter = database.NewBatchWriter(db, 1000, 5*time.Second)
	}

	return s
}

func (s *APIServer) SetDynamicParser(parser *protocol.DynamicProtocolParser) {
	s.dynamicParser = parser
}

func (s *APIServer) Stop() {
	if s.batchWriter != nil {
		s.batchWriter.Stop()
	}
}

type ProtocolConfigRequest struct {
	Name     string `json:"name" binding:"required"`
	Version  string `json:"version"`
	Header   string `json:"header"`
	MinLen   int    `json:"min_length"`
	MaxLen   int    `json:"max_length"`
	Endian   string `json:"endian" binding:"oneof=big little"`
	Fields   []struct {
		Name     string `json:"name" binding:"required"`
		Type     string `json:"type" binding:"required"`
		Offset   int    `json:"offset" binding:"required"`
		Length   int    `json:"length"`
		Endian   string `json:"endian"`
		Optional bool   `json:"optional"`
	} `json:"fields" binding:"required"`
}

type ExportRequest struct {
	DeviceID   *uint32 `json:"device_id"`
	PacketType string  `json:"packet_type"`
	StartTime  string  `json:"start_time" binding:"required"`
	EndTime    string  `json:"end_time" binding:"required"`
	Format     string  `json:"format" binding:"required,oneof=json csv"`
}

func (s *APIServer) SetupRoutes() *gin.Engine {
	if s.config.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.Use(s.corsMiddleware())
	r.Use(s.loggingMiddleware())

	api := r.Group("/api/v1")
	{
		api.POST("/parse", s.handleParse)
		api.POST("/parse/forward", s.handleForwardParse)
		api.POST("/parse/dynamic/:config", s.handleDynamicParse)
		api.POST("/parse/autodetect", s.handleAutoDetect)

		api.GET("/packets/:id", s.getPacket)
		api.GET("/packets/device/:device_id", s.queryPacketsByDevice)
		api.GET("/packets", s.queryPacketsPaged)
		api.POST("/packets/export", s.handleExport)

		api.GET("/cluster/nodes", s.getClusterNodes)
		api.GET("/cluster/health", s.healthCheck)

		api.GET("/protocols", s.listProtocolConfigs)
		api.GET("/protocols/:name", s.getProtocolConfig)
		api.POST("/protocols", s.createProtocolConfig)
		api.PUT("/protocols/:name", s.updateProtocolConfig)
		api.DELETE("/protocols/:name", s.deleteProtocolConfig)
		api.POST("/protocols/reload", s.reloadProtocolConfigs)

		api.GET("/stats", s.getStats)
	}

	return r
}

func (s *APIServer) Start() error {
	r := s.SetupRoutes()
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	
	go s.startHeartbeat()

	s.logger.Info("api_server", nil, map[string]interface{}{
		"node_id": s.nodeID,
		"address": addr,
	})

	return r.Run(addr)
}

func (s *APIServer) startHeartbeat() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	node := &database.ClusterNode{
		ID:            s.nodeID,
		Address:       fmt.Sprintf("http://%s:%d", s.config.Host, s.config.Port),
		Status:        "active",
		Load:          0,
		LastHeartbeat: time.Now(),
	}

	if s.db != nil {
		s.db.RegisterClusterNode(node)
	}

	for range ticker.C {
		load := int(atomic.LoadInt64(&s.requestCount))
		if s.db != nil {
			s.db.UpdateNodeHeartbeat(s.nodeID, load)
		}
		atomic.StoreInt64(&s.requestCount, 0)
	}
}

func (s *APIServer) handleParse(c *gin.Context) {
	var req ParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ParseResponse{
			Success: false,
			Message: "invalid request: " + err.Error(),
		})
		return
	}

	atomic.AddInt64(&s.requestCount, 1)

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		s.logErrorPacket(req.ProtocolType, data, "decode_error", err.Error(), time.Now())
		c.JSON(http.StatusBadRequest, ParseResponse{
			Success: false,
			Message: "invalid hex data: " + err.Error(),
		})
		return
	}

	if s.config.EnableCluster {
		backend, err := s.loadBalancer.Select()
		if err == nil && backend.ID != s.nodeID {
			if result, err := s.forwardToNode(backend.Address, &req); err == nil {
				s.loadBalancer.Release(backend)
				c.JSON(http.StatusOK, result)
				return
			} else {
				atomic.AddInt32(&backend.ErrorCount, 1)
				s.loadBalancer.Release(backend)
			}
		}
	}

	result, err := s.parsePacket(req.ProtocolType, data, req.Source)
	if err != nil {
		c.JSON(http.StatusOK, result)
		return
	}

	result.ProcessedBy = s.nodeID
	c.JSON(http.StatusOK, result)
}

func (s *APIServer) handleForwardParse(c *gin.Context) {
	var req ClusterForwardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ParseResponse{
			Success: false,
			Message: "invalid request",
		})
		return
	}

	atomic.AddInt64(&s.requestCount, 1)

	data, _ := hex.DecodeString(req.Data)
	result, _ := s.parsePacket(req.ProtocolType, data, req.Source)
	result.ProcessedBy = s.nodeID

	c.JSON(http.StatusOK, result)
}

func (s *APIServer) parsePacket(protocolType string, data []byte, source string) (*ParseResponse, error) {
	receivedAt := time.Now()

	switch protocolType {
	case "private":
		return s.parsePrivateProtocol(data, source, receivedAt)
	case "tcp":
		return s.parseTCPProtocol(data, source, receivedAt)
	case "serial":
		return s.parseSerialProtocol(data, source, receivedAt)
	default:
		return &ParseResponse{
			Success: false,
			Message: "unsupported protocol type",
		}, errors.New("unsupported protocol")
	}
}

func (s *APIServer) parsePrivateProtocol(data []byte, source string, receivedAt time.Time) (*ParseResponse, error) {
	validation := s.privateValidator.ValidateAll(data)

	msg, err := s.privateParser.Parse(data)
	if err != nil || !validation.IsValid {
		errorMsg := "unknown error"
		if err != nil {
			errorMsg = err.Error()
		}
		if len(validation.Errors) > 0 {
			errorMsg = validation.Errors[0].Error()
		}

		s.logger.Error("private", data, err, map[string]interface{}{
			"source": source,
			"validation_errors": validation.Errors,
		})
		s.logErrorPacket("private", data, "parse_error", errorMsg, receivedAt)

		return &ParseResponse{
			Success: false,
			Message: errorMsg,
		}, err
	}

	metadata := s.privateParser.GetMetadata(msg)

	var packetID int64
	if s.db != nil {
		record := &database.PacketRecord{
			PacketType:  "private",
			ProtocolVer: int(msg.ProtocolVer),
			DeviceType:  int(msg.DeviceType),
			DeviceID:    msg.DeviceID,
			CmdID:       msg.CmdID,
			DataLen:     int(msg.DataLen),
			RawData:     data,
			Metadata:    metadata,
			IsValid:     true,
			ReceivedAt:  receivedAt,
		}

		if s.batchWriter != nil {
			s.batchWriter.Write(record)
		} else {
			pid, dbErr := s.db.InsertPacket(record)
			if dbErr != nil {
				s.logger.Error("private", data, dbErr, map[string]interface{}{
					"source": source,
				})
			} else {
				packetID = pid
			}
		}
	}

	s.logger.Info("private", data, metadata)

	return &ParseResponse{
		Success:  true,
		Data:     metadata,
		PacketID: packetID,
	}, nil
}

func (s *APIServer) parseTCPProtocol(data []byte, source string, receivedAt time.Time) (*ParseResponse, error) {
	validation := s.tcpValidator.ValidateAll(data)

	tcpParser := protocol.NewTCPParser(&protocol.TCPConfig{BufferSize: 4096})
	msg, err := tcpParser.Parse(data)
	if err != nil || !validation.IsValid {
		errorMsg := "unknown error"
		if err != nil {
			errorMsg = err.Error()
		}
		if len(validation.Errors) > 0 {
			errorMsg = validation.Errors[0].Error()
		}

		s.logger.Error("tcp", data, err, map[string]interface{}{
			"source": source,
			"validation_errors": validation.Errors,
		})
		s.logErrorPacket("tcp", data, "parse_error", errorMsg, receivedAt)

		return &ParseResponse{
			Success: false,
			Message: errorMsg,
		}, err
	}

	metadata := map[string]interface{}{
		"magic":     msg.Magic,
		"version":   msg.Version,
		"msg_type":  msg.MsgType,
		"seq_num":   msg.SeqNum,
		"length":    msg.Length,
		"crc32":     msg.CRC32,
		"source":    source,
	}

	var packetID int64
	if s.db != nil {
		record := &database.PacketRecord{
			PacketType:  "tcp",
			ProtocolVer: int(msg.Version),
			DeviceID:    uint32(msg.SeqNum),
			CmdID:       msg.MsgType,
			DataLen:     int(msg.Length),
			RawData:     data,
			Metadata:    metadata,
			IsValid:     true,
			ReceivedAt:  receivedAt,
		}

		if s.batchWriter != nil {
			s.batchWriter.Write(record)
		} else {
			pid, dbErr := s.db.InsertPacket(record)
			if dbErr != nil {
				s.logger.Error("tcp", data, dbErr, map[string]interface{}{
					"source": source,
				})
			} else {
				packetID = pid
			}
		}
	}

	s.logger.Info("tcp", data, metadata)

	return &ParseResponse{
		Success:  true,
		Data:     metadata,
		PacketID: packetID,
	}, nil
}

func (s *APIServer) parseSerialProtocol(data []byte, source string, receivedAt time.Time) (*ParseResponse, error) {
	serialParser := protocol.NewSerialParser(&protocol.SerialConfig{})
	msg, err := serialParser.Parse(data)
	if err != nil {
		s.logger.Error("serial", data, err, map[string]interface{}{"source": source})
		s.logErrorPacket("serial", data, "parse_error", err.Error(), receivedAt)

		return &ParseResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	metadata := map[string]interface{}{
		"header":   msg.Header,
		"length":   msg.Length,
		"command":  msg.Command,
		"checksum": msg.Checksum,
		"source":   source,
	}

	var packetID int64
	if s.db != nil {
		record := &database.PacketRecord{
			PacketType:  "serial",
			DeviceType:  int(msg.Command),
			DataLen:     int(msg.Length),
			RawData:     data,
			Metadata:    metadata,
			IsValid:     true,
			ReceivedAt:  receivedAt,
		}

		if s.batchWriter != nil {
			s.batchWriter.Write(record)
		} else {
			pid, dbErr := s.db.InsertPacket(record)
			if dbErr != nil {
				s.logger.Error("serial", data, dbErr, map[string]interface{}{"source": source})
			} else {
				packetID = pid
			}
		}
	}

	s.logger.Info("serial", data, metadata)

	return &ParseResponse{
		Success:  true,
		Data:     metadata,
		PacketID: packetID,
	}, nil
}

func (s *APIServer) forwardToNode(address string, req *ParseRequest) (*ParseResponse, error) {
	forwardReq := ClusterForwardRequest{
		NodeID:       s.nodeID,
		ProtocolType: req.ProtocolType,
		Data:         req.Data,
		Source:       req.Source,
	}

	body, _ := json.Marshal(forwardReq)
	url := fmt.Sprintf("%s/api/v1/parse/forward", address)

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result ParseResponse
	json.Unmarshal(respBody, &result)

	return &result, nil
}

func (s *APIServer) getPacket(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid packet id"})
		return
	}

	record, err := s.db.GetPacketByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "packet not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":          record.ID,
			"packet_type": record.PacketType,
			"device_id":   record.DeviceID,
			"cmd_id":      record.CmdID,
			"data_len":    record.DataLen,
			"raw_data":    hex.EncodeToString(record.RawData),
			"metadata":    record.Metadata,
			"is_valid":    record.IsValid,
			"received_at": record.ReceivedAt,
		},
	})
}

func (s *APIServer) queryPacketsByDevice(c *gin.Context) {
	deviceIDStr := c.Param("device_id")
	deviceID, err := strconv.ParseUint(deviceIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}

	startTime := time.Now().Add(-24 * time.Hour)
	endTime := time.Now()
	limit := 100

	if s := c.Query("start_time"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			startTime = t
		}
	}
	if e := c.Query("end_time"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			endTime = t
		}
	}
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}

	records, err := s.db.QueryPackets(uint32(deviceID), startTime, endTime, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]map[string]interface{}, len(records))
	for i, r := range records {
		result[i] = map[string]interface{}{
			"id":          r.ID,
			"packet_type": r.PacketType,
			"cmd_id":      r.CmdID,
			"data_len":    r.DataLen,
			"received_at": r.ReceivedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"count":   len(result),
		"data":    result,
	})
}

func (s *APIServer) getClusterNodes(c *gin.Context) {
	nodes, err := s.db.GetActiveNodes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]map[string]interface{}, len(nodes))
	for i, n := range nodes {
		result[i] = map[string]interface{}{
			"id":             n.ID,
			"address":        n.Address,
			"status":         n.Status,
			"load":           n.Load,
			"last_heartbeat": n.LastHeartbeat,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"count":   len(result),
		"data":    result,
	})
}

func (s *APIServer) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"node_id": s.nodeID,
		"status":  "healthy",
		"time":    time.Now(),
	})
}

func (s *APIServer) getStats(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"node_id":       s.nodeID,
			"request_count": atomic.LoadInt64(&s.requestCount),
			"timestamp":     time.Now(),
		},
	})
}

func (s *APIServer) logErrorPacket(packetType string, data []byte, errorType, errorMsg string, receivedAt time.Time) {
	if s.db != nil {
		s.db.InsertErrorPacket(packetType, data, errorType, errorMsg, receivedAt)
	}
}

func (s *APIServer) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func (s *APIServer) loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		s.logger.Debug("api_request", map[string]interface{}{
			"path":     path,
			"method":   c.Request.Method,
			"status":   c.Writer.Status(),
			"latency":  latency.Milliseconds(),
			"client_ip": c.ClientIP(),
		})
	}
}

func (s *APIServer) handleDynamicParse(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	configName := c.Param("config")

	var req struct {
		Data   string `json:"data" binding:"required"`
		Source string `json:"source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hex data: " + err.Error()})
		return
	}

	result, err := s.dynamicParser.Parse(configName, data)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"config":       configName,
		"data":         result,
		"processed_by": s.nodeID,
	})
}

func (s *APIServer) handleAutoDetect(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	var req struct {
		Data   string `json:"data" binding:"required"`
		Source string `json:"source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hex data: " + err.Error()})
		return
	}

	configName, result, err := s.dynamicParser.AutoDetect(data)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"config":       configName,
		"data":         result,
		"processed_by": s.nodeID,
	})
}

func (s *APIServer) queryPacketsPaged(c *gin.Context) {
	if s.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not connected"})
		return
	}

	offset := 0
	limit := 20
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	if o := c.Query("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil {
			offset = n
		}
	}

	startTime := time.Now().Add(-24 * time.Hour)
	endTime := time.Now()
	if s := c.Query("start_time"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			startTime = t
		}
	}
	if e := c.Query("end_time"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			endTime = t
		}
	}

	var deviceID *uint32
	if d := c.Query("device_id"); d != "" {
		if n, err := strconv.ParseUint(d, 10, 32); err == nil {
			u := uint32(n)
			deviceID = &u
		}
	}

	packetType := c.Query("packet_type")

	records, total, err := s.db.QueryPacketsPaged(deviceID, packetType, startTime, endTime, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]map[string]interface{}, len(records))
	for i, r := range records {
		result[i] = map[string]interface{}{
			"id":           r.ID,
			"packet_type":  r.PacketType,
			"device_id":    r.DeviceID,
			"cmd_id":       r.CmdID,
			"data_len":     r.DataLen,
			"is_valid":     r.IsValid,
			"received_at":  r.ReceivedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"total":   total,
		"offset":  offset,
		"limit":   limit,
		"data":    result,
	})
}

func (s *APIServer) handleExport(c *gin.Context) {
	if s.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not connected"})
		return
	}

	var req ExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	startTime, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
		return
	}
	endTime, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
		return
	}

	records, _, err := s.db.QueryPacketsPaged(req.DeviceID, req.PacketType, startTime, endTime, 0, 100000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("packets_export_%s.%s", time.Now().Format("20060102-150405"), req.Format)

	if req.Format == "csv" {
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", "attachment; filename="+filename)

		writer := csv.NewWriter(c.Writer)
		defer writer.Flush()

		writer.Write([]string{"ID", "PacketType", "DeviceID", "CmdID", "DataLen", "IsValid", "ReceivedAt"})
		for _, r := range records {
			writer.Write([]string{
				strconv.FormatInt(r.ID, 10),
				r.PacketType,
				strconv.FormatUint(uint64(r.DeviceID), 10),
				strconv.FormatUint(uint64(r.CmdID), 10),
				strconv.Itoa(r.DataLen),
				strconv.FormatBool(r.IsValid),
				r.ReceivedAt.Format(time.RFC3339),
			})
		}
	} else {
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", "attachment; filename="+filename)

		result := make([]map[string]interface{}, len(records))
		for i, r := range records {
			result[i] = map[string]interface{}{
				"id":          r.ID,
				"packet_type": r.PacketType,
				"device_id":   r.DeviceID,
				"cmd_id":      r.CmdID,
				"data_len":    r.DataLen,
				"raw_data":    hex.EncodeToString(r.RawData),
				"metadata":    r.Metadata,
				"is_valid":    r.IsValid,
				"received_at": r.ReceivedAt.Format(time.RFC3339),
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "count": len(result), "data": result})
	}
}

func (s *APIServer) listProtocolConfigs(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	configs := s.dynamicParser.ListConfigs()
	c.JSON(http.StatusOK, gin.H{"success": true, "count": len(configs), "data": configs})
}

func (s *APIServer) getProtocolConfig(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	name := c.Param("name")
	cfg, ok := s.dynamicParser.GetConfig(name)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "config not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": cfg})
}

func (s *APIServer) createProtocolConfig(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	var req ProtocolConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	cfg := &protocol.ProtocolConfig{
		Name:      req.Name,
		Version:   req.Version,
		MinLength: req.MinLen,
		MaxLength: req.MaxLen,
		Endian:    protocol.EndianType(req.Endian),
	}

	if req.Header != "" {
		cfg.HeaderPattern, _ = hex.DecodeString(req.Header)
	}

	cfg.Fields = make([]protocol.ProtocolField, len(req.Fields))
	for i, f := range req.Fields {
		cfg.Fields[i] = protocol.ProtocolField{
			Name:     f.Name,
			Type:     protocol.FieldType(f.Type),
			Offset:   f.Offset,
			Length:   f.Length,
			Endian:   protocol.EndianType(f.Endian),
			Optional: f.Optional,
		}
	}

	if err := s.dynamicParser.AddConfig(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": cfg})
}

func (s *APIServer) updateProtocolConfig(c *gin.Context) {
	s.createProtocolConfig(c)
}

func (s *APIServer) deleteProtocolConfig(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	name := c.Param("name")
	if ok := s.dynamicParser.RemoveConfig(name); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "config not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (s *APIServer) reloadProtocolConfigs(c *gin.Context) {
	if s.dynamicParser == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dynamic parser not configured"})
		return
	}

	reloaded, err := s.dynamicParser.ReloadIfModified()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "reloaded": reloaded})
}
