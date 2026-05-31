package driver

import (
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"icc-server/internal/model"
)

type InstrumentDriver struct {
	protocol    string
	connections map[string]*InstrumentConnection
	mu          sync.RWMutex
}

type InstrumentConnection struct {
	DeviceID  string
	Address   string
	Port      int
	Connected bool
	LastRead  time.Time
	Channels  map[string]float64
	Mode      string
}

func NewInstrumentDriver(protocol string) *InstrumentDriver {
	return &InstrumentDriver{
		protocol:    protocol,
		connections: make(map[string]*InstrumentConnection),
	}
}

func (d *InstrumentDriver) Connect(device model.Device) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	conn := &InstrumentConnection{
		DeviceID:  device.ID,
		Address:   device.Address,
		Port:      device.Port,
		Connected: true,
		LastRead:  time.Now(),
		Channels:  make(map[string]float64),
		Mode:      "normal",
	}
	d.connections[device.ID] = conn

	log.Printf("[Instrument] Connected to %s at %s:%d via %s", device.Name, device.Address, device.Port, d.protocol)
	return nil
}

func (d *InstrumentDriver) Disconnect(deviceID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.connections, deviceID)
	log.Printf("[Instrument] Disconnected device %s", deviceID)
	return nil
}

func (d *InstrumentDriver) SendCommand(deviceID string, action string, params map[string]interface{}) (interface{}, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok || !conn.Connected {
		return nil, fmt.Errorf("instrument device %s not connected", deviceID)
	}

	switch action {
	case "read_channel":
		ch, ok := params["channel"].(string)
		if !ok {
			return nil, fmt.Errorf("missing channel parameter")
		}
		value, exists := conn.Channels[ch]
		if !exists {
			return nil, fmt.Errorf("channel %s not found", ch)
		}
		conn.LastRead = time.Now()
		return map[string]interface{}{"channel": ch, "value": value}, nil

	case "set_mode":
		mode, ok := params["mode"].(string)
		if !ok {
			return nil, fmt.Errorf("missing mode parameter")
		}
		conn.Mode = mode
		log.Printf("[Instrument] Set mode: device=%s, mode=%s", deviceID, mode)
		return map[string]interface{}{"mode": mode}, nil

	case "zero_calibrate":
		ch, ok := params["channel"].(string)
		if !ok {
			return nil, fmt.Errorf("missing channel parameter")
		}
		conn.Channels[ch] = 0.0
		log.Printf("[Instrument] Zero calibrate: device=%s, channel=%s", deviceID, ch)
		return map[string]interface{}{"channel": ch, "status": "zeroed"}, nil

	case "range_set":
		ch, ok1 := params["channel"].(string)
		minVal, ok2 := params["min"].(float64)
		maxVal, ok3 := params["max"].(float64)
		if !ok1 || !ok2 || !ok3 {
			return nil, fmt.Errorf("missing channel, min or max parameter")
		}
		log.Printf("[Instrument] Range set: device=%s, channel=%s, min=%.2f, max=%.2f", deviceID, ch, minVal, maxVal)
		return map[string]interface{}{"channel": ch, "min": minVal, "max": maxVal}, nil

	case "start":
		log.Printf("[Instrument] Start command sent to device %s", deviceID)
		return map[string]interface{}{"status": "started"}, nil

	case "stop":
		log.Printf("[Instrument] Stop command sent to device %s", deviceID)
		return map[string]interface{}{"status": "stopped"}, nil

	default:
		return nil, fmt.Errorf("unsupported instrument action: %s", action)
	}
}

func (d *InstrumentDriver) ReadStatus(deviceID string) (*model.DeviceStatusReport, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("instrument device %s not found", deviceID)
	}

	metrics := make(map[string]float64)
	for k, v := range conn.Channels {
		metrics[k] = v
	}
	metrics["channel_count"] = float64(len(conn.Channels))
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

func (d *InstrumentDriver) SimulateReading(deviceID string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	conn, ok := d.connections[deviceID]
	if !ok || !conn.Connected {
		return
	}

	conn.Channels["voltage_ch1"] = 220.0 + rand.Float64()*10.0 - 5.0
	conn.Channels["current_ch1"] = 5.0 + rand.Float64()*2.0
	conn.Channels["power_ch1"] = conn.Channels["voltage_ch1"] * conn.Channels["current_ch1"]
	conn.Channels["frequency"] = 50.0 + rand.Float64()*0.5
	conn.LastRead = time.Now()
}

func (d *InstrumentDriver) IsConnected(deviceID string) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	conn, ok := d.connections[deviceID]
	return ok && conn.Connected
}

func (d *InstrumentDriver) SupportedProtocol() string {
	return d.protocol
}
