# 工业信令系统数据流测试脚本 (Windows PowerShell)

Write-Host "=== 工业信令系统数据流测试 ===" -ForegroundColor Cyan
Write-Host ""

# 检查镜像转发服务
Write-Host "1. 检查镜像转发服务健康状态..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/forward/health" -TimeoutSec 5
    Write-Host "   状态: $($response.data.status)" -ForegroundColor Green
} catch {
    Write-Host "   状态: 离线或错误" -ForegroundColor Red
}
Write-Host ""

# 检查抓包解析服务
Write-Host "2. 检查抓包解析服务健康状态..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3002/api/capture/health" -TimeoutSec 5
    Write-Host "   状态: $($response.data.status)" -ForegroundColor Green
    Write-Host "   活跃捕获: $($response.data.activeCaptures)" -ForegroundColor Gray
} catch {
    Write-Host "   状态: 离线或错误" -ForegroundColor Red
}
Write-Host ""

# 生成测试数据包
Write-Host "3. 生成10个测试数据包并转发..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3002/api/capture/generate?count=10&forward=true" -TimeoutSec 10
    Write-Host "   生成数据包: $($response.data.total)" -ForegroundColor Green
    Write-Host "   协议分布:" -ForegroundColor Gray
    $response.data.protocolStats.PSObject.Properties | ForEach-Object {
        Write-Host "     - $($_.Name): $($_.Value)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   错误: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 检查队列统计
Write-Host "4. 检查队列统计..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/forward/stats" -TimeoutSec 5
    Write-Host "   总数据包: $($response.data.packets.total)" -ForegroundColor Green
    Write-Host "   队列:" -ForegroundColor Gray
    $response.data.queues | ForEach-Object {
        Write-Host "     - $($_.queueName): $($_.messageCount) 消息" -ForegroundColor Gray
    }
} catch {
    Write-Host "   错误: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 检查溯源检索服务
Write-Host "5. 检查溯源检索服务健康状态..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3003/api/query/health" -TimeoutSec 5
    Write-Host "   状态: $($response.data.status)" -ForegroundColor Green
    Write-Host "   ClickHouse: $($response.data.services.clickhouse)" -ForegroundColor Gray
} catch {
    Write-Host "   状态: 离线或错误" -ForegroundColor Red
}
Write-Host ""

# 检查数据入库服务
Write-Host "6. 检查数据入库服务健康状态..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3004/health" -TimeoutSec 5
    Write-Host "   状态: $($response.status)" -ForegroundColor Green
    Write-Host "   RabbitMQ: $($response.services.rabbitmq)" -ForegroundColor Gray
    Write-Host "   ClickHouse: $($response.services.clickhouse)" -ForegroundColor Gray
} catch {
    Write-Host "   状态: 离线或错误" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== 测试完成 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 前端监控面板: http://localhost:5173" -ForegroundColor Cyan
Write-Host "🐰 RabbitMQ管理面板: http://localhost:15672 (admin/admin123)" -ForegroundColor Cyan
Write-Host "🗄️  ClickHouse: http://localhost:8123" -ForegroundColor Cyan
