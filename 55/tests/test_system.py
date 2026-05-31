"""
系统测试脚本 - 增强版
用于验证工业设备故障智能研判AI服务系统的各项功能
"""

import os
import sys
import json
import time
import tempfile

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = BASE_DIR
sys.path.insert(0, SRC_DIR)


def test_models():
    """测试数据模型"""
    print("[测试] 数据模型模块...")
    try:
        from src.models import (
            TextParsingRequest,
            ParsedTextResult,
            SemanticFeatureResult,
            FaultMatchResult,
            FaultType,
            FaultCategory,
            SeverityLevel,
            RepairSolution,
            RepairRecommendation,
            SingleFaultAnalysisResult,
            BatchFaultAnalysisRequest,
            FaultCorrectionRequest,
            FaultCorrection,
            FaultCase,
            CorrectionStatus,
            CaseStatus,
            TaskPriority,
            ModelPerformanceMetrics,
        )

        request = TextParsingRequest(
            text="电机过热，温度升高",
            device_id="TEST001",
            device_type="测试设备",
            priority=TaskPriority.normal,
        )
        assert request.text == "电机过热，温度升高"
        assert request.device_id == "TEST001"
        assert request.priority == TaskPriority.normal

        correction_req = FaultCorrectionRequest(
            analysis_request_id="REQ001",
            original_text="电机过热",
            correct_fault_type_id="FT001",
            correct_fault_type_name="电机过热故障",
            operator="张三",
            reason="现场确认确实是电机过热",
        )
        assert correction_req.operator == "张三"

        print("  ✓ 数据模型模块正常")
        return True
    except Exception as e:
        print(f"  ✗ 数据模型模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_text_parser():
    """测试文本解析模块"""
    print("[测试] 文本解析模块...")
    try:
        from src.text_parser import TextParser
        from src.models import TextParsingRequest

        config = {
            "max_text_length": 2000,
            "min_text_length": 5,
            "segment_length": 300,
        }
        parser = TextParser(config)

        request = TextParsingRequest(
            text="电机运行过热，温度达到85度，轴承有异响，设备#A-201生产线1号工位"
        )
        result = parser.parse(request)

        assert len(result.cleaned_text) > 0
        assert len(result.keywords) > 0
        assert len(result.tokens) > 0
        print(f"  ✓ 文本解析正常 - 关键词: {result.keywords[:5]}")
        print(f"    提取设备信息: {result.device_info}")
        return True
    except Exception as e:
        print(f"  ✗ 文本解析模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_long_text_parsing():
    """测试长文本分段解析"""
    print("[测试] 长文本分段解析...")
    try:
        from src.text_parser import TextParser
        from src.models import TextParsingRequest

        config = {
            "max_text_length": 2000,
            "min_text_length": 5,
            "segment_length": 100,
        }
        parser = TextParser(config)

        long_text = "电机过热。温度很高。轴承异响。" * 20
        request = TextParsingRequest(text=long_text)
        result = parser.parse(request)

        assert len(result.cleaned_text) > 0
        assert len(result.keywords) > 0
        print(
            f"  ✓ 长文本解析正常 - 原长度={len(long_text)}, 关键词数={len(result.keywords)}"
        )
        return True
    except Exception as e:
        print(f"  ✗ 长文本解析失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_semantic_features():
    """测试语义特征计算模块"""
    print("[测试] 语义特征计算模块...")
    try:
        from src.semantic_features import SemanticFeatureExtractor
        from src.models import ParsedTextResult

        extractor = SemanticFeatureExtractor()

        parsed = ParsedTextResult(
            original_text="电机过热",
            cleaned_text="电机过热",
            keywords=["电机", "过热"],
            tokens=["电机", "过热"],
            device_info=None,
        )

        result = extractor.extract_features(parsed)

        assert len(result.feature_vector) > 0
        assert result.vector_dimension > 0
        print(
            f"  ✓ 语义特征正常 - 维度: {result.vector_dimension}, 模型: {result.embedding_model}"
        )
        return True
    except Exception as e:
        print(f"  ✗ 语义特征计算模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_semantic_cache():
    """测试语义特征缓存功能"""
    print("[测试] 语义特征缓存...")
    try:
        from src.semantic_features import SemanticFeatureExtractor
        from src.models import ParsedTextResult

        extractor = SemanticFeatureExtractor()

        parsed = ParsedTextResult(
            original_text="电机过热测试缓存",
            cleaned_text="电机过热测试缓存",
            keywords=["电机", "过热"],
            tokens=["电机", "过热"],
            device_info=None,
        )

        start1 = time.time()
        result1 = extractor.extract_features(parsed)
        elapsed1 = time.time() - start1

        start2 = time.time()
        result2 = extractor.extract_features(parsed)
        elapsed2 = time.time() - start2

        assert len(result1.feature_vector) == len(result2.feature_vector)
        print(
            f"  ✓ 缓存正常 - 首次耗时: {elapsed1:.4f}s, 缓存耗时: {elapsed2:.4f}s"
        )
        return True
    except Exception as e:
        print(f"  ✗ 语义特征缓存失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_fault_matcher():
    """测试故障类型匹配模块"""
    print("[测试] 故障类型匹配模块...")
    try:
        from src.fault_matcher import FaultMatcher
        from src.semantic_features import SemanticFeatureExtractor
        from src.models import ParsedTextResult

        extractor = SemanticFeatureExtractor()
        matcher = FaultMatcher({"similarity_threshold": 0.4, "max_candidates": 3})
        matcher.set_feature_extractor(extractor)

        parsed = ParsedTextResult(
            original_text="电机过热，温度升高，运行时发烫",
            cleaned_text="电机过热温度升高运行时发烫",
            keywords=["电机", "过热", "温度", "升高", "发烫"],
            tokens=["电机", "过热", "温度", "升高", "运行", "发烫"],
            device_info=None,
        )

        features = extractor.extract_features(parsed)
        matches = matcher.match(parsed, features)

        assert len(matches) > 0
        best_match = matches[0]
        print(
            f"  ✓ 故障匹配正常 - 最佳匹配: {best_match.fault_type.name} "
            f"(得分: {best_match.similarity_score:.3f})"
        )
        print(f"    匹配关键词: {best_match.matched_keywords}")
        return True
    except Exception as e:
        print(f"  ✗ 故障类型匹配模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_weighted_keyword_matching():
    """测试加权关键词匹配"""
    print("[测试] 加权关键词匹配...")
    try:
        from src.fault_matcher import FaultMatcher

        matcher = FaultMatcher({"similarity_threshold": 0.3, "max_candidates": 5})

        score, matched = matcher._calculate_weighted_keyword_score(
            ["PLC", "通信", "中断", "连接", "失败"],
            ["PLC", "通信", "连接", "网络", "数据异常", "超时"],
        )

        assert score > 0
        assert len(matched) > 0
        print(f"  ✓ 加权关键词匹配正常 - 得分={score:.3f}, 匹配={matched}")
        return True
    except Exception as e:
        print(f"  ✗ 加权关键词匹配失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_dynamic_threshold():
    """测试动态阈值计算"""
    print("[测试] 动态阈值计算...")
    try:
        from src.fault_matcher import FaultMatcher

        matcher = FaultMatcher()

        threshold1 = matcher._calculate_dynamic_threshold(
            ["电机", "过热", "温度", "升高", "发烫", "轴承", "异响"],
            ["电机", "过热", "温度", "升高"],
            {"机械故障": 0.5},
        )

        threshold2 = matcher._calculate_dynamic_threshold(["过热"], ["过热"], {})

        assert threshold1 < threshold2
        print(
            f"  ✓ 动态阈值正常 - 多关键词={threshold1:.3f}, 少关键词={threshold2:.3f}"
        )
        return True
    except Exception as e:
        print(f"  ✗ 动态阈值计算失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_repair_recommender():
    """测试维修方案推荐模块"""
    print("[测试] 维修方案推荐模块...")
    try:
        from src.repair_recommender import RepairRecommender
        from src.fault_matcher import FaultMatcher
        from src.semantic_features import SemanticFeatureExtractor
        from src.models import ParsedTextResult

        extractor = SemanticFeatureExtractor()
        matcher = FaultMatcher({"similarity_threshold": 0.4, "max_candidates": 3})
        matcher.set_feature_extractor(extractor)

        recommender = RepairRecommender({"max_recommendations": 2})

        parsed = ParsedTextResult(
            original_text="电机过热，温度升高",
            cleaned_text="电机过热温度升高",
            keywords=["电机", "过热", "温度", "升高"],
            tokens=["电机", "过热", "温度", "升高"],
            device_info=None,
        )

        features = extractor.extract_features(parsed)
        matches = matcher.match(parsed, features)

        recommendation = recommender.recommend(matches)

        assert recommendation is not None
        assert len(recommendation.solutions) > 0
        print(f"  ✓ 维修推荐正常 - 推荐方案数: {len(recommendation.solutions)}")
        for sol in recommendation.solutions:
            print(f"    - [{sol.id}] {sol.title} (优先级: {sol.priority})")
        return True
    except Exception as e:
        print(f"  ✗ 维修方案推荐模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_correction_manager():
    """测试人工修正管理模块"""
    print("[测试] 人工修正管理模块...")
    try:
        import tempfile
        import shutil
        from src.correction_manager import CorrectionManager
        from src.models import FaultCorrectionRequest, CorrectionStatus

        temp_dir = tempfile.mkdtemp()
        correction_manager = CorrectionManager(data_dir=temp_dir)

        request = FaultCorrectionRequest(
            analysis_request_id="REQ_TEST001",
            original_text="电机过热，温度很高",
            correct_fault_type_id="FT001",
            correct_fault_type_name="电机过热故障",
            operator="测试员",
            reason="测试修正",
            repair_feedback="维修效果良好",
            repair_cost=500.0,
            repair_duration=120,
        )

        correction = correction_manager.add_correction(request)
        assert correction.correction_id is not None
        assert correction.status == CorrectionStatus.pending

        updated = correction_manager.update_correction_status(
            correction.correction_id, CorrectionStatus.applied)
        assert updated is not None
        assert updated.status == CorrectionStatus.applied

        stats = correction_manager.get_statistics()
        assert stats["total_corrections"] == 1

        print(f"  ✓ 人工修正正常 - 修正ID: {correction.correction_id}")
        print(f"    统计: {stats}")

        shutil.rmtree(temp_dir)
        return True
    except Exception as e:
        print(f"  ✗ 人工修正管理模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_case_manager():
    """测试故障案例管理模块"""
    print("[测试] 故障案例管理模块...")
    try:
        import tempfile
        import shutil
        from src.case_manager import CaseManager
        from src.models import FaultCategory, SeverityLevel, CaseStatus

        temp_dir = tempfile.mkdtemp()
        case_manager = CaseManager(data_dir=temp_dir)

        case = case_manager.create_manual_case(
            original_text="电机运行过热，温度达到90度",
            fault_type_id="FT001",
            fault_type_name="电机过热故障",
            category=FaultCategory.mechanical,
            severity=SeverityLevel.high,
            device_id="DEV001",
            keywords=["电机", "过热"],
            repair_effectiveness=0.9,
            repair_cost=800.0,
            repair_duration=180,
            operator="测试员",
        )

        assert case.case_id is not None
        assert case.fault_type_id == "FT001"

        updated = case_manager.update_case(
            case.case_id,
            repair_effectiveness=0.95,
            status=CaseStatus.verified,
        )
        assert updated.repair_effectiveness == 0.95

        summary = case_manager.get_summary(days=30)
        assert summary.total_cases >= 1

        stats = case_manager.get_statistics()
        assert stats["total_cases"] == 1

        print(f"  ✓ 案例管理正常 - 案例ID: {case.case_id}")
        print(f"    汇总: 总案例数={summary.total_cases}")

        shutil.rmtree(temp_dir)
        return True
    except Exception as e:
        print(f"  ✗ 故障案例管理模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_service_manager():
    """测试服务管理器"""
    print("[测试] 服务管理器模块...")
    try:
        from src.service_manager import ServiceManager
        from src.models import TextParsingRequest, TaskPriority

        config = {
            "nlp": {
                "max_text_length": 2000,
                "min_text_length": 5,
                "segment_length": 300,
                "enable_cache": True,
            },
            "fault": {"similarity_threshold": 0.5, "max_candidates": 3},
            "repair": {"max_recommendations": 2},
            "parallel": {
                "max_workers": 4,
                "task_timeout": 25,
                "global_timeout": 120,
                "queue_size": 16,
                "max_batch_size": 50,
                "enable_priority": True,
            },
            "data_dir": tempfile.gettempdir(),
        }

        manager = ServiceManager(config)

        request = TextParsingRequest(
            text="电机过热温度升高，运行异常，轴承有异响",
            priority=TaskPriority.high,
        )

        result = manager.analyze_single_fault(request)

        assert result.request_id is not None
        assert len(result.fault_matches) > 0
        assert result.repair_recommendation is not None
        print(f"  ✓ 服务管理器正常 - 耗时: {result.processing_time:.3f}s")
        print(f"    最佳匹配: {result.fault_matches[0].fault_type.name}")
        return True
    except Exception as e:
        print(f"  ✗ 服务管理器模块失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_executor_status():
    """测试线程池状态监控"""
    print("[测试] 线程池状态监控...")
    try:
        from src.service_manager import ServiceManager

        config = {
            "nlp": {},
            "fault": {"similarity_threshold": 0.5},
            "repair": {},
            "parallel": {
                "max_workers": 2,
                "task_timeout": 25,
                "queue_size": 8,
                "enable_priority": True,
            },
            "data_dir": tempfile.gettempdir(),
        }

        manager = ServiceManager(config)
        status = manager.get_executor_status()

        assert "max_workers" in status
        assert "queue_size" in status
        assert "utilization" in status
        assert "circuit_breaker_state" in status
        assert "priority_enabled" in status
        print(f"  ✓ 线程池监控正常 - 状态: {status}")
        return True
    except Exception as e:
        print(f"  ✗ 线程池状态监控失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_metrics():
    """测试任务统计指标"""
    print("[测试] 任务统计指标...")
    try:
        from src.service_manager import ServiceManager
        from src.models import TextParsingRequest

        config = {
            "nlp": {},
            "fault": {"similarity_threshold": 0.5},
            "repair": {},
            "parallel": {
                "max_workers": 2,
                "task_timeout": 25,
                "queue_size": 8,
            },
            "data_dir": tempfile.gettempdir(),
        }

        manager = ServiceManager(config)

        request = TextParsingRequest(text="电机过热，轴承异响")
        manager.analyze_single_fault(request)

        metrics = manager.get_metrics()

        assert "total_submitted" in metrics
        assert "total_completed" in metrics
        assert metrics["total_completed"] >= 1
        assert "by_priority" in metrics
        print(f"  ✓ 任务统计正常 - 指标: {metrics}")
        return True
    except Exception as e:
        print(f"  ✗ 任务统计指标失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_priority_processing():
    """测试优先级处理"""
    print("[测试] 优先级处理...")
    try:
        from src.service_manager import ServiceManager
        from src.models import TextParsingRequest, BatchFaultAnalysisRequest, TaskPriority

        config = {
            "nlp": {
                "max_text_length": 2000,
                "min_text_length": 5,
            },
            "fault": {
                "similarity_threshold": 0.4,
                "max_candidates": 3,
            },
            "repair": {
                "max_recommendations": 2,
            },
            "parallel": {
                "max_workers": 4,
                "task_timeout": 25,
                "global_timeout": 120,
                "queue_size": 16,
                "enable_priority": True,
            },
            "data_dir": tempfile.gettempdir(),
        }

        manager = ServiceManager(config)

        batch_request = BatchFaultAnalysisRequest(
            texts=[
                TextParsingRequest(
                    text="电机过热温度升高，运行发烫", priority=TaskPriority.low
                ),
                TextParsingRequest(
                    text="轴承异响磨损严重，转动不顺畅",
                    priority=TaskPriority.normal,
                ),
                TextParsingRequest(
                    text="PLC通信中断连接失败，数据异常",
                    priority=TaskPriority.high,
                ),
                TextParsingRequest(
                    text="紧急停机，冒烟", priority=TaskPriority.urgent
                ),
            ]
        )

        start_time = time.time()
        result = manager.analyze_batch_faults(batch_request)
        elapsed = time.time() - start_time

        assert result.total_count == 4
        assert len(result.results) == 4
        print(f"  ✓ 优先级处理正常 - 4条处理耗时: {elapsed:.3f}s")
        return True
    except Exception as e:
        print(f"  ✗ 优先级处理失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    print("\n" + "=" * 70)
    print("  工业设备故障智能研判AI服务系统 - 增强版功能测试")
    print("=" * 70 + "\n")

    tests = [
        ("数据模型", test_models),
        ("文本解析", test_text_parser),
        ("长文本分段解析", test_long_text_parsing),
        ("语义特征计算", test_semantic_features),
        ("语义特征缓存", test_semantic_cache),
        ("加权关键词匹配", test_weighted_keyword_matching),
        ("动态阈值计算", test_dynamic_threshold),
        ("故障类型匹配", test_fault_matcher),
        ("维修方案推荐", test_repair_recommender),
        ("人工修正管理", test_correction_manager),
        ("故障案例管理", test_case_manager),
        ("线程池状态监控", test_executor_status),
        ("服务管理器", test_service_manager),
        ("任务统计指标", test_metrics),
        ("优先级处理", test_priority_processing),
    ]

    results = []
    for name, test_func in tests:
        result = test_func()
        results.append((name, result))
        print()

    print("=" * 70)
    print("  测试结果汇总")
    print("=" * 70)

    passed = 0
    failed = 0
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"  {name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1

    print(f"\n  总计: {passed} 通过, {failed} 失败")
    print("=" * 70 + "\n")

    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
