@echo off
chcp 65001 >nul
echo ============================================
echo   油气管道阴极保护参数采集与阈值告警 API 服务集群
echo   Cathodic Protection Monitoring API Cluster
echo ============================================
echo.

echo [1/4] 检查 Python 环境...
python --version
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.11+
    pause
    exit /b 1
)

echo.
echo [2/4] 创建虚拟环境...
if not exist ".venv" (
    python -m venv .venv
    echo 虚拟环境已创建
) else (
    echo 虚拟环境已存在
)

echo.
echo [3/4] 激活虚拟环境并安装依赖...
call .venv\Scripts\activate.bat
pip install --upgrade pip
pip install -r requirements.txt

echo.
echo [4/4] 初始化环境配置...
if not exist ".env" (
    copy .env.example .env
    echo 已创建 .env 配置文件，请根据实际环境修改
) else (
    echo .env 配置文件已存在
)

if not exist "logs" (
    mkdir logs
    echo 已创建日志目录
)

echo.
echo ============================================
echo   初始化完成！
echo ============================================
echo.
echo 启动命令:
echo   python start.py
echo.
echo 集群部署:
echo   docker-compose up -d --build
echo.
echo API 文档:
echo   http://localhost:8000/docs
echo.
pause