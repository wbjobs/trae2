@echo off
chcp 65001 >nul
echo ============================================
echo   蒸汽机械联动结构拆装模拟 - 桌面端
echo ============================================
echo.

echo 检查 Electron 依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
)

echo.
echo 启动桌面客户端...
echo.
echo ============================================
echo   提示: 请确保游戏服务器已启动!
echo   服务器地址: http://localhost:3000
echo ============================================
echo.

npx electron .
pause
