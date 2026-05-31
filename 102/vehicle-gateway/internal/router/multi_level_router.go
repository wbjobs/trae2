package router

import (
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"go.uber.org/zap"
)

type RoutePriority int

const (
	PriorityHigh   RoutePriority = 3
	PriorityMedium RoutePriority = 2
	PriorityLow    RoutePriority = 1
)

type RouteLevel int

const (
	LevelRegion    RouteLevel = 1
	LevelPriority  RouteLevel = 2
	LevelNode      RouteLevel = 3
)

type RouteStrategy interface {
	Route(msg *models.UnifiedMessage) (*ServiceNode, error)
	Name() string
}

type RegionRouteStrategy struct {
	router *RegionRouter
}

func (s *RegionRouteStrategy) Route(msg *models.UnifiedMessage) (*ServiceNode, error) {
	return s.router.GetNodeByRegion(msg.Header.Region, msg.Header.DeviceID)
}

func (s *RegionRouteStrategy) Name() string {
	return "region"
}

type PriorityRouteStrategy struct {
	highPriorityNodes   []*ServiceNode
	mediumPriorityNodes []*ServiceNode
	lowPriorityNodes    []*ServiceNode
	highPriorityTypes   map[string]bool
	mediumPriorityTypes map[string]bool
	mu                  sync.RWMutex
}

func NewPriorityRouteStrategy() *PriorityRouteStrategy {
	return &PriorityRouteStrategy{
		highPriorityTypes: map[string]bool{
			models.MsgTypeAlarm: true,
			"ALARM":            true,
			"EMERGENCY":        true,
		},
		mediumPriorityTypes: map[string]bool{
			models.MsgTypeLocation: true,
			"LOCATION":            true,
		},
	}
}

func (s *PriorityRouteStrategy) SetPriorityNodes(high, medium, low []*ServiceNode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.highPriorityNodes = high
	s.mediumPriorityNodes = medium
	s.lowPriorityNodes = low
}

func (s *PriorityRouteStrategy) getPriority(msg *models.UnifiedMessage) RoutePriority {
	if s.highPriorityTypes[msg.Header.MsgType] || msg.Header.Priority >= 3 {
		return PriorityHigh
	}
	if s.mediumPriorityTypes[msg.Header.MsgType] || msg.Header.Priority >= 2 {
		return PriorityMedium
	}
	return PriorityLow
}

func (s *PriorityRouteStrategy) Route(msg *models.UnifiedMessage) (*ServiceNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	priority := s.getPriority(msg)
	var nodes []*ServiceNode

	switch priority {
	case PriorityHigh:
		nodes = s.highPriorityNodes
	case PriorityMedium:
		nodes = s.mediumPriorityNodes
	default:
		nodes = s.lowPriorityNodes
	}

	if len(nodes) == 0 {
		if len(s.highPriorityNodes) > 0 {
			nodes = s.highPriorityNodes
		} else if len(s.mediumPriorityNodes) > 0 {
			nodes = s.mediumPriorityNodes
		} else if len(s.lowPriorityNodes) > 0 {
			nodes = s.lowPriorityNodes
		} else {
			return nil, nil
		}
	}

	lb := NewLoadBalancer(LoadBalancerRoundRobin, nodes)
	return lb.Next(msg.Header.DeviceID)
}

func (s *PriorityRouteStrategy) Name() string {
	return "priority"
}

type LoadBalanceStrategy struct {
	loadBalancer *LoadBalancer
	mu           sync.RWMutex
}

func NewLoadBalanceStrategy(typ LoadBalancerType, nodes []*ServiceNode) *LoadBalanceStrategy {
	return &LoadBalanceStrategy{
		loadBalancer: NewLoadBalancer(typ, nodes),
	}
}

func (s *LoadBalanceStrategy) UpdateNodes(nodes []*ServiceNode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadBalancer.UpdateNodes(nodes)
}

func (s *LoadBalanceStrategy) Route(msg *models.UnifiedMessage) (*ServiceNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadBalancer.Next(msg.Header.DeviceID)
}

func (s *LoadBalanceStrategy) Name() string {
	return "load_balance"
}

type MultiLevelRouter struct {
	regionStrategy    *RegionRouteStrategy
	priorityStrategy  *PriorityRouteStrategy
	loadBalanceStrategy *LoadBalanceStrategy
	regionRouter      *RegionRouter
	level1Strategy    RouteStrategy
	level2Strategy    RouteStrategy
	level3Strategy    RouteStrategy
	level1Enabled     bool
	level2Enabled     bool
	level3Enabled     bool
	mu                sync.RWMutex
	routeStats        map[string]*RouteStats
}

type RouteStats struct {
	TotalCount    int64
	RegionCount   int64
	PriorityCount int64
	NodeCount     int64
	ForwardCount  int64
	LocalCount    int64
	LastUpdate    time.Time
}

