@echo off
echo ========================================
echo 电机运行异响音频诊断AI预处理平台
echo ========================================
echo.

echo [1/3] 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)
echo.

echo [2/3] 安装依赖...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo 警告: 部分依赖安装失败，请检查网络连接或手动安装
    echo 继续尝试启动服务...
)
echo.

echo [3/3] 启动服务...
echo 服务将在 http://localhost:8000 启动
echo 前端控制台: http://localhost:8000/static/index.html
echo API文档: http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

python -m src.main
