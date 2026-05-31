package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"icc-server/internal/api"
	"icc-server/internal/collector"
	"icc-server/internal/command"
	"icc-server/internal/driver"
	"icc-server/internal/platform"
	"icc-server/internal/template"
)

func generateSecretKey() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "default-secret-key-change-in-production"
	}
	return hex.EncodeToString(b)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[ICC] Industrial Control Peripheral Management Server starting...")

	secretKey := "icc-secret-key-2024"
	log.Printf("[ICC] API security enabled (HMAC-SHA256), key length: %d bytes", len(secretKey))

	plt := platform.Detect()
	log.Printf("[ICC] Platform: %s | OS: %s | Arch: %s", plt.Name, plt.OS, plt.Arch)

	driverMgr := driver.NewManager()
	dispatcher := command.NewDispatcher(driverMgr)
	templateMgr := template.NewManager()
	wsHub := api.NewWebSocketHub()
	collectorSvc := collector.NewCollector(driverMgr, 5*time.Second, wsHub)

	handler := api.NewHandler(driverMgr, dispatcher, collectorSvc, templateMgr, wsHub, secretKey)

	go wsHub.Run()
	go dispatcher.Start()
	go collectorSvc.Start()

	go func() {
		for report := range collectorSvc.StatusChannel() {
			data, err := json.Marshal(report)
			if err == nil {
				wsHub.Broadcast(data)
			}
		}
	}()

	server := api.NewServer(8080, handler)

	go func() {
		log.Println("[ICC] HTTP server listening on :8080")
		if err := server.Start(); err != nil {
			log.Fatalf("[ICC] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[ICC] Shutting down...")
	dispatcher.Stop()
	collectorSvc.Stop()
	log.Println("[ICC] Server stopped")
}
