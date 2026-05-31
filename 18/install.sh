#!/bin/bash

set -e

echo "=========================================="
echo "文档AI系统 - 依赖安装脚本"
echo "=========================================="

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
VENV_DIR="$PROJECT_DIR/venv"

echo ""
echo "创建虚拟环境..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo "虚拟环境创建成功"
else
    echo "虚拟环境已存在"
fi

source "$VENV_DIR/bin/activate"

echo ""
echo "升级pip..."
pip install --upgrade pip setuptools wheel

echo ""
echo "安装系统依赖 (需要sudo权限)..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y \
        build-essential \
        python3-dev \
        libpq-dev \
        poppler-utils \
        libxml2-dev \
        libxslt1-dev \
        antiword
    echo "系统依赖安装完成"
elif command -v yum &> /dev/null; then
    sudo yum install -y \
        gcc \
        python3-devel \
        postgresql-devel \
        poppler-utils \
        libxml2-devel \
        libxslt-devel
    echo "系统依赖安装完成"
else
    echo "警告: 无法自动安装系统依赖，请手动安装"
fi

echo ""
echo "安装Python依赖..."
pip install -r "$PROJECT_DIR/requirements.txt"

echo ""
echo "创建必要目录..."
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/uploads"
mkdir -p "$PROJECT_DIR/models"

echo ""
echo "配置环境变量文件..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "已创建 .env 文件"
fi

echo ""
echo "=========================================="
echo "安装完成！"
echo "=========================================="
echo ""
echo "下一步操作:"
echo "1. 编辑 .env 文件配置数据库和AI参数"
echo "2. 运行 ./start.sh 启动服务"
echo "3. 或运行 ./deploy.sh 部署为系统服务"
echo ""
