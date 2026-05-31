package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	DefaultMaxRetryAttempts  = 5
	DefaultRetryBaseDelay    = 1 * time.Second
	DefaultMaxRetryDelay     = 60 * time.Second
	DefaultDeadLetterLimit   = 1000
	DefaultOfflineCacheLimit = 100000
	DefaultCacheFlushInterval = 10 * time.Second
)

type MessageType int

const (
	MessageTypeInfluxDB MessageType = iota
	MessageTypeMQTT
	MessageTypeMySQLStatus
)

type MessageStatus int

const (
	MessageStatusPending MessageStatus = iota
	MessageStatusProcessing
	MessageStatusRetry
	MessageStatusDead
	MessageStatusSuccess
)

type Message struct {
	ID          string                 `json:"id"`
	Type        MessageType            `json:"type"`
	Data        *DataPoint             `json:"data"`
	Status      MessageStatus          `json:"status"`
	RetryCount  int                    `json:"retry_count"`
	MaxRetry    int                    `json:"max_retry"`
	NextRetryAt time.Time              `json:"next_retry_at"`
	CreatedAt   time.Time              `json:"created_at"`
	LastError   string                 `json:"last_error"`
	Extra       map[string]interface{} `json:"extra"`
}

type MessageQueue struct {
	pendingQueue    chan *Message
	retryQueue      []*Message
	deadLetterQueue []*Message
	
	retryMu         sync.Mutex
	deadMu          sync.Mutex
	
	maxRetryAttempts  int
	retryBaseDelay    time.Duration
	maxRetryDelay     time.Duration
	deadLetterLimit   int
	offlineCacheLimit int
	
	offlineCachePath  string
	offlineCache      []*Message
	offlineMu         sync.Mutex
	
	handlers         map[MessageType]MessageHandler
	
	doneChan         chan struct{}
	wg               sync.WaitGroup
	
	metrics          *QueueMetrics
	metricsMu        sync.RWMutex
}

type MessageHandler func(*Message) error

type QueueMetrics struct {
	TotalReceived    int64 `json:"total_received"`
	TotalProcessed   int64 `json:"total_processed"`
	TotalFailed      int64 `json:"total_failed"`
	TotalDeadLetter  int64 `json:"total_dead_letter"`
	TotalCompensated int64 `json:"total_compensated"`
	PendingCount     int   `json:"pending_count"`
	RetryCount       int   `json:"retry_count"`
	DeadLetterCount  int   `json:"dead_letter_count"`
	OfflineCacheCount int  `json:"offline_cache_count"`
}

func NewMessageQueue(cfg *GatewayConfig) *MessageQueue {
	maxRetry := DefaultMaxRetryAttempts
	if cfg.MessageQueue.MaxRetryAttempts > 0 {
		maxRetry = cfg.MessageQueue.MaxRetryAttempts
	}
	
	baseDelay := DefaultRetryBaseDelay
	if cfg.MessageQueue.RetryBaseDelay > 0 {
		baseDelay = time.Duration(cfg.MessageQueue.RetryBaseDelay) * time.Second
	}
	
	maxDelay := DefaultMaxRetryDelay
	if cfg.MessageQueue.MaxRetryDelay > 0 {
		maxDelay = time.Duration(cfg.MessageQueue.MaxRetryDelay) * time.Second
	}
	
	dlLimit := DefaultDeadLetterLimit
	if cfg.MessageQueue.DeadLetterLimit > 0 {
		dlLimit = cfg.MessageQueue.DeadLetterLimit
	}
	
	cacheLimit := DefaultOfflineCacheLimit
	if cfg.MessageQueue.OfflineCacheLimit > 0 {
		cacheLimit = cfg.MessageQueue.OfflineCacheLimit
	}
	
	mq := &MessageQueue{
		pendingQueue:      make(chan *Message, DefaultDataBufferSize),
		retryQueue:        make([]*Message, 0),
		deadLetterQueue:   make([]*Message, 0),
		maxRetryAttempts:  maxRetry,
		retryBaseDelay:    baseDelay,
		maxRetryDelay:     maxDelay,
		deadLetterLimit:   dlLimit,
		offlineCacheLimit: cacheLimit,
		offlineCachePath:  filepath.Join(".", "offline_cache"),
		handlers:          make(map[MessageType]MessageHandler),
		doneChan:          make(chan struct{}),
		metrics:           &QueueMetrics{},
	}
	
	os.MkdirAll(mq.offlineCachePath, 0755)
	
	return mq
}

