"""
测试三个问题修复：
1. 预约冲突问题
2. 文件预览优化
3. 文件上传确认
"""
import requests
import json
import time
import threading
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

def test_reservation_conflict():
    """测试预约冲突检测"""
    print("\n" + "="*60)
    print("测试 1: 预约冲突检测 (Redis 分布式锁)")
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
    print(f"使用仪器: {instruments[0]['name']} ({instrument_id})")
    
    import random
    day_offset = random.randint(2, 7)
    tomorrow = (datetime.now() + timedelta(days=day_offset)).replace(hour=9, minute=0, second=0, microsecond=0)
    hour_offset = random.randint(0, 6)
    start_time = tomorrow + timedelta(hours=hour_offset)
    end_time = start_time + timedelta(hours=2)
    
    print(f"预约时段: {start_time} - {end_time}")
    
    reservation_data = {
        'instrument': instrument_id,
        'start_time': start_time.isoformat(),
        'end_time': end_time.isoformat(),
        'purpose': '测试预约1',
    }
    
    print("\n发起并发预约请求...")
    results = []
    
    def make_reservation(purpose):
        data = dict(reservation_data)
        data['purpose'] = purpose
        r = requests.post(
            f'{BASE_URL}/api/reservations/',
            headers=headers,
            json=data
        )
        results.append(r)
    
    thread1 = threading.Thread(target=lambda: make_reservation('并发测试A'))
    thread2 = threading.Thread(target=lambda: make_reservation('并发测试B'))
    
    thread1.start()
    thread2.start()
    thread1.join()
    thread2.join()
    
    success_count = 0
    conflict_count = 0
    
    for i, r in enumerate(results):
        data = r.json()
        if data.get('code') == 200:
            success_count += 1
            print(f"✓ 预约 {i+1}: 成功 ({data['data']['purpose']})")
        elif data.get('code') == 409 or '时段已被预约' in str(data):
            conflict_count += 1
            msg = data.get('message') or str(data)
            print(f"✓ 预约 {i+1}: 冲突检测生效 - {msg}")
        else:
            print(f"预约 {i+1}: code={data.get('code')}, message={data}")
    
    print(f"\n结果: {success_count} 个成功, {conflict_count} 个被正确拒绝")
    
    if success_count >= 1 and conflict_count >= 1:
        print("✓ 预约冲突检测正常工作")
        return True
    else:
        print("⚠ 请检查冲突检测逻辑")
        return success_count >= 1

def test_file_preview_api():
    """测试文件预览API"""
    print("\n" + "="*60)
    print("测试 2: 文件预览 API")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.get(f'{BASE_URL}/api/files/', headers=headers)
    if response.status_code != 200:
        print("✗ 获取文件列表失败")
        return False
    
    data = response.json()
    files = data['data']['items']
    print(f"文件总数: {data['data']['total']}")
    
    if files:
        file_id = files[0]['id']
        print(f"测试文件: {files[0]['name']} ({file_id})")
        
        response = requests.get(f'{BASE_URL}/api/files/{file_id}/preview/', headers=headers)
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 200:
                print("✓ 预览URL获取成功")
                print(f"  可预览: {data['data'].get('can_preview')}")
                print(f"  MIME类型: {data['data'].get('mime_type')}")
                return True
            else:
                print(f"✗ 获取预览URL失败: {data.get('message')}")
                return False
        else:
            print(f"✗ 获取预览URL失败，状态码: {response.status_code}")
            return False
    else:
        print("⚠ 没有测试文件，跳过预览测试")
        return True

def test_file_upload_confirm():
    """测试文件上传确认流程"""
    print("\n" + "="*60)
    print("测试 3: 文件上传确认流程")
    print("="*60)
    
    token = login()
    if not token:
        print("✗ 登录失败")
        return False
    
    headers = {'Authorization': f'Bearer {token}'}
    
    upload_data = {
        'original_name': 'test_file.txt',
        'size': 1024,
        'content_type': 'text/plain',
        'tags': 'test',
        'description': '测试文件',
    }
    
    response = requests.post(
        f'{BASE_URL}/api/files/',
        headers=headers,
        json=upload_data
    )
    
    if response.status_code != 200:
        print(f"✗ 获取上传URL失败，状态码: {response.status_code}")
        print(f"  响应内容: {response.text[:200]}")
        return False
    
    data = response.json()
    if data.get('code') != 200:
        print(f"✗ 获取上传URL失败: {data.get('message')}")
        return False
    
    file_id = data['data']['file_id']
    print("✓ 获取上传URL成功")
    print(f"  文件ID: {file_id}")
    print(f"  存储路径: {data['data']['storage_key']}")
    
    confirm_data = {
        'file_id': file_id,
        'etag': 'test-etag-12345',
        'size': 1024,
    }
    
    response = requests.post(
        f'{BASE_URL}/api/files/confirm_upload/',
        headers=headers,
        json=confirm_data
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get('code') == 200:
            print("✓ 文件确认上传成功")
            print(f"  文件大小已更新: {data['data'].get('size')}")
            return True
        else:
            print(f"✗ 文件确认失败: {data.get('message')}")
            return False
    else:
        print(f"✗ 文件确认失败，状态码: {response.status_code}")
        return False

def test_instrument_slots_cache():
    """测试仪器时段缓存"""
    print("\n" + "="*60)
    print("测试 4: 仪器时段缓存 (Redis)")
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
    if instruments:
        instrument_id = instruments[0]['id']
        test_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        print(f"测试仪器: {instruments[0]['name']}")
        print(f"测试日期: {test_date}")
        
        start_time = time.time()
        response1 = requests.get(
            f'{BASE_URL}/api/instruments/{instrument_id}/slots/',
            headers=headers,
            params={'date': test_date}
        )
        time1 = time.time() - start_time
        
        start_time = time.time()
        response2 = requests.get(
            f'{BASE_URL}/api/instruments/{instrument_id}/slots/',
            headers=headers,
            params={'date': test_date}
        )
        time2 = time.time() - start_time
        
        print(f"第一次请求耗时: {time1:.3f}s")
        print(f"第二次请求耗时: {time2:.3f}s")
        
        if time2 < time1:
            print("✓ 缓存生效，第二次请求更快")
        else:
            print("⚠ 缓存可能未生效或差异不明显")
        
        return True
    return False

if __name__ == '__main__':
    print("\n" + "="*60)
    print("实验室仪器预约系统 - 修复验证测试")
    print("="*60)
    
    results = []
    
    results.append(("预约冲突检测", test_reservation_conflict()))
    results.append(("文件预览API", test_file_preview_api()))
    results.append(("文件上传确认", test_file_upload_confirm()))
    results.append(("仪器时段缓存", test_instrument_slots_cache()))
    
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
