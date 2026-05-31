@echo off
echo ========================================
echo 文档智能校对 AI 系统 - Celery Worker
echo ========================================

echo.
echo 启动 Celery Worker 处理异步任务...
echo 注意: 请确保 Redis 服务已启动
echo.

celery -A app.tasks.celery_app worker --loglevel=info -P solo
