package driver

import (
	"fmt"
	"log"
	"sync"
	"time"

	"icc-server/internal/model"
)

type PLCDriver struct {
	protocol    string
	connections map[string]*PLCConnection
	mu          sync.RWMutex
}

type PLCConnection struct {
	DeviceID  string
	Address   string
	Port      int
	Connected bool
	LastRead  time.Time
	Registers map[int]uint16
}

func NewPLCDriver(protocol string) *PLCDriver {
	return &PLCDriver{
		protocol:    protocol,
		connections: make(map[string]*PLCConnection),
	}
}

func (d *PLCDriver) Connect(device model.Device) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	conn := &PLCConnection{
		DeviceID:  device.ID,
		Address:   device.Address,
		Port:      device.Port,
		Connected: true,
		LastRead:  time.Now(),
		Registers: make(map[int]uint16),
	}
	d.connections[device.ID] = conn

	log.Printf("[PLC] Connected to %s at %s:%d via %s", device.Name, device.Address, device.Port, d.protocol)
	return nil
}

func (d *PLCDriver) Disconnect(deviceID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.connections, deviceID)
	log.Printf("[PLC] Disconnected device %s", deviceID)
	return nil
}

func (d *PLCDriver) SendCommand(deviceID string, action string, params map[string]interface{}) (interface{}, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok || !conn.Connected {
		return nil, fmt.Errorf("PLC device %s not connected", deviceID)
	}

	switch action {
	case "write_register":
		addr, ok1 := params["address"].(float64)
		value, ok2 := params["value"].(float64)
		if !ok1 || !ok2 {
			return nil, fmt.Errorf("missing address or value parameter")
		}
		conn.Registers[int(addr)] = uint16(value)
		conn.LastRead = time.Now()
		log.Printf("[PLC] Write register: device=%s, addr=%d, value=%d", deviceID, int(addr), uint16(value))
		return map[string]interface{}{"address": int(addr), "value": uint16(value)}, nil

	case "read_register":
		addr, ok := params["address"].(float64)
		if !ok {
			return nil, fmt.Errorf("missing address parameter")
		}
		value, exists := conn.Registers[int(addr)]
		if !exists {
			return nil, fmt.Errorf("register %d not found", int(addr))
		}
		conn.LastRead = time.Now()
		return map[string]interface{}{"address": int(addr), "value": value}, nil

	case "start":
		log.Printf("[PLC] Start command sent to device %s", deviceID)
		return map[string]interface{}{"status": "started"}, nil

	case "stop":
		log.Printf("[PLC] Stop command sent to device %s", deviceID)
		return map[string]interface{}{"status": "stopped"}, nil

	case "reset":
		log.Printf("[PLC] Reset command sent to device %s", deviceID)
		return map[string]interface{}{"status": "reset"}, nil

	default:
		return nil, fmt.Errorf("unsupported PLC action: %s", action)
	}
}

func (d *PLCDriver) ReadStatus(deviceID string) (*model.DeviceStatusReport, error) {
	d.mu.RLock()
	conn, ok := d.connections[deviceID]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("PLC device %s not found", deviceID)
	}

	metrics := make(map[string]float64)
	metrics["register_count"] = float64(len(conn.Registers))
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

func (d *PLCDriver) IsConnected(deviceID string) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	conn, ok := d.connections[deviceID]
	return ok && conn.Connected
}

func (d *PLCDriver) SupportedProtocol() string {
	return d.protocol
}
