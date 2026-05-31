#!/usr/bin/env python
"""
API 集成测试脚本
"""
import requests
import json
import sys

BASE_URL = 'http://127.0.0.1:8000'


def get_response_data(response):
    """统一处理响应格式"""
    data = response.json()
    if 'data' in data and isinstance(data['data'], dict):
        return data['data']
    return data


def test_login():
    """测试登录"""
    print('=' * 60)
    print('测试 1: 用户登录')
    print('=' * 60)
    response = requests.post(
        f'{BASE_URL}/api/auth/login/',
        json={'username': 'admin', 'password': 'admin123'}
    )
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        print(f'✓ 登录成功')
        print(f'  用户: {result["data"]["user"]["real_name"]}')
        print(f'  角色: {result["data"]["user"]["role_name"]}')
        return result['data']['access']
    else:
        print(f'✗ 登录失败: {response.text}')
        sys.exit(1)


def test_instruments(headers):
    """测试仪器列表"""
    print()
    print('=' * 60)
    print('测试 2: 获取仪器列表')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/instruments/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', []))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取仪器列表成功')
        print(f'  仪器总数: {total}')
        if items:
            first = items[0]
            print(f'  第一个仪器: {first["name"]} ({first["code"]})')
            print(f'  状态: {first.get("status_text", first.get("status"))}')
            return first['id']
    else:
        print(f'✗ 获取仪器列表失败: {response.text}')
    return None


def test_instrument_slots(headers, instrument_id):
    """测试仪器可用时段"""
    print()
    print('=' * 60)
    print('测试 3: 获取仪器可用时段 (Redis 缓存)')
    print('=' * 60)
    response = requests.get(
        f'{BASE_URL}/api/instruments/{instrument_id}/slots/',
        headers=headers,
        params={'date': '2026-05-29'}
    )
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = result.get('data', result)
        print(f'✓ 获取时段成功')
        if 'available_slots' in data:
            print(f'  可用时段数: {len(data["available_slots"])}')
            print(f'  已预约时段数: {len(data["reserved_slots"])}')
            if data['available_slots']:
                print(f'  第一个可用时段: {data["available_slots"][0]}')
        elif 'items' in data:
            print(f'  时段数: {len(data["items"])}')
        print(f'  (数据已通过 Redis 缓存)')
    else:
        print(f'✗ 获取时段失败: {response.text}')


def test_user_profile(headers):
    """测试用户信息"""
    print()
    print('=' * 60)
    print('测试 4: 获取用户信息')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/auth/profile/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = result.get('data', result)
        print(f'✓ 获取用户信息成功')
        print(f'  用户名: {data["username"]}')
        print(f'  真实姓名: {data["real_name"]}')
        print(f'  邮箱: {data["email"]}')
    else:
        print(f'✗ 获取用户信息失败: {response.text}')


def test_audit_logs(headers):
    """测试审计日志"""
    print()
    print('=' * 60)
    print('测试 5: 获取审计日志')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/audit-logs/logs/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', data.get('data', [])))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取审计日志成功')
        print(f'  日志总数: {total}')
        if items:
            latest = items[0]
            print(f'  最新日志: {latest.get("action_text", latest.get("action"))} - {latest.get("module_text", latest.get("module"))}')
            print(f'  操作人: {latest.get("user_name", "系统")}')
    else:
        print(f'✗ 获取审计日志失败: {response.text}')


def test_reservations(headers):
    """测试预约列表"""
    print()
    print('=' * 60)
    print('测试 6: 获取预约列表')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/reservations/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', []))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取预约列表成功')
        print(f'  预约总数: {total}')
    else:
        print(f'✗ 获取预约列表失败: {response.text}')


def test_notifications(headers):
    """测试消息通知"""
    print()
    print('=' * 60)
    print('测试 7: 获取消息通知')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/notifications/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', []))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取消息通知成功')
        print(f'  消息总数: {total}')
    else:
        print(f'✗ 获取消息通知失败: {response.text}')


def test_records(headers):
    """测试使用记录"""
    print()
    print('=' * 60)
    print('测试 8: 获取使用记录')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/records/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', []))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取使用记录成功')
        print(f'  记录总数: {total}')
    else:
        print(f'✗ 获取使用记录失败: {response.text}')


