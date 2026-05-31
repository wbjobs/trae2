#!/bin/bash

set -e

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_NAME="doc-ai-service"
VENV_DIR="$PROJECT_DIR/venv"
LOG_DIR="$PROJECT_DIR/logs"
UPLOAD_DIR="$PROJECT_DIR/uploads"
SERVICE_FILE="/etc/systemd/system/$PROJECT_NAME.service"

echo "=========================================="
echo "文档AI系统 - Linux部署脚本"
echo "=========================================="

echo ""
echo "[1/8] 检查系统环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python 3.9+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(sys.version_info[1])')
if [ "$PYTHON_VERSION" -lt 9 ]; then
    echo "错误: Python版本过低，需要3.9+，当前版本: 3.$PYTHON_VERSION"
    exit 1
fi

echo "Python版本检查通过: $(python3 --version)"

if ! command -v pip3 &> /dev/null; then
    echo "错误: 未找到pip3，请先安装pip3"
    exit 1
fi

echo ""
echo "[2/8] 创建必要目录..."
mkdir -p "$LOG_DIR"
mkdir -p "$UPLOAD_DIR"
mkdir -p "$PROJECT_DIR/models"
echo "目录创建完成"

echo ""
echo "[3/8] 创建Python虚拟环境..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo "虚拟环境创建成功: $VENV_DIR"
else
    echo "虚拟环境已存在，跳过创建"
fi

source "$VENV_DIR/bin/activate"

echo ""
echo "[4/8] 安装Python依赖..."
pip install --upgrade pip
pip install -r "$PROJECT_DIR/requirements.txt"
echo "依赖安装完成"

echo ""
echo "[5/8] 配置环境变量..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "已创建 .env 文件，请根据实际情况修改配置"
else
    echo ".env 文件已存在"
fi

echo ""
echo "[6/8] 创建Systemd服务文件..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Document AI Service - 文档语义抽取与智能归类系统
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/python $PROJECT_DIR/main.py
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/service.log
StandardError=append:$LOG_DIR/error.log

[Install]
WantedBy=multi-user.target
EOF

echo "服务文件创建完成: $SERVICE_FILE"

echo ""
echo "[7/8] 配置日志轮转..."
sudo tee "/etc/logrotate.d/$PROJECT_NAME" > /dev/null <<EOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 $(whoami) $(whoami)
}
EOF
echo "日志轮转配置完成"

echo ""
echo "[8/8] 启动服务..."
sudo systemctl daemon-reload
sudo systemctl enable "$PROJECT_NAME"
sudo systemctl start "$PROJECT_NAME"

sleep 2

if systemctl is-active --quiet "$PROJECT_NAME"; then
    echo "服务启动成功!"
    echo ""
    echo "=========================================="
    echo "部署完成！"
    echo "=========================================="
    echo ""
    echo "服务管理命令:"
    echo "  查看状态: sudo systemctl status $PROJECT_NAME"
    echo "  启动服务: sudo systemctl start $PROJECT_NAME"
    echo "  停止服务: sudo systemctl stop $PROJECT_NAME"
    echo "  重启服务: sudo systemctl restart $PROJECT_NAME"
    echo "  查看日志: sudo journalctl -u $PROJECT_NAME -f"
    echo ""
    echo "访问地址:"
    echo "  API文档: http://localhost:8000/docs"
    echo "  健康检查: http://localhost:8000/api/v1/health"
    echo ""
    echo "请编辑 .env 文件配置数据库和AI服务参数"
else
    echo "服务启动失败，请检查日志: $LOG_DIR/error.log"
    exit 1
fi
