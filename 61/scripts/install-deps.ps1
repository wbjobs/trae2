# 安装依赖脚本 - Windows

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装项目依赖" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

Write-Host "项目根目录: $projectRoot" -ForegroundColor Gray
Write-Host ""

Write-Host "[1/6] 安装公共模块依赖..." -ForegroundColor Yellow
python -m pip install paho-mqtt redis PyYAML requests

Write-Host "[2/6] 安装网关服务依赖..." -ForegroundColor Yellow
python -m pip install -r "$projectRoot\gateway-service\requirements.txt"

Write-Host "[3/6] 安装分析服务依赖..." -ForegroundColor Yellow
python -m pip install -r "$projectRoot\electrical-analysis-service\requirements.txt"

Write-Host "[4/6] 安装控制服务依赖..." -ForegroundColor Yellow
python -m pip install -r "$projectRoot\control-service\requirements.txt"

Write-Host "[5/6] 安装告警服务依赖..." -ForegroundColor Yellow
python -m pip install -r "$projectRoot\alert-service\requirements.txt"

Write-Host "[6/6] 安装前端依赖..." -ForegroundColor Yellow
Set-Location "$projectRoot\frontend-monitoring-panel"
npm install

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  依赖安装完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
