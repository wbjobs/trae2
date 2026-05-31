package driver

import (
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"icc-server/internal/model"
)

type SensorDriver struct {
	protocol    string
	connections map[string]*SensorConnection
	mu          sync.RWMutex
}

type SensorConnection struct {
	DeviceID  string
	Address   string
	Port      int
	Connected bool
	LastRead  time.Time
	Values    map[string]float64
}

func NewSensorDriver(protocol string) *SensorDriver {
	return &SensorDriver{
		protocol:    protocol,
		connections: make(map[string]*SensorConnection),
	}
}

func (d *SensorDriver) Connect(device model.Device) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	conn := &SensorConnection{
		DeviceID:  device.ID,
		Address:   device.Address,
		Port:      device.Port,
		Connected: true,
		LastRead:  time.Now(),
		Values:    make(map[string]float64),
	}
	d.connections[device.ID] = conn

	log.Printf("[Sensor] Connected to %s at %s:%d via %s", device.Name, device.Address, device.Port, d.protocol)
	return nil
}

func (d *SensorDriver) Disconnect(deviceID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.connections, deviceID)
	log.Printf("[Sensor] Disconnected device %s", deviceID)
	return nil
}

func (d *SensorDriver) SendCommand(deviceID string, action string, params map[string]interface{}) (interface{}, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok || !conn.Connected {
		return nil, fmt.Errorf("sensor device %s not connected", deviceID)
	}

	switch action {
	case "read_value":
		key, ok := params["key"].(string)
		if !ok {
			return nil, fmt.Errorf("missing key parameter")
		}
		value, exists := conn.Values[key]
		if !exists {
			return nil, fmt.Errorf("sensor key %s not found", key)
		}
		conn.LastRead = time.Now()
		return map[string]interface{}{"key": key, "value": value}, nil

	case "set_threshold":
		key, ok1 := params["key"].(string)
		threshold, ok2 := params["threshold"].(float64)
		if !ok1 || !ok2 {
			return nil, fmt.Errorf("missing key or threshold parameter")
		}
		log.Printf("[Sensor] Set threshold: device=%s, key=%s, threshold=%.2f", deviceID, key, threshold)
		return map[string]interface{}{"key": key, "threshold": threshold}, nil

	case "calibrate":
		log.Printf("[Sensor] Calibrate command sent to device %s", deviceID)
		return map[string]interface{}{"status": "calibrated"}, nil

	case "reset":
		log.Printf("[Sensor] Reset command sent to device %s", deviceID)
		return map[string]interface{}{"status": "reset"}, nil

	default:
		return nil, fmt.Errorf("unsupported sensor action: %s", action)
	}
}

func (d *SensorDriver) ReadStatus(deviceID string) (*model.DeviceStatusReport, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("sensor device %s not found", deviceID)
	}

	metrics := make(map[string]float64)
	for k, v := range conn.Values {
		metrics[k] = v
	}
	metrics["sensor_count"] = float64(len(conn.Values))
	metrics["uptime_seconds"] = time.Since(conn.LastRead).Seconds()

	status := model.DeviceStatusOnline
	if !conn.Connected {
		status = model.DeviceStatusOffline
	}

	return &model.DeviceStatusReport{
		DeviceID:  deviceID,
		Status:    status,
		Metrics:   metrics,
		Timestamp: time.Now(),
	}, nil
}

func (d *SensorDriver) SimulateReading(deviceID string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	conn, ok := d.connections[deviceID]
	if !ok || !conn.Connected {
		return
	}

	conn.Values["temperature"] = 20.0 + rand.Float64()*15.0
	conn.Values["humidity"] = 40.0 + rand.Float64()*30.0
	conn.Values["pressure"] = 100.0 + rand.Float64()*5.0
	conn.Values["vibration"] = rand.Float64() * 2.0
	conn.LastRead = time.Now()
}

func (d *SensorDriver) IsConnected(deviceID string) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	conn, ok := d.connections[deviceID]
	return ok && conn.Connected
}

func (d *SensorDriver) SupportedProtocol() string {
	return d.protocol
}
