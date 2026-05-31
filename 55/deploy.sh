#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_HOME=$(cd "$(dirname "$0")" && pwd)
APP_NAME="fault-analysis-service"
APP_PORT=8080

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  工业设备故障智能研判AI服务系统 - 部署脚本${NC}"
echo -e "${GREEN}============================================${NC}"

check_python() {
    echo -e "${YELLOW}[1/5] 检查Python环境...${NC}"
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version 2>&1)
        echo -e "${GREEN}Python已安装: $PYTHON_VERSION${NC}"
    else
        echo -e "${RED}错误: Python3未安装，请先安装Python 3.8+${NC}"
        exit 1
    fi
}

create_venv() {
    echo -e "${YELLOW}[2/5] 创建虚拟环境...${NC}"
    cd "$APP_HOME"

    if [ -d "venv" ]; then
        echo -e "${GREEN}虚拟环境已存在${NC}"
    else
        python3 -m venv venv
        echo -e "${GREEN}虚拟环境创建成功${NC}"
    fi

    source venv/bin/activate
}

install_deps() {
    echo -e "${YELLOW}[3/5] 安装依赖...${NC}"
    cd "$APP_HOME"
    source venv/bin/activate

    pip install --upgrade pip
    pip install -r requirements.txt
    echo -e "${GREEN}依赖安装完成${NC}"
}

create_dirs() {
    echo -e "${YELLOW}[4/5] 创建目录结构...${NC}"
    cd "$APP_HOME"
    mkdir -p logs data models
    echo -e "${GREEN}目录创建完成${NC}"
}

start_service() {
    echo -e "${YELLOW}[5/5] 启动服务...${NC}"
    cd "$APP_HOME"
    source venv/bin/activate

    if pgrep -f "main.py" > /dev/null; then
        echo -e "${YELLOW}服务已在运行中，正在重启...${NC}"
        pkill -f "main.py"
        sleep 2
    fi

    nohup python main.py > logs/stdout.log 2>&1 &
    PID=$!
    echo $PID > app.pid

    sleep 3

    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}服务启动成功! PID: $PID${NC}"
        echo -e "${GREEN}服务地址: http://localhost:$APP_PORT${NC}"
        echo -e "${GREEN}API文档: http://localhost:$APP_PORT/docs${NC}"
        echo -e "${GREEN}健康检查: http://localhost:$APP_PORT/health${NC}"
    else
        echo -e "${RED}服务启动失败，请查看日志: logs/stdout.log${NC}"
        exit 1
    fi
}

stop_service() {
    echo -e "${YELLOW}停止服务...${NC}"
    cd "$APP_HOME"

    if [ -f app.pid ]; then
        PID=$(cat app.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            rm -f app.pid
            echo -e "${GREEN}服务已停止 (PID: $PID)${NC}"
        else
            echo -e "${YELLOW}服务未在运行${NC}"
            rm -f app.pid
        fi
    else
        if pgrep -f "main.py" > /dev/null; then
            pkill -f "main.py"
            echo -e "${GREEN}服务已停止${NC}"
        else
            echo -e "${YELLOW}服务未在运行${NC}"
        fi
    fi
}

status_service() {
    echo -e "${YELLOW}服务状态检查...${NC}"
    if pgrep -f "main.py" > /dev/null; then
        PID=$(pgrep -f "main.py")
        echo -e "${GREEN}服务正在运行 (PID: $PID)${NC}"
        if command -v curl &> /dev/null; then
            HEALTH=$(curl -s http://localhost:$APP_PORT/health 2>/dev/null || echo "{}")
            echo -e "${GREEN}健康检查: $HEALTH${NC}"
        fi
    else
        echo -e "${YELLOW}服务未运行${NC}"
    fi
}

case "$1" in
    start)
        check_python
        create_venv
        install_deps
        create_dirs
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        sleep 2
        check_python
        create_venv
        install_deps
        create_dirs
        start_service
        ;;
    status)
        status_service
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        echo ""
        echo "  start   - 启动服务（包含环境检查和依赖安装）"
        echo "  stop    - 停止服务"
        echo "  restart - 重启服务"
        echo "  status  - 查看服务状态"
        exit 1
        ;;
esac