package flowctrl

import (
	"context"
	"sync"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

type TokenBucket struct {
	limiter *rate.Limiter
}

func NewTokenBucket(rateLimit float64, burst int) *TokenBucket {
	return &TokenBucket{
		limiter: rate.NewLimiter(rate.Limit(rateLimit), burst),
	}
}

func NewTokenBucketWithInitialTokens(rateLimit float64, burst, initialTokens int) *TokenBucket {
	limiter := rate.NewLimiter(rate.Limit(rateLimit), burst)
	if initialTokens > 0 && initialTokens < burst {
		tokensToConsume := burst - initialTokens
		for i := 0; i < tokensToConsume; i++ {
			limiter.Allow()
		}
	}
	return &TokenBucket{
		limiter: limiter,
	}
}

func (tb *TokenBucket) Allow() bool {
	return tb.limiter.Allow()
}

func (tb *TokenBucket) AllowN(n int) bool {
	return tb.limiter.AllowN(time.Now(), n)
}

func (tb *TokenBucket) Wait(ctx context.Context) error {
	return tb.limiter.Wait(ctx)
}

func (tb *TokenBucket) Tokens() float64 {
	return tb.limiter.TokensAt(time.Now())
}

type SlidingWindow struct {
	windowSize time.Duration
	limit      int
	requests   []time.Time
	mu         sync.Mutex
}

func NewSlidingWindow(windowSize time.Duration, limit int) *SlidingWindow {
	return &SlidingWindow{
		windowSize: windowSize,
		limit:      limit,
		requests:   make([]time.Time, 0),
	}
}

func (sw *SlidingWindow) Allow() bool {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-sw.windowSize)

	valid := sw.requests[:0]
	for _, t := range sw.requests {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	sw.requests = valid

	if len(sw.requests) >= sw.limit {
		return false
	}

	sw.requests = append(sw.requests, now)
	return true
}

func (sw *SlidingWindow) Count() int {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-sw.windowSize)

	count := 0
	for _, t := range sw.requests {
		if t.After(cutoff) {
			count++
		}
	}
	return count
}

type CircuitBreakerState int

const (
	StateClosed CircuitBreakerState = iota
	StateOpen
	StateHalfOpen
)

type CircuitBreaker struct {
	state              CircuitBreakerState
	failureThreshold   float64
	requestCount       int
	timeout            time.Duration
	halfOpenMaxCalls   int
	failures           int
	totalRequests      int
	lastStateChange    time.Time
	mu                 sync.Mutex
}

func NewCircuitBreaker(cfg models.CircuitBreakerConfig) *CircuitBreaker {
	return &CircuitBreaker{
		state:            StateClosed,
		failureThreshold: cfg.FailureThreshold,
		requestCount:     cfg.RequestCount,
		timeout:          time.Duration(cfg.Timeout) * time.Second,
		halfOpenMaxCalls: cfg.HalfOpenMaxCalls,
		lastStateChange:  time.Now(),
	}
}

func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateClosed:
		return true
	case StateOpen:
		if time.Since(cb.lastStateChange) > cb.timeout {
			cb.state = StateHalfOpen
			cb.lastStateChange = time.Now()
			cb.failures = 0
			cb.totalRequests = 0
			return true
		}
		return false
	case StateHalfOpen:
		if cb.totalRequests < cb.halfOpenMaxCalls {
			return true
		}
		return false
	}
	return false
}

func (cb *CircuitBreaker) Record(success bool) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.totalRequests++
	if !success {
		cb.failures++
	}

	switch cb.state {
	case StateClosed:
		if cb.totalRequests >= cb.requestCount {
			failureRate := float64(cb.failures) / float64(cb.totalRequests)
			if failureRate >= cb.failureThreshold {
				cb.state = StateOpen
				cb.lastStateChange = time.Now()
				logger.Warn("Circuit breaker opened",
					zap.Float64("failure_rate", failureRate))
			}
			cb.failures = 0
			cb.totalRequests = 0
		}
	case StateHalfOpen:
		if !success {
			cb.state = StateOpen
			cb.lastStateChange = time.Now()
			logger.Warn("Circuit breaker reopened from half-open")
		} else if cb.totalRequests >= cb.halfOpenMaxCalls {
			cb.state = StateClosed
			cb.lastStateChange = time.Now()
			cb.failures = 0
			cb.totalRequests = 0
			logger.Info("Circuit breaker closed")
		}
	}
}

func (cb *CircuitBreaker) State() CircuitBreakerState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

