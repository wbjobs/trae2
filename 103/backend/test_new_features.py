"""
新增功能集成测试：
1. 仪器使用评价
2. 违规使用标记
3. 智能排布算法
4. 文件多版本留存
"""
import requests
import json
from datetime import datetime, timedelta

BASE_URL = 'http://localhost:8000'

def login(username='admin', password='admin123'):
    url = f'{BASE_URL}/api/auth/login/'
    data = {'username': username, 'password': password}
    response = requests.post(url, json=data)
    if response.status_code == 200:
        result = response.json()
        return result['data']['access']
    return None

def test_evaluation():
    print("\n" + "="*60)
    print("测试 1: 仪器使用评价")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.get(f'{BASE_URL}/api/instruments/', headers=headers)
    if response.status_code != 200:
        print("✗ 获取仪器列表失败")
        return False
    
    instruments = response.json()['data']['items']
    if not instruments:
        print("✗ 没有可用仪器")
        return False
    
    instrument_id = instruments[0]['id']
    print(f"使用仪器: {instruments[0]['name']}")
    
    response = requests.get(f'{BASE_URL}/api/records/', headers=headers)
    if response.status_code != 200:
        print(f"✗ 获取使用记录失败，状态码: {response.status_code}")
        return False
    
    records = response.json()['data']['items']
    if not records:
        print("⚠ 没有使用记录，尝试创建测试记录...")
        tomorrow = (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        record_data = {
            'instrument': instrument_id,
            'start_time': tomorrow.isoformat(),
            'end_time': (tomorrow + timedelta(hours=2)).isoformat(),
            'experiment_content': '测试评价用记录',
        }
        record_response = requests.post(f'{BASE_URL}/api/records/', headers=headers, json=record_data)
        if record_response.status_code in [200, 201]:
            records = [record_response.json()['data']]
        else:
            print("✗ 无法创建测试使用记录")
            return False
    
    record_id = records[0]['id']
    print(f"使用记录ID: {record_id}")
    
    eval_data = {
        'rating': 4,
        'content': '仪器运行状态良好，操作便捷',
        'tags': '设备良好,操作规范',
    }
    
    response = requests.post(
        f'{BASE_URL}/api/records/{record_id}/evaluate/',
        headers=headers,
        json=eval_data
    )
    
    if response.status_code in [200, 201]:
        data = response.json()
        if data.get('code') in [200, 201]:
            print("✓ 评价创建成功")
            print(f"  评分: {data['data']['rating']}/5")
            print(f"  内容: {data['data']['content']}")
        else:
            print(f"✗ 评价创建失败: {data.get('message')}")
            return False
    else:
        print(f"✗ 评价创建失败，状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
        return False
    
    response = requests.get(
        f'{BASE_URL}/api/records/{record_id}/evaluations/',
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        eval_count = len(data.get('data', []))
        print(f"✓ 获取评价列表成功，共 {eval_count} 条评价")
    else:
        print("⚠ 获取评价列表失败")
    
    return True

def test_violation():
    print("\n" + "="*60)
    print("测试 2: 违规使用标记")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.get(f'{BASE_URL}/api/records/', headers=headers)
    records = response.json().get('data', {}).get('items', [])
    if not records:
        print("✗ 没有使用记录")
        return False
    
    record_id = records[0]['id']
    
    violation_data = {
        'violation_type': 'rule_violation',
        'severity': 'moderate',
        'description': '未按操作规程使用仪器，未关闭设备电源',
        'penalty': 'warning',
    }
    
    response = requests.post(
        f'{BASE_URL}/api/records/{record_id}/flag_violation/',
        headers=headers,
        json=violation_data
    )
    
    if response.status_code in [200, 201]:
        data = response.json()
        if data.get('code') in [200, 201]:
            print("✓ 违规标记创建成功")
            print(f"  违规类型: {data['data']['violation_type_text']}")
            print(f"  严重程度: {data['data']['severity_text']}")
            print(f"  状态: {data['data']['status_text']}")
            
            violation_id = data['data']['id']
        else:
            print(f"✗ 违规标记失败: {data.get('message')}")
            return False
    else:
        print(f"✗ 违规标记失败，状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
        return False
    
    response = requests.get(
        f'{BASE_URL}/api/records/{record_id}/violations/',
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        violation_count = len(data.get('data', []))
        print(f"✓ 获取违规列表成功，共 {violation_count} 条违规记录")
    else:
        print("⚠ 获取违规列表失败")
    
    return True

def test_smart_scheduling():
    print("\n" + "="*60)
    print("测试 3: 智能排布算法")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.get(f'{BASE_URL}/api/instruments/', headers=headers)
    instruments = response.json()['data']['items']
    if not instruments:
        print("✗ 没有可用仪器")
        return False
    
    instrument_id = instruments[0]['id']
    test_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    print(f"测试仪器: {instruments[0]['name']}")
    print(f"测试日期: {test_date}")
    
    response = requests.get(
        f'{BASE_URL}/api/instruments/{instrument_id}/slots/',
        headers=headers,
        params={'date': test_date}
    )
    
    if response.status_code == 200:
        data = response.json()
        slots = data.get('data', [])
        recommended = [s for s in slots if s.get('recommendation') in ['recommended', 'best_fit', 'low_demand']]
        available = [s for s in slots if s.get('status') == 'available']
        
        print(f"✓ 获取时段列表成功")
        print(f"  总时段: {len(slots)}")
        print(f"  可用时段: {len(available)}")
        print(f"  推荐时段: {len(recommended)}")
        
        rec_types = {}
        for s in recommended:
            r = s.get('recommendation', 'none')
            rec_types[r] = rec_types.get(r, 0) + 1
        for rtype, count in rec_types.items():
            print(f"    {rtype}: {count}")
    else:
        print("✗ 获取时段列表失败")
        return False
    
    response = requests.get(
        f'{BASE_URL}/api/instruments/{instrument_id}/smart_slots/',
        headers=headers,
        params={'date': test_date, 'duration_hours': 2}
    )
    
    if response.status_code == 200:
        data = response.json()
        recommendations = data.get('data', [])
        print(f"\n✓ 智能推荐成功")
        print(f"  推荐窗口数: {len(recommendations)}")
        if recommendations:
            top = recommendations[0]
            print(f"  最佳推荐: {top.get('start')} - {top.get('end')}")
            print(f"  匹配度: {top.get('score', 0):.2f}")
            print(f"  窗口时长: {top.get('window_length', 0):.1f}h")
    else:
        print(f"⚠ 智能推荐失败，状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
    
    response = requests.get(
        f'{BASE_URL}/api/instruments/{instrument_id}/peak_hours/',
        headers=headers,
        params={'days': 7}
    )
    
    if response.status_code == 200:
        data = response.json()
        peak_data = data.get('data', [])
        print(f"\n✓ 高峰时段统计成功")
        print(f"  统计时段数: {len(peak_data)}")
        if peak_data:
            top_peak = sorted(peak_data, key=lambda x: x.get('rate', 0), reverse=True)[:3]
            print("  最热门时段:")
            for p in top_peak:
                print(f"    {p.get('slot')}: 预约{p.get('count', 0)}次, 频率{p.get('rate', 0):.1%}")
    else:
        print("⚠ 高峰时段统计失败")
    
    return True

def test_file_versions():
    print("\n" + "="*60)
    print("测试 4: 文件多版本留存")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    upload_data = {
        'original_name': 'experiment_data_v1.csv',
        'size': 2048,
        'content_type': 'text/csv',
        'tags': 'experiment,data',
        'description': '实验数据文件',
    }
    
    response = requests.post(
        f'{BASE_URL}/api/files/',
        headers=headers,
        json=upload_data
    )
    
    if response.status_code not in [200, 201]:
        print(f"✗ 创建文件失败，状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
        return False
    
    data = response.json()
    if data.get('code') not in [200, 201]:
        print(f"✗ 创建文件失败: {data.get('message')}")
        return False
    
    file_id = data['data']['file_id']
    print(f"✓ 创建文件成功，ID: {file_id}")
    
    confirm_data = {
        'file_id': file_id,
        'etag': 'test-etag-v1',
        'size': 2048,
    }
    
    response = requests.post(
        f'{BASE_URL}/api/files/confirm_upload/',
        headers=headers,
        json=confirm_data
    )
    
    if response.status_code == 200:
        print("✓ 文件确认成功 (v1)")
    else:
        print(f"⚠ 文件确认失败: {response.text[:100]}")
    
    response = requests.get(
        f'{BASE_URL}/api/files/{file_id}/versions/',
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        versions = data.get('data', [])
        print(f"✓ 获取版本列表成功，共 {len(versions)} 个版本")
        for v in versions:
            print(f"  v{v['version']}: {v.get('name')} ({v.get('size')} bytes) by {v.get('created_by_name', 'N/A')}")
    else:
        print("⚠ 获取版本列表失败")
    
    new_version_data = {
        'original_name': 'experiment_data_v2.csv',
        'size': 4096,
        'content_type': 'text/csv',
        'change_log': '更新了第三组实验数据，修正了温度读数偏差',
    }
    
    response = requests.post(
        f'{BASE_URL}/api/files/{file_id}/new_version/',
        headers=headers,
        json=new_version_data
    )
    
    if response.status_code in [200, 201]:
        data = response.json()
        if data.get('code') in [200, 201]:
            print(f"✓ 创建新版本成功 (v{data['data'].get('version', '?')})")
        else:
            print(f"✗ 创建新版本失败: {data.get('message')}")
    else:
        print(f"✗ 创建新版本失败: {response.status_code}")
    
    response = requests.get(
        f'{BASE_URL}/api/files/{file_id}/versions/',
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        versions = data.get('data', [])
        print(f"✓ 更新后版本数: {len(versions)}")
        for v in versions:
            change = v.get('change_log', '')
            print(f"  v{v['version']}: {v.get('name')} - {change[:30] if change else 'N/A'}")
    else:
        print("⚠ 获取更新后版本列表失败")
    
    response = requests.get(
        f'{BASE_URL}/api/files/{file_id}/preview/',
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✓ 预览接口正常，可预览: {data['data'].get('can_preview')}")
    else:
        print("⚠ 预览接口异常")
    
    return True

if __name__ == '__main__':
    print("\n" + "="*60)
    print("实验室仪器预约系统 - 新增功能集成测试")
    print("="*60)
    
    results = []
    
    results.append(("仪器使用评价", test_evaluation()))
    results.append(("违规使用标记", test_violation()))
    results.append(("智能排布算法", test_smart_scheduling()))
    results.append(("文件多版本留存", test_file_versions()))
    
    print("\n" + "="*60)
    print("测试总结")
    print("="*60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{name}: {status}")
    
    print(f"\n总计: {passed}/{total} 测试通过")
    
    print("\n" + "="*60)
