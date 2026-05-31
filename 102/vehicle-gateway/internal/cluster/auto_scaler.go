package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
)

type NodeStatus int

const (
	NodeStatusOffline   NodeStatus = 0
	NodeStatusWarmingUp NodeStatus = 1
	NodeStatusActive    NodeStatus = 2
	NodeStatusDraining  NodeStatus = 3
	NodeStatusDeleting  NodeStatus = 4
)

type AutoScaler struct {
	redisClient        *redis.Client
	config             models.AutoScalingConfig
	localNode          *ServiceNode
	ctx                context.Context
	cancel             context.CancelFunc
	wg                 sync.WaitGroup
	lastScaleUpTime    time.Time
	lastScaleDownTime  time.Time
	mu                 sync.Mutex
	nodeStatusCache    map[string]*NodeStatusInfo
}

type NodeStatusInfo struct {
	NodeID        string
	Status        NodeStatus
	StatusChanged time.Time
	TrafficWeight float64
	WarmupStart   time.Time
}

type ScaleEvent struct {
	Type         string    `json:"type"`
	NodeID       string    `json:"node_id"`
	Timestamp    time.Time `json:"timestamp"`
	Reason       string    `json:"reason"`
	Load         float64   `json:"load"`
}

func NewAutoScaler(redisClient *redis.Client, config models.AutoScalingConfig, localNode *ServiceNode) *AutoScaler {
	ctx, cancel := context.WithCancel(context.Background())

	return &AutoScaler{
		redisClient:     redisClient,
		config:          config,
		localNode:       localNode,
		ctx:             ctx,
		cancel:          cancel,
		nodeStatusCache: make(map[string]*NodeStatusInfo),
	}
}

func (as *AutoScaler) Start() {
	as.wg.Add(3)
	go as.monitorLoop()
	go as.nodeStatusLoop()
	go as.scaleEventLoop()

	logger.Info("Auto scaler started",
		zap.Int("min_nodes", as.config.MinNodes),
		zap.Int("max_nodes", as.config.MaxNodes),
		zap.Float64("scale_up_threshold", as.config.ScaleUpThreshold),
		zap.Float64("scale_down_threshold", as.config.ScaleDownThreshold))
}

func (as *AutoScaler) Stop() {
	as.cancel()
	as.wg.Wait()
	logger.Info("Auto scaler stopped")
}

func (as *AutoScaler) monitorLoop() {
	defer as.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-as.ctx.Done():
			return
		case <-ticker.C:
			as.checkAndScale()
		}
	}
}

func (as *AutoScaler) checkAndScale() {
	as.mu.Lock()
	defer as.mu.Unlock()

	activeNodes, nodeLoads, err := as.getClusterLoad()
	if err != nil {
		logger.Error("Get cluster load failed", zap.Error(err))
		return
	}

	nodeCount := len(activeNodes)
	if nodeCount == 0 {
		return
	}

	totalLoad := float64(0)
	for _, load := range nodeLoads {
		totalLoad += load
	}
	avgLoad := totalLoad / float64(nodeCount) * 100

	logger.Debug("Cluster load check",
		zap.Int("active_nodes", nodeCount),
		zap.Float64("avg_load", avgLoad))

	now := time.Now()
	cooldownUp := time.Duration(as.config.ScaleUpCooldown) * time.Second
	cooldownDown := time.Duration(as.config.ScaleDownCooldown) * time.Second

	if avgLoad > as.config.ScaleUpThreshold && nodeCount < as.config.MaxNodes {
		if now.Sub(as.lastScaleUpTime) > cooldownUp {
			as.scaleUp(avgLoad)
			as.lastScaleUpTime = now
		}
	} else if avgLoad < as.config.ScaleDownThreshold && nodeCount > as.config.MinNodes {
		if now.Sub(as.lastScaleDownTime) > cooldownDown {
			as.scaleDown(avgLoad)
			as.lastScaleDownTime = now
		}
	}
}

func (as *AutoScaler) getClusterLoad() ([]string, map[string]float64, error) {
	ctx := context.Background()
	serviceKey := fmt.Sprintf("service:%s:nodes", as.localNode.ServiceName)

	nodeIDs, err := as.redisClient.SMembers(ctx, serviceKey).Result()
	if err != nil {
		return nil, nil, err
	}

	activeNodes := make([]string, 0)
	nodeLoads := make(map[string]float64)

	for _, nodeID := range nodeIDs {
		nodeKey := fmt.Sprintf("service:node:%s", nodeID)
		nodeData, err := as.redisClient.Get(ctx, nodeKey).Result()
		if err != nil {
			continue
		}

		var node ServiceNode
		if err := json.Unmarshal([]byte(nodeData), &node); err != nil {
			continue
		}

		status := as.getNodeStatus(nodeID)
		if status == NodeStatusActive || status == NodeStatusWarmingUp {
			activeNodes = append(activeNodes, nodeID)
			load := float64(node.Load) / 10000.0
			if load > 1.0 {
				load = 1.0
			}
			nodeLoads[nodeID] = load
		}
	}

	return activeNodes, nodeLoads, nil
}

