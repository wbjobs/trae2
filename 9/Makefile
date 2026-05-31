.PHONY: deps build scheduler worker start-infra stop-infra clean test

# Install dependencies
deps:
	go mod download
	go mod tidy

# Build all binaries
build:
	go build -o bin/scheduler.exe ./cmd/scheduler
	go build -o bin/worker.exe ./cmd/worker

# Build scheduler only
build-scheduler:
	go build -o bin/scheduler.exe ./cmd/scheduler

# Build worker only
build-worker:
	go build -o bin/worker.exe ./cmd/worker

# Start infrastructure (PostgreSQL, Jaeger)
start-infra:
	docker-compose up -d

# Stop infrastructure
stop-infra:
	docker-compose down

# Start worker 1
worker1:
	go run ./cmd/worker -port 50051 -id worker-1

# Start worker 2
worker2:
	go run ./cmd/worker -port 50052 -id worker-2

# Start scheduler
scheduler:
	go run ./cmd/scheduler \
		-http-port 8080 \
		-workers "localhost:50051,localhost:50052"

# Start scheduler with Jaeger tracing
scheduler-tracing:
	go run ./cmd/scheduler \
		-http-port 8080 \
		-workers "localhost:50051,localhost:50052" \
		-jaeger "http://localhost:14268/api/traces"

# Clean build artifacts
clean:
	rm -rf bin/

# Run tests
test:
	go test ./... -v
