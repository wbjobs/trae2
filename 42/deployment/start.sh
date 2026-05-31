#!/bin/bash

echo "========================================"
echo " 轨道交通车载通信信道监控系统 - 启动脚本"
echo "========================================"
echo ""

echo "[1/3] 安装后端依赖..."
cd "$(dirname "$0")/.."
npm install --no-audit --no-fund
if [ $? -ne 0 ]; then
    echo "后端依赖安装失败"
    exit 1
fi

echo ""
echo "[2/3] 安装前端依赖..."
cd frontend
npm install --no-audit --no-fund
if [ $? -ne 0 ]; then
    echo "前端依赖安装失败"
    exit 1
fi
cd ..

echo ""
echo "[3/3] 启动服务..."
echo ""
echo "后端服务将在 http://localhost:3000 启动"
echo "前端服务将在 http://localhost:8080 启动"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

npx concurrently \
  --names "BACKEND,FRONTEND" \
  --prefix-colors "blue.bold,green.bold" \
  "npm start" \
  "cd frontend && npm run dev"
