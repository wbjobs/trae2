package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	DefaultMQTTBufferSize  = 1000
	DefaultMQTTMaxRetries  = 5
	DefaultMQTTRetryDelay  = 1 * time.Second
)

type MQTTClient struct {
	cfg         *MQTTConfig
	client      mqtt.Client
	connected   bool
	
	buffer      []*DataPoint
	bufferMu    sync.Mutex
	bufferSize  int
	
	maxRetries  int
	retryDelay  time.Duration
	
	doneChan    chan struct{}
	wg          sync.WaitGroup
	
	metrics     *MQTTMetrics
	metricsMu   sync.RWMutex
}

type MQTTMetrics struct {
	TotalPublished  int64 `json:"total_published"`
	TotalFailed     int64 `json:"total_failed"`
	TotalBuffered   int64 `json:"total_buffered"`
	BufferCount     int   `json:"buffer_count"`
}

type MQTTMessage struct {
	GatewayID  string                 `json:"gateway_id"`
	DeviceID   string                 `json:"device_id"`
	Protocol   string                 `json:"protocol"`
	Tags       map[string]string      `json:"tags"`
	Fields     map[string]interface{} `json:"fields"`
	Timestamp  int64                  `json:"timestamp"`
}

func NewMQTTClient(cfg *GatewayConfig) (*MQTTClient, error) {
	return &MQTTClient{
		cfg:        &cfg.MQTT,
		buffer:     make([]*DataPoint, 0, DefaultMQTTBufferSize),
		bufferSize: DefaultMQTTBufferSize,
		maxRetries: DefaultMQTTMaxRetries,
		retryDelay: DefaultMQTTRetryDelay,
		doneChan:   make(chan struct{}),
		metrics:    &MQTTMetrics{},
	}, nil
}

func (m *MQTTClient) Connect() error {
	opts := mqtt.NewClientOptions()
	
	broker := fmt.Sprintf("tcp://%s:%d", m.cfg.Broker, m.cfg.Port)
	opts.AddBroker(broker)
	opts.SetClientID(m.cfg.ClientID)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)
	opts.SetMaxReconnectInterval(30 * time.Second)
	opts.SetCleanSession(true)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetPingTimeout(10 * time.Second)
	opts.SetWriteTimeout(10 * time.Second)
	
	if m.cfg.Username != "" {
		opts.SetUsername(m.cfg.Username)
		opts.SetPassword(m.cfg.Password)
	}

	opts.SetOnConnectHandler(func(client mqtt.Client) {
		log.Printf("MQTT connected to %s", broker)
		m.connected = true
		go m.flushBuffer()
	})

	opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		log.Printf("MQTT connection lost: %v", err)
		m.connected = false
	})

	opts.SetReconnectingHandler(func(client mqtt.Client, options *mqtt.ClientOptions) {
		log.Println("MQTT reconnecting...")
	})

	m.client = mqtt.NewClient(opts)
	
	if token := m.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt connect failed: %w", token.Error())
	}

	m.wg.Add(1)
	go m.bufferMonitor()
	
	log.Printf("MQTT client initialized: %s", broker)
	return nil
}

func (m *MQTTClient) bufferMonitor() {
	defer m.wg.Done()
	
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			m.metricsMu.Lock()
			m.bufferMu.Lock()
			m.metrics.BufferCount = len(m.buffer)
			m.bufferMu.Unlock()
			m.metricsMu.Unlock()
		case <-m.doneChan:
			return
		}
	}
}

func (m *MQTTClient) Publish(point *DataPoint) error {
	if point == nil {
		return fmt.Errorf("nil data point")
	}

	if !m.connected {
		m.bufferMu.Lock()
		if len(m.buffer) < m.bufferSize {
			m.buffer = append(m.buffer, point)
			m.metricsMu.Lock()
			m.metrics.TotalBuffered++
			m.metrics.BufferCount = len(m.buffer)
			m.metricsMu.Unlock()
			m.bufferMu.Unlock()
			log.Printf("MQTT not connected, buffered point for device %s", point.DeviceID)
			return nil
		}
		m.bufferMu.Unlock()
		return fmt.Errorf("mqtt not connected and buffer full")
	}

	return m.publishWithRetry(point)
}

