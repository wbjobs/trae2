package loadbalancer

import (
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

type Backend struct {
	ID          string
	Address     string
	Weight      int
	Healthy     bool
	Connections int64
	LastCheck   time.Time
	ErrorCount  int32
}

type LoadBalancer interface {
	Select() (*Backend, error)
	AddBackend(backend *Backend)
	RemoveBackend(id string)
	Release(backend *Backend)
	HealthCheck()
	GetBackends() []*Backend
	GetHealthyBackends() []*Backend
}

type healthCheckResponse struct {
	Success bool   `json:"success"`
	NodeID  string `json:"node_id"`
	Status  string `json:"status"`
}

func (b *Backend) CheckHealth(timeout time.Duration) bool {
	client := http.Client{Timeout: timeout}
	resp, err := client.Get(b.Address + "/api/v1/cluster/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false
	}

	var result healthCheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}

	return result.Success && result.Status == "healthy"
}

type RoundRobin struct {
	backends []*Backend
	current  uint64
	mu       sync.RWMutex
}

func NewRoundRobin() *RoundRobin {
	return &RoundRobin{
		backends: make([]*Backend, 0),
	}
}

func (rr *RoundRobin) Select() (*Backend, error) {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	if len(rr.backends) == 0 {
		return nil, errors.New("no backends available")
	}

	healthyBackends := make([]*Backend, 0)
	for _, b := range rr.backends {
		if b.Healthy {
			healthyBackends = append(healthyBackends, b)
		}
	}

	if len(healthyBackends) == 0 {
		return nil, errors.New("no healthy backends available")
	}

	next := atomic.AddUint64(&rr.current, 1)
	index := int(next) % len(healthyBackends)
	atomic.AddInt64(&healthyBackends[index].Connections, 1)

	return healthyBackends[index], nil
}

func (rr *RoundRobin) AddBackend(backend *Backend) {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	for _, b := range rr.backends {
		if b.ID == backend.ID {
			return
		}
	}
	rr.backends = append(rr.backends, backend)
}

func (rr *RoundRobin) RemoveBackend(id string) {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	for i, b := range rr.backends {
		if b.ID == id {
			rr.backends = append(rr.backends[:i], rr.backends[i+1:]...)
			return
		}
	}
}

func (rr *RoundRobin) Release(backend *Backend) {
	atomic.AddInt64(&backend.Connections, -1)
}

func (rr *RoundRobin) HealthCheck() {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	now := time.Now()
	for _, b := range rr.backends {
		b.LastCheck = now
		if b.CheckHealth(3 * time.Second) {
			b.Healthy = true
			atomic.StoreInt32(&b.ErrorCount, 0)
		} else {
			atomic.AddInt32(&b.ErrorCount, 1)
			if atomic.LoadInt32(&b.ErrorCount) > 3 {
				b.Healthy = false
			}
		}
	}
}

func (rr *RoundRobin) GetBackends() []*Backend {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	result := make([]*Backend, len(rr.backends))
	copy(result, rr.backends)
	return result
}

func (rr *RoundRobin) GetHealthyBackends() []*Backend {
	rr.mu.RLock()
	defer rr.mu.RUnlock()

	result := make([]*Backend, 0)
	for _, b := range rr.backends {
		if b.Healthy {
			result = append(result, b)
		}
	}
	return result
}

type WeightedRoundRobin struct {
	backends     []*Backend
	currentIndex int
	currentWeight int
	gcdWeight    int
	maxWeight    int
	mu           sync.RWMutex
}