type limiterEntry struct {
	limiter    *TokenBucket
	createTime time.Time
	lastAccess time.Time
	isNew      bool
}

type RateLimiter struct {
	globalLimiter   *TokenBucket
	deviceLimiters  *sync.Map
	ipLimiters      *sync.Map
	perDeviceQPS    float64
	perIPQPS        float64
	burstRatio      float64
	warmupDuration  time.Duration
	cleanupInterval time.Duration
	deviceWhitelist *sync.Map
}

func NewRateLimiter(cfg models.FlowCtrlConfig) *RateLimiter {
	globalBurst := int(float64(cfg.GlobalQPS) * cfg.BurstRatio)
	rl := &RateLimiter{
		globalLimiter:   NewTokenBucket(float64(cfg.GlobalQPS), globalBurst),
		deviceLimiters:  &sync.Map{},
		ipLimiters:      &sync.Map{},
		perDeviceQPS:    float64(cfg.PerDeviceQPS),
		perIPQPS:        float64(cfg.PerIPQPS),
		burstRatio:      cfg.BurstRatio,
		warmupDuration:  30 * time.Second,
		cleanupInterval: 10 * time.Minute,
		deviceWhitelist: &sync.Map{},
	}

	go rl.startCleanupRoutine()

	return rl
}

func (rl *RateLimiter) AddToWhitelist(deviceID string) {
	rl.deviceWhitelist.Store(deviceID, true)
}

func (rl *RateLimiter) RemoveFromWhitelist(deviceID string) {
	rl.deviceWhitelist.Delete(deviceID)
}

func (rl *RateLimiter) isWhitelisted(deviceID string) bool {
	if deviceID == "" {
		return false
	}
	_, ok := rl.deviceWhitelist.Load(deviceID)
	return ok
}

func (rl *RateLimiter) Allow(deviceID, ip string) bool {
	if rl.isWhitelisted(deviceID) {
		return rl.globalLimiter.Allow()
	}

	if !rl.globalLimiter.Allow() {
		return false
	}

	if deviceID != "" {
		deviceLimiter := rl.getDeviceLimiter(deviceID)
		if !deviceLimiter.Allow() {
			return false
		}
	}

	if ip != "" {
		ipLimiter := rl.getIPLimiter(ip)
		if !ipLimiter.Allow() {
			return false
		}
	}

	return true
}

func (rl *RateLimiter) getDeviceLimiter(deviceID string) *TokenBucket {
	if entry, ok := rl.deviceLimiters.Load(deviceID); ok {
		e := entry.(*limiterEntry)
		e.lastAccess = time.Now()
		return e.limiter
	}

	burst := int(rl.perDeviceQPS * rl.burstRatio)
	initialTokens := int(rl.perDeviceQPS / 2)
	if initialTokens < 1 {
		initialTokens = 1
	}
	limiter := NewTokenBucketWithInitialTokens(rl.perDeviceQPS, burst, initialTokens)

	entry := &limiterEntry{
		limiter:    limiter,
		createTime: time.Now(),
		lastAccess: time.Now(),
		isNew:      true,
	}
	rl.deviceLimiters.Store(deviceID, entry)

	return limiter
}

func (rl *RateLimiter) getIPLimiter(ip string) *TokenBucket {
	if entry, ok := rl.ipLimiters.Load(ip); ok {
		e := entry.(*limiterEntry)
		e.lastAccess = time.Now()
		return e.limiter
	}

	burst := int(rl.perIPQPS * rl.burstRatio)
	initialTokens := int(rl.perIPQPS / 2)
	if initialTokens < 1 {
		initialTokens = 1
	}
	limiter := NewTokenBucketWithInitialTokens(rl.perIPQPS, burst, initialTokens)

	entry := &limiterEntry{
		limiter:    limiter,
		createTime: time.Now(),
		lastAccess: time.Now(),
		isNew:      true,
	}
	rl.ipLimiters.Store(ip, entry)

	return limiter
}

func (rl *RateLimiter) startCleanupRoutine() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for {
		<-ticker.C
		rl.cleanupExpiredLimiters()
	}
}

func (rl *RateLimiter) cleanupExpiredLimiters() {
	expireTime := time.Now().Add(-rl.cleanupInterval)
	cleanedCount := 0

	rl.deviceLimiters.Range(func(key, value interface{}) bool {
		entry := value.(*limiterEntry)
		if entry.lastAccess.Before(expireTime) {
			rl.deviceLimiters.Delete(key)
			cleanedCount++
		}
		return true
	})

	rl.ipLimiters.Range(func(key, value interface{}) bool {
		entry := value.(*limiterEntry)
		if entry.lastAccess.Before(expireTime) {
			rl.ipLimiters.Delete(key)
			cleanedCount++
		}
		return true
	})

	if cleanedCount > 0 {
		logger.Debug("Cleaned up expired limiters", zap.Int("count", cleanedCount))
	}
}

