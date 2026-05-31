@echo off
echo ========================================
echo 地下水文演化模拟计算系统启动脚本
echo ========================================

echo [%date% %time%] 启动 Redis 服务...
start "Redis" redis-server --port 6379

timeout /t 3 /nobreak >nul

echo [%date% %time%] 启动 InfluxDB 服务...
start "InfluxDB" influxd

timeout /t 5 /nobreak >nul

echo [%date% %time%] 启动 Celery Worker (default 队列)...
start "Celery-Default" celery -A task_scheduler.celery_app worker -Q default -n worker-default@%%h --loglevel=info -c 2

timeout /t 2 /nobreak >nul

echo [%date% %time%] 启动 Celery Worker (seepage 队列)...
start "Celery-Seepage" celery -A task_scheduler.celery_app worker -Q seepage -n worker-seepage@%%h --loglevel=info -c 1

timeout /t 2 /nobreak >nul

echo [%date% %time%] 启动 Celery Flower 监控面板...
start "Celery-Flower" celery -A task_scheduler.celery_app flower --port=5555

timeout /t 3 /nobreak >nul

echo [%date% %time%] 启动 Flask API 服务...
start "Flask-API" python main.py

echo ========================================
echo 服务启动完成!
echo API 服务: http://localhost:5000
echo Flower 监控: http://localhost:5555
echo InfluxDB UI: http://localhost:8086
echo ========================================
echo 按任意键停止所有服务...
pause >nul

echo [%date% %time%] 正在停止所有服务...
taskkill /F /FI "WINDOWTITLE eq Redis*"
taskkill /F /FI "WINDOWTITLE eq InfluxDB*"
taskkill /F /FI "WINDOWTITLE eq Celery*"
taskkill /F /FI "WINDOWTITLE eq Flask*"
echo 服务已停止
