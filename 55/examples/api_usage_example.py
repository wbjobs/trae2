"""
API使用示例
演示如何调用工业设备故障智能研判AI服务系统的各个API接口
"""

import requests
import json


BASE_URL = "http://localhost:8080"


def example_single_fault_analysis():
    """示例1: 单条故障文本分析"""
    print("=" * 60)
    print("示例1: 单条故障文本分析")
    print("=" * 60)

    url = f"{BASE_URL}/api/v1/fault/analyze"
    payload = {
        "text": "电机运行时温度过高，烫手，伴有轻微异响",
        "device_id": "DEV-001",
        "device_type": "CNC机床"
    }

    try:
        response = requests.post(url, json=payload, timeout=30)
        result = response.json()

        print(f"请求成功!")
        print(f"请求ID: {result.get('request_id')}")
        print(f"原始文本: {result.get('original_text')}")
        print(f"提取关键词: {result.get('parsing_result', {}).get('keywords')}")

        fault_matches = result.get('fault_matches', [])
        if fault_matches:
            print(f"\n匹配的故障类型 (Top {len(fault_matches)}):")
            for match in fault_matches:
                ft = match.get('fault_type', {})
                print(f"  {match.get('rank')}. {ft.get('name')} - "
                      f"相似度: {match.get('similarity_score'):.3f}, "
                      f"分类: {ft.get('category')}, "
                      f"严重程度: {ft.get('severity')}")

        repair = result.get('repair_recommendation')
        if repair:
            print(f"\n推荐维修方案:")
            for solution in repair.get('solutions', []):
                print(f"  方案ID: {solution.get('id')}")
                print(f"  标题: {solution.get('title')}")
                print(f"  描述: {solution.get('description')}")
                print(f"  优先级: {solution.get('priority')}")
                print(f"  预计耗时: {solution.get('estimated_time')}")
                print(f"  所需工具: {solution.get('tools')}")
                print(f"  操作步骤:")
                for i, step in enumerate(solution.get('steps', []), 1):
                    print(f"    {i}. {step}")
                print()

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


def example_batch_fault_analysis():
    """示例2: 批量故障文本分析"""
    print("=" * 60)
    print("示例2: 批量故障文本分析")
    print("=" * 60)

    url = f"{BASE_URL}/api/v1/fault/analyze/batch"
    payload = {
        "texts": [
            {"text": "电机运行时温度过高，烫手，伴有轻微异响"},
            {"text": "PLC通信中断，上位机无法连接到下位机"},
            {"text": "液压系统压力不足，油缸动作缓慢"},
            {"text": "输送带卡滞，无法正常运转"},
            {"text": "传感器读数异常，偏差很大"}
        ]
    }

    try:
        response = requests.post(url, json=payload, timeout=60)
        result = response.json()

        print(f"批量分析完成!")
        print(f"总数: {result.get('total_count')}")
        print(f"成功: {result.get('success_count')}")
        print(f"失败: {result.get('failed_count')}")
        print(f"总耗时: {result.get('total_processing_time'):.3f}秒")

        for item in result.get('results', []):
            ft_name = item.get('fault_matches', [{}])[0].get('fault_type', {}).get('name', 'N/A')
            print(f"  - {item.get('original_text')[:30]}... => {ft_name}")

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


def example_text_parsing():
    """示例3: 文本解析服务"""
    print("=" * 60)
    print("示例3: 文本解析服务")
    print("=" * 60)

    url = f"{BASE_URL}/api/v1/text/parse"
    payload = {
        "text": "设备#A-201的主轴电机过热，温度达到105度，PLC报警E021"
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        result = response.json()

        print(f"原始文本: {result.get('original_text')}")
        print(f"清洗后文本: {result.get('cleaned_text')}")
        print(f"提取关键词: {result.get('keywords')}")
        print(f"分词结果: {result.get('tokens')}")
        print(f"设备信息: {result.get('device_info')}")

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


def example_get_fault_types():
    """示例4: 获取所有故障类型"""
    print("=" * 60)
    print("示例4: 获取所有故障类型")
    print("=" * 60)

    url = f"{BASE_URL}/api/v1/fault/types"

    try:
        response = requests.get(url, timeout=10)
        fault_types = response.json()

        print(f"系统支持 {len(fault_types)} 种故障类型:")
        for ft in fault_types:
            print(f"  [{ft.get('id')}] {ft.get('name')} - "
                  f"{ft.get('category')} - {ft.get('severity')}")

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


def example_health_check():
    """示例5: 健康检查"""
    print("=" * 60)
    print("示例5: 健康检查")
    print("=" * 60)

    url = f"{BASE_URL}/health"

    try:
        response = requests.get(url, timeout=5)
        health = response.json()

        print(f"状态: {health.get('status')}")
        print(f"版本: {health.get('version')}")
        print(f"运行时间: {health.get('uptime'):.0f}秒")
        print(f"模块状态:")
        for module, status in health.get('modules', {}).items():
            print(f"  - {module}: {status}")

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


def example_get_repair_solutions():
    """示例6: 获取维修方案"""
    print("=" * 60)
    print("示例6: 获取维修方案")
    print("=" * 60)

    url = f"{BASE_URL}/api/v1/repair/solutions"
    params = {"fault_type_id": "FT001"}

    try:
        response = requests.get(url, params=params, timeout=10)
        result = response.json()

        print(f"故障类型: {result.get('fault_type_id')}")
        print(f"维修方案数量: {len(result.get('solutions', []))}")
        for sol in result.get('solutions', []):
            print(f"  - {sol.get('title')} (优先级: {sol.get('priority')})")

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

    print()


if __name__ == "__main__":
    print("\n工业设备故障智能研判AI服务系统 - API使用示例\n")

    example_health_check()
    example_get_fault_types()
    example_text_parsing()
    example_single_fault_analysis()
    example_batch_fault_analysis()
    example_get_repair_solutions()

    print("=" * 60)
    print("所有示例运行完成!")
    print("=" * 60)