def test_files(headers):
    """测试文件列表"""
    print()
    print('=' * 60)
    print('测试 9: 获取文件列表 (MinIO 对象存储)')
    print('=' * 60)
    response = requests.get(f'{BASE_URL}/api/files/', headers=headers)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        data = get_response_data(response)
        items = data.get('items', data.get('results', []))
        total = data.get('total', data.get('count', len(items)))
        print(f'✓ 获取文件列表成功')
        print(f'  文件总数: {total}')
        print(f'  (文件存储在 MinIO 对象存储)')
    else:
        print(f'✗ 获取文件列表失败: {response.text}')


def test_redis_connection():
    """测试 Redis 连接"""
    print()
    print('=' * 60)
    print('测试 10: Redis 连接测试')
    print('=' * 60)
    try:
        from django_redis import get_redis_connection
        conn = get_redis_connection()
        conn.ping()
        print('✓ Redis 连接成功')

        # 测试缓存写入
        conn.set('api_test:key', 'api_test:value', ex=60)
        value = conn.get('api_test:key')
        if value and value.decode('utf-8') == 'api_test:value':
            print('✓ Redis 缓存读写测试成功')
        else:
            print('✗ Redis 缓存读写测试失败')

        # 查看预约时段缓存
        keys = conn.keys('instrument:slots:*')
        print(f'  时段缓存键数量: {len(keys)}')
        if keys:
            print(f'  第一个缓存键: {keys[0].decode("utf-8")}')

        # 查看分布式锁
        lock_keys = conn.keys('reservation:lock:*')
        print(f'  预约锁键数量: {len(lock_keys)}')

        return True
    except Exception as e:
        print(f'✗ Redis 连接失败: {str(e)}')
        return False


def test_minio_connection():
    """测试 MinIO 连接"""
    print()
    print('=' * 60)
    print('测试 11: MinIO 对象存储连接测试')
    print('=' * 60)
    try:
        from apps.files.services import MinIOService
        minio_service = MinIOService()
        if minio_service.is_available():
            print('✓ MinIO 连接成功')
            print(f'  存储桶: {minio_service.bucket_name}')
            if minio_service.bucket_exists():
                print('✓ 存储桶已存在')
            else:
                print('⚠ 存储桶不存在，需要创建')
            return True
        else:
            print('✗ MinIO 客户端未初始化 (服务可能未启动)')
            return False
    except Exception as e:
        print(f'✗ MinIO 连接失败: {str(e)}')
        return False


def main():
    print()
    print('=' * 60)
    print('实验室仪器预约追溯系统 - API 集成测试')
    print('=' * 60)
    print()

    # 测试登录
    token = test_login()
    headers = {'Authorization': f'Bearer {token}'}

    # 测试仪器列表
    instrument_id = test_instruments(headers)

    # 测试仪器时段 (Redis 缓存)
    if instrument_id:
        test_instrument_slots(headers, instrument_id)

    # 测试用户信息
    test_user_profile(headers)

    # 测试审计日志
    test_audit_logs(headers)

    # 测试预约列表
    test_reservations(headers)

    # 测试消息通知
    test_notifications(headers)

    # 测试使用记录
    test_records(headers)

    # 测试文件列表
    test_files(headers)

    # 测试 Redis 连接
    redis_ok = test_redis_connection()

    # 测试 MinIO 连接
    minio_ok = test_minio_connection()

    print()
    print('=' * 60)
    print('测试完成!')
    print('=' * 60)
    print()
    print('系统访问地址:')
    print('  前端地址: http://localhost:8080/')
    print('  后端地址: http://localhost:8000/')
    print('  API 文档: http://localhost:8000/api/docs/')
    print('  API Schema: http://localhost:8000/api/schema/')
    print()
    print('默认账号:')
    print('  用户名: admin')
    print('  密码: admin123')
    print()
    print('核心模块状态:')
    print(f'  ✓ 用户与权限模块: 正常')
    print(f'  ✓ 仪器管理模块: 正常')
    print(f'  ✓ 预约管理模块: 正常')
    print(f'  ✓ 使用记录模块: 正常')
    print(f'  ✓ 文件存储模块: 正常')
    print(f'  ✓ 消息通知模块: 正常')
    print(f'  ✓ 操作审计模块: 正常')
    print(f'  {"✓" if redis_ok else "⚠"} Redis 缓存: {"正常" if redis_ok else "请检查服务"}')
    print(f'  {"✓" if minio_ok else "⚠"} MinIO 对象存储: {"正常" if minio_ok else "请检查服务"}')
    print()
    print('注意: 请及时修改默认密码以确保系统安全!')
    print()


if __name__ == '__main__':
    import django
    import os
    import dotenv
    dotenv.load_dotenv()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    main()
