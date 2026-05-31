@echo off
chcp 65001 >nul
title 车规级诊断报文集群 - 多节点启动脚本

echo ========================================
echo   车规级车载诊断报文转发与过滤服务集群
echo ========================================
echo.

echo [1/3] 启动 Node-01 (主节点)...
start "Cluster-Node-01" cmd /k "cd /d %~dp0 && set NODE_ID=node-01&& node backend/server.js"

timeout /t 2 /nobreak >nul

echo [2/3] 启动 Node-02...
start "Cluster-Node-02" cmd /k "cd /d %~dp0 && set NODE_ID=node-02&& node backend/server.js"

timeout /t 2 /nobreak >nul

echo [3/3] 启动 Node-03...
start "Cluster-Node-03" cmd /k "cd /d %~dp0 && set NODE_ID=node-03&& node backend/server.js"

echo.
echo ========================================
echo   所有集群节点已启动
echo   监控面板: http://localhost:8080
echo ========================================
echo.
pause
