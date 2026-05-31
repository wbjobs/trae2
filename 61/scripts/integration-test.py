#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能配电房系统 - 集成测试脚本
测试各微服务之间的通信和功能集成
"""

import sys
import os
import json
import time
import requests
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class IntegrationTester:
    def __init__(self):
        self.base_urls = {
            "gateway": "http://localhost:5000",
            "analysis": "http://localhost:5001",
            "control": "http://localhost:5002",
            "alert": "http://localhost:5003"
        }
        self.test_results = []

    def run_test(self, name, func):
        """运行单个测试用例"""
        logger.info(f"▶️  测试: {name}")
        try:
            result = func()
            if result:
                logger.info(f"✅  PASS: {name}")
                self.test_results.append((name, "PASS"))
                return True
            else:
                logger.error(f"❌  FAIL: {name}")
                self.test_results.append((name, "FAIL"))
                return False
        except Exception as e:
            logger.error(f"❌  FAIL: {name} - {e}")
            self.test_results.append((name, "FAIL"))
            return False

    def test_gateway_health(self):
        """测试网关服务健康检查"""
        response = requests.get(f"{self.base_urls['gateway']}/api/health", timeout=5)
        return response.status_code == 200 and response.json()["status"] == "ok"

    def test_analysis_health(self):
        """测试分析服务健康检查"""
        response = requests.get(f"{self.base_urls['analysis']}/api/health", timeout=5)
        return response.status_code == 200 and response.json()["status"] == "ok"

    def test_control_health(self):
        """测试控制服务健康检查"""
        response = requests.get(f"{self.base_urls['control']}/api/health", timeout=5)
        return response.status_code == 200 and response.json()["status"] == "ok"

    def test_alert_health(self):
        """测试告警服务健康检查"""
        response = requests.get(f"{self.base_urls['alert']}/api/health", timeout=5)
        return response.status_code == 200 and response.json()["status"] == "ok"

    def test_get_rooms(self):
        """测试获取配电房列表"""
        response = requests.get(f"{self.base_urls['gateway']}/api/rooms", timeout=5)
        data = response.json()
        return response.status_code == 200 and "rooms" in data

    def test_trigger_collection(self):
        """测试触发数据采集"""
        response = requests.post(f"{self.base_urls['gateway']}/api/sensor/collect", timeout=5)
        data = response.json()
        return response.status_code == 200 and data["count"] > 0

    def test_get_room_sensors(self):
        """测试获取房间传感器数据"""
        response = requests.get(f"{self.base_urls['gateway']}/api/sensor/latest/room_001", timeout=5)
        data = response.json()
        return response.status_code == 200 and "data" in data

    def test_get_thresholds(self):
        """测试获取阈值配置"""
        response = requests.get(f"{self.base_urls['analysis']}/api/thresholds", timeout=5)
        data = response.json()
        return response.status_code == 200 and "thresholds" in data

    def test_analyze_data(self):
        """测试数据分析接口"""
        test_data = {
            "device_id": "test_device",
            "room_id": "room_001",
            "sensor_type": "temperature",
            "value": 45.0,
            "unit": "°C",
            "timestamp": "2024-01-01T00:00:00"
        }
        response = requests.post(
            f"{self.base_urls['analysis']}/api/analyze",
            json=test_data,
            timeout=5
        )
        data = response.json()
        return response.status_code == 200 and "threshold_check" in data

    def test_autotrip_status(self):
        """测试自动跳闸状态"""
        response = requests.get(f"{self.base_urls['control']}/api/autotrip/status", timeout=5)
        data = response.json()
        return response.status_code == 200 and "auto_trip_enabled" in data

    def test_send_command(self):
        """测试发送控制命令"""
        command = {
            "room_id": "room_001",
            "device_id": "test_device_01",
            "command_type": "config",
            "params": {"test_param": "test_value"}
        }
        response = requests.post(
            f"{self.base_urls['control']}/api/command",
            json=command,
            timeout=5
        )
        data = response.json()
        return response.status_code == 200 and "result" in data

    def test_get_active_alerts(self):
        """测试获取活动告警"""
        response = requests.get(f"{self.base_urls['alert']}/api/alerts/active", timeout=5)
        data = response.json()
        return response.status_code == 200 and "alerts" in data

    def test_get_alert_channels(self):
        """测试获取告警通道"""
        response = requests.get(f"{self.base_urls['alert']}/api/alerts/channels", timeout=5)
        data = response.json()
        return response.status_code == 200 and "channels" in data

    def test_send_test_alert(self):
        """测试发送测试告警"""
        test_alert = {
            "level": "warning",
            "message": "Integration test alert"
        }
        response = requests.post(
            f"{self.base_urls['alert']}/api/alerts/test",
            json=test_alert,
            timeout=5
        )
        return response.status_code == 200

    def test_end_to_end_workflow(self):
        """测试端到端工作流程: 数据采集 -> 分析 -> 告警 -> 控制"""
        logger.info("  测试端到端工作流...")
        
        # 1. 触发数据采集
        logger.info("    1/4: 触发数据采集")
        collect_response = requests.post(
            f"{self.base_urls['gateway']}/api/sensor/collect",
            timeout=5
        )
        if collect_response.status_code != 200:
            logger.error("    数据采集失败")
            return False
        
        # 2. 获取传感器数据
        logger.info("    2/4: 获取传感器数据")
        sensor_response = requests.get(
            f"{self.base_urls['gateway']}/api/sensor/latest/room_001",
            timeout=5
        )
        if sensor_response.status_code != 200:
            logger.error("    获取传感器数据失败")
            return False
        
        # 3. 发送异常数据进行分析
        logger.info("    3/4: 发送异常数据进行分析")
        anomaly_data = {
            "device_id": "room_001_curr_01",
            "room_id": "room_001",
            "sensor_type": "current",
            "value": 95.0,
            "unit": "A",
            "timestamp": "2024-01-01T00:00:00"
        }
        analysis_response = requests.post(
            f"{self.base_urls['analysis']}/api/analyze",
            json=anomaly_data,
            timeout=5
        )
        if analysis_response.status_code != 200:
            logger.error("    数据分析失败")
            return False
        
        # 4. 发送控制命令
        logger.info("    4/4: 发送控制命令")
        command = {
            "room_id": "room_001",
            "device_id": "room_001_curr_01",
            "command_type": "config",
            "params": {"protection_enabled": True}
        }
        control_response = requests.post(
            f"{self.base_urls['control']}/api/command",
            json=command,
            timeout=5
        )
        if control_response.status_code != 200:
            logger.error("    控制命令失败")
            return False
        
        logger.info("    端到端工作流测试通过!")
        return True

    def run_all_tests(self):
        """运行所有测试"""
        logger.info("=" * 60)
        logger.info("智能配电房系统 - 集成测试")
        logger.info("=" * 60)
        logger.info("")
        
        # 健康检查测试
        logger.info("📋 第一阶段: 服务健康检查")
        logger.info("-" * 60)
        self.run_test("网关服务健康检查", self.test_gateway_health)
        self.run_test("分析服务健康检查", self.test_analysis_health)
        self.run_test("控制服务健康检查", self.test_control_health)
        self.run_test("告警服务健康检查", self.test_alert_health)
        logger.info("")
        
        # 网关服务测试
        logger.info("📋 第二阶段: 网关服务测试")
        logger.info("-" * 60)
        self.run_test("获取配电房列表", self.test_get_rooms)
        self.run_test("触发数据采集", self.test_trigger_collection)
        self.run_test("获取房间传感器数据", self.test_get_room_sensors)
        logger.info("")
        
        # 分析服务测试
        logger.info("📋 第三阶段: 分析服务测试")
        logger.info("-" * 60)
        self.run_test("获取阈值配置", self.test_get_thresholds)
        self.run_test("数据分析接口", self.test_analyze_data)
        logger.info("")
        
        # 控制服务测试
        logger.info("📋 第四阶段: 控制服务测试")
        logger.info("-" * 60)
        self.run_test("获取自动跳闸状态", self.test_autotrip_status)
        self.run_test("发送控制命令", self.test_send_command)
        logger.info("")
        
        # 告警服务测试
        logger.info("📋 第五阶段: 告警服务测试")
        logger.info("-" * 60)
        self.run_test("获取活动告警", self.test_get_active_alerts)
        self.run_test("获取告警通道", self.test_get_alert_channels)
        self.run_test("发送测试告警", self.test_send_test_alert)
        logger.info("")
        
        # 端到端测试
        logger.info("📋 第六阶段: 端到端集成测试")
        logger.info("-" * 60)
        self.run_test("端到端工作流程", self.test_end_to_end_workflow)
        logger.info("")
        
        # 测试结果汇总
        logger.info("=" * 60)
        logger.info("测试结果汇总")
        logger.info("=" * 60)
        
        pass_count = sum(1 for _, result in self.test_results if result == "PASS")
        total_count = len(self.test_results)
        
        for name, result in self.test_results:
            status_icon = "✅" if result == "PASS" else "❌"
            logger.info(f"{status_icon}  {name}: {result}")
        
        logger.info("")
        logger.info(f"总计: {pass_count}/{total_count} 测试通过")
        
        if pass_count == total_count:
            logger.info("🎉 所有测试通过!")
            return True
        else:
            logger.warning(f"⚠️  有 {total_count - pass_count} 个测试失败")
            return False


def main():
    tester = IntegrationTester()
    
    logger.info("等待服务启动... (按Ctrl+C跳过)")
    for i in range(5):
        logger.info(f"  {5 - i}秒后开始测试...")
        time.sleep(1)
    
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("\n测试被用户中断")
        sys.exit(1)
    except requests.exceptions.ConnectionError as e:
        logger.error(f"连接错误: {e}")
        logger.error("请确保所有服务已启动!")
        logger.error("运行: scripts/start-all.ps1 (Windows) 或 scripts/start-all.sh (Linux)")
        sys.exit(1)


if __name__ == "__main__":
    main()
