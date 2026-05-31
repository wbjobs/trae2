@echo off
echo ========================================
echo    虚拟沙盘 - 地形侵蚀演化模拟游戏
echo ========================================
echo.

echo [1/4] 检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 16.0 或更高版本
    pause
    exit /b 1
)
echo Node.js 环境正常
echo.

echo [2/4] 安装服务端依赖...
cd server
if not exist "node_modules" (
    call npm install
)
cd ..
echo 服务端依赖就绪
echo.

echo [3/4] 安装客户端依赖...
cd client
if not exist "node_modules" (
    call npm install
)
cd ..
echo 客户端依赖就绪
echo.

echo [4/4] 启动服务...
echo.
echo ========================================
echo  服务端地址: http://localhost:3000
echo  客户端地址: http://localhost:5173
echo ========================================
echo.
echo 正在启动服务端和客户端...
echo.

start "Terrain Sandbox Server" cmd /k "cd server && npm start"
timeout /t 3 /nobreak >nul
start "Terrain Sandbox Client" cmd /k "cd client && npm run dev"

echo.
echo 服务启动中，请等待浏览器自动打开...
echo 如未自动打开，请手动访问: http://localhost:5173
echo.
pause
