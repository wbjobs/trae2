#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证修复脚本：测试降噪、特征提取、AI推理的修复效果
"""
import os
import sys
import numpy as np
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.denoiser import AudioDenoiser
from src.feature_extractor import FeatureExtractor
from src.ai_classifier import AIClassifier
from src.config import settings


def generate_industrial_noise(duration=3.0, sample_rate=16000, snr_level='high'):
    """生成不同强度的工业噪声"""
    n_samples = int(duration * sample_rate)
    t = np.linspace(0, duration, n_samples)
    
    signal = np.zeros(n_samples)
    fundamental = 50
    for h in range(1, 6):
        signal += (1.0 / h) * np.sin(2 * np.pi * fundamental * h * t)
    
    if snr_level == 'high':
        noise_amp = 5.0
    elif snr_level == 'medium':
        noise_amp = 2.0
    else:
        noise_amp = 0.5
    
    noise = np.zeros(n_samples)
    
    noise += noise_amp * np.random.normal(0, 1, n_samples)
    
    for freq in [60, 120, 180, 240, 300]:
        phase = np.random.uniform(0, 2 * np.pi)
        noise += noise_amp * 0.3 * np.sin(2 * np.pi * freq * t + phase)
    
    impulse_count = int(duration * 50)
    for _ in range(impulse_count):
        pos = np.random.randint(0, n_samples - 50)
        noise[pos:pos+50] += noise_amp * 2.0 * np.exp(-np.linspace(0, 3, 50))
    
    noisy_signal = signal + noise
    
    return noisy_signal.astype(np.float32), signal, sample_rate


def test_denoising_improvement():
    """测试降噪算法在强工业噪声下的表现"""
    print("=" * 70)
    print("测试1: 强工业噪声下降噪效果验证")
    print("=" * 70)
    
    denoiser = AudioDenoiser(sample_rate=16000)
    results = []
    
    for snr_level in ['high', 'medium', 'low']:
        noisy, clean, sr = generate_industrial_noise(snr_level=snr_level)
        
        noise_power = np.mean((noisy - clean) ** 2)
        signal_power = np.mean(clean ** 2)
        input_snr = 10 * np.log10(signal_power / (noise_power + 1e-10))
        
        start_time = time.time()
        denoised = denoiser.denoise(noisy, sr, method='adaptive_industrial')
        process_time = (time.time() - start_time) * 1000
        
        noise_power_out = np.mean((denoised - clean) ** 2)
        output_snr = 10 * np.log10(signal_power / (noise_power_out + 1e-10))
        snr_improvement = output_snr - input_snr
        
        results.append({
            'level': snr_level,
            'input_snr': input_snr,
            'output_snr': output_snr,
            'snr_improvement': snr_improvement,
            'time_ms': process_time
        })
        
        print(f"\n噪声级别: {snr_level}")
        print(f"  输入SNR: {input_snr:.2f} dB")
        print(f"  输出SNR: {output_snr:.2f} dB")
        print(f"  SNR提升: {snr_improvement:.2f} dB")
        print(f"  处理时间: {process_time:.2f} ms")
    
    print("\n" + "-" * 70)
    print("降噪测试完成:")
    all_improved = all(r['snr_improvement'] > 0 for r in results)
    print(f"  ✓ 所有测试SNR均有提升: {all_improved}")
    avg_improvement = np.mean([r['snr_improvement'] for r in results])
    print(f"  ✓ 平均SNR提升: {avg_improvement:.2f} dB")
    
    return all_improved


def test_feature_extraction_completeness():
    """测试特征提取完整性"""
    print("\n" + "=" * 70)
    print("测试2: 强噪声下特征提取完整性验证")
    print("=" * 70)
    
    extractor = FeatureExtractor(sample_rate=16000)
    
    noisy, clean, sr = generate_industrial_noise(snr_level='high')
    
    print("\n在强噪声信号上提取特征...")
    start_time = time.time()
    features = extractor.extract_all_features(noisy, sr)
    process_time = (time.time() - start_time) * 1000
    
    feature_count = len(features)
    print(f"  提取特征数量: {feature_count}")
    print(f"  处理时间: {process_time:.2f} ms")
    
    nan_count = sum(1 for v in features.values() if np.isnan(v))
    inf_count = sum(1 for v in features.values() if np.isinf(v))
    zero_count = sum(1 for v in features.values() if v == 0.0)
    
    print(f"  NaN值数量: {nan_count}")
    print(f"  Inf值数量: {inf_count}")
    print(f"  零值数量: {zero_count}")
    
    feature_categories = {
        '时域特征': [k for k in features.keys() if any(t in k for t in ['mean', 'std', 'rms', 'peak', 'crest', 'skew', 'kurtosis', 'energy'])],
        '频域特征': [k for k in features.keys() if any(t in k for t in ['spectral', 'freq', 'bandwidth', 'rolloff'])],
        '包络特征': [k for k in features.keys() if 'envelope' in k],
        '倒谱特征': [k for k in features.keys() if 'cepstrum' in k],
        '轴承特征': [k for k in features.keys() if 'bearing' in k],
        '齿轮特征': [k for k in features.keys() if 'gear' in k],
        'MFCC特征': [k for k in features.keys() if 'mfcc' in k],
        '谐波特征': [k for k in features.keys() if 'harmonic' in k],
    }
    
    print("\n特征类别统计:")
    for category, feats in feature_categories.items():
        if feats:
            print(f"  {category}: {len(feats)} 个")
    
    print("\n" + "-" * 70)
    print("特征提取测试完成:")
    no_nan_inf = (nan_count == 0 and inf_count == 0)
    print(f"  ✓ 无NaN/Inf值: {no_nan_inf}")
    enough_features = feature_count >= 100
    print(f"  ✓ 特征数量充足 (>=100): {enough_features} ({feature_count})")
    
    return no_nan_inf and enough_features


def test_concurrent_inference_stability():
    """测试多路并发AI推理稳定性"""
    print("\n" + "=" * 70)
    print("测试3: 多路并发AI推理稳定性验证")
    print("=" * 70)
    
    classifier = AIClassifier(model_path=settings.model_path)
    extractor = FeatureExtractor(sample_rate=16000)
    
    print("\n生成测试数据...")
    n_concurrent = 10
    n_requests = 50
    
    test_features = []
    for i in range(n_requests):
        noisy, _, sr = generate_industrial_noise(duration=2.0, snr_level='medium')
        features = extractor.extract_all_features(noisy, sr)
        test_features.append(features)
    
    print(f"\n测试配置:")
    print(f"  并发线程数: {n_concurrent}")
    print(f"  总请求数: {n_requests}")
    print(f"  模型断路器初始状态: {classifier._circuit_breaker.state}")
    
    results = []
    errors = []
    
    start_time = time.time()
    
    def inference_task(idx, features):
        try:
            task_start = time.time()
            prediction, confidence, probs = classifier.classify(features)
            task_time = (time.time() - task_start) * 1000
            return {
                'idx': idx,
                'success': True,
                'prediction': prediction,
                'confidence': confidence,
                'time_ms': task_time,
                'error': None
            }
        except Exception as e:
            return {
                'idx': idx,
                'success': False,
                'prediction': None,
                'confidence': 0.0,
                'time_ms': 0,
                'error': str(e)
            }
    
    print(f"\n开始并发测试...")
    with ThreadPoolExecutor(max_workers=n_concurrent) as executor:
        futures = []
        for i, features in enumerate(test_features):
            future = executor.submit(inference_task, i, features)
            futures.append(future)
        
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if not result['success']:
                errors.append(result)
    
    total_time = (time.time() - start_time) * 1000
    
    success_count = sum(1 for r in results if r['success'])
    fail_count = len(results) - success_count
    success_rate = success_count / len(results) * 100
    
    times = [r['time_ms'] for r in results if r['success']]
    avg_time = np.mean(times) if times else 0
    max_time = np.max(times) if times else 0
    min_time = np.min(times) if times else 0
    
    print(f"\n测试结果:")
    print(f"  总耗时: {total_time:.2f} ms")
    print(f"  成功请求: {success_count}/{len(results)}")
    print(f"  失败请求: {fail_count}")
    print(f"  成功率: {success_rate:.2f}%")
    print(f"  平均推理时间: {avg_time:.2f} ms")
    print(f"  最大推理时间: {max_time:.2f} ms")
    print(f"  最小推理时间: {min_time:.2f} ms")
    
    stats = classifier.get_statistics()
    print(f"\n模型统计:")
    print(f"  总预测数: {stats['total_predictions']}")
    print(f"  成功预测: {stats['successful_predictions']}")
    print(f"  失败预测: {stats['failed_predictions']}")
    print(f"  成功率: {stats['success_rate']*100:.2f}%")
    print(f"  断路器状态: {stats['circuit_breaker_state']}")
    
    predictions = [r['prediction'] for r in results if r['success']]
    pred_distribution = {}
    for pred in predictions:
        pred_distribution[pred] = pred_distribution.get(pred, 0) + 1
    
    print(f"\n预测分布:")
    for pred, count in sorted(pred_distribution.items()):
        print(f"  {pred}: {count} ({count/len(predictions)*100:.1f}%)")
    
    if errors:
        print(f"\n错误详情 ({len(errors)}个):")
        for err in errors[:5]:
            print(f"  请求{err['idx']}: {err['error']}")
        if len(errors) > 5:
            print(f"  ... 还有 {len(errors)-5} 个错误")
    
    print("\n" + "-" * 70)
    print("并发测试完成:")
    high_success = success_rate >= 95
    print(f"  ✓ 成功率 >= 95%: {high_success} ({success_rate:.2f}%)")
    circuit_ok = stats['circuit_breaker_state'] == 'closed'
    print(f"  ✓ 断路器状态正常: {circuit_ok} ({stats['circuit_breaker_state']})")
    
    return high_success and circuit_ok


def main():
    """主函数"""
    print("\n" + "=" * 70)
    print("电机异响诊断平台 - 修复验证测试")
    print("=" * 70)
    
    results = []
    
    try:
        results.append(("降噪效果", test_denoising_improvement()))
    except Exception as e:
        print(f"\n降噪测试失败: {e}")
        results.append(("降噪效果", False))
    
    try:
        results.append(("特征完整性", test_feature_extraction_completeness()))
    except Exception as e:
        print(f"\n特征提取测试失败: {e}")
        results.append(("特征完整性", False))
    
    try:
        results.append(("并发稳定性", test_concurrent_inference_stability()))
    except Exception as e:
        print(f"\n并发测试失败: {e}")
        results.append(("并发稳定性", False))
    
    print("\n" + "=" * 70)
    print("测试结果汇总")
    print("=" * 70)
    
    all_passed = True
    for name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"  {status} - {name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 所有修复验证通过！")
        print("\n修复总结:")
        print("  1. 降噪算法: 自适应工业噪声降噪 + 鲁棒噪声估计 + 多阶段滤波")
        print("  2. 特征提取: 增加包络/倒谱/轴承/齿轮专用特征 + NaN/Inf防护")
        print("  3. 并发稳定性: 线程锁 + 超时机制 + 重试机制 + 熔断保护")
    else:
        print("⚠️  部分测试未通过，请检查日志")
    print("=" * 70 + "\n")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n测试异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
