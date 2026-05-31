#!/usr/bin/env python
"""
数据库初始化脚本
"""
import os
import sys
import django
import dotenv

dotenv.load_dotenv()
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()


def init_permissions():
    """初始化权限"""
    from apps.accounts.services import PermissionService
    print('正在初始化权限...')
    PermissionService.initialize_permissions()
    print('✓ 权限初始化完成')


def init_roles():
    """初始化角色"""
    from apps.accounts.services import PermissionService
    print('正在初始化角色...')
    PermissionService.initialize_roles()
    print('✓ 角色初始化完成')


def init_superuser():
    """初始化超级管理员"""
    from apps.accounts.services import PermissionService
    print('正在初始化超级管理员...')
    PermissionService.initialize_superuser()
    print('✓ 超级管理员初始化完成')


def init_instruments():
    """初始化测试仪器数据"""
    from apps.instruments.models import InstrumentCategory, Instrument
    import uuid

    print('正在初始化测试仪器数据...')

    categories = [
        {'code': 'OPTICAL', 'name': '光学仪器', 'description': '显微镜、光谱仪等'},
        {'code': 'ANALYSIS', 'name': '分析仪器', 'description': '色谱仪、质谱仪等'},
        {'code': 'ELECTRONIC', 'name': '电子仪器', 'description': '示波器、信号发生器等'},
        {'code': 'BIOCHEM', 'name': '生化仪器', 'description': 'PCR仪、离心机等'},
        {'code': 'PHYSICS', 'name': '物理仪器', 'description': '万能试验机、硬度计等'},
    ]

    for cat_data in categories:
        category, created = InstrumentCategory.objects.get_or_create(
            code=cat_data['code'],
            defaults={
                'name': cat_data['name'],
                'description': cat_data['description']
            }
        )

    instruments = [
        {
            'code': 'INS-001',
            'name': '高倍光学显微镜',
            'model': 'Olympus-BX53',
            'category_code': 'OPTICAL',
            'location': 'A栋301室',
            'description': '科研级正置荧光显微镜，支持明场、暗场、相差观察',
            'specifications': '放大倍数: 40x-1000x, 光源: LED',
            'status': 'available',
        },
        {
            'code': 'INS-002',
            'name': '高效液相色谱仪',
            'model': 'Agilent-1260',
            'category_code': 'ANALYSIS',
            'location': 'B栋205室',
            'description': '用于有机化合物的定性和定量分析',
            'specifications': '柱温箱: 室温-80°C, 流速: 0.001-10mL/min',
            'status': 'available',
        },
        {
            'code': 'INS-003',
            'name': '数字示波器',
            'model': 'Tektronix-MSO64',
            'category_code': 'ELECTRONIC',
            'location': 'C栋102室',
            'description': '4通道混合信号示波器，带宽1GHz',
            'specifications': '带宽: 1GHz, 采样率: 10GS/s',
            'status': 'available',
        },
        {
            'code': 'INS-004',
            'name': '实时荧光定量PCR仪',
            'model': 'Applied-Biosystems-7500',
            'category_code': 'BIOCHEM',
            'location': 'D栋401室',
            'description': '用于基因表达分析、病原体检测等',
            'specifications': '通道数: 5色, 样本容量: 96孔',
            'status': 'maintenance',
        },
        {
            'code': 'INS-005',
            'name': '万能电子试验机',
            'model': 'Instron-5967',
            'category_code': 'PHYSICS',
            'location': 'E栋101室',
            'description': '用于材料的拉伸、压缩、弯曲等力学性能测试',
            'specifications': '最大载荷: 30kN, 速度范围: 0.001-500mm/min',
            'status': 'available',
        },
        {
            'code': 'INS-006',
            'name': '扫描电子显微镜',
            'model': 'Hitachi-SU5000',
            'category_code': 'OPTICAL',
            'location': 'A栋305室',
            'description': '高分辨率场发射扫描电子显微镜',
            'specifications': '分辨率: 1.0nm, 加速电压: 0.5-30kV',
            'status': 'available',
        },
        {
            'code': 'INS-007',
            'name': '气相色谱质谱联用仪',
            'model': 'Thermo-ISQ7000',
            'category_code': 'ANALYSIS',
            'location': 'B栋208室',
            'description': '用于复杂混合物的定性定量分析',
            'specifications': '质量范围: 10-1050m/z, EI源',
            'status': 'available',
        },
        {
            'code': 'INS-008',
            'name': '高速冷冻离心机',
            'model': 'Eppendorf-5810R',
            'category_code': 'BIOCHEM',
            'location': 'D栋405室',
            'description': '大容量高速冷冻离心机',
            'specifications': '最大转速: 14000rpm, 温度范围: -10~40°C',
            'status': 'available',
        },
    ]

    for inst_data in instruments:
        category = InstrumentCategory.objects.get(code=inst_data['category_code'])
        instrument, created = Instrument.objects.get_or_create(
            code=inst_data['code'],
            defaults={
                'name': inst_data['name'],
                'model': inst_data['model'],
                'category': category,
                'location': inst_data['location'],
                'description': inst_data['description'],
                'specifications': inst_data['specifications'],
                'status': inst_data['status'],
            }
        )

    print(f'✓ 仪器数据初始化完成，共 {Instrument.objects.count()} 台仪器')


def test_redis():
    """测试Redis连接"""
    from django_redis import get_redis_connection
    print('正在测试Redis连接...')
    try:
        conn = get_redis_connection()
        conn.ping()
        conn.set('test_key', 'test_value', ex=60)
        value = conn.get('test_key')
        if value and value.decode('utf-8') == 'test_value':
            print('✓ Redis连接测试成功')
            return True
        else:
            print('✗ Redis连接测试失败: 数据读写异常')
            return False
    except Exception as e:
        print(f'✗ Redis连接测试失败: {str(e)}')
        return False


def test_minio():
    """测试MinIO连接"""
    from apps.files.services import MinIOService
    print('正在测试MinIO连接...')
    try:
        minio_service = MinIOService()
        bucket_exists = minio_service.bucket_exists()
        if not bucket_exists:
            minio_service.create_bucket()
            print(f'✓ 创建存储桶: {minio_service.bucket_name}')
        print('✓ MinIO连接测试成功')
        return True
    except Exception as e:
        print(f'✗ MinIO连接测试失败: {str(e)}')
        return False


def main():
    print('=' * 60)
    print('实验室仪器预约追溯系统 - 数据初始化')
    print('=' * 60)
    print()

    try:
        init_permissions()
        init_roles()
        init_superuser()
        init_instruments()
        print()

        print('=' * 60)
        print('系统连接测试')
        print('=' * 60)
        print()

        redis_ok = test_redis()
        minio_ok = test_minio()
        print()

        print('=' * 60)
        print('初始化完成')
        print('=' * 60)
        print()
        print('默认超级管理员账号:')
        print('  用户名: admin')
        print('  密码: admin123456')
        print()
        print('请及时修改默认密码以确保系统安全!')
        print()

        if not redis_ok:
            print('⚠ 警告: Redis连接失败，请检查Redis服务是否启动')
        if not minio_ok:
            print('⚠ 警告: MinIO连接失败，请检查MinIO服务是否启动')

    except Exception as e:
        print(f'✗ 初始化失败: {str(e)}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
