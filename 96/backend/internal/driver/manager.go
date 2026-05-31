package driver

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"icc-server/internal/model"
)

const (
	defaultConnectRetries = 3
	defaultRetryInterval  = 500 * time.Millisecond
)

type Manager struct {
	drivers  map[string]Driver
	devices  map[string]model.Device
	connState map[string]bool
	mu       sync.RWMutex
}

func NewManager() *Manager {
	m := &Manager{
		drivers:   make(map[string]Driver),
		devices:   make(map[string]model.Device),
		connState: make(map[string]bool),
	}

	m.registerBuiltinDrivers()
	return m
}

func (m *Manager) registerBuiltinDrivers() {
	m.drivers["modbus-tcp"] = NewPLCDriver("modbus-tcp")
	m.drivers["modbus-rtu"] = NewPLCDriver("modbus-rtu")
	m.drivers["mqtt"] = NewSensorDriver("mqtt")
	m.drivers["opc-ua"] = NewInstrumentDriver("opc-ua")
	log.Println("[Driver] Built-in drivers registered: modbus-tcp, modbus-rtu, mqtt, opc-ua")
}

func (m *Manager) RegisterDriver(name string, d Driver) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.drivers[name] = d
	log.Printf("[Driver] Custom driver registered: %s", name)
}

func (m *Manager) RegisterDevice(dev model.Device) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.devices[dev.ID]; exists {
		return fmt.Errorf("device %s already exists", dev.ID)
	}

	protocol := normalizeProtocol(dev.Protocol)
	drv, ok := m.drivers[protocol]
	if !ok {
		var available []string
		for p := range m.drivers {
			available = append(available, p)
		}
		return fmt.Errorf("no driver for protocol: %s (available: %v)", protocol, available)
	}

	var lastErr error
	for attempt := 0; attempt < defaultConnectRetries; attempt++ {
		if err := drv.Connect(dev); err != nil {
			lastErr = err
			log.Printf("[Driver] Connect attempt %d/%d failed for device %s: %v",
				attempt+1, defaultConnectRetries, dev.Name, err)
			time.Sleep(defaultRetryInterval)
			continue
		}

		m.devices[dev.ID] = dev
		m.connState[dev.ID] = true
		dev.Status = model.DeviceStatusOnline
		m.devices[dev.ID] = dev

		log.Printf("[Driver] Device registered: %s (%s/%s)", dev.Name, dev.Type, protocol)
		return nil
	}

	dev.Status = model.DeviceStatusError
	m.devices[dev.ID] = dev
	m.connState[dev.ID] = false

	log.Printf("[Driver] Device registration failed after %d attempts: %s, error: %v",
		defaultConnectRetries, dev.Name, lastErr)
	return fmt.Errorf("connect failed after %d attempts: %w", defaultConnectRetries, lastErr)
}

func (m *Manager) GetDevice(id string) (model.Device, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	dev, ok := m.devices[id]
	if !ok {
		return model.Device{}, fmt.Errorf("device %s not found", id)
	}
	return dev, nil
}

func (m *Manager) UpdateDevice(dev model.Device) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.devices[dev.ID]; !ok {
		return fmt.Errorf("device %s not found", dev.ID)
	}
	m.devices[dev.ID] = dev
	return nil
}

func (m *Manager) RemoveDevice(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	dev, ok := m.devices[id]
	if !ok {
		return fmt.Errorf("device %s not found", id)
	}

	if drv, exists := m.drivers[dev.Protocol]; exists {
		drv.Disconnect(id)
	}

	delete(m.devices, id)
	delete(m.connState, id)
	log.Printf("[Driver] Device removed: %s", dev.Name)
	return nil
}

func (m *Manager) ListDevices() []model.Device {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]model.Device, 0, len(m.devices))
	for _, dev := range m.devices {
		result = append(result, dev)
	}
	return result
}

func (m *Manager) SendCommand(deviceID string, action string, params map[string]interface{}) (interface{}, error) {
	m.mu.RLock()
	dev, ok := m.devices[deviceID]
	if !ok {
		m.mu.RUnlock()
		return nil, fmt.Errorf("device %s not found", deviceID)
	}
	drv, ok := m.drivers[normalizeProtocol(dev.Protocol)]
	if !ok {
		m.mu.RUnlock()
		return nil, fmt.Errorf("no driver for protocol %s", dev.Protocol)
	}
	m.mu.RUnlock()

	return drv.SendCommand(deviceID, action, params)
}

func (m *Manager) ReadStatus(deviceID string) (*model.DeviceStatusReport, error) {
	m.mu.RLock()
	dev, ok := m.devices[deviceID]
	if !ok {
		m.mu.RUnlock()
		return nil, fmt.Errorf("device %s not found", deviceID)
	}
	drv, ok := m.drivers[normalizeProtocol(dev.Protocol)]
	if !ok {
		m.mu.RUnlock()
		return nil, fmt.Errorf("no driver for protocol %s", dev.Protocol)
	}
	m.mu.RUnlock()

	return drv.ReadStatus(deviceID)
}

func (m *Manager) ApplyTemplate(deviceID string, params map[string]string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	dev, ok := m.devices[deviceID]
	if !ok {
		return fmt.Errorf("device %s not found", deviceID)
	}

	if dev.Params == nil {
		dev.Params = make(map[string]string)
	}
	for k, v := range params {
		dev.Params[k] = v
	}
	dev.UpdatedAt = time.Now()
	m.devices[deviceID] = dev

	log.Printf("[Driver] Template applied to device %s, %d params updated", deviceID, len(params))
	return nil
}

func normalizeProtocol(protocol string) string {
	protocol = strings.TrimSpace(protocol)
	protocol = strings.ToLower(protocol)
	protocol = strings.ReplaceAll(protocol, "_", "-")
	protocol = strings.ReplaceAll(protocol, " ", "")

	switch protocol {
	case "modbustcp":
		return "modbus-tcp"
	case "modbusrtu":
		return "modbus-rtu"
	case "opcua", "opc_ua":
		return "opc-ua"
	}
	return protocol
}