func (mq *MessageQueue) RegisterHandler(msgType MessageType, handler MessageHandler) {
	mq.handlers[msgType] = handler
	log.Printf("Registered handler for message type: %d", msgType)
}

func (mq *MessageQueue) Start() {
	mq.wg.Add(3)
	go mq.processPending()
	go mq.processRetry()
	go mq.processOfflineCache()
	
	log.Println("Message queue started")
}

func (mq *MessageQueue) Stop() {
	log.Println("Stopping message queue...")
	
	close(mq.doneChan)
	
	timeout := time.After(15 * time.Second)
	done := make(chan struct{})
	go func() {
		mq.wg.Wait()
		close(done)
	}()
	
	select {
	case <-done:
		log.Println("Message queue stopped gracefully")
	case <-timeout:
		log.Println("Timeout waiting for message queue to stop")
	}
	
	mq.flushOfflineCache()
	mq.saveDeadLetterQueue()
}

func (mq *MessageQueue) Enqueue(msgType MessageType, data *DataPoint) error {
	if data == nil {
		return fmt.Errorf("nil data point")
	}
	
	msg := &Message{
		ID:         fmt.Sprintf("%s_%d", data.DeviceID, time.Now().UnixNano()),
		Type:       msgType,
		Data:       data,
		Status:     MessageStatusPending,
		RetryCount: 0,
		MaxRetry:   mq.maxRetryAttempts,
		CreatedAt:  time.Now(),
	}
	
	select {
	case mq.pendingQueue <- msg:
		mq.metricsMu.Lock()
		mq.metrics.TotalReceived++
		mq.metrics.PendingCount = len(mq.pendingQueue)
		mq.metricsMu.Unlock()
		return nil
	default:
		log.Printf("Warning: pending queue full, caching offline for device %s", data.DeviceID)
		mq.cacheOffline(msg)
		return nil
	}
}

func (mq *MessageQueue) processPending() {
	defer mq.wg.Done()
	log.Println("Pending queue processor started")
	
	for {
		select {
		case msg, ok := <-mq.pendingQueue:
			if !ok {
				return
			}
			mq.processMessage(msg)
		case <-mq.doneChan:
			return
		}
	}
}

func (mq *MessageQueue) processMessage(msg *Message) {
	if msg == nil || msg.Data == nil {
		return
	}
	
	handler, ok := mq.handlers[msg.Type]
	if !ok {
		log.Printf("No handler for message type: %d", msg.Type)
		mq.moveToDeadLetter(msg, fmt.Sprintf("no handler for type %d", msg.Type))
		return
	}
	
	msg.Status = MessageStatusProcessing
	
	if err := handler(msg); err != nil {
		log.Printf("Handler failed for message %s: %v (attempt %d/%d)", 
			msg.ID, err, msg.RetryCount+1, msg.MaxRetry)
		
		msg.RetryCount++
		msg.LastError = err.Error()
		
		if msg.RetryCount >= msg.MaxRetry {
			mq.moveToDeadLetter(msg, err.Error())
			return
		}
		
		mq.scheduleRetry(msg)
	} else {
		msg.Status = MessageStatusSuccess
		
		mq.metricsMu.Lock()
		mq.metrics.TotalProcessed++
		mq.metricsMu.Unlock()
	}
}

func (mq *MessageQueue) scheduleRetry(msg *Message) {
	delay := mq.retryBaseDelay * time.Duration(1<<msg.RetryCount)
	if delay > mq.maxRetryDelay {
		delay = mq.maxRetryDelay
	}
	
	msg.NextRetryAt = time.Now().Add(delay)
	msg.Status = MessageStatusRetry
	
	mq.retryMu.Lock()
	mq.retryQueue = append(mq.retryQueue, msg)
	mq.metricsMu.Lock()
	mq.metrics.RetryCount = len(mq.retryQueue)
	mq.metricsMu.Unlock()
	mq.retryMu.Unlock()
	
	log.Printf("Scheduled retry for message %s at %v (delay: %v)", 
		msg.ID, msg.NextRetryAt, delay)
}

func (mq *MessageQueue) processRetry() {
	defer mq.wg.Done()
	log.Println("Retry queue processor started")
	
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			mq.processDueRetries()
		case <-mq.doneChan:
			return
		}
	}
}