func NewMultiLevelRouter(regionEnabled, priorityEnabled bool, loadBalanceType string, nodes []*ServiceNode) *MultiLevelRouter {
	regionRouter := NewRegionRouter(models.RegionCentral)
	mr := &MultiLevelRouter{
		regionRouter:      regionRouter,
		regionStrategy:    &RegionRouteStrategy{router: regionRouter},
		priorityStrategy:  NewPriorityRouteStrategy(),
		loadBalanceStrategy: NewLoadBalanceStrategy(LoadBalancerType(loadBalanceType), nodes),
		level1Enabled:     regionEnabled,
		level2Enabled:     priorityEnabled,
		level3Enabled:     true,
		routeStats:        make(map[string]*RouteStats),
	}

	mr.level1Strategy = mr.regionStrategy
	mr.level2Strategy = mr.priorityStrategy
	mr.level3Strategy = mr.loadBalanceStrategy

	return mr
}

func (r *MultiLevelRouter) AddNode(node *ServiceNode) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.regionRouter.AddNode(node)

	region := node.Region
	if region == "" {
		region = models.RegionCentral
	}

	nodes, _ := r.regionRouter.GetNodesByRegion(region)
	r.loadBalanceStrategy.UpdateNodes(nodes)

	highNodes := make([]*ServiceNode, 0)
	mediumNodes := make([]*ServiceNode, 0)
	lowNodes := make([]*ServiceNode, 0)
	for _, n := range nodes {
		switch n.Weight {
		case 100:
			highNodes = append(highNodes, n)
		case 50:
			mediumNodes = append(mediumNodes, n)
		default:
			lowNodes = append(lowNodes, n)
		}
	}
	r.priorityStrategy.SetPriorityNodes(highNodes, mediumNodes, lowNodes)

	logger.Info("Node added to multi-level router",
		zap.String("node_id", node.ID),
		zap.String("region", node.Region))
}

func (r *MultiLevelRouter) RemoveNode(region, nodeID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.regionRouter.RemoveNode(region, nodeID)

	nodes, _ := r.regionRouter.GetNodesByRegion(region)
	r.loadBalanceStrategy.UpdateNodes(nodes)

	highNodes := make([]*ServiceNode, 0)
	mediumNodes := make([]*ServiceNode, 0)
	lowNodes := make([]*ServiceNode, 0)
	for _, n := range nodes {
		switch n.Weight {
		case 100:
			highNodes = append(highNodes, n)
		case 50:
			mediumNodes = append(mediumNodes, n)
		default:
			lowNodes = append(lowNodes, n)
		}
	}
	r.priorityStrategy.SetPriorityNodes(highNodes, mediumNodes, lowNodes)

	logger.Info("Node removed from multi-level router",
		zap.String("node_id", nodeID),
		zap.String("region", region))
}

func (r *MultiLevelRouter) Route(msg *models.UnifiedMessage, localNodeID string) (*ServiceNode, RouteLevel, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := r.getOrCreateStats(msg.Header.Region)
	stats.TotalCount++

	var targetNode *ServiceNode
	var err error
	var routeLevel RouteLevel

	if r.level1Enabled {
		targetNode, err = r.level1Strategy.Route(msg)
		if err == nil && targetNode != nil {
			routeLevel = LevelRegion
			stats.RegionCount++
		}
	}

	if (targetNode == nil || err != nil) && r.level2Enabled {
		targetNode, err = r.level2Strategy.Route(msg)
		if err == nil && targetNode != nil {
			routeLevel = LevelPriority
			stats.PriorityCount++
		}
	}

	if (targetNode == nil || err != nil) && r.level3Enabled {
		targetNode, err = r.level3Strategy.Route(msg)
		if err == nil && targetNode != nil {
			routeLevel = LevelNode
			stats.NodeCount++
		}
	}

	if targetNode != nil {
		if targetNode.ID == localNodeID {
			stats.LocalCount++
		} else {
			stats.ForwardCount++
		}
	}

	stats.LastUpdate = time.Now()

	return targetNode, routeLevel, err
}

func (r *MultiLevelRouter) getOrCreateStats(region string) *RouteStats {
	if stats, ok := r.routeStats[region]; ok {
		return stats
	}
	stats := &RouteStats{}
	r.routeStats[region] = stats
	return stats
}

func (r *MultiLevelRouter) GetStats() map[string]*RouteStats {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := make(map[string]*RouteStats, len(r.routeStats))
	for k, v := range r.routeStats {
		stats[k] = &RouteStats{
			TotalCount:    v.TotalCount,
			RegionCount:   v.RegionCount,
			PriorityCount: v.PriorityCount,
			NodeCount:     v.NodeCount,
			ForwardCount:  v.ForwardCount,
			LocalCount:    v.LocalCount,
			LastUpdate:    v.LastUpdate,
		}
	}
	return stats
}

func (r *MultiLevelRouter) SetLevelEnabled(level RouteLevel, enabled bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch level {
	case LevelRegion:
		r.level1Enabled = enabled
	case LevelPriority:
		r.level2Enabled = enabled
	case LevelNode:
		r.level3Enabled = enabled
	}
}

func (r *MultiLevelRouter) GetRegionRouter() *RegionRouter {
	return r.regionRouter
}

func (r *MultiLevelRouter) UpdateNodesByRegion(region string) {
	nodes, err := r.regionRouter.GetNodesByRegion(region)
	if err != nil {
		return
	}
	r.loadBalanceStrategy.UpdateNodes(nodes)
}
