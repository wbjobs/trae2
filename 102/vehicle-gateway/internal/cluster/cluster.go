package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/internal/router"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type ServiceRegistry interface {
	Register(node *ServiceNode) error
	Deregister(nodeID string) error
	Discover(serviceName string) ([]*ServiceNode, error)
	Watch(serviceName string, onChange func([]*ServiceNode)) error
}

type ServiceNode struct {
	ID          string    `json:"id"`
	ServiceName string    `json:"service_name"`
	Address     string    `json:"address"`
	Port        int       `json:"port"`
	GRPCPort    int       `json:"grpc_port"`
	Region      string    `json:"region"`
	Weight      int       `json:"weight"`
	Status      int32     `json:"status"`
	Load        int64     `json:"load"`
	Connections int64     `json:"connections"`
	RegisterTime time.Time `json:"register_time"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

type RedisServiceRegistry struct {
	redisClient *redis.Client
	leaseTTL    time.Duration
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

func NewRedisServiceRegistry(redisClient *redis.Client, leaseTTL int) *RedisServiceRegistry {
	ctx, cancel := context.WithCancel(context.Background())

	return &RedisServiceRegistry{
		redisClient: redisClient,
		leaseTTL:    time.Duration(leaseTTL) * time.Second,
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (r *RedisServiceRegistry) Register(node *ServiceNode) error {
	node.RegisterTime = time.Now()
	node.LastHeartbeat = time.Now()

	key := r.getNodeKey(node.ID)
	data, err := json.Marshal(node)
	if err != nil {
		return err
	}

	err = r.redisClient.Set(r.ctx, key, data, r.leaseTTL*2).Err()
	if err != nil {
		return err
	}

	serviceKey := r.getServiceKey(node.ServiceName)
	err = r.redisClient.SAdd(r.ctx, serviceKey, node.ID).Err()
	if err != nil {
		return err
	}

	logger.Info("Service registered",
		zap.String("node_id", node.ID),
		zap.String("service", node.ServiceName),
		zap.String("address", node.Address))

	return nil
}

func (r *RedisServiceRegistry) Deregister(nodeID string) error {
	nodeData, err := r.redisClient.Get(r.ctx, r.getNodeKey(nodeID)).Result()
	if err != nil && err != redis.Nil {
		return err
	}

	if nodeData != "" {
		var node ServiceNode
		if err := json.Unmarshal([]byte(nodeData), &node); err == nil {
			r.redisClient.SRem(r.ctx, r.getServiceKey(node.ServiceName), nodeID)
		}
	}

	r.redisClient.Del(r.ctx, r.getNodeKey(nodeID))

	logger.Info("Service deregistered", zap.String("node_id", nodeID))

	return nil
}

func (r *RedisServiceRegistry) Discover(serviceName string) ([]*ServiceNode, error) {
	serviceKey := r.getServiceKey(serviceName)
	nodeIDs, err := r.redisClient.SMembers(r.ctx, serviceKey).Result()
	if err != nil {
		return nil, err
	}

	nodes := make([]*ServiceNode, 0, len(nodeIDs))
	for _, nodeID := range nodeIDs {
		nodeData, err := r.redisClient.Get(r.ctx, r.getNodeKey(nodeID)).Result()
		if err != nil {
			if err == redis.Nil {
				r.redisClient.SRem(r.ctx, serviceKey, nodeID)
				continue
			}
			return nil, err
		}

		var node ServiceNode
		if err := json.Unmarshal([]byte(nodeData), &node); err != nil {
			continue
		}

		if time.Since(node.LastHeartbeat) > r.leaseTTL*2 {
			r.redisClient.SRem(r.ctx, serviceKey, nodeID)
			r.redisClient.Del(r.ctx, r.getNodeKey(nodeID))
			continue
		}

		nodes = append(nodes, &node)
	}

	return nodes, nil
}

func (r *RedisServiceRegistry) Watch(serviceName string, onChange func([]*ServiceNode)) error {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		var lastNodes []*ServiceNode

		for {
			select {
			case <-r.ctx.Done():
				return
			case <-ticker.C:
				nodes, err := r.Discover(serviceName)
				if err != nil {
					logger.Error("Discover service failed", zap.Error(err))
					continue
				}

				if !nodesEqual(lastNodes, nodes) {
					onChange(nodes)
					lastNodes = nodes
				}
			}
		}
	}()

	return nil
}

func (r *RedisServiceRegistry) Heartbeat(node *ServiceNode) error {
	node.LastHeartbeat = time.Now()

	key := r.getNodeKey(node.ID)
	data, err := json.Marshal(node)
	if err != nil {
		return err
	}

	return r.redisClient.Set(r.ctx, key, data, r.leaseTTL*2).Err()
}

func (r *RedisServiceRegistry) getNodeKey(nodeID string) string {
	return fmt.Sprintf("service:node:%s", nodeID)
}

func (r *RedisServiceRegistry) getServiceKey(serviceName string) string {
	return fmt.Sprintf("service:%s:nodes", serviceName)
}

func (r *RedisServiceRegistry) Stop() {
	r.cancel()
	r.wg.Wait()
}

func nodesEqual(a, b []*ServiceNode) bool {
	if len(a) != len(b) {
		return false
	}

	aMap := make(map[string]*ServiceNode)
	for _, node := range a {
		aMap[node.ID] = node
	}

	for _, node := range b {
		if aNode, ok := aMap[node.ID]; !ok || aNode.Status != node.Status {
			return false
		}
	}

	return true
}

type ClusterManager struct {
	registry          *RedisServiceRegistry
	localNode         *ServiceNode
	msgRouter         *router.MessageRouter
	multiLevelRouter  *router.MultiLevelRouter
	healthCheck       *HealthChecker
	autoScaler        *AutoScaler
	config            models.ClusterConfig
	ctx               context.Context
	cancel            context.CancelFunc
	wg                sync.WaitGroup
}

func NewClusterManager(redisClient *redis.Client, config models.ClusterConfig, serverConfig models.ServerConfig) *ClusterManager {
	ctx, cancel := context.WithCancel(context.Background())

	registry := NewRedisServiceRegistry(redisClient, config.HealthCheck.Interval)

	localNode := &ServiceNode{
		ID:          serverConfig.NodeID,
		ServiceName: config.ServiceName,
		Address:     getLocalAddress(),
		Port:        parsePort(serverConfig.HTTPAddr),
		GRPCPort:    parsePort(serverConfig.GRPCAddr),
		Region:      getLocalRegion(),
		Weight:      100,
		Status:      1,
	}

	multiLevelRouter := router.NewMultiLevelRouter(config.RegionRouter, true, config.LoadBalance, nil)

	var autoScaler *AutoScaler
	if config.AutoScaling.Enabled {
		autoScaler = NewAutoScaler(redisClient, config.AutoScaling, localNode)
	}

	return &ClusterManager{
		registry:         registry,
		localNode:        localNode,
		msgRouter:        router.NewMessageRouter(config.RegionRouter, config.LoadBalance),
		multiLevelRouter: multiLevelRouter,
		healthCheck:      NewHealthChecker(config.HealthCheck),
		autoScaler:       autoScaler,
		config:           config,
		ctx:              ctx,
		cancel:           cancel,
	}
}

func (cm *ClusterManager) startHeartbeat() {
	cm.wg.Add(1)
	go func() {
		defer cm.wg.Done()

		ticker := time.NewTicker(time.Duration(cm.config.HealthCheck.Interval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-cm.ctx.Done():
				return
			case <-ticker.C:
				if err := cm.registry.Heartbeat(cm.localNode); err != nil {
					logger.Error("Heartbeat failed", zap.Error(err))
				}
			}
		}
	}()
}

func (cm *ClusterManager) startServiceDiscovery() {
	cm.wg.Add(1)
	go func() {
		defer cm.wg.Done()

		err := cm.registry.Watch(cm.config.ServiceName, func(nodes []*ServiceNode) {
			cm.updateRouterNodes(nodes)
		})
		if err != nil {
			logger.Error("Watch service failed", zap.Error(err))
		}
	}()
}

func (cm *ClusterManager) updateRouterNodes(nodes []*ServiceNode) {
	for _, node := range nodes {
		routerNode := &router.ServiceNode{
			ID:      node.ID,
			Address: node.Address,
			Port:    node.Port,
			Region:  node.Region,
			Weight:  node.Weight,
			Status:  node.Status,
			Load:    node.Load,
		}
		cm.msgRouter.AddNode(routerNode)
		cm.multiLevelRouter.AddNode(routerNode)
	}

	logger.Info("Router nodes updated", zap.Int("count", len(nodes)))
}

func (cm *ClusterManager) GetMessageRouter() *router.MessageRouter {
	return cm.msgRouter
}

func (cm *ClusterManager) GetMultiLevelRouter() *router.MultiLevelRouter {
	return cm.multiLevelRouter
}

func (cm *ClusterManager) Start() error {
	if !cm.config.Enabled {
		logger.Info("Cluster mode disabled")
		return nil
	}

	if err := cm.registry.Register(cm.localNode); err != nil {
		return err
	}

	cm.startHeartbeat()

	cm.startServiceDiscovery()

	cm.healthCheck.Start()

	if cm.autoScaler != nil {
		cm.autoScaler.Start()
	}

	logger.Info("Cluster manager started",
		zap.String("node_id", cm.localNode.ID),
		zap.String("service", cm.localNode.ServiceName))

	return nil
}

func (cm *ClusterManager) UpdateLocalNodeLoad(load, connections int64) {
	cm.localNode.Load = load
	cm.localNode.Connections = connections
}

func (cm *ClusterManager) Stop() {
	cm.cancel()
	cm.wg.Wait()

	if cm.config.Enabled {
		cm.registry.Deregister(cm.localNode.ID)
	}

	if cm.autoScaler != nil {
		cm.autoScaler.Stop()
	}

	cm.healthCheck.Stop()
	cm.registry.Stop()

	logger.Info("Cluster manager stopped")
}

type HealthChecker struct {
	config   models.HealthCheckConfig
	servers  map[string]string
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

func NewHealthChecker(config models.HealthCheckConfig) *HealthChecker {
	ctx, cancel := context.WithCancel(context.Background())

	return &HealthChecker{
		config:  config,
		servers: make(map[string]string),
		ctx:     ctx,
		cancel:  cancel,
	}
}

func (hc *HealthChecker) AddServer(id, address string) {
	hc.servers[id] = address
}

func (hc *HealthChecker) Start() {
	hc.wg.Add(1)
	go hc.checkLoop()
}

func (hc *HealthChecker) checkLoop() {
	defer hc.wg.Done()

	ticker := time.NewTicker(time.Duration(hc.config.Interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-hc.ctx.Done():
			return
		case <-ticker.C:
			for id, addr := range hc.servers {
				go hc.checkServer(id, addr)
			}
		}
	}
}

func (hc *HealthChecker) checkServer(id, addr string) {
	timeout := time.Duration(hc.config.Timeout) * time.Second
	url := fmt.Sprintf("http://%s%s", addr, hc.config.Path)

	ctx, cancel := context.WithTimeout(hc.ctx, timeout)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logger.Warn("Health check failed",
			zap.String("server_id", id),
			zap.Error(err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logger.Warn("Health check returned non-200",
			zap.String("server_id", id),
			zap.Int("status", resp.StatusCode))
	}
}

func (hc *HealthChecker) Stop() {
	hc.cancel()
	hc.wg.Wait()
}

func getLocalAddress() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}

	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				return ipNet.IP.String()
			}
		}
	}

	return "127.0.0.1"
}

func parsePort(addr string) int {
	parts := strings.Split(addr, ":")
	if len(parts) < 2 {
		return 8080
	}

	port, err := strconv.Atoi(parts[len(parts)-1])
	if err != nil {
		return 8080
	}

	return port
}

func getLocalRegion() string {
	return models.RegionCentral
}