func (mq *MessageQueue) processDueRetries() {
	now := time.Now()
	
	mq.retryMu.Lock()
	remaining := make([]*Message, 0, len(mq.retryQueue))
	
	for _, msg := range mq.retryQueue {
		if now.After(msg.NextRetryAt) {
			remaining = append(remaining, msg)
			continue
		}
		remaining = append(remaining, msg)
	}
	
	due := make([]*Message, 0)
	stillWaiting := make([]*Message, 0)
	
	for _, msg := range remaining {
		if now.After(msg.NextRetryAt) {
			due = append(due, msg)
		} else {
			stillWaiting = append(stillWaiting, msg)
		}
	}
	
	mq.retryQueue = stillWaiting
	mq.metricsMu.Lock()
	mq.metrics.RetryCount = len(mq.retryQueue)
	mq.metricsMu.Unlock()
	mq.retryMu.Unlock()
	
	for _, msg := range due {
		mq.processMessage(msg)
	}
}

func (mq *MessageQueue) moveToDeadLetter(msg *Message, reason string) {
	msg.Status = MessageStatusDead
	msg.LastError = reason
	
	mq.deadMu.Lock()
	if len(mq.deadLetterQueue) >= mq.deadLetterLimit {
		mq.deadLetterQueue = mq.deadLetterQueue[1:]
	}
	mq.deadLetterQueue = append(mq.deadLetterQueue, msg)
	
	mq.metricsMu.Lock()
	mq.metrics.TotalFailed++
	mq.metrics.TotalDeadLetter++
	mq.metrics.DeadLetterCount = len(mq.deadLetterQueue)
	mq.metricsMu.Unlock()
	mq.deadMu.Unlock()
	
	log.Printf("Message %s moved to dead letter queue: %s", msg.ID, reason)
}

func (mq *MessageQueue) cacheOffline(msg *Message) {
	mq.offlineMu.Lock()
	defer mq.offlineMu.Unlock()
	
	if len(mq.offlineCache) >= mq.offlineCacheLimit {
		mq.offlineCache = mq.offlineCache[1:]
	}
	
	mq.offlineCache = append(mq.offlineCache, msg)
	
	mq.metricsMu.Lock()
	mq.metrics.OfflineCacheCount = len(mq.offlineCache)
	mq.metricsMu.Unlock()
}

func (mq *MessageQueue) processOfflineCache() {
	defer mq.wg.Done()
	log.Println("Offline cache processor started")
	
	ticker := time.NewTicker(DefaultCacheFlushInterval)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			mq.flushOfflineCache()
		case <-mq.doneChan:
			return
		}
	}
}

func (mq *MessageQueue) flushOfflineCache() {
	mq.offlineMu.Lock()
	
	if len(mq.offlineCache) == 0 {
		mq.offlineMu.Unlock()
		return
	}
	
	batch := make([]*Message, len(mq.offlineCache))
	copy(batch, mq.offlineCache)
	mq.offlineCache = mq.offlineCache[:0]
	
	mq.metricsMu.Lock()
	mq.metrics.OfflineCacheCount = 0
	mq.metricsMu.Unlock()
	mq.offlineMu.Unlock()
	
	log.Printf("Flushing %d offline cached messages", len(batch))
	
	compensated := 0
	for _, msg := range batch {
		select {
		case mq.pendingQueue <- msg:
			compensated++
		default:
			mq.offlineMu.Lock()
			mq.offlineCache = append(mq.offlineCache, msg)
			mq.metricsMu.Lock()
			mq.metrics.OfflineCacheCount = len(mq.offlineCache)
			mq.metricsMu.Unlock()
			mq.offlineMu.Unlock()
			break
		}
	}
	
	if compensated > 0 {
		mq.metricsMu.Lock()
		mq.metrics.TotalCompensated += int64(compensated)
		mq.metricsMu.Unlock()
		log.Printf("Compensated %d offline messages to pending queue", compensated)
	}
	
	mq.persistOfflineCache()
}

func (mq *MessageQueue) persistOfflineCache() {
	mq.offlineMu.Lock()
	defer mq.offlineMu.Unlock()
	
	if len(mq.offlineCache) == 0 {
		return
	}
	
	data, err := json.Marshal(mq.offlineCache)
	if err != nil {
		log.Printf("Failed to marshal offline cache: %v", err)
		return
	}
	
	cacheFile := filepath.Join(mq.offlineCachePath, "cache.json")
	if err := os.WriteFile(cacheFile, data, 0644); err != nil {
		log.Printf("Failed to persist offline cache: %v", err)
	}
}