func (m *MQTTClient) publishWithRetry(point *DataPoint) error {
	var lastErr error
	
	for attempt := 0; attempt < m.maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(m.retryDelay * time.Duration(attempt))
			log.Printf("Retrying MQTT publish for device %s, attempt %d/%d", 
				point.DeviceID, attempt+1, m.maxRetries)
		}
		
		err := m.publish(point)
		if err == nil {
			m.metricsMu.Lock()
			m.metrics.TotalPublished++
			m.metricsMu.Unlock()
			return nil
		}
		
		lastErr = err
		log.Printf("MQTT publish attempt %d failed for device %s: %v", 
			attempt+1, point.DeviceID, err)
	}
	
	m.metricsMu.Lock()
	m.metrics.TotalFailed++
	m.metricsMu.Unlock()
	
	return fmt.Errorf("mqtt publish failed after %d attempts: %w", m.maxRetries, lastErr)
}

func (m *MQTTClient) publish(point *DataPoint) error {
	msg := MQTTMessage{
		GatewayID: point.GatewayID,
		DeviceID:  point.DeviceID,
		Protocol:  point.Protocol,
		Tags:      point.Tags,
		Fields:    point.Fields,
		Timestamp: point.Timestamp.UnixMilli(),
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message failed: %w", err)
	}

	topic := fmt.Sprintf("%s/%s/%s", m.cfg.Topic, point.Protocol, point.DeviceID)
	
	token := m.client.Publish(topic, m.cfg.QoS, false, payload)
	if token.WaitTimeout(10*time.Second) && token.Error() != nil {
		return fmt.Errorf("publish failed: %w", token.Error())
	}

	return nil
}

func (m *MQTTClient) PublishBatch(points []*DataPoint) error {
	failed := 0
	for _, point := range points {
		if err := m.Publish(point); err != nil {
			log.Printf("Publish point failed: %v", err)
			failed++
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d points failed to publish", failed)
	}
	return nil
}

func (m *MQTTClient) flushBuffer() {
	m.bufferMu.Lock()
	
	if len(m.buffer) == 0 {
		m.bufferMu.Unlock()
		return
	}
	
	batch := make([]*DataPoint, len(m.buffer))
	copy(batch, m.buffer)
	m.buffer = m.buffer[:0]
	
	m.metricsMu.Lock()
	m.metrics.BufferCount = 0
	m.metricsMu.Unlock()
	m.bufferMu.Unlock()
	
	log.Printf("Flushing %d buffered MQTT messages", len(batch))
	
	compensated := 0
	for _, point := range batch {
		if err := m.publish(point); err != nil {
			log.Printf("Flush publish failed for device %s: %v", point.DeviceID, err)
			m.bufferMu.Lock()
			if len(m.buffer) < m.bufferSize {
				m.buffer = append(m.buffer, point)
			}
			m.bufferMu.Unlock()
		} else {
			compensated++
			m.metricsMu.Lock()
			m.metrics.TotalPublished++
			m.metricsMu.Unlock()
		}
	}
	
	log.Printf("Flushed %d/%d buffered MQTT messages", compensated, len(batch))
}

func (m *MQTTClient) PublishAsync(point *DataPoint, callback func(error)) {
	go func() {
		err := m.Publish(point)
		if callback != nil {
			callback(err)
		}
	}()
}

func (m *MQTTClient) IsConnected() bool {
	return m.connected
}

func (m *MQTTClient) GetMetrics() *MQTTMetrics {
	m.metricsMu.RLock()
	defer m.metricsMu.RUnlock()
	
	metrics := *m.metrics
	return &metrics
}

func (m *MQTTClient) Disconnect() {
	log.Println("Disconnecting MQTT client...")
	
	close(m.doneChan)
	
	timeout := time.After(5 * time.Second)
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	
	select {
	case <-done:
	case <-timeout:
		log.Println("Timeout waiting for MQTT goroutines")
	}
	
	m.bufferMu.Lock()
	if len(m.buffer) > 0 {
		log.Printf("Persisting %d buffered messages before disconnect", len(m.buffer))
	}
	m.bufferMu.Unlock()
	
	if m.client != nil {
		m.client.Disconnect(250)
		m.connected = false
	}
	log.Println("MQTT client disconnected")
}
