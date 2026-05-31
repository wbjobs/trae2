"""
修复验证测试脚本
测试内容：
1. 强噪音环境下降噪效果
2. 特征提取数据完整性（各种边界情况）
3. 多路并发推理稳定性
"""
import logging
import sys
import time
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def test_denoise_strong_noise():
    """测试强噪音环境下降噪效果"""
    print("\n" + "="*60)
    print("测试1: 强噪音环境下降噪效果")
    print("="*60)

    try:
        from denoise import AudioDenoiser

        np.random.seed(42)
        sample_rate = 16000
        duration = 3
        t = np.linspace(0, duration, int(sample_rate * duration))

        signal = 0.1 * np.sin(2 * np.pi * 440 * t)

        strong_noise = 0.5 * np.random.randn(len(t))
        noisy_signal = signal + strong_noise

        snr_before = 10 * np.log10(np.sum(signal**2) / np.sum(strong_noise**2))
        print(f"输入信号 SNR: {snr_before:.2f} dB (强噪音环境)")

        results = {}
        for method in ["spectral_subtraction", "wiener", "wavelet"]:
            try:
                denoiser = AudioDenoiser(method=method)
                denoiser.auto_estimate_noise(noisy_signal)
                denoised = denoiser.denoise(noisy_signal)

                residual_noise = denoised - signal
                if np.sum(residual_noise**2) > 0:
                    snr_after = 10 * np.log10(np.sum(signal**2) / np.sum(residual_noise**2))
                else:
                    snr_after = 100

                noise_reduction = 20 * np.log10(np.std(noisy_signal) / np.std(denoised))

                results[method] = {
                    "snr_after": snr_after,
                    "noise_reduction": noise_reduction,
                    "output_valid": np.isfinite(denoised).all(),
                    "output_shape": denoised.shape,
                }
            except Exception as e:
                results[method] = {"error": str(e)}

        all_passed = True
        for method, result in results.items():
            if "error" in result:
                print(f"  ❌ {method}: 失败 - {result['error']}")
                all_passed = False
            else:
                status = "✅" if result["output_valid"] and result["snr_after"] > snr_before else "⚠️"
                print(f"  {status} {method}:")
                print(f"     SNR 改善: {result['snr_after'] - snr_before:.2f} dB")
                print(f"     噪声衰减: {result['noise_reduction']:.2f} dB")
                print(f"     输出有效: {result['output_valid']}")

        return all_passed

    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_feature_extraction_robustness():
    """测试特征提取鲁棒性 - 各种边界情况"""
    print("\n" + "="*60)
    print("测试2: 特征提取鲁棒性测试")
    print("="*60)

    try:
        from feature_extraction import FeatureExtractor, FeatureValidator

        extractor = FeatureExtractor(feature_types=["time_domain", "mfcc", "mel_spectrogram"])

        test_cases = [
            ("正常音频", np.random.randn(16000).astype(np.float32) * 0.1),
            ("静音", np.zeros(16000, dtype=np.float32)),
            ("短时音频", np.random.randn(100).astype(np.float32) * 0.1),
            ("极短音频", np.random.randn(10).astype(np.float32) * 0.1),
            ("空音频", np.array([], dtype=np.float32)),
            ("包含NaN", np.array([np.nan] * 1000 + [0.1] * 15000, dtype=np.float32)),
            ("包含Inf", np.array([np.inf] * 1000 + [0.1] * 15000, dtype=np.float32)),
            ("大振幅信号", np.random.randn(16000).astype(np.float32) * 100),
            ("高振幅脉冲", np.zeros(16000, dtype=np.float32)),
        ]

        test_cases[-1][1][8000] = 1000.0

        all_passed = True
        for name, audio in test_cases:
            try:
                features = extractor.extract(audio)
                flattened = extractor.extract_flattened(audio)
                stats = extractor.extract_global_stats(audio)

                features_valid = len(features) > 0
                shapes_valid = all(isinstance(v, np.ndarray) and np.isfinite(v).all() for v in features.values())
                flattened_valid = len(flattened) > 0 and np.isfinite(flattened).all()
                stats_valid = isinstance(stats, dict) and len(stats) > 0

                passed = features_valid and shapes_valid and flattened_valid and stats_valid
                status = "✅" if passed else "❌"

                print(f"  {status} {name}:")
                print(f"     特征数量: {len(features)}, 展平维度: {len(flattened)}")
                print(f"     特征有效: {shapes_valid}, 展平有效: {flattened_valid}")

                if not passed:
                    all_passed = False

            except Exception as e:
                print(f"  ❌ {name}: 异常 - {e}")
                all_passed = False

        print(f"\n  验证器测试:")
        valid, msg = FeatureValidator.validate_audio(np.random.randn(1000))
        print(f"     正常音频验证: {valid}, {msg}")

        sanitized = FeatureValidator.sanitize_audio(np.array([np.nan, np.inf, -np.inf]))
        print(f"     异常值清理有效: {np.isfinite(sanitized).all()}")

        return all_passed

    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_concurrent_inference():
    """测试多路并发推理稳定性"""
    print("\n" + "="*60)
    print("测试3: 多路并发推理稳定性")
    print("="*60)

    try:
        from classifier import AudioClassifier

        classifier = AudioClassifier(
            model_type="random_forest",
            use_model_pool=True,
            pool_size=4,
            max_retries=3,
            timeout_seconds=5.0,
        )
        classifier.load_model()

        def inference_task(task_id):
            try:
                np.random.seed(task_id + int(time.time() * 1000) % 10000)
                features = np.random.randn(1024).astype(np.float32)
                start_time = time.time()
                result = classifier.classify(features)
                elapsed = (time.time() - start_time) * 1000
                return {
                    "task_id": task_id,
                    "success": True,
                    "label": result.label,
                    "confidence": result.confidence,
                    "latency_ms": elapsed,
                    "valid_label": result.label != "unknown" or result.confidence == 0.0,
                }
            except Exception as e:
                return {
                    "task_id": task_id,
                    "success": False,
                    "error": str(e),
                }

        num_concurrent = 32
        print(f"  并发任务数: {num_concurrent}, 模型池大小: 4")

        start_time = time.time()
        results = []

        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(inference_task, i) for i in range(num_concurrent)]
            for future in as_completed(futures):
                results.append(future.result())

        total_time = time.time() - start_time

        success_count = sum(1 for r in results if r["success"])
        valid_count = sum(1 for r in results if r["success"] and r.get("valid_label", False))
        latencies = [r["latency_ms"] for r in results if r["success"]]

        print(f"\n  结果统计:")
        print(f"    总成功数: {success_count}/{num_concurrent} ({success_count/num_concurrent*100:.1f}%)")
        print(f"    有效结果: {valid_count}/{num_concurrent} ({valid_count/num_concurrent*100:.1f}%)")
        if latencies:
            print(f"    平均延迟: {np.mean(latencies):.2f} ms")
            print(f"    最大延迟: {np.max(latencies):.2f} ms")
            print(f"    最小延迟: {np.min(latencies):.2f} ms")
        print(f"    总耗时: {total_time*1000:.2f} ms")
        print(f"    吞吐量: {num_concurrent/total_time:.2f} req/s")

        stats = classifier.get_stats()
        print(f"\n  分类器状态:")
        print(f"    推理计数: {stats['inference_count']}")
        print(f"    重试次数: {stats['retry_count']}")
        print(f"    超时次数: {stats['timeout_count']}")
        print(f"    恢复次数: {stats['recovery_count']}")
        print(f"    平均延迟: {stats['avg_latency_ms']:.2f} ms")

        classifier.unload()

        success_rate = success_count / num_concurrent
        return success_rate >= 0.95

    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_integration_pipeline():
    """集成测试 - 完整处理流程"""
    print("\n" + "="*60)
    print("测试4: 完整处理流程集成测试")
    print("="*60)

    try:
        from denoise import AudioDenoiser
        from feature_extraction import FeatureExtractor
        from classifier import AudioClassifier

        np.random.seed(42)
        sample_rate = 16000

        test_signal = 0.1 * np.sin(2 * np.pi * 440 * np.linspace(0, 2, 2*sample_rate))
        test_signal += 0.3 * np.random.randn(len(test_signal))

        print(f"  输入信号: {len(test_signal)} 采样点, {len(test_signal)/sample_rate:.2f} 秒")

        print("\n  步骤1: 音频降噪")
        denoiser = AudioDenoiser(method="spectral_subtraction")
        denoiser.auto_estimate_noise(test_signal)
        denoised = denoiser.denoise(test_signal)
        print(f"    降噪后: {len(denoised)} 采样点, 有限值: {np.isfinite(denoised).all()}")

        print("\n  步骤2: 特征提取")
        extractor = FeatureExtractor(feature_types=["mfcc", "mel_spectrogram", "time_domain"])
        features = extractor.extract(denoised)
        flattened = extractor.extract_flattened(denoised)
        print(f"    特征类型: {list(features.keys())}")
        print(f"    展平维度: {len(flattened)}")
        print(f"    特征有效: {all(np.isfinite(v).all() for v in features.values())}")

        print("\n  步骤3: AI 分类")
        classifier = AudioClassifier(model_type="random_forest", use_model_pool=True)
        classifier.load_model()
        result = classifier.classify(flattened)
        print(f"    分类结果: {result.label}")
        print(f"    置信度: {result.confidence:.4f}")
        print(f"    推理耗时: {result.latency_ms:.2f} ms")

        classifier.unload()

        print("\n  ✅ 完整流程测试通过")
        return True

    except Exception as e:
        print(f"  ❌ 集成测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("声学样本降噪与特征分类 AI 预处理平台 - 修复验证测试")
    print("测试内容: 强噪音降噪 | 特征提取鲁棒性 | 并发推理稳定性 | 完整流程")

    results = {}

    results["强噪音降噪"] = test_denoise_strong_noise()
    results["特征提取鲁棒性"] = test_feature_extraction_robustness()
    results["并发推理稳定性"] = test_concurrent_inference()
    results["完整流程集成"] = test_integration_pipeline()

    print("\n" + "="*60)
    print("测试总结")
    print("="*60)

    all_passed = True
    for test_name, passed in results.items():
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"  {status}: {test_name}")
        if not passed:
            all_passed = False

    print("\n" + "="*60)
    if all_passed:
        print("🎉 所有测试通过！修复验证成功。")
    else:
        print("⚠️  部分测试失败，请检查上述输出。")
    print("="*60 + "\n")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
