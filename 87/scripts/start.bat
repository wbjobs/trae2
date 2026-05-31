@echo off
echo ========================================
echo 工业时序工况数据分析与可视化平台
echo ========================================
echo.

echo [1/3] Checking Python environment...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)
echo Python environment OK
echo.

echo [2/3] Installing dependencies...
pip install -r requirements.txt
echo Dependencies installed
echo.

echo [3/3] Starting backend server...
echo.
echo ========================================
echo API Server: http://localhost:8000
echo API Docs:   http://localhost:8000/docs
echo Frontend:   http://localhost:8000/static/index.html
echo ========================================
echo.
echo Default login: admin / admin123
echo.

python -m backend.main
