#!/bin/bash
# 工业信令系统数据流测试脚本

echo "=== 工业信令系统数据流测试 ==="
echo ""

# 检查镜像转发服务
echo "1. 检查镜像转发服务健康状态..."
curl -s http://localhost:3001/api/forward/health | head -c 200
echo ""
echo ""

# 检查抓包解析服务
echo "2. 检查抓包解析服务健康状态..."
curl -s http://localhost:3002/api/capture/health | head -c 200
echo ""
echo ""

# 生成测试数据包
echo "3. 生成10个测试数据包并转发..."
curl -s "http://localhost:3002/api/capture/generate?count=10&forward=true" | head -c 500
echo ""
echo ""

# 检查队列统计
echo "4. 检查队列统计..."
curl -s http://localhost:3001/api/forward/stats | head -c 800
echo ""
echo ""

# 检查溯源检索服务
echo "5. 检查溯源检索服务健康状态..."
curl -s http://localhost:3003/api/query/health | head -c 300
echo ""
echo ""

# 检查数据入库服务
echo "6. 检查数据入库服务健康状态..."
curl -s http://localhost:3004/health | head -c 500
echo ""
echo ""

echo "=== 测试完成 ==="
echo ""
echo "📊 前端监控面板: http://localhost:5173"
echo "🐰 RabbitMQ管理面板: http://localhost:15672 (admin/admin123)"
echo "🗄️  ClickHouse: http://localhost:8123"
