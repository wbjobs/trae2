@echo off
echo ========================================
echo 科研项目成果资产全生命周期管理系统
echo 后端启动脚本
echo ========================================
echo.

cd /d "%~dp0backend"

echo [1/3] 检查 Maven 环境...
mvn -version
if %errorlevel% neq 0 (
    echo 错误: 未找到 Maven，请先安装 Maven
    pause
    exit /b 1
)

echo.
echo [2/3] 检查配置文件...
if not exist "src\main\resources\application.yml" (
    echo 警告: 配置文件不存在
) else (
    echo 配置文件已就绪
)

echo.
echo [3/3] 启动 SpringBoot 服务...
echo 服务地址: http://localhost:8080
echo API文档: http://localhost:8080/swagger-ui.html
echo.
echo 按 Ctrl+C 停止服务
echo ========================================

mvn spring-boot:run

pause
