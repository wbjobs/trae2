#!/bin/bash

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
VENV_DIR="$PROJECT_DIR/venv"

echo "=========================================="
echo "启动文档AI服务"
echo "=========================================="

if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    echo "已激活虚拟环境"
fi

cd "$PROJECT_DIR"

echo "启动服务..."
python main.py
