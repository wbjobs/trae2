#!/bin/bash
# API接口测试脚本

echo "========================================"
echo "  API接口测试"
echo "========================================"
echo ""

GATEWAY_URL="http://localhost:5000"
ANALYSIS_URL="http://localhost:5001"
CONTROL_URL="http://localhost:5002"
ALERT_URL="http://localhost:5003"

echo "[1/8] 测试网关服务健康检查..."
curl -s "$GATEWAY_URL/api/health" | python3 -m json.tool
echo ""

echo "[2/8] 测试获取配电房列表..."
curl -s "$GATEWAY_URL/api/rooms" | python3 -m json.tool
echo ""

echo "[3/8] 测试触发数据采集..."
curl -s -X POST "$GATEWAY_URL/api/sensor/collect" | python3 -m json.tool
echo ""

echo "[4/8] 测试获取房间传感器数据..."
curl -s "$GATEWAY_URL/api/sensor/latest/room_001" | python3 -m json.tool
echo ""

echo "[5/8] 测试分析服务健康检查..."
curl -s "$ANALYSIS_URL/api/health" | python3 -m json.tool
echo ""

echo "[6/8] 测试获取阈值配置..."
curl -s "$ANALYSIS_URL/api/thresholds" | python3 -m json.tool
echo ""

echo "[7/8] 测试控制服务健康检查..."
curl -s "$CONTROL_URL/api/health" | python3 -m json.tool
echo ""

echo "[8/8] 测试告警服务健康检查..."
curl -s "$ALERT_URL/api/health" | python3 -m json.tool
echo ""

echo "========================================"
echo "  API测试完成"
echo "========================================"
