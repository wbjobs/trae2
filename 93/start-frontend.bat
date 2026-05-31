@echo off
echo ========================================
echo 科研项目成果资产全生命周期管理系统
echo 前端启动脚本
echo ========================================
echo.

cd /d "%~dp0frontend"

echo [1/3] 检查 Node.js 环境...
node -v
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

echo.
echo [2/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
) else (
    echo 依赖已安装
)

echo.
echo [3/3] 启动 Angular 开发服务...
echo 访问地址: http://localhost:4200
echo.
echo 按 Ctrl+C 停止服务
echo ========================================

npm start

pause
