#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
电机异响诊断平台 API 测试脚本
"""
import os
import sys
import json
import numpy as np
import requests
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

def generate_test_audio(duration=2.0, sample_rate=16000, fault_type='normal'):
    """生成测试音频"""
    n_samples = int(duration * sample_rate)
    t = np.linspace(0, duration, n_samples)
    
    base_noise = np.random.normal(0, 0.02, n_samples)
    audio = base_noise.copy()
    
    if fault_type == 'normal':
        fundamental = 50
        harmonics = [2, 3, 4]
        for h in harmonics:
            amp = 0.5 / h
            audio += amp * np.sin(2 * np.pi * fundamental * h * t)
        audio *= 0.5
    elif fault_type == 'bearing_fault':
        bearing_freq = 150
        modulation_freq = 15
        carrier = np.sin(2 * np.pi * bearing_freq * t)
        modulation = 1 + 0.3 * np.sin(2 * np.pi * modulation_freq * t)
        audio += 0.6 * carrier * modulation
        sidebands = [-4, -3, -2, -1, 1, 2, 3, 4]
        for sb in sidebands:
            amp = 0.15 / (abs(sb) + 1)
            audio += amp * np.sin(2 * np.pi * (bearing_freq + sb * modulation_freq) * t)
    elif fault_type == 'gear_fault':
        mesh_freq = 300
        rotation_freq = 25
        for h in range(1, 5):
            amp = 0.4 / h
            audio += amp * np.sin(2 * np.pi * mesh_freq * h * t)
        audio += 0.15 * np.sin(2 * np.pi * rotation_freq * t)
        impulses = np.zeros(n_samples)
        impulse_interval = int(sample_rate / rotation_freq)
        for i in range(0, n_samples, impulse_interval):
            if i + 50 < n_samples:
                impulses[i:i+50] = np.exp(-np.linspace(0, 3, 50))
        audio += 0.3 * impulses
    
    return audio.astype(np.float32), sample_rate

def save_test_wav(audio, sample_rate, filename):
    """保存测试音频"""
    import soundfile as sf
    sf.write(filename, audio, sample_rate)
    return filename

def test_health():
    """测试健康检查接口"""
    print("=" * 60)
    print("测试1: 健康检查接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"状态码: {response.status_code}")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_diagnosis(audio_file, motor_id='test_motor_001'):
    """测试故障诊断接口"""
    print("\n" + "=" * 60)
    print("测试2: 故障诊断接口")
    print("=" * 60)
    try:
        with open(audio_file, 'rb') as f:
            files = {'file': f}
            params = {
                'motor_id': motor_id,
                'motor_type': 'induction_motor',
                'save_sample': 'true',
                'denoise_method': 'combined'
            }
            response = requests.post(f"{BASE_URL}/api/v1/diagnosis", files=files, params=params)
            print(f"状态码: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"故障类型: {result['fault_type']}")
                print(f"置信度: {result['confidence']:.4f}")
                print(f"处理耗时: {result['processing_time_ms']:.2f} ms")
                print(f"样本ID: {result.get('sample_id', 'N/A')}")
                print(f"\n各类别概率:")
                for k, v in result['fault_probabilities'].items():
                    print(f"  {k}: {v*100:.2f}%")
                return True
            else:
                print(f"错误响应: {response.text}")
                return False
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_upload_sample(audio_file, fault_type=None):
    """测试样本上传接口"""
    print("\n" + "=" * 60)
    print("测试3: 样本上传接口")
    print("=" * 60)
    try:
        with open(audio_file, 'rb') as f:
            files = {'file': f}
            params = {
                'motor_type': 'induction_motor',
                'is_labeled': 'true' if fault_type else 'false'
            }
            if fault_type:
                params['fault_type'] = fault_type
                params['fault_severity'] = 'moderate'
            
            response = requests.post(f"{BASE_URL}/api/v1/samples/upload", files=files, params=params)
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_get_samples():
    """测试样本查询接口"""
    print("\n" + "=" * 60)
    print("测试4: 样本查询接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/samples", params={'limit': 5})
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"样本总数: {result['total']}")
            print(f"返回样本数: {len(result['samples'])}")
            for sample in result['samples'][:3]:
                print(f"  - {sample['sample_id']}: {sample['fault_type']} "
                      f"({sample['duration']:.2f}s, 置信度: {sample['confidence']*100:.1f}%)")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_statistics():
    """测试统计信息接口"""
    print("\n" + "=" * 60)
    print("测试5: 统计信息接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/samples/statistics")
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            stats = response.json()
            print(f"样本总数: {stats['total_samples']}")
            print(f"已标注: {stats['labeled_samples']}")
            print(f"未标注: {stats['unlabeled_samples']}")
            print(f"总时长: {stats['total_duration_hours']:.2f} 小时")
            print(f"按故障类型分布: {json.dumps(stats.get('by_fault_type', {}), ensure_ascii=False)}")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_model_info():
    """测试模型信息接口"""
    print("\n" + "=" * 60)
    print("测试6: 模型信息接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/model/info")
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            info = response.json()
            print(f"模型名称: {info['model_name']}")
            print(f"模型版本: {info['model_version']}")
            print(f"模型类型: {info['model_type']}")
            print(f"准确率: {info['accuracy']*100:.2f}%")
            print(f"支持类别数: {len(info['classes'])}")
            print(f"类别: {', '.join(info['classes'])}")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_diagnosis_history():
    """测试诊断历史接口"""
    print("\n" + "=" * 60)
    print("测试7: 诊断历史接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/diagnosis/history", params={'limit': 5})
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"记录总数: {result['total']}")
            for record in result['records'][:3]:
                print(f"  - {record['record_id']}: {record['fault_type']} "
                      f"({record['confidence']*100:.1f}%, {record['created_at']})")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_stream_sessions():
    """测试流会话接口"""
    print("\n" + "=" * 60)
    print("测试8: 流会话查询接口")
    print("=" * 60)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/stream/sessions")
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"活跃会话数: {result['total_active']}/{result['max_streams']}")
            for session in result.get('sessions', []):
                print(f"  - {session['session_id']}: {session['motor_id']} "
                      f"({session['total_duration']:.1f}s, {session['diagnosis_count']}次诊断)")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("电机异响诊断平台 API 测试脚本")
    print("=" * 60)
    
    # 生成测试音频
    print("\n生成测试音频...")
    test_dir = Path("./data/test")
    test_dir.mkdir(exist_ok=True, parents=True)
    
    # 生成不同故障类型的测试音频
    test_files = {}
    for fault in ['normal', 'bearing_fault', 'gear_fault']:
        audio, sr = generate_test_audio(duration=3.0, fault_type=fault)
        filename = str(test_dir / f"test_{fault}.wav")
        save_test_wav(audio, sr, filename)
        test_files[fault] = filename
        print(f"  ✓ 生成 {filename} ({fault})")
    
    print("\n开始API测试...")
    print(f"目标地址: {BASE_URL}")
    
    results = []
    
    # 运行所有测试
    results.append(("健康检查", test_health()))
    time.sleep(0.5)
    
    results.append(("故障诊断 (正常)", test_diagnosis(test_files['normal'], 'test_motor_001')))
    time.sleep(0.5)
    
    results.append(("故障诊断 (轴承故障)", test_diagnosis(test_files['bearing_fault'], 'test_motor_002')))
    time.sleep(0.5)
    
    results.append(("样本上传", test_upload_sample(test_files['gear_fault'], 'gear_fault')))
    time.sleep(0.5)
    
    results.append(("样本查询", test_get_samples()))
    time.sleep(0.5)
    
    results.append(("统计信息", test_statistics()))
    time.sleep(0.5)
    
    results.append(("模型信息", test_model_info()))
    time.sleep(0.5)
    
    results.append(("诊断历史", test_diagnosis_history()))
    time.sleep(0.5)
    
    results.append(("流会话查询", test_stream_sessions()))
    
    # 打印测试结果汇总
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"  {status} - {name}")
    
    print("\n" + "=" * 60)
    print(f"总计: {passed}/{total} 测试通过")
    print("=" * 60)
    
    if passed == total:
        print("\n🎉 所有API测试通过！")
        print(f"🌐 前端控制台: {BASE_URL}/static/index.html")
        print(f"📚 API文档: {BASE_URL}/docs")
    else:
        print(f"\n⚠️  {total - passed} 个测试失败，请检查服务是否正常启动")
    
    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        sys.exit(1)
