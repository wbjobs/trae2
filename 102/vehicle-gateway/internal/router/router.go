package router

import (
	"errors"
	"hash/crc32"
	"sort"
	"strconv"
	"sync"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"go.uber.org/zap"
)

type ServiceNode struct {
	ID       string
	Address  string
	Port     int
	Region   string
	Weight   int
	Status   int32
	Load     int64
}

type ConsistentHash struct {
	ring        map[uint32]*ServiceNode
	sortedKeys  []uint32
	replicas    int
	mu          sync.RWMutex
}

func NewConsistentHash(replicas int) *ConsistentHash {
	return &ConsistentHash{
		ring:     make(map[uint32]*ServiceNode),
		replicas: replicas,
	}
}

func (ch *ConsistentHash) hashKey(key string) uint32 {
	return crc32.ChecksumIEEE([]byte(key))
}

func (ch *ConsistentHash) AddNode(node *ServiceNode) {
	ch.mu.Lock()
	defer ch.mu.Unlock()

	for i := 0; i < ch.replicas; i++ {
		key := ch.hashKey(node.ID + ":" + strconv.Itoa(i))
		ch.ring[key] = node
		ch.sortedKeys = append(ch.sortedKeys, key)
	}

	sort.Slice(ch.sortedKeys, func(i, j int) bool {
		return ch.sortedKeys[i] < ch.sortedKeys[j]
	})
}

func (ch *ConsistentHash) RemoveNode(nodeID string) {
	ch.mu.Lock()
	defer ch.mu.Unlock()

	for i := 0; i < ch.replicas; i++ {
		key := ch.hashKey(nodeID + ":" + strconv.Itoa(i))
		delete(ch.ring, key)
	}

	newKeys := make([]uint32, 0, len(ch.sortedKeys))
	for _, key := range ch.sortedKeys {
		if node, ok := ch.ring[key]; ok && node.ID == nodeID {
			continue
		}
		newKeys = append(newKeys, key)
	}
	ch.sortedKeys = newKeys
}

func (ch *ConsistentHash) GetNode(key string) (*ServiceNode, bool) {
	ch.mu.RLock()
	defer ch.mu.RUnlock()

	if len(ch.ring) == 0 {
		return nil, false
	}

	hash := ch.hashKey(key)

	idx := sort.Search(len(ch.sortedKeys), func(i int) bool {
		return ch.sortedKeys[i] >= hash
	})

	if idx == len(ch.sortedKeys) {
		idx = 0
	}

	node, ok := ch.ring[ch.sortedKeys[idx]]
	return node, ok
}

type RegionRouter struct {
	regionMap      map[string][]*ServiceNode
	regionHash     map[string]*ConsistentHash
	defaultRegion  string
	mu             sync.RWMutex
}

func NewRegionRouter(defaultRegion string) *RegionRouter {
	return &RegionRouter{
		regionMap:     make(map[string][]*ServiceNode),
		regionHash:    make(map[string]*ConsistentHash),
		defaultRegion: defaultRegion,
	}
}

func (rr *RegionRouter) AddNode(node *ServiceNode) {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	region := node.Region
	if region == "" {
		region = rr.defaultRegion
	}

	if _, ok := rr.regionMap[region]; !ok {
		rr.regionMap[region] = make([]*ServiceNode, 0)
		rr.regionHash[region] = NewConsistentHash(100)
	}

	rr.regionMap[region] = append(rr.regionMap[region], node)
	rr.regionHash[region].AddNode(node)

	logger.Info("Add node to region router",
		zap.String("node_id", node.ID),
		zap.String("region", region))
}

func (rr *RegionRouter) RemoveNode(region, nodeID string) {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	if _, ok := rr.regionMap[region]; !ok {
		return
	}

	nodes := rr.regionMap[region]
	newNodes := make([]*ServiceNode, 0, len(nodes))
	for _, node := range nodes {
		if node.ID != nodeID {
			newNodes = append(newNodes, node)
		}
	}
	rr.regionMap[region] = newNodes

	if hash, ok := rr.regionHash[region]; ok {
		hash.RemoveNode(nodeID)
	}

	logger.Info("Remove node from region router",
		zap.String("node_id", nodeID),
		zap.String("region", region))
}

func (rr *RegionRouter) GetNodeByRegion(region, key string) (*ServiceNode, error) {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	if region == "" {
		region = rr.defaultRegion
	}

	hash, ok := rr.regionHash[region]
	if !ok {
		return nil, errors.New("region not found: " + region)
	}

	node, ok := hash.GetNode(key)
	if !ok {
		return nil, errors.New("no node available in region: " + region)
	}

	return node, nil
}

func (rr *RegionRouter) GetNodesByRegion(region string) ([]*ServiceNode, error) {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	nodes, ok := rr.regionMap[region]
	if !ok {
		return nil, errors.New("region not found: " + region)
	}

	return nodes, nil
}

