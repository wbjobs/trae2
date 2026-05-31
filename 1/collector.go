package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/ua"
	modbus "github.com/things-go/go-modbus"
)

type Collector interface {
	Start() error
	Stop() error
	Collect() (*DataPoint, error)
	SetDataCallback(func(*DataPoint))
}

type ModbusCollector struct {
	cfg          *ModbusConfig
	client       modbus.Client
	handler      modbus.TCPClientHandler
	callback     func(*DataPoint)
	stopChan     chan struct{}
	running      bool
	mu           sync.Mutex
	gatewayID    string
	deviceID     string
}

type OPUACollector struct {
	cfg          *OPCUAConfig
	client       *opcua.Client
	callback     func(*DataPoint)
	stopChan     chan struct{}
	running      bool
	mu           sync.Mutex
	gatewayID    string
	deviceID     string
	ctx          context.Context
	cancel       context.CancelFunc
}

func NewModbusCollector(cfg *GatewayConfig) (*ModbusCollector, error) {
	if !cfg.Modbus.Enabled {
		return nil, fmt.Errorf("modbus not enabled")
	}

	deviceID := fmt.Sprintf("modbus_%s_%d", cfg.Modbus.Address, cfg.Modbus.SlaveID)
	
	return &ModbusCollector{
		cfg:       &cfg.Modbus,
		gatewayID: cfg.GatewayID,
		deviceID:  deviceID,
		stopChan:  make(chan struct{}),
	}, nil
}

func (m *ModbusCollector) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("modbus collector already running")
	}

	addr := fmt.Sprintf("%s:%d", m.cfg.Address, m.cfg.Port)
	handler := modbus.NewTCPClientHandler(addr)
	handler.Timeout = time.Duration(m.cfg.Timeout) * time.Second
	handler.SlaveID = m.cfg.SlaveID

	client := modbus.NewClient(handler)
	m.handler = handler
	m.client = client

	if err := m.handler.Connect(); err != nil {
		return fmt.Errorf("modbus connect failed: %w", err)
	}

	m.running = true
	go m.pollLoop()

	log.Printf("Modbus collector started: %s", addr)
	return nil
}

func (m *ModbusCollector) pollLoop() {
	ticker := time.NewTicker(m.cfg.GetPollDuration())
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			point, err := m.Collect()
			if err != nil {
				log.Printf("Modbus collect failed: %v", err)
				continue
			}
			if m.callback != nil {
				m.callback(point)
			}
		case <-m.stopChan:
			log.Println("Modbus poll loop stopped")
			return
		}
	}
}

func (m *ModbusCollector) Collect() (*DataPoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running {
		return nil, fmt.Errorf("modbus collector not running")
	}

	fields := make(map[string]interface{})

	for _, reg := range m.cfg.Registers {
		var value interface{}
		var err error

		switch reg.Type {
		case "holding":
			value, err = m.readHoldingRegister(reg)
		case "input":
			value, err = m.readInputRegister(reg)
		case "coil":
			value, err = m.readCoil(reg)
		case "discrete":
			value, err = m.readDiscreteInput(reg)
		default:
			log.Printf("Unknown register type: %s", reg.Type)
			continue
		}

		if err != nil {
			log.Printf("Read register %s failed: %v", reg.Name, err)
			continue
		}

		fields[reg.Name] = value
	}

	return &DataPoint{
		GatewayID: m.gatewayID,
		DeviceID:  m.deviceID,
		Protocol:  "modbus",
		Tags: map[string]string{
			"address": m.cfg.Address,
			"slave_id": fmt.Sprintf("%d", m.cfg.SlaveID),
		},
		Fields:    fields,
		Timestamp: time.Now(),
	}, nil
}

func (m *ModbusCollector) readHoldingRegister(reg RegisterConfig) (interface{}, error) {
	results, err := m.client.ReadHoldingRegisters(reg.Address, reg.Quantity)
	if err != nil {
		return nil, err
	}
	return m.parseRegisterValue(results, reg.Quantity), nil
}

func (m *ModbusCollector) readInputRegister(reg RegisterConfig) (interface{}, error) {
	results, err := m.client.ReadInputRegisters(reg.Address, reg.Quantity)
	if err != nil {
		return nil, err
	}
	return m.parseRegisterValue(results, reg.Quantity), nil
}

func (m *ModbusCollector) readCoil(reg RegisterConfig) (interface{}, error) {
	results, err := m.client.ReadCoils(reg.Address, reg.Quantity)
	if err != nil {
		return nil, err
	}
	if len(results) > 0 {
		return results[0] == 1, nil
	}
	return nil, fmt.Errorf("no data")
}

func (m *ModbusCollector) readDiscreteInput(reg RegisterConfig) (interface{}, error) {
	results, err := m.client.ReadDiscreteInputs(reg.Address, reg.Quantity)
	if err != nil {
		return nil, err
	}
	if len(results) > 0 {
		return results[0] == 1, nil
	}
	return nil, fmt.Errorf("no data")
}

func (m *ModbusCollector) parseRegisterValue(data []byte, quantity uint16) interface{} {
	if quantity == 1 {
		return binary.BigEndian.Uint16(data)
	} else if quantity == 2 {
		bits := binary.BigEndian.Uint32(data)
		return math.Float32frombits(bits)
	} else if quantity == 4 {
		bits := binary.BigEndian.Uint64(data)
		return math.Float64frombits(bits)
	}
	return data
}

