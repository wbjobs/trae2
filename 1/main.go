package main

import (
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

const (
	DefaultDataBufferSize = 10000
	DefaultWorkerCount    = 4
	DefaultMetricsInterval = 30 * time.Second
)

type EdgeGateway struct {
	config          *GatewayConfig
	dbOperator      *DBOperator
	mqttClient      *MQTTClient
	messageQueue    *MessageQueue
	modbusCollector *ModbusCollector
	opcuaCollector  *OPUACollector
	
	workerCount     int
	wg              sync.WaitGroup
	doneChan        chan struct{}
	
	metricsTicker   *time.Ticker
}

func NewEdgeGateway(cfg *GatewayConfig) (*EdgeGateway, error) {
	gw := &EdgeGateway{
		config:      cfg,
		workerCount: DefaultWorkerCount,
		doneChan:    make(chan struct{}),
	}

	var err error
	gw.dbOperator, err = NewDBOperator(cfg)
	if err != nil {
		log.Printf("Warning: init database failed: %v", err)
	}

	gw.mqttClient, err = NewMQTTClient(cfg)
	if err != nil {
		log.Printf("Warning: init mqtt client failed: %v", err)
	}

	gw.messageQueue = NewMessageQueue(cfg)
	gw.registerMessageHandlers()

	if cfg.Modbus.Enabled {
		gw.modbusCollector, err = NewModbusCollector(cfg)
		if err != nil {
			log.Printf("Warning: init modbus collector failed: %v", err)
		}
	}

	if cfg.OPCUA.Enabled {
		gw.opcuaCollector, err = NewOPUACollector(cfg)
		if err != nil {
			log.Printf("Warning: init opcua collector failed: %v", err)
		}
	}

	return gw, nil
}

func (g *EdgeGateway) registerMessageHandlers() {
	g.messageQueue.RegisterHandler(MessageTypeInfluxDB, g.handleInfluxDBMessage)
	g.messageQueue.RegisterHandler(MessageTypeMQTT, g.handleMQTTMessage)
	g.messageQueue.RegisterHandler(MessageTypeMySQLStatus, g.handleMySQLStatusMessage)
	
	log.Println("Message handlers registered")
}

func (g *EdgeGateway) handleInfluxDBMessage(msg *Message) error {
	if g.dbOperator == nil {
		return nil
	}
	return g.dbOperator.WriteTimeSeries(msg.Data)
}

func (g *EdgeGateway) handleMQTTMessage(msg *Message) error {
	if g.mqttClient == nil {
		return nil
	}
	return g.mqttClient.Publish(msg.Data)
}

func (g *EdgeGateway) handleMySQLStatusMessage(msg *Message) error {
	if g.dbOperator == nil {
		return nil
	}
	return g.dbOperator.UpdateDeviceStatus(msg.Data.DeviceID, "online")
}

func (g *EdgeGateway) Start() error {
	log.Println("Starting Edge Gateway...")

	if g.mqttClient != nil {
		if err := g.mqttClient.Connect(); err != nil {
			log.Printf("Warning: mqtt connect failed: %v", err)
		}
	}

	g.messageQueue.Start()

	if g.modbusCollector != nil {
		g.modbusCollector.SetDataCallback(g.onDataReceived)
		if err := g.modbusCollector.Start(); err != nil {
			log.Printf("Warning: modbus collector start failed: %v", err)
		}
	}

	if g.opcuaCollector != nil {
		g.opcuaCollector.SetDataCallback(g.onDataReceived)
		if err := g.opcuaCollector.Start(); err != nil {
			log.Printf("Warning: opcua collector start failed: %v", err)
		}
	}

	g.wg.Add(1)
	go g.metricsReporter()

	log.Println("Edge Gateway started successfully")
	return nil
}

func (g *EdgeGateway) onDataReceived(point *DataPoint) {
	if point == nil {
		return
	}

	if err := g.messageQueue.Enqueue(MessageTypeInfluxDB, point); err != nil {
		log.Printf("Enqueue InfluxDB message failed: %v", err)
	}

	if err := g.messageQueue.Enqueue(MessageTypeMQTT, point); err != nil {
		log.Printf("Enqueue MQTT message failed: %v", err)
	}

	if err := g.messageQueue.Enqueue(MessageTypeMySQLStatus, point); err != nil {
		log.Printf("Enqueue MySQL status message failed: %v", err)
	}
}

func (g *EdgeGateway) metricsReporter() {
	defer g.wg.Done()
	
	g.metricsTicker = time.NewTicker(DefaultMetricsInterval)
	defer g.metricsTicker.Stop()
	
	for {
		select {
		case <-g.metricsTicker.C:
			g.reportMetrics()
		case <-g.doneChan:
			return
		}
	}
}

func (g *EdgeGateway) reportMetrics() {
	mqMetrics := g.messageQueue.GetMetrics()
	mqttMetrics := g.mqttClient.GetMetrics()
	
	log.Printf("=== Gateway Metrics ===")
	log.Printf("Message Queue - Received: %d, Processed: %d, Failed: %d, DeadLetter: %d, Compensated: %d",
		mqMetrics.TotalReceived, mqMetrics.TotalProcessed, mqMetrics.TotalFailed,
		mqMetrics.TotalDeadLetter, mqMetrics.TotalCompensated)
	log.Printf("Queue Status - Pending: %d, Retry: %d, DeadLetter: %d, OfflineCache: %d",
		mqMetrics.PendingCount, mqMetrics.RetryCount, mqMetrics.DeadLetterCount, mqMetrics.OfflineCacheCount)
	log.Printf("MQTT - Published: %d, Failed: %d, Buffered: %d, BufferCount: %d",
		mqttMetrics.TotalPublished, mqttMetrics.TotalFailed, mqttMetrics.TotalBuffered, mqttMetrics.BufferCount)
}

func (g *EdgeGateway) Stop() {
	log.Println("Stopping Edge Gateway...")

	if g.modbusCollector != nil {
		if err := g.modbusCollector.Stop(); err != nil {
			log.Printf("Stop modbus collector failed: %v", err)
		}
	}

	if g.opcuaCollector != nil {
		if err := g.opcuaCollector.Stop(); err != nil {
			log.Printf("Stop opcua collector failed: %v", err)
		}
	}

	close(g.doneChan)
	
	timeout := time.After(10 * time.Second)
	done := make(chan struct{})
	go func() {
		g.wg.Wait()
		close(done)
	}()
	
	select {
	case <-done:
		log.Println("All goroutines stopped gracefully")
	case <-timeout:
		log.Println("Timeout waiting for goroutines to stop, forcing close")
	}

	g.messageQueue.Stop()

	if g.mqttClient != nil {
		g.mqttClient.Disconnect()
	}

	if g.dbOperator != nil {
		if err := g.dbOperator.Close(); err != nil {
			log.Printf("Close database failed: %v", err)
		}
	}

	log.Println("Edge Gateway stopped")
}

func (g *EdgeGateway) ReloadConfig() {
	log.Println("Reloading configuration...")
	
	if g.modbusCollector != nil {
		if err := g.modbusCollector.Stop(); err != nil {
			log.Printf("Stop modbus collector failed: %v", err)
		}
	}

	if g.opcuaCollector != nil {
		if err := g.opcuaCollector.Stop(); err != nil {
			log.Printf("Stop opcua collector failed: %v", err)
		}
	}

	var err error
	if Config.Modbus.Enabled {
		g.modbusCollector, err = NewModbusCollector(Config)
		if err != nil {
			log.Printf("Reinit modbus collector failed: %v", err)
		} else {
			g.modbusCollector.SetDataCallback(g.onDataReceived)
			if err := g.modbusCollector.Start(); err != nil {
				log.Printf("Restart modbus collector failed: %v", err)
			}
		}
	}

	if Config.OPCUA.Enabled {
		g.opcuaCollector, err = NewOPUACollector(Config)
		if err != nil {
			log.Printf("Reinit opcua collector failed: %v", err)
		} else {
			g.opcuaCollector.SetDataCallback(g.onDataReceived)
			if err := g.opcuaCollector.Start(); err != nil {
				log.Printf("Restart opcua collector failed: %v", err)
			}
		}
	}

	log.Println("Configuration reloaded")
}

func (g *EdgeGateway) GetDeadLetterMessages() []*Message {
	return g.messageQueue.GetDeadLetterMessages()
}

func (g *EdgeGateway) RetryDeadLetterMessages() int {
	return g.messageQueue.RetryDeadLetterMessages()
}

func (g *EdgeGateway) ClearDeadLetterQueue() int {
	return g.messageQueue.ClearDeadLetterQueue()
}

func main() {
	configPath := "config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Load config failed: %v", err)
	}

	gw, err := NewEdgeGateway(cfg)
	if err != nil {
		log.Fatalf("Create gateway failed: %v", err)
	}

	if err := gw.Start(); err != nil {
		log.Fatalf("Start gateway failed: %v", err)
	}

	if err := WatchConfig(gw.ReloadConfig); err != nil {
		log.Printf("Warning: config watcher start failed: %v", err)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	gw.Stop()
	log.Println("Edge Gateway shutdown complete")
}
