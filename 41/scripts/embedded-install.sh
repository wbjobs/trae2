#!/bin/bash
echo "========================================"
echo "嵌入式 Linux 环境安装脚本"
echo "========================================"

echo "[1/5] 更新系统包..."
sudo apt-get update && sudo apt-get upgrade -y

echo "[2/5] 安装 Python 3 和依赖..."
sudo apt-get install -y python3 python3-pip python3-venv

echo "[3/5] 创建虚拟环境..."
python3 -m venv ~/pv-env
source ~/pv-env/bin/activate

echo "[4/5] 安装 Python 依赖..."
pip install --upgrade pip
pip install fastapi uvicorn paho-mqtt sqlalchemy pydantic

echo "[5/5] 配置系统服务..."
sudo tee /etc/systemd/system/pv-gateway.service > /dev/null <<EOF
[Unit]
Description=PV Gateway Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/gateway
ExecStart=$HOME/pv-env/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pv-gateway.service

echo "========================================"
echo "嵌入式环境安装完成!"
echo "启动网关服务: sudo systemctl start pv-gateway"
echo "查看状态: sudo systemctl status pv-gateway"
echo "========================================"
