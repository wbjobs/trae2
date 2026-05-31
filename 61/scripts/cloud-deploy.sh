#!/bin/bash
# 云端服务部署脚本 - 用于云服务器环境

echo "========================================"
echo "  云端服务部署 - 云服务器环境"
echo "========================================"
echo ""

APP_DIR="/opt/power-room-cloud"
SERVICE_DIR="/etc/systemd/system"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/data"

echo "[1/6] 复制应用文件..."
cp -r ./* "$APP_DIR/"

echo "[2/6] 安装Python依赖..."
pip3 install -r "$APP_DIR/gateway-service/requirements.txt"
pip3 install -r "$APP_DIR/electrical-analysis-service/requirements.txt"
pip3 install -r "$APP_DIR/control-service/requirements.txt"
pip3 install -r "$APP_DIR/alert-service/requirements.txt"

echo "[3/6] 构建前端..."
cd "$APP_DIR/frontend-monitoring-panel"
npm install
npm run build

echo "[4/6] 创建Systemd服务..."

create_service() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    
    cat > "$SERVICE_DIR/$service_name.service" << EOF
[Unit]
Description=$service_name Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/$service_dir
Environment=ENV=cloud
ExecStart=/usr/bin/python3 src/main.py
Restart=always
RestartSec=10
StandardOutput=append:$APP_DIR/logs/$service_name.log
StandardError=append:$APP_DIR/logs/$service_name.error.log

[Install]
WantedBy=multi-user.target
EOF
}

create_service "power-room-gateway" "gateway-service" 5000
create_service "power-room-analysis" "electrical-analysis-service" 5001
create_service "power-room-control" "control-service" 5002
create_service "power-room-alert" "alert-service" 5003

echo "[5/6] 创建Nginx配置..."
cat > /etc/nginx/conf.d/power-room.conf << EOF
server {
    listen 80;
    server_name power-room.example.com;

    location / {
        root $APP_DIR/frontend-monitoring-panel/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/gateway/ {
        proxy_pass http://localhost:5000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /api/analysis/ {
        proxy_pass http://localhost:5001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /api/control/ {
        proxy_pass http://localhost:5002/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /api/alert/ {
        proxy_pass http://localhost:5003/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

echo "[6/6] 启用并启动服务..."
systemctl daemon-reload
systemctl enable power-room-gateway
systemctl enable power-room-analysis
systemctl enable power-room-control
systemctl enable power-room-alert
systemctl start power-room-gateway
systemctl start power-room-analysis
systemctl start power-room-control
systemctl start power-room-alert

systemctl reload nginx

echo ""
echo "========================================"
echo "  云端服务部署完成!"
echo "========================================"
echo ""
echo "服务状态:"
echo "  - gateway:  systemctl status power-room-gateway"
echo "  - analysis: systemctl status power-room-analysis"
echo "  - control:  systemctl status power-room-control"
echo "  - alert:    systemctl status power-room-alert"
echo ""
echo "访问地址: http://power-room.example.com"
echo "日志目录: $APP_DIR/logs/"
echo ""
