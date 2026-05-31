@echo off
chcp 65001 >nul
echo ============================================
echo   蒸汽机械联动结构拆装模拟游戏
echo ============================================
echo.

echo [1/3] 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js 版本: 
node --version
echo.

echo [2/3] 安装项目依赖...
call npm install
if %errorlevel% neq 0 (
    echo 错误: 依赖安装失败
    pause
    exit /b 1
)
echo 依赖安装完成!
echo.

echo [3/3] 启动游戏服务器...
echo.
echo ============================================
echo   服务器已启动!
echo   网页端: http://localhost:3000
echo   按 Ctrl+C 停止服务器
echo ============================================
echo.

node server/src/index.js
pause
