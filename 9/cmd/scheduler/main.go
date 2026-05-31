package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	"workflow-engine/internal/handler"
	"workflow-engine/internal/scheduler"
	"workflow-engine/internal/store"
	"workflow-engine/internal/telemetry"
	"workflow-engine/internal/worker"

	"github.com/gin-gonic/gin"
)

func main() {
	httpPort := flag.Int("http-port", 8080, "HTTP API port")
	dsn := flag.String("dsn", "host=localhost port=5432 user=postgres password=postgres dbname=workflow sslmode=disable", "PostgreSQL DSN")
	workers := flag.String("workers", "localhost:50051,localhost:50052", "Comma-separated list of worker addresses")
	jaegerEndpoint := flag.String("jaeger", "", "Jaeger endpoint for tracing")
	maxParallel := flag.Int("max-parallel", 10, "Maximum parallel step executions")
	flag.Parse()

	tp, err := telemetry.InitTracer(*jaegerEndpoint)
	if err != nil {
		log.Printf("Warning: Failed to initialize tracer: %v", err)
	}
	defer func() {
		if tp != nil {
			if err := tp.Shutdown(context.Background()); err != nil {
				log.Printf("Error shutting down tracer provider: %v", err)
			}
		}
	}()

	s, err := store.NewStore(*dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to database successfully")

	workerAddrs := strings.Split(*workers, ",")
	for i, addr := range workerAddrs {
		workerAddrs[i] = strings.TrimSpace(addr)
	}

	wp, err := worker.NewWorkerPool(workerAddrs)
	if err != nil {
		log.Fatalf("Failed to create worker pool: %v", err)
	}
	defer wp.Close()
	log.Printf("Connected to %d workers", len(workerAddrs))

	sch := scheduler.NewScheduler(s, wp, *maxParallel)
	h := handler.NewHandler(s, sch)

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.Static("/web", "./web")
	r.GET("/", func(c *gin.Context) {
		c.File("./web/index.html")
	})

	api := r.Group("/api/v1")
	{
		api.POST("/workflow", h.CreateWorkflow)
		api.POST("/instance", h.StartInstance)
		api.GET("/trace/:traceID", h.GetTrace)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", *httpPort),
		Handler: r,
	}

	go func() {
		log.Printf("Scheduler HTTP API starting on port %d", *httpPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down scheduler...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Scheduler stopped")
}
