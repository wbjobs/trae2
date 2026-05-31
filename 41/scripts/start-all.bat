@echo off
echo ========================================
echo 光伏监测系统 - 启动所有服务
echo ========================================

echo [1/6] 启动 MQTT Broker...
start "MQTT Broker" cmd /k "docker run -p 1883:1883 -p 9001:9001 -v %cd%/mqtt/config:/mosquitto/config eclipse-mosquitto:2.0"
timeout /t 3 /nobreak >nul

echo [2/6] 启动数据采集网关...
start "Gateway Service" cmd /k "cd gateway && pip install -r requirements.txt && python main.py"
timeout /t 2 /nobreak >nul

echo [3/6] 启动数据分析服务...
start "Analysis Service" cmd /k "cd analysis && pip install -r requirements.txt && python main.py"
timeout /t 2 /nobreak >nul

echo [4/6] 启动指令下发服务...
start "Command Service" cmd /k "cd command && pip install -r requirements.txt && python main.py"
timeout /t 2 /nobreak >nul

echo [5/6] 启动告警推送服务...
start "Alert Service" cmd /k "cd alert && pip install -r requirements.txt && python main.py"
timeout /t 2 /nobreak >nul

echo [6/6] 启动前端面板...
start "Frontend" cmd /k "cd frontend && npm install && npm start"

echo ========================================
echo 所有服务启动中...
echo 访问地址: http://localhost:3000
echo 网关API: http://localhost:8000/docs
echo 分析API: http://localhost:8001/docs
echo 指令API: http://localhost:8002/docs
echo 告警API: http://localhost:8003/docs
echo ========================================
pause
