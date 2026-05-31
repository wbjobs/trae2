# 智能配电房系统 - Windows启动脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  智能配电房多维度感知与远程联动控制系统" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

Write-Host "项目根目录: $projectRoot" -ForegroundColor Gray
Write-Host ""

Write-Host "[1/5] 启动感知数据网关服务..." -ForegroundColor Yellow
Set-Location "$projectRoot\gateway-service"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python src/main.py" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host "[2/5] 启动电气参数分析服务..." -ForegroundColor Yellow
Set-Location "$projectRoot\electrical-analysis-service"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python src/main.py" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[3/5] 启动联动控制服务..." -ForegroundColor Yellow
Set-Location "$projectRoot\control-service"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python src/main.py" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[4/5] 启动告警推送服务..." -ForegroundColor Yellow
Set-Location "$projectRoot\alert-service"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python src/main.py" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[5/5] 启动前端监控面板..." -ForegroundColor Yellow
Set-Location "$projectRoot\frontend-monitoring-panel"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  所有服务启动完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "服务地址:" -ForegroundColor Cyan
Write-Host "  - 前端面板:     http://localhost:3000" -ForegroundColor White
Write-Host "  - 网关服务API:  http://localhost:5000" -ForegroundColor White
Write-Host "  - 分析服务API:  http://localhost:5001" -ForegroundColor White
Write-Host "  - 控制服务API:  http://localhost:5002" -ForegroundColor White
Write-Host "  - 告警服务API:  http://localhost:5003" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止所有服务" -ForegroundColor Gray
Write-Host ""

Set-Location $projectRoot