func (as *AutoScaler) scaleUp(avgLoad float64) {
	newNodeID := as.generateNewNodeID()
	logger.Info("Scaling up cluster",
		zap.String("new_node_id", newNodeID),
		zap.Float64("avg_load", avgLoad),
		zap.String("reason", "load exceeds threshold"))

	as.publishScaleEvent(&ScaleEvent{
		Type:      "SCALE_UP",
		NodeID:    newNodeID,
		Timestamp: time.Now(),
		Reason:    fmt.Sprintf("Average load %.2f%% exceeds threshold %.2f%%", avgLoad, as.config.ScaleUpThreshold),
		Load:      avgLoad,
	})

	as.setNodeStatus(newNodeID, NodeStatusWarmingUp)

	go func() {
		warmupDuration := time.Duration(as.config.NodeWarmupDuration) * time.Second
		logger.Info("Node warming up",
			zap.String("node_id", newNodeID),
			zap.Duration("duration", warmupDuration))

		time.Sleep(warmupDuration)

		as.setNodeStatus(newNodeID, NodeStatusActive)
		logger.Info("Node warmup complete, now active",
			zap.String("node_id", newNodeID))
	}()
}

func (as *AutoScaler) scaleDown(avgLoad float64) {
	nodesToRemove := as.selectNodesToRemove(1)
	if len(nodesToRemove) == 0 {
		return
	}

	nodeToRemove := nodesToRemove[0]
	logger.Info("Scaling down cluster",
		zap.String("remove_node_id", nodeToRemove),
		zap.Float64("avg_load", avgLoad),
		zap.String("reason", "load below threshold"))

	as.setNodeStatus(nodeToRemove, NodeStatusDraining)

	as.publishScaleEvent(&ScaleEvent{
		Type:      "SCALE_DOWN",
		NodeID:    nodeToRemove,
		Timestamp: time.Now(),
		Reason:    fmt.Sprintf("Average load %.2f%% below threshold %.2f%%", avgLoad, as.config.ScaleDownThreshold),
		Load:      avgLoad,
	})

	go func() {
		migrationDuration := 60 * time.Second
		logger.Info("Node draining, traffic migrating",
			zap.String("node_id", nodeToRemove),
			zap.Duration("duration", migrationDuration))

		as.startTrafficMigration(nodeToRemove)

		time.Sleep(migrationDuration)

		as.setNodeStatus(nodeToRemove, NodeStatusDeleting)
		logger.Info("Node drain complete, marking for deletion",
			zap.String("node_id", nodeToRemove))
	}()
}

func (as *AutoScaler) selectNodesToRemove(count int) []string {
	ctx := context.Background()
	serviceKey := fmt.Sprintf("service:%s:nodes", as.localNode.ServiceName)

	nodeIDs, err := as.redisClient.SMembers(ctx, serviceKey).Result()
	if err != nil {
		return nil
	}

	candidateNodes := make([]string, 0)
	for _, nodeID := range nodeIDs {
		if nodeID == as.localNode.ID {
			continue
		}
		status := as.getNodeStatus(nodeID)
		if status == NodeStatusActive {
			candidateNodes = append(candidateNodes, nodeID)
		}
	}

	if len(candidateNodes) <= count {
		return candidateNodes
	}

	return candidateNodes[:count]
}

func (as *AutoScaler) startTrafficMigration(nodeID string) {
	migrationSteps := 10
	stepInterval := time.Duration(as.config.TrafficMigrationRate) * time.Second

	for i := 0; i <= migrationSteps; i++ {
		weight := 1.0 - (float64(i) / float64(migrationSteps))
		as.setNodeTrafficWeight(nodeID, weight)

		logger.Debug("Traffic migration progress",
			zap.String("node_id", nodeID),
			zap.Float64("weight", weight),
			zap.Int("step", i),
			zap.Int("total_steps", migrationSteps))

		if i < migrationSteps {
			time.Sleep(stepInterval)
		}
	}
}

func (as *AutoScaler) getNodeStatus(nodeID string) NodeStatus {
	as.mu.Lock()
	defer as.mu.Unlock()

	if info, ok := as.nodeStatusCache[nodeID]; ok {
		return info.Status
	}

	return NodeStatusActive
}

