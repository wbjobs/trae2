@echo off
chcp 65001
echo ========================================
echo   法律条文智能检索比对 AI 系统
echo ========================================
echo.
echo [1] 安装依赖
echo [2] 启动开发服务器
echo [3] 仅启动 Sanic 服务
echo [4] 检查环境
echo [5] 退出
echo.
set /p choice=请选择操作:

if "%choice%"=="1" goto install
if "%choice%"=="2" goto start_dev
if "%choice%"=="3" goto start_server
if "%choice%"=="4" goto check_env
if "%choice%"=="5" goto end

:install
echo.
echo 正在安装依赖...
pip install -r requirements.txt
goto end

:start_dev
echo.
echo 正在启动开发服务器...
set PYTHONPATH=%~dp0
python -m app.main
goto end

:start_server
echo.
echo 正在启动 Sanic 服务...
set PYTHONPATH=%~dp0
sanic app.main.app --host=0.0.0.0 --port=8000 --dev
goto end

:check_env
echo.
echo 检查 Python 版本...
python --version
echo.
echo 检查 pip 版本...
pip --version
echo.
echo 检查已安装包...
pip list | findstr "sanic sqlalchemy elasticsearch"
echo.
echo 环境检查完成
goto end

:end
echo.
pause
