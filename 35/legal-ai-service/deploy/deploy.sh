#!/bin/bash
set -e

APP_DIR="/opt/legal-ai-service"
VENV_DIR="$APP_DIR/venv"
SERVICE_USER="legalai"
SERVICE_GROUP="legalai"

echo "Starting deployment of Legal AI Service..."

if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

echo "Updating system packages..."
apt-get update -y
apt-get install -y python3 python3-venv python3-pip redis-server nginx curl

echo "Creating application directory..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/data

echo "Copying application files..."
cp -r ./* $APP_DIR/

echo "Creating service user..."
id -u $SERVICE_USER &>/dev/null || useradd -r -s /bin/false $SERVICE_USER

echo "Setting permissions..."
chown -R $SERVICE_USER:$SERVICE_GROUP $APP_DIR
chmod -R 755 $APP_DIR

echo "Creating virtual environment..."
sudo -u $SERVICE_USER python3 -m venv $VENV_DIR

echo "Installing dependencies..."
sudo -u $SERVICE_USER $VENV_DIR/bin/pip install --upgrade pip
sudo -u $SERVICE_USER $VENV_DIR/bin/pip install -r $APP_DIR/requirements.txt

echo "Installing systemd service..."
cp deploy/legal-ai-service.service /etc/systemd/system/
cp deploy/legal-ai-celery-worker.service /etc/systemd/system/

echo "Enabling and starting Redis..."
systemctl enable redis-server
systemctl start redis-server

echo "Reloading systemd..."
systemctl daemon-reload

echo "Enabling services..."
systemctl enable legal-ai-service
systemctl enable legal-ai-celery-worker

echo "Starting services..."
systemctl start legal-ai-service
systemctl start legal-ai-celery-worker

echo "Configuring Nginx..."
cp deploy/nginx.conf /etc/nginx/conf.d/legal-ai-service.conf
nginx -t
systemctl reload nginx

echo "Deployment completed!"
echo "Service is running at http://localhost:8000"
echo "Check status: systemctl status legal-ai-service"
