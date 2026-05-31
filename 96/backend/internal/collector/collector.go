package collector

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"icc-server/internal/api"
	"icc-server/internal/driver"
	"icc-server/internal/model"
)

const (
	defaultBatchInterval = 500 * time.Millisecond
	maxBatchSize        = 100
)

type Collector struct {
	driverMgr   *driver.Manager
	interval    time.Duration
	statusMap   map[string]*model.DeviceStatusReport
	prevStatusMap map[string]string
	pending     []*model.DeviceStatusReport
	wsHub       *api.WebSocketHub
	statusCh    chan *model.DeviceStatusReport
	alertCh     chan *model.Alert
	batchCh     chan *model.DeviceStatusReport
	stopCh      chan struct{}
	mu          sync.RWMutex
	pendingMu   sync.Mutex
	running     bool
}

func NewCollector(driverMgr *driver.Manager, interval time.Duration, wsHub *api.WebSocketHub) *Collector {
	return &Collector{
		driverMgr:     driverMgr,
		interval:      interval,
		statusMap:     make(map[string]*model.DeviceStatusReport),
		prevStatusMap: make(map[string]string),
		pending:       make([]*model.DeviceStatusReport, 0, maxBatchSize),
		wsHub:         wsHub,
		statusCh:      make(chan *model.DeviceStatusReport, 1024),
		alertCh:       make(chan *model.Alert, 1024),
		batchCh:       make(chan *model.DeviceStatusReport, 1024),
		stopCh:        make(chan struct{}),
	}
}

func (c *Collector) Start() {
	c.mu.Lock()
	c.running = true
	c.mu.Unlock()

	go c.collectLoop()
	go c.batchLoop()
	go c.alertLoop()
	log.Printf("[Collector] Started with interval %v, batch interval %v", c.interval, defaultBatchInterval)
}

func (c *Collector) Stop() {
	c.mu.Lock()
	c.running = false
	c.mu.Unlock()
	close(c.stopCh)
	log.Println("[Collector] Stopped")
}

func (c *Collector) StatusChannel() <-chan *model.DeviceStatusReport {
	return c.statusCh
}

func (c *Collector) AlertChannel() <-chan *model.Alert {
	return c.alertCh
}

func (c *Collector) collectLoop() {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.collectAll()
		}
	}
}

func (c *Collector) collectAll() {
	devices := c.driverMgr.ListDevices()

	var wg sync.WaitGroup
	for _, dev := range devices {
		wg.Add(1)
		go func(device model.Device) {
			defer wg.Done()
			c.collectDevice(device)
		}(dev)
	}
	wg.Wait()
}

func (c *Collector) collectDevice(device model.Device) {
	report, err := c.driverMgr.ReadStatus(device.ID)
	if err != nil {
		log.Printf("[Collector] Failed to read status for device %s: %v", device.ID, err)
		return
	}

	c.mu.Lock()
	prevStatus := c.prevStatusMap[device.ID]
	c.statusMap[device.ID] = report
	c.prevStatusMap[device.ID] = report.Status
	c.mu.Unlock()

	if prevStatus != "" && prevStatus != report.Status {
		if report.Status == model.DeviceStatusError || report.Status == model.DeviceStatusOffline {
			alertLevel := model.AlertLevelWarning
			if report.Status == model.DeviceStatusError {
				alertLevel = model.AlertLevelCritical
			}
			alert := &model.Alert{
				ID:        "ALT" + time.Now().Format("20060102150405"),
				DeviceID:  device.ID,
				DeviceName: device.Name,
				Level:     alertLevel,
				Type:      model.AlertTypeStatus,
				Title:     "设备状态异常",
				Message:   fmt.Sprintf("设备 [%s] 状态从 %s 变为 %s",
					device.Name, prevStatus, report.Status),
				Timestamp: time.Now(),
				Acknowledged: false,
			}
			select {
			case c.alertCh <- alert:
			default:
			}

			alertMsg := map[string]interface{}{
				"type":  "alert",
				"alert": alert,
			}
			data, err := json.Marshal(alertMsg)
			if err == nil {
				c.wsHub.Broadcast(data)
			}
			log.Printf("[Collector] Alert: %s for device %s", alert.Message, device.ID)
		}
	}

	select {
	case c.batchCh <- report:
	default:
	}
}

func (c *Collector) batchLoop() {
	ticker := time.NewTicker(defaultBatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopCh:
			c.flushBatch()
			return
		case report := <-c.batchCh:
			c.addToBatch(report)
			if c.batchSize() >= maxBatchSize {
				c.flushBatch()
			}
		case <-ticker.C:
			if c.batchSize() > 0 {
				c.flushBatch()
			}
		}
	}
}

func (c *Collector) addToBatch(report *model.DeviceStatusReport) {
	c.pendingMu.Lock()
	defer c.pendingMu.Unlock()

	for i, existing := range c.pending {
		if existing.DeviceID == report.DeviceID {
			c.pending[i] = report
			return
		}
	}

	c.pending = append(c.pending, report)
}

func (c *Collector) batchSize() int {
	c.pendingMu.Lock()
	defer c.pendingMu.Unlock()
	return len(c.pending)
}

func (c *Collector) flushBatch() {
	c.pendingMu.Lock()
	batch := c.pending
	c.pending = make([]*model.DeviceStatusReport, 0, maxBatchSize)
	c.pendingMu.Unlock()

	if len(batch) == 0 {
		return
	}

	batchMsg := map[string]interface{}{
		"type":    "batch_status",
		"count":   len(batch),
		"reports": batch,
	}

	data, err := json.Marshal(batchMsg)
	if err == nil {
		c.wsHub.Broadcast(data)
	}

	for _, report := range batch {
		select {
		case c.statusCh <- report:
		default:
		}
	}

	if len(batch) > 1 {
		log.Printf("[Collector] Flushed batch of %d status reports", len(batch))
	}
}

func (c *Collector) GetDeviceStatus(deviceID string) (*model.DeviceStatusReport, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	report, ok := c.statusMap[deviceID]
	if !ok {
		return nil, ErrStatusNotFound
	}
	return report, nil
}

func (c *Collector) GetAllStatus() []*model.DeviceStatusReport {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*model.DeviceStatusReport, 0, len(c.statusMap))
	for _, report := range c.statusMap {
		result = append(result, report)
	}
	return result
}

func (c *Collector) Aggregate() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var total, online, offline, errorCount int64
	metrics := make(map[string]float64)

	for _, report := range c.statusMap {
		total++
		switch report.Status {
		case model.DeviceStatusOnline:
			online++
		case model.DeviceStatusOffline:
			offline++
		case model.DeviceStatusError:
			errorCount++
		}

		for k, v := range report.Metrics {
			metrics[k+"_sum"] += v
		}
	}

	result := map[string]interface{}{
		"total_devices":  total,
		"online_devices": online,
		"offline_devices": offline,
		"error_devices":  errorCount,
		"metrics":        metrics,
	}

	if total > 0 {
		for k, v := range metrics {
			metrics[k+"_avg"] = v / float64(total)
		}
	}

	return result
}

var ErrStatusNotFound = &StatusNotFoundError{}

type StatusNotFoundError struct{}

func (e *StatusNotFoundError) Error() string {
	return "device status not found"
}

func (c *Collector) alertLoop() {
	for {
		select {
		case <-c.stopCh:
			return
		case alert := <-c.alertCh:
			log.Printf("[Alert] %s: %s", alert.Level, alert.Message)
		}
	}
}
