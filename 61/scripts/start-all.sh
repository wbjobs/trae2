#!/bin/bash

echo "========================================"
echo "  智能配电房多维度感知与远程联动控制系统"
echo "========================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "项目根目录: $PROJECT_ROOT"
echo ""

cleanup() {
    echo ""
    echo "正在停止所有服务..."
    kill $GATEWAY_PID $ANALYSIS_PID $CONTROL_PID $ALERT_PID $FRONTEND_PID 2>/dev/null
    wait
    echo "所有服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "[1/5] 启动感知数据网关服务..."
cd "$PROJECT_ROOT/gateway-service"
python3 src/main.py &
GATEWAY_PID=$!
sleep 3

echo "[2/5] 启动电气参数分析服务..."
cd "$PROJECT_ROOT/electrical-analysis-service"
python3 src/main.py &
ANALYSIS_PID=$!
sleep 2

echo "[3/5] 启动联动控制服务..."
cd "$PROJECT_ROOT/control-service"
python3 src/main.py &
CONTROL_PID=$!
sleep 2

echo "[4/5] 启动告警推送服务..."
cd "$PROJECT_ROOT/alert-service"
python3 src/main.py &
ALERT_PID=$!
sleep 2

echo "[5/5] 启动前端监控面板..."
cd "$PROJECT_ROOT/frontend-monitoring-panel"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  所有服务启动完成!"
echo "========================================"
echo ""
echo "服务地址:"
echo "  - 前端面板:     http://localhost:3000"
echo "  - 网关服务API:  http://localhost:5000"
echo "  - 分析服务API:  http://localhost:5001"
echo "  - 控制服务API:  http://localhost:5002"
echo "  - 告警服务API:  http://localhost:5003"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

wait
