#!/bin/bash
echo "========================================"
echo "工业时序工况数据分析与可视化平台"
echo "========================================"
echo ""

echo "[1/3] Checking Python environment..."
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed or not in PATH"
    exit 1
fi
echo "Python environment OK"
echo ""

echo "[2/3] Installing dependencies..."
pip3 install -r requirements.txt
echo "Dependencies installed"
echo ""

echo "[3/3] Starting backend server..."
echo ""
echo "========================================"
echo "API Server: http://localhost:8000"
echo "API Docs:   http://localhost:8000/docs"
echo "Frontend:   http://localhost:8000/static/index.html"
echo "========================================"
echo ""
echo "Default login: admin / admin123"
echo ""

python3 -m backend.main