func (rl *RateLimiter) DeviceCount() int {
	count := 0
	rl.deviceLimiters.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

func (rl *RateLimiter) IPCount() int {
	count := 0
	rl.ipLimiters.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

type DistributedRateLimiter struct {
	redisClient *redis.Client
	burstRatio  float64
}

func NewDistributedRateLimiter(redisClient *redis.Client, burstRatio float64) *DistributedRateLimiter {
	return &DistributedRateLimiter{
		redisClient: redisClient,
		burstRatio:  burstRatio,
	}
}

func (drl *DistributedRateLimiter) Allow(key string, qps int) (bool, error) {
	ctx := context.Background()
	burst := int(float64(qps) * drl.burstRatio)

	script := `
	local key = KEYS[1]
	local rate = tonumber(ARGV[1])
	local burst = tonumber(ARGV[2])
	local now = tonumber(ARGV[3])
	
	local last_time = redis.call('HGET', key, 'last_time')
	local tokens = redis.call('HGET', key, 'tokens')
	
	if last_time == false or tokens == false then
		redis.call('HSET', key, 'last_time', now)
		redis.call('HSET', key, 'tokens', burst)
		redis.call('EXPIRE', key, 60)
		return 1
	end
	
	local elapsed = now - tonumber(last_time)
	local new_tokens = tonumber(tokens) + elapsed * rate / 1000.0
	
	if new_tokens > burst then
		new_tokens = burst
	end
	
	if new_tokens < 1 then
		return 0
	end
	
	redis.call('HSET', key, 'last_time', now)
	redis.call('HSET', key, 'tokens', new_tokens - 1)
	redis.call('EXPIRE', key, 60)
	
	return 1
	`

	result, err := drl.redisClient.Eval(ctx, script, []string{key}, qps, burst, time.Now().UnixMilli()).Result()
	if err != nil {
		return false, err
	}

	return result.(int64) == 1, nil
}

type FlowController struct {
	rateLimiter        *RateLimiter
	distributedLimiter *DistributedRateLimiter
	circuitBreaker     *CircuitBreaker
	enabled            bool
}

func NewFlowController(cfg models.FlowCtrlConfig, redisClient *redis.Client) *FlowController {
	fc := &FlowController{
		enabled: cfg.Enabled,
	}

	if cfg.Enabled {
		fc.rateLimiter = NewRateLimiter(cfg)
		if redisClient != nil {
			fc.distributedLimiter = NewDistributedRateLimiter(redisClient, cfg.BurstRatio)
		}
		if cfg.CircuitBreaker.Enabled {
			fc.circuitBreaker = NewCircuitBreaker(cfg.CircuitBreaker)
		}
	}

	return fc
}

func (fc *FlowController) Allow(deviceID, ip string) bool {
	if !fc.enabled {
		return true
	}

	if fc.circuitBreaker != nil && !fc.circuitBreaker.Allow() {
		return false
	}

	return fc.rateLimiter.Allow(deviceID, ip)
}

func (fc *FlowController) RecordSuccess() {
	if fc.circuitBreaker != nil {
		fc.circuitBreaker.Record(true)
	}
}

func (fc *FlowController) RecordFailure() {
	if fc.circuitBreaker != nil {
		fc.circuitBreaker.Record(false)
	}
}

func (fc *FlowController) AllowDistributed(key string, qps int) (bool, error) {
	if !fc.enabled || fc.distributedLimiter == nil {
		return true, nil
	}

	return fc.distributedLimiter.Allow(key, qps)
}

func (fc *FlowController) AddDeviceToWhitelist(deviceID string) {
	if fc.rateLimiter != nil {
		fc.rateLimiter.AddToWhitelist(deviceID)
	}
}

func (fc *FlowController) RemoveDeviceFromWhitelist(deviceID string) {
	if fc.rateLimiter != nil {
		fc.rateLimiter.RemoveFromWhitelist(deviceID)
	}
}

func (fc *FlowController) GetDeviceLimiterCount() (int, int) {
	if fc.rateLimiter == nil {
		return 0, 0
	}
	return fc.rateLimiter.DeviceCount(), fc.rateLimiter.IPCount()
}
