# Start Workflow Engine - Windows PowerShell Script

Write-Host "Starting Workflow Engine Infrastructure..." -ForegroundColor Green

# Start Docker containers
Write-Host "`n[1/5] Starting PostgreSQL and Jaeger..." -ForegroundColor Cyan
docker-compose up -d

# Wait for PostgreSQL to be ready
Write-Host "`n[2/5] Waiting for PostgreSQL to be ready..." -ForegroundColor Cyan
$attempts = 0
do {
    $attempts++
    try {
        $result = docker exec workflow-postgres pg_isready -U postgres
        if ($result -match "accepting connections") {
            Write-Host "PostgreSQL is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Ignore errors during startup
    }
    if ($attempts -gt 12) {
        Write-Host "Timeout waiting for PostgreSQL" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 5
} while ($true)

# Wait for Jaeger to be ready
Write-Host "`n[3/5] Waiting for Jaeger to be ready..." -ForegroundColor Cyan
$attempts = 0
do {
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:16686" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "Jaeger is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Ignore errors during startup
    }
    if ($attempts -gt 12) {
        Write-Host "Timeout waiting for Jaeger" -ForegroundColor Yellow
        Write-Host "Continuing without Jaeger verification..." -ForegroundColor Yellow
        break
    }
    Start-Sleep -Seconds 5
} while ($true)

# Start Worker 1 in new window
Write-Host "`n[4/5] Starting Worker 1 on port 50051..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; go run ./cmd/worker -port 50051 -id worker-1"

# Start Worker 2 in new window
Write-Host "`n[5/5] Starting Worker 2 on port 50052..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; go run ./cmd/worker -port 50052 -id worker-2"

# Wait a moment for workers to start
Start-Sleep -Seconds 3

# Start Scheduler in current window
Write-Host "`nStarting Scheduler HTTP API on port 8080..." -ForegroundColor Cyan
Write-Host "Scheduler will run in this window. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host "`nAPI Endpoints:" -ForegroundColor Green
Write-Host "  POST   http://localhost:8080/api/v1/workflow   - Create workflow" -ForegroundColor White
Write-Host "  POST   http://localhost:8080/api/v1/instance   - Start instance" -ForegroundColor White
Write-Host "  GET    http://localhost:8080/api/v1/trace/{id} - Get trace" -ForegroundColor White
Write-Host "  GET    http://localhost:8080/health            - Health check" -ForegroundColor White
Write-Host "`nJaeger UI:  http://localhost:16686" -ForegroundColor Green
Write-Host "`n"

go run ./cmd/scheduler -http-port 8080 -workers "localhost:50051,localhost:50052" -jaeger "http://localhost:14268/api/traces"