func (mq *MessageQueue) loadOfflineCache() {
	cacheFile := filepath.Join(mq.offlineCachePath, "cache.json")
	
	data, err := os.ReadFile(cacheFile)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		log.Printf("Failed to read offline cache: %v", err)
		return
	}
	
	var cached []*Message
	if err := json.Unmarshal(data, &cached); err != nil {
		log.Printf("Failed to unmarshal offline cache: %v", err)
		return
	}
	
	mq.offlineMu.Lock()
	mq.offlineCache = append(mq.offlineCache, cached...)
	mq.metricsMu.Lock()
	mq.metrics.OfflineCacheCount = len(mq.offlineCache)
	mq.metricsMu.Unlock()
	mq.offlineMu.Unlock()
	
	log.Printf("Loaded %d offline cached messages", len(cached))
}

func (mq *MessageQueue) saveDeadLetterQueue() {
	mq.deadMu.Lock()
	defer mq.deadMu.Unlock()
	
	if len(mq.deadLetterQueue) == 0 {
		return
	}
	
	data, err := json.Marshal(mq.deadLetterQueue)
	if err != nil {
		log.Printf("Failed to marshal dead letter queue: %v", err)
		return
	}
	
	dlFile := filepath.Join(mq.offlineCachePath, "dead_letter.json")
	if err := os.WriteFile(dlFile, data, 0644); err != nil {
		log.Printf("Failed to persist dead letter queue: %v", err)
	}
	
	log.Printf("Saved %d dead letter messages", len(mq.deadLetterQueue))
}

func (mq *MessageQueue) GetMetrics() *QueueMetrics {
	mq.metricsMu.RLock()
	defer mq.metricsMu.RUnlock()
	
	mq.retryMu.Lock()
	mq.metrics.RetryCount = len(mq.retryQueue)
	mq.retryMu.Unlock()
	
	mq.deadMu.Lock()
	mq.metrics.DeadLetterCount = len(mq.deadLetterQueue)
	mq.deadMu.Unlock()
	
	mq.offlineMu.Lock()
	mq.metrics.OfflineCacheCount = len(mq.offlineCache)
	mq.offlineMu.Unlock()
	
	metrics := *mq.metrics
	metrics.PendingCount = len(mq.pendingQueue)
	
	return &metrics
}

func (mq *MessageQueue) GetDeadLetterMessages() []*Message {
	mq.deadMu.Lock()
	defer mq.deadMu.Unlock()
	
	result := make([]*Message, len(mq.deadLetterQueue))
	copy(result, mq.deadLetterQueue)
	return result
}

func (mq *MessageQueue) ClearDeadLetterQueue() int {
	mq.deadMu.Lock()
	defer mq.deadMu.Unlock()
	
	count := len(mq.deadLetterQueue)
	mq.deadLetterQueue = mq.deadLetterQueue[:0]
	return count
}

func (mq *MessageQueue) RetryDeadLetterMessages() int {
	mq.deadMu.Lock()
	
	if len(mq.deadLetterQueue) == 0 {
		mq.deadMu.Unlock()
		return 0
	}
	
	messages := make([]*Message, len(mq.deadLetterQueue))
	copy(messages, mq.deadLetterQueue)
	mq.deadLetterQueue = mq.deadLetterQueue[:0]
	
	mq.metricsMu.Lock()
	mq.metrics.DeadLetterCount = 0
	mq.metricsMu.Unlock()
	mq.deadMu.Unlock()
	
	retried := 0
	for _, msg := range messages {
		msg.Status = MessageStatusPending
		msg.RetryCount = 0
		msg.LastError = ""
		
		select {
		case mq.pendingQueue <- msg:
			retried++
		default:
			mq.offlineMu.Lock()
			mq.offlineCache = append(mq.offlineCache, msg)
			mq.metricsMu.Lock()
			mq.metrics.OfflineCacheCount = len(mq.offlineCache)
			mq.metricsMu.Unlock()
			mq.offlineMu.Unlock()
		}
	}
	
	log.Printf("Retried %d dead letter messages", retried)
	return retried
}