func NewWeightedRoundRobin() *WeightedRoundRobin {
	return &WeightedRoundRobin{
		backends:     make([]*Backend, 0),
		currentIndex: -1,
	}
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

func (wrr *WeightedRoundRobin) calculateGCD() {
	if len(wrr.backends) == 0 {
		wrr.gcdWeight = 0
		return
	}

	g := wrr.backends[0].Weight
	for i := 1; i < len(wrr.backends); i++ {
		g = gcd(g, wrr.backends[i].Weight)
	}
	wrr.gcdWeight = g
}

func (wrr *WeightedRoundRobin) calculateMaxWeight() {
	max := 0
	for _, b := range wrr.backends {
		if b.Weight > max {
			max = b.Weight
		}
	}
	wrr.maxWeight = max
}

func (wrr *WeightedRoundRobin) Select() (*Backend, error) {
	wrr.mu.RLock()
	defer wrr.mu.RUnlock()

	if len(wrr.backends) == 0 {
		return nil, errors.New("no backends available")
	}

	healthyBackends := make([]*Backend, 0)
	for _, b := range wrr.backends {
		if b.Healthy {
			healthyBackends = append(healthyBackends, b)
		}
	}

	if len(healthyBackends) == 0 {
		return nil, errors.New("no healthy backends available")
	}

	for {
		wrr.currentIndex = (wrr.currentIndex + 1) % len(healthyBackends)
		if wrr.currentIndex == 0 {
			wrr.currentWeight = wrr.currentWeight - wrr.gcdWeight
			if wrr.currentWeight <= 0 {
				wrr.currentWeight = wrr.maxWeight
				if wrr.currentWeight == 0 {
					return nil, errors.New("all weights are zero")
				}
			}
		}

		if healthyBackends[wrr.currentIndex].Weight >= wrr.currentWeight {
			atomic.AddInt64(&healthyBackends[wrr.currentIndex].Connections, 1)
			return healthyBackends[wrr.currentIndex], nil
		}
	}
}

func (wrr *WeightedRoundRobin) AddBackend(backend *Backend) {
	wrr.mu.Lock()
	defer wrr.mu.Unlock()

	for _, b := range wrr.backends {
		if b.ID == backend.ID {
			return
		}
	}
	wrr.backends = append(wrr.backends, backend)
	wrr.calculateGCD()
	wrr.calculateMaxWeight()
}

func (wrr *WeightedRoundRobin) RemoveBackend(id string) {
	wrr.mu.Lock()
	defer wrr.mu.Unlock()

	for i, b := range wrr.backends {
		if b.ID == id {
			wrr.backends = append(wrr.backends[:i], wrr.backends[i+1:]...)
			wrr.calculateGCD()
			wrr.calculateMaxWeight()
			return
		}
	}
}

func (wrr *WeightedRoundRobin) Release(backend *Backend) {
	atomic.AddInt64(&backend.Connections, -1)
}

func (wrr *WeightedRoundRobin) HealthCheck() {
	wrr.mu.Lock()
	defer wrr.mu.Unlock()

	now := time.Now()
	for _, b := range wrr.backends {
		b.LastCheck = now
		if b.CheckHealth(3 * time.Second) {
			b.Healthy = true
			atomic.StoreInt32(&b.ErrorCount, 0)
		} else {
			atomic.AddInt32(&b.ErrorCount, 1)
			if atomic.LoadInt32(&b.ErrorCount) > 3 {
				b.Healthy = false
			}
		}
	}
}

func (wrr *WeightedRoundRobin) GetBackends() []*Backend {
	wrr.mu.RLock()
	defer wrr.mu.RUnlock()

	result := make([]*Backend, len(wrr.backends))
	copy(result, wrr.backends)
	return result
}

func (wrr *WeightedRoundRobin) GetHealthyBackends() []*Backend {
	wrr.mu.RLock()
	defer wrr.mu.RUnlock()

	result := make([]*Backend, 0)
	for _, b := range wrr.backends {
		if b.Healthy {
			result = append(result, b)
		}
	}
	return result
}

type LeastConnections struct {
	backends []*Backend
	mu       sync.RWMutex
}

func NewLeastConnections() *LeastConnections {
	return &LeastConnections{
		backends: make([]*Backend, 0),
	}
}

func (lc *LeastConnections) Select() (*Backend, error) {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	if len(lc.backends) == 0 {
		return nil, errors.New("no backends available")
	}

	var selected *Backend
	minConns := int64(-1)

	for _, b := range lc.backends {
		if !b.Healthy {
			continue
		}
		conns := atomic.LoadInt64(&b.Connections)
		if minConns == -1 || conns < minConns {
			minConns = conns
			selected = b
		}
	}

	if selected == nil {
		return nil, errors.New("no healthy backends available")
	}

	atomic.AddInt64(&selected.Connections, 1)
	return selected, nil
}

func (lc *LeastConnections) AddBackend(backend *Backend) {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	for _, b := range lc.backends {
		if b.ID == backend.ID {
			return
		}
	}
	lc.backends = append(lc.backends, backend)
}

func (lc *LeastConnections) RemoveBackend(id string) {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	for i, b := range lc.backends {
		if b.ID == id {
			lc.backends = append(lc.backends[:i], lc.backends[i+1:]...)
			return
		}
	}
}

func (lc *LeastConnections) Release(backend *Backend) {
	atomic.AddInt64(&backend.Connections, -1)
}

func (lc *LeastConnections) HealthCheck() {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	now := time.Now()
	for _, b := range lc.backends {
		b.LastCheck = now
		if b.CheckHealth(3 * time.Second) {
			b.Healthy = true
			atomic.StoreInt32(&b.ErrorCount, 0)
		} else {
			atomic.AddInt32(&b.ErrorCount, 1)
			if atomic.LoadInt32(&b.ErrorCount) > 3 {
				b.Healthy = false
			}
		}
	}
}

func (lc *LeastConnections) GetBackends() []*Backend {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	result := make([]*Backend, len(lc.backends))
	copy(result, lc.backends)
	return result
}

func (lc *LeastConnections) GetHealthyBackends() []*Backend {
	lc.mu.RLock()
	defer lc.mu.RUnlock()

	result := make([]*Backend, 0)
	for _, b := range lc.backends {
		if b.Healthy {
			result = append(result, b)
		}
	}
	return result
}
