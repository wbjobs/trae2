#!/bin/bash
echo "============================================"
echo "   工业边缘网关 - 启动脚本"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "[1/2] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未检测到 Python3，请先安装 Python 3.8+"
    exit 1
fi

echo "[2/2] 启动网关服务..."
echo ""

if [ "$1" = "cloud" ]; then
    echo "启动云端模式..."
    python3 -m scripts.gateway_main config/cloud_config.json
else
    echo "启动边缘模式..."
    python3 -m scripts.gateway_main config/gateway_config.json
fi