@echo off
chcp 65001 >nul
echo ============================================
echo   日志溯源平台 - Windows 启动脚本
echo ============================================
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

cd /d "%PROJECT_DIR%"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo 请安装 Node.js 18+: https://nodejs.org/
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js 版本: %NODE_VERSION%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 npm
    pause
    exit /b 1
)

for /f "delims=" %%v in ('npm --version') do set NPM_VERSION=%%v
echo [OK] npm 版本: %NPM_VERSION%

echo.
echo [信息] 检查依赖...

if not exist "node_modules" (
    echo 安装根目录依赖...
    call npm install
)

if exist "frontend" (
    cd /d "frontend"
    if not exist "node_modules" (
        echo 安装 frontend 依赖...
        call npm install
    )
    cd /d "%PROJECT_DIR%"
)

if exist "gateway" (
    cd /d "gateway"
    if not exist "node_modules" (
        echo 安装 gateway 依赖...
        call npm install
    )
    cd /d "%PROJECT_DIR%"
)

if exist "collector" (
    cd /d "collector"
    if not exist "node_modules" (
        echo 安装 collector 依赖...
        call npm install
    )
    cd /d "%PROJECT_DIR%"
)

if exist "storage" (
    cd /d "storage"
    if not exist "node_modules" (
        echo 安装 storage 依赖...
        call npm install
    )
    cd /d "%PROJECT_DIR%"
)

echo [OK] 依赖检查完成
echo.

echo 请选择启动模式:
echo   1) 仅启动后端服务
echo   2) 仅启动前端服务
echo   3) 启动所有服务 (推荐)
echo   4) 仅启动前端开发 (假设后端已运行)
echo.

set /p choice=请输入选项 [1-4]: 

if "%choice%"=="1" goto :start_backend
if "%choice%"=="2" goto :start_frontend
if "%choice%"=="3" goto :start_all
if "%choice%"=="4" goto :start_frontend_dev

echo 无效选项
pause
exit /b 1

:start_backend
echo.
echo [信息] 启动后端服务...

cd /d "%PROJECT_DIR%\storage"
start "Storage Service" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

cd /d "%PROJECT_DIR%\collector"
start "Collector Service" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

cd /d "%PROJECT_DIR%\gateway"
start "Gateway Service" cmd /k "npm run dev"

goto :show_info

:start_frontend
cd /d "%PROJECT_DIR%\frontend"
call npm run dev
goto :eof

:start_all
echo.
echo [信息] 启动所有服务...

cd /d "%PROJECT_DIR%\storage"
start "Storage Service" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

cd /d "%PROJECT_DIR%\collector"
start "Collector Service" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

cd /d "%PROJECT_DIR%\gateway"
start "Gateway Service" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

cd /d "%PROJECT_DIR%\frontend"
start "Frontend Dev Server" cmd /k "npm run dev"

goto :show_info

:start_frontend_dev
cd /d "%PROJECT_DIR%\frontend"
call npm run dev
goto :eof

:show_info
echo.
echo ============================================
echo   服务启动完成!
echo   前端: http://localhost:3000
echo   网关: http://localhost:8080
echo   采集: http://localhost:8081
echo   存储: http://localhost:8082
echo ============================================
echo.
echo 注意: 各服务在独立窗口中运行
echo       关闭对应窗口即可停止服务
echo.

pause