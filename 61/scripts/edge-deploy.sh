#!/bin/bash
# 边缘节点部署脚本 - 用于嵌入式Linux环境

echo "========================================"
echo "  边缘节点部署 - 嵌入式Linux环境"
echo "========================================"
echo ""

APP_DIR="/opt/power-room-edge"
SERVICE_DIR="/etc/systemd/system"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/data"

echo "[1/4] 复制应用文件..."
cp -r ./* "$APP_DIR/"

echo "[2/4] 安装Python依赖..."
pip3 install -r "$APP_DIR/gateway-service/requirements.txt"
pip3 install -r "$APP_DIR/electrical-analysis-service/requirements.txt"

echo "[3/4] 创建Systemd服务..."

cat > "$SERVICE_DIR/power-room-gateway.service" << EOF
[Unit]
Description=Power Room Gateway Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/gateway-service
Environment=ENV=edge
ExecStart=/usr/bin/python3 src/main.py
Restart=always
RestartSec=10
StandardOutput=append:$APP_DIR/logs/gateway.log
StandardError=append:$APP_DIR/logs/gateway.error.log

[Install]
WantedBy=multi-user.target
EOF

cat > "$SERVICE_DIR/power-room-analysis.service" << EOF
[Unit]
Description=Power Room Analysis Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/electrical-analysis-service
Environment=ENV=edge
ExecStart=/usr/bin/python3 src/main.py
Restart=always
RestartSec=10
StandardOutput=append:$APP_DIR/logs/analysis.log
StandardError=append:$APP_DIR/logs/analysis.error.log

[Install]
WantedBy=multi-user.target
EOF

echo "[4/4] 启用并启动服务..."
systemctl daemon-reload
systemctl enable power-room-gateway
systemctl enable power-room-analysis
systemctl start power-room-gateway
systemctl start power-room-analysis

echo ""
echo "========================================"
echo "  边缘节点部署完成!"
echo "========================================"
echo ""
echo "服务状态:"
echo "  - gateway:  systemctl status power-room-gateway"
echo "  - analysis: systemctl status power-room-analysis"
echo ""
echo "日志目录: $APP_DIR/logs/"
echo "数据目录: $APP_DIR/data/"
echo ""
