@echo off
chcp 65001 >nul
echo ============================================
echo    工业边缘网关 - 启动脚本
echo ============================================
echo.

cd /d "%~dp0\..

echo [1/2] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未检测到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo [2/2] 启动网关服务...
echo.

python -m scripts.gateway_main config/gateway_config.json

pause