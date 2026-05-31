#!/bin/bash
echo "========================================"
echo "光伏监测系统 - Docker 部署"
echo "========================================"

echo "[1/3] 构建镜像..."
docker-compose build

echo "[2/3] 启动服务..."
docker-compose up -d

echo "[3/3] 等待服务就绪..."
sleep 10

echo "========================================"
echo "服务启动完成!"
echo "访问地址: http://localhost:3000"
echo "网关API: http://localhost:8000/docs"
echo "分析API: http://localhost:8001/docs"
echo "指令API: http://localhost:8002/docs"
echo "告警API: http://localhost:8003/docs"
echo ""
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"
echo "========================================"