func (m *ModbusCollector) SetDataCallback(cb func(*DataPoint)) {
	m.callback = cb
}

func (m *ModbusCollector) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running {
		return nil
	}

	close(m.stopChan)
	m.handler.Close()
	m.running = false
	log.Println("Modbus collector stopped")
	return nil
}

func NewOPUACollector(cfg *GatewayConfig) (*OPUACollector, error) {
	if !cfg.OPCUA.Enabled {
		return nil, fmt.Errorf("opcua not enabled")
	}

	deviceID := fmt.Sprintf("opcua_%s", cfg.OPCUA.Endpoint)
	ctx, cancel := context.WithCancel(context.Background())

	return &OPUACollector{
		cfg:       &cfg.OPCUA,
		gatewayID: cfg.GatewayID,
		deviceID:  deviceID,
		stopChan:  make(chan struct{}),
		ctx:       ctx,
		cancel:    cancel,
	}, nil
}

func (o *OPUACollector) Start() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	if o.running {
		return fmt.Errorf("opcua collector already running")
	}

	opts := []opcua.Option{
		opcua.SecurityMode(ua.MessageSecurityModeNone),
	}

	if o.cfg.Username != "" {
		opts = append(opts, opcua.AuthUsername(o.cfg.Username, o.cfg.Password))
	}

	client, err := opcua.NewClient(o.cfg.Endpoint, opts...)
	if err != nil {
		return fmt.Errorf("create opcua client failed: %w", err)
	}

	if err := client.Connect(o.ctx); err != nil {
		return fmt.Errorf("opcua connect failed: %w", err)
	}

	o.client = client
	o.running = true
	go o.pollLoop()

	log.Printf("OPC UA collector started: %s", o.cfg.Endpoint)
	return nil
}

func (o *OPUACollector) pollLoop() {
	ticker := time.NewTicker(o.cfg.GetPollDuration())
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			point, err := o.Collect()
			if err != nil {
				log.Printf("OPC UA collect failed: %v", err)
				continue
			}
			if o.callback != nil {
				o.callback(point)
			}
		case <-o.stopChan:
			log.Println("OPC UA poll loop stopped")
			return
		}
	}
}

func (o *OPUACollector) Collect() (*DataPoint, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if !o.running {
		return nil, fmt.Errorf("opcua collector not running")
	}

	fields := make(map[string]interface{})

	nodeIDs := make([]*ua.NodeID, 0, len(o.cfg.Nodes))
	nodeMap := make(map[int]string)

	for i, node := range o.cfg.Nodes {
		nodeID, err := ua.ParseNodeID(fmt.Sprintf("ns=%d;s=%s", node.Namespace, node.NodeID))
		if err != nil {
			log.Printf("Parse node %s ID failed: %v", node.Name, err)
			continue
		}
		nodeIDs = append(nodeIDs, nodeID)
		nodeMap[i] = node.Name
	}

	if len(nodeIDs) == 0 {
		return &DataPoint{
			GatewayID: o.gatewayID,
			DeviceID:  o.deviceID,
			Protocol:  "opcua",
			Tags: map[string]string{
				"endpoint": o.cfg.Endpoint,
			},
			Fields:    fields,
			Timestamp: time.Now(),
		}, nil
	}

	readValueIDs := make([]ua.ReadValueID, len(nodeIDs))
	for i, nodeID := range nodeIDs {
		readValueIDs[i] = ua.ReadValueID{NodeID: nodeID}
	}

	req := &ua.ReadRequest{
		MaxAge:       2000,
		NodesToRead:  readValueIDs,
		TimestampsToReturn: ua.TimestampsToReturnBoth,
	}

	ctx, cancel := context.WithTimeout(o.ctx, 10*time.Second)
	defer cancel()

	resp, err := o.client.ReadWithContext(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("opcua read failed: %w", err)
	}

	for i, result := range resp.Results {
		nodeName, ok := nodeMap[i]
		if !ok {
			continue
		}

		if result.Status != ua.StatusOK {
			log.Printf("Node %s status not OK: %v", nodeName, result.Status)
			continue
		}

		if result.Value == nil {
			log.Printf("Node %s value is nil", nodeName)
			continue
		}

		value := result.Value.Value()
		if value == nil {
			log.Printf("Node %s value.Value() returned nil, type: %v", nodeName, result.Value.Type())
			continue
		}

		fields[nodeName] = o.safeConvertValue(value)
	}

	return &DataPoint{
		GatewayID: o.gatewayID,
		DeviceID:  o.deviceID,
		Protocol:  "opcua",
		Tags: map[string]string{
			"endpoint": o.cfg.Endpoint,
		},
		Fields:    fields,
		Timestamp: time.Now(),
	}, nil
}

func (o *OPUACollector) safeConvertValue(value interface{}) interface{} {
	switch v := value.(type) {
	case int8, int16, int32, int64, uint8, uint16, uint32, uint64:
		return v
	case float32, float64:
		return v
	case bool:
		return v
	case string:
		return v
	case []byte:
		return string(v)
	case time.Time:
		return v.Format(time.RFC3339)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func (o *OPUACollector) SetDataCallback(cb func(*DataPoint)) {
	o.callback = cb
}

func (o *OPUACollector) Stop() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	if !o.running {
		return nil
	}

	close(o.stopChan)
	o.cancel()
	if o.client != nil {
		o.client.Close()
	}
	o.running = false
	log.Println("OPC UA collector stopped")
	return nil
}
