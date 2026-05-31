@echo off
echo ========================================
echo 启动边缘设备模拟器
echo ========================================

cd edge
pip install -r requirements.txt
python simulator.py --interval 3

pause
