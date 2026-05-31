package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	workflowpb "workflow-engine/api/proto"
	"workflow-engine/internal/telemetry"
	"workflow-engine/internal/worker"

	"github.com/google/uuid"
	"google.golang.org/grpc"
)

func main() {
	port := flag.Int("port", 50051, "Worker gRPC port")
	jaegerEndpoint := flag.String("jaeger", "", "Jaeger endpoint for tracing")
	workerID := flag.String("id", uuid.New().String(), "Worker ID")
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

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	workerServer := worker.NewWorkerServer(*workerID)
	workflowpb.RegisterWorkerServiceServer(grpcServer, workerServer)

	go func() {
		log.Printf("Worker %s starting on port %d", *workerID, *port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down worker...")
	grpcServer.GracefulStop()
	log.Println("Worker stopped")
}