func (rr *RegionRouter) GetRegions() []string {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	regions := make([]string, 0, len(rr.regionMap))
	for region := range rr.regionMap {
		regions = append(regions, region)
	}
	return regions
}

type LoadBalancerType string

const (
	LoadBalancerRoundRobin LoadBalancerType = "round_robin"
	LoadBalancerRandom     LoadBalancerType = "random"
	LoadBalancerWeight     LoadBalancerType = "weight"
	LoadBalancerLeastConn  LoadBalancerType = "least_conn"
	LoadBalancerIPHash     LoadBalancerType = "ip_hash"
)

type LoadBalancer struct {
	typ            LoadBalancerType
	nodes          []*ServiceNode
	roundRobinIdx  int
	mu             sync.Mutex
}

func NewLoadBalancer(typ LoadBalancerType, nodes []*ServiceNode) *LoadBalancer {
	return &LoadBalancer{
		typ:   typ,
		nodes: nodes,
	}
}

func (lb *LoadBalancer) Next(key string) (*ServiceNode, error) {
	if len(lb.nodes) == 0 {
		return nil, errors.New("no nodes available")
	}

	lb.mu.Lock()
	defer lb.mu.Unlock()

	switch lb.typ {
	case LoadBalancerRoundRobin:
		node := lb.nodes[lb.roundRobinIdx]
		lb.roundRobinIdx = (lb.roundRobinIdx + 1) % len(lb.nodes)
		return node, nil
	case LoadBalancerWeight:
		return lb.nextWeighted(), nil
	case LoadBalancerLeastConn:
		return lb.nextLeastConn(), nil
	case LoadBalancerIPHash:
		idx := int(crc32.ChecksumIEEE([]byte(key))) % len(lb.nodes)
		return lb.nodes[idx], nil
	default:
		return lb.nodes[lb.roundRobinIdx], nil
	}
}

func (lb *LoadBalancer) nextWeighted() *ServiceNode {
	totalWeight := 0
	for _, node := range lb.nodes {
		totalWeight += node.Weight
	}

	randomWeight := uint32(0) % uint32(totalWeight)

	for _, node := range lb.nodes {
		randomWeight -= uint32(node.Weight)
		if randomWeight <= 0 {
			return node
		}
	}

	return lb.nodes[0]
}

func (lb *LoadBalancer) nextLeastConn() *ServiceNode {
	minLoad := int64(1<<63 - 1)
	var selected *ServiceNode

	for _, node := range lb.nodes {
		if node.Status != 1 {
			continue
		}
		if node.Load < minLoad {
			minLoad = node.Load
			selected = node
		}
	}

	if selected == nil {
		return lb.nodes[0]
	}

	return selected
}

func (lb *LoadBalancer) UpdateNodes(nodes []*ServiceNode) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	lb.nodes = nodes
	lb.roundRobinIdx = 0
}

type MessageRouter struct {
	regionRouter   *RegionRouter
	loadBalancers  map[string]*LoadBalancer
	regionEnabled  bool
	loadBalanceTyp LoadBalancerType
	mu             sync.RWMutex
}

func NewMessageRouter(regionEnabled bool, loadBalanceTyp string) *MessageRouter {
	mr := &MessageRouter{
		regionRouter:   NewRegionRouter(models.RegionCentral),
		loadBalancers:  make(map[string]*LoadBalancer),
		regionEnabled:  regionEnabled,
		loadBalanceTyp: LoadBalancerType(loadBalanceTyp),
	}
	return mr
}

func (mr *MessageRouter) AddNode(node *ServiceNode) {
	mr.regionRouter.AddNode(node)

	region := node.Region
	if region == "" {
		region = models.RegionCentral
	}

	mr.mu.Lock()
	defer mr.mu.Unlock()

	if _, ok := mr.loadBalancers[region]; !ok {
		mr.loadBalancers[region] = NewLoadBalancer(mr.loadBalanceTyp, nil)
	}

	nodes, _ := mr.regionRouter.GetNodesByRegion(region)
	mr.loadBalancers[region].UpdateNodes(nodes)
}

func (mr *MessageRouter) RemoveNode(region, nodeID string) {
	mr.regionRouter.RemoveNode(region, nodeID)

	mr.mu.Lock()
	defer mr.mu.Unlock()

	if lb, ok := mr.loadBalancers[region]; ok {
		nodes, _ := mr.regionRouter.GetNodesByRegion(region)
		lb.UpdateNodes(nodes)
	}
}

func (mr *MessageRouter) Route(msg *models.UnifiedMessage) (*ServiceNode, error) {
	if !mr.regionEnabled {
		return nil, nil
	}

	key := msg.Header.DeviceID
	node, err := mr.regionRouter.GetNodeByRegion(msg.Header.Region, key)
	if err != nil {
		logger.Warn("Region route failed, fallback to central",
			zap.String("region", msg.Header.Region),
			zap.Error(err))
		node, err = mr.regionRouter.GetNodeByRegion(models.RegionCentral, key)
	}

	return node, err
}