func (as *AutoScaler) setNodeStatus(nodeID string, status NodeStatus) {
	as.mu.Lock()
	defer as.mu.Unlock()

	info := &NodeStatusInfo{
		NodeID:        nodeID,
		Status:        status,
		StatusChanged: time.Now(),
	}

	if status == NodeStatusWarmingUp {
		info.WarmupStart = time.Now()
	}

	as.nodeStatusCache[nodeID] = info

	ctx := context.Background()
	key := fmt.Sprintf("scaler:node_status:%s", nodeID)
	data, _ := json.Marshal(info)
	as.redisClient.Set(ctx, key, data, 24*time.Hour)
}

func (as *AutoScaler) setNodeTrafficWeight(nodeID string, weight float64) {
	as.mu.Lock()
	defer as.mu.Unlock()

	if info, ok := as.nodeStatusCache[nodeID]; ok {
		info.TrafficWeight = weight
	}

	ctx := context.Background()
	key := fmt.Sprintf("scaler:node_weight:%s", nodeID)
	as.redisClient.Set(ctx, key, weight, 24*time.Hour)
}

func (as *AutoScaler) nodeStatusLoop() {
	defer as.wg.Done()

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-as.ctx.Done():
			return
		case <-ticker.C:
			as.cleanupExpiredNodeStatus()
		}
	}
}

func (as *AutoScaler) cleanupExpiredNodeStatus() {
	as.mu.Lock()
	defer as.mu.Unlock()

	now := time.Now()
	expiredNodes := make([]string, 0)

	for nodeID, info := range as.nodeStatusCache {
		if info.Status == NodeStatusDeleting && now.Sub(info.StatusChanged) > 1*time.Hour {
			expiredNodes = append(expiredNodes, nodeID)
		}
	}

	for _, nodeID := range expiredNodes {
		delete(as.nodeStatusCache, nodeID)
	}

	if len(expiredNodes) > 0 {
		logger.Info("Cleaned up expired node status",
			zap.Int("count", len(expiredNodes)))
	}
}

func (as *AutoScaler) publishScaleEvent(event *ScaleEvent) {
	ctx := context.Background()
	channel := fmt.Sprintf("scaler:events:%s", as.localNode.ServiceName)

	data, _ := json.Marshal(event)
	as.redisClient.Publish(ctx, channel, data)

	historyKey := fmt.Sprintf("scaler:history:%s", as.localNode.ServiceName)
	as.redisClient.LPush(ctx, historyKey, data)
	as.redisClient.LTrim(ctx, historyKey, 0, 99)
}

func (as *AutoScaler) scaleEventLoop() {
	defer as.wg.Done()

	ctx := context.Background()
	channel := fmt.Sprintf("scaler:events:%s", as.localNode.ServiceName)

	pubsub := as.redisClient.Subscribe(ctx, channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-as.ctx.Done():
			return
		case msg := <-ch:
			var event ScaleEvent
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				continue
			}

			logger.Info("Scale event received",
				zap.String("type", event.Type),
				zap.String("node_id", event.NodeID),
				zap.String("reason", event.Reason))

			if event.Type == "SCALE_UP" && event.NodeID != as.localNode.ID {
				as.handleNodeAdded(event.NodeID)
			} else if event.Type == "SCALE_DOWN" && event.NodeID != as.localNode.ID {
				as.handleNodeRemoved(event.NodeID)
			}
		}
	}
}

func (as *AutoScaler) handleNodeAdded(nodeID string) {
	logger.Info("New node added to cluster",
		zap.String("node_id", nodeID))
}

func (as *AutoScaler) handleNodeRemoved(nodeID string) {
	logger.Info("Node removed from cluster",
		zap.String("node_id", nodeID))
}

func (as *AutoScaler) generateNewNodeID() string {
	now := time.Now()
	return fmt.Sprintf("node-%s-%04d",
		now.Format("20060102-150405"),
		now.Nanosecond()%10000)
}

func (as *AutoScaler) GetNodeStatus(nodeID string) NodeStatus {
	return as.getNodeStatus(nodeID)
}

func (as *AutoScaler) GetNodeTrafficWeight(nodeID string) float64 {
	as.mu.Lock()
	defer as.mu.Unlock()

	if info, ok := as.nodeStatusCache[nodeID]; ok {
		return info.TrafficWeight
	}
	return 1.0
}

func (as *AutoScaler) IsNodeActive(nodeID string) bool {
	status := as.getNodeStatus(nodeID)
	return status == NodeStatusActive || status == NodeStatusWarmingUp
}
