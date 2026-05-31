@echo off
echo ========================================
echo 文档智能校对 AI 系统 - 启动脚本
echo ========================================

echo.
echo [1/3] 检查环境...
if not exist ".env" (
    echo 复制环境变量配置文件...
    copy .env.example .env
)

if not exist "uploads" mkdir uploads
if not exist "exports" mkdir exports
if not exist "logs" mkdir logs

echo.
echo [2/3] 初始化数据库...
python -m scripts.init_db

echo.
echo [3/3] 启动 FastAPI 服务...
echo 服务地址: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo.
echo 注意: 请确保 Redis 服务已启动
echo       如需启动 Celery Worker, 请运行: start_worker.bat
echo.

python main.py
