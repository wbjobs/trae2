@echo off
echo ========================================
echo 初始化示例数据
echo ========================================
echo.

set /p DAYS="请输入生成数据的天数 (默认7天): "
if "%DAYS%"=="" set DAYS=7

set /p INTERVAL="请输入数据间隔秒数 (默认60秒): "
if "%INTERVAL%"=="" set INTERVAL=60

echo.
echo 正在生成 %DAYS% 天的数据，间隔 %INTERVAL% 秒...
echo.

python scripts\init_data.py --days %DAYS% --interval %INTERVAL%

echo.
echo 数据初始化完成！
pause
