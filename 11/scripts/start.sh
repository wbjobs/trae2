#!/bin/bash

echo "============================================"
echo "  日志溯源平台 - Linux/Mac 启动脚本"
echo "============================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

check_node() {
    if ! command -v node &> /dev/null; then
        echo "错误: 未检测到 Node.js"
        echo "请安装 Node.js 18+: https://nodejs.org/"
        exit 1
    fi
    echo "✓ Node.js 版本: $(node --version)"
}

check_npm() {
    if ! command -v npm &> /dev/null; then
        echo "错误: 未检测到 npm"
        exit 1
    fi
    echo "✓ npm 版本: $(npm --version)"
}

install_dependencies() {
    echo ""
    echo "📦 正在检查依赖..."

    if [ ! -d "node_modules" ]; then
        echo "安装根目录依赖..."
        npm install
    fi

    for dir in frontend gateway collector storage; do
        if [ -d "$dir" ]; then
            cd "$dir"
            if [ ! -d "node_modules" ]; then
                echo "安装 $dir 依赖..."
                npm install
            fi
            cd "$PROJECT_DIR"
        fi
    done

    echo "✓ 依赖检查完成"
}

start_services() {
    echo ""
    echo "🚀 启动服务..."

    if command -v tmux &> /dev/null; then
        tmux new-session -d -s log_platform "cd $PROJECT_DIR/storage && npm run dev"
        tmux split-window -h "cd $PROJECT_DIR/collector && npm run dev"
        tmux split-window -v "cd $PROJECT_DIR/gateway && npm run dev"
        tmux select-layout even-vertical
        echo "✓ 后端服务已在 tmux 会话中启动"
        echo "  使用 'tmux attach -t log_platform' 查看日志"
    else
        echo "启动存储服务 (端口: 8082)..."
        cd "$PROJECT_DIR/storage" && npm run dev &
        STORAGE_PID=$!

        echo "启动采集服务 (端口: 8081)..."
        cd "$PROJECT_DIR/collector" && npm run dev &
        COLLECTOR_PID=$!

        echo "启动网关服务 (端口: 8080)..."
        cd "$PROJECT_DIR/gateway" && npm run dev &
        GATEWAY_PID=$!

        echo ""
        echo "✓ 后端服务已启动"
        echo "  存储服务 PID: $STORAGE_PID"
        echo "  采集服务 PID: $COLLECTOR_PID"
        echo "  网关服务 PID: $GATEWAY_PID"
        echo ""
        echo "  使用 'kill $STORAGE_PID $COLLECTOR_PID $GATEWAY_PID' 停止服务"
    fi
}

start_frontend() {
    echo ""
    echo "🎨 启动前端开发服务器..."
    cd "$PROJECT_DIR/frontend"
    npm run dev
}

echo "欢迎使用分布式日志溯源平台"
echo ""

check_node
check_npm
install_dependencies

echo ""
echo "请选择启动模式:"
echo "  1) 仅启动后端服务"
echo "  2) 仅启动前端服务"
echo "  3) 启动所有服务 (推荐)"
echo "  4) 仅启动前端开发 (假设后端已运行)"
echo ""

read -p "请输入选项 [1-4]: " choice

case $choice in
    1)
        start_services
        ;;
    2)
        start_frontend
        ;;
    3)
        start_services
        sleep 3
        start_frontend
        ;;
    4)
        start_frontend
        ;;
    *)
        echo "无效选项"
        exit 1
        ;;
esac

echo ""
echo "============================================"
echo "  服务启动完成!"
echo "  前端: http://localhost:3000"
echo "  网关: http://localhost:8080"
echo "  采集: http://localhost:8081"
echo "  存储: http://localhost:8082"
echo "============================================"