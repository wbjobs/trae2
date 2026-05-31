package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"binary-parser-cluster/config"
	"binary-parser-cluster/pkg/api"
	"binary-parser-cluster/pkg/database"
	"binary-parser-cluster/pkg/loadbalancer"
	"binary-parser-cluster/pkg/logger"
	"binary-parser-cluster/pkg/protocol"
)

func main() {
	configPath := flag.String("config", "./config/config.yaml", "path to config file")
	nodeID := flag.String("node", "node-1", "cluster node ID")
	port := flag.Int("port", 8080, "server port")
	flag.Parse()

	fmt.Println("========================================")
	fmt.Println("  Binary Parser Cluster Service")
	fmt.Println("========================================")
	fmt.Printf("Node ID: %s\n", *nodeID)
	fmt.Printf("Port: %d\n", *port)
	fmt.Printf("Config: %s\n", *configPath)
	fmt.Println("========================================")

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Printf("Warning: failed to load config: %v\n", err)
	}

	cfg.API.NodeID = *nodeID
	cfg.API.Port = *port

	log, err := logger.NewPacketLogger(cfg.Logger)
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}

	log.Info("service_start", nil, map[string]interface{}{
		"node_id": *nodeID,
	})

	var db *database.Database
	db, err = database.NewDatabase(cfg.Database)
	if err != nil {
		log.Warn("database connection failed, running without database", map[string]interface{}{
			"error": err.Error(),
		})
		fmt.Printf("Warning: Database connection failed: %v\n", err)
		fmt.Println("Running in standalone mode (no database persistence)")
	} else {
		log.Info("database_connected", nil, nil)
	}

	var lb loadbalancer.LoadBalancer
	if cfg.Cluster != nil && cfg.Cluster.Enabled {
		switch cfg.Cluster.Strategy {
		case "weighted_round_robin":
			lb = loadbalancer.NewWeightedRoundRobin()
		case "least_connections":
			lb = loadbalancer.NewLeastConnections()
		default:
			lb = loadbalancer.NewRoundRobin()
		}

		if db != nil {
			nodes, _ := db.GetActiveNodes()
			for _, node := range nodes {
				lb.AddBackend(&loadbalancer.Backend{
					ID:      node.ID,
					Address: node.Address,
					Weight:  1,
					Healthy: true,
				})
			}
		}

		lb.AddBackend(&loadbalancer.Backend{
			ID:        *nodeID,
			Address:   fmt.Sprintf("http://localhost:%d", *port),
			Weight:    1,
			Healthy:   true,
		})
	} else {
		lb = loadbalancer.NewRoundRobin()
		lb.AddBackend(&loadbalancer.Backend{
			ID:        *nodeID,
			Address:   fmt.Sprintf("http://localhost:%d", *port),
			Weight:    1,
			Healthy:   true,
		})
	}

	server := api.NewAPIServer(cfg.API, db, log, lb)

	dynamicParser, err := protocol.NewDynamicProtocolParser("./config/protocols.json")
	if err != nil {
		log.Warn("dynamic parser init failed", map[string]interface{}{"error": err.Error()})
	} else {
		server.SetDynamicParser(dynamicParser)
		log.Info("dynamic_parser_initialized", nil, nil)
	}

	stopHealthCheck := make(chan struct{})
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				lb.HealthCheck()
				if dynamicParser != nil {
					dynamicParser.ReloadIfModified()
				}
			case <-stopHealthCheck:
				return
			}
		}
	}()

	go func() {
		if err := server.Start(); err != nil {
			log.Fatal("server failed to start", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	close(stopHealthCheck)

	server.Stop()
	log.Info("service_stop", nil, nil)

	if db != nil {
		db.Close()
	}

	fmt.Println("Server stopped")
}
