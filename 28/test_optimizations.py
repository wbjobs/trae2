"""
优化功能测试
验证多工况对比、快照保存、网格效率优化、模块解耦等功能
"""

import numpy as np
import sys
import os
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 70)
print("地质剖面应力场有限元模拟工具 - 优化功能测试")
print("=" * 70)

test_results = []

def test_case(name, func):
    """测试用例装饰器"""
    print(f"\n{'='*70}")
    print(f"测试: {name}")
    print(f"{'='*70}")
    try:
        result = func()
        if result:
            print(f"OK 通过: {name}")
            test_results.append((name, True, ""))
            return True
        else:
            print(f"FAIL 失败: {name}")
            test_results.append((name, False, "未知错误"))
            return False
    except Exception as e:
        print(f"FAIL 异常: {name} - {str(e)}")
        import traceback
        traceback.print_exc()
        test_results.append((name, False, str(e)))
        return False

def test_1_case_manager():
    """测试1: 工况管理功能"""
    from src.config_parser import ConfigParser
    from src.case_manager import CaseManager

    config = ConfigParser().load_config()
    case_manager = CaseManager(config, output_dir="test_cases")

    case1 = case_manager.create_case("基础工况")
    case2 = case_manager.create_case("高应力", {"horizontal_stress_ratio": 1.5})
    case3 = case_manager.create_case("精细网格", {"mesh.max_element_size": 15.0})

    print(f"  创建工况数量: {len(case_manager.cases)}")
    print(f"  工况1名称: {case1.name}")
    print(f"  工况2参数: {case2.parameters.get('horizontal_stress_ratio', {}).value if case2.parameters else '无'}")

    assert len(case_manager.cases) == 3
    assert case1.case_id == "case_0001"
    assert case2.name == "高应力"

    return True

def test_2_parametric_study():
    """测试2: 参数化研究功能"""
    from src.config_parser import ConfigParser
    from src.case_manager import CaseManager

    config = ConfigParser().load_config()
    case_manager = CaseManager(config, output_dir="test_cases")

    cases = case_manager.create_parametric_study(
        "horizontal_stress_ratio",
        [1.0, 1.2, 1.5, 2.0],
        base_name="应力比"
    )

    print(f"  创建参数化工况数: {len(cases)}")
    for case in cases:
        print(f"    {case.name}: {case.parameters['horizontal_stress_ratio'].value}")

    assert len(cases) == 4
    return True

def test_3_solver_snapshots():
    """测试3: 求解器快照保存功能"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver

    config = ConfigParser().load_config()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()

    solver = ElasticityFEMSolver(
        config, mesh_data,
        snapshot_dir="test_snapshots",
        enable_snapshots=True
    )

    result = solver.solve()

    snapshot_dir = Path("test_snapshots")
    snapshot_files = list(snapshot_dir.glob("*.pkl"))

    print(f"  生成快照数: {len(snapshot_files)}")
    for f in snapshot_files[:5]:
        print(f"    {f.name}")

    assert len(snapshot_files) >= 5
    assert result.is_valid()

    return True

def test_4_snapshot_load():
    """测试4: 快照加载恢复功能"""
    from src.fem_solver import SolverSnapshot

    snapshot_dir = Path("test_snapshots")
    snapshot_files = list(snapshot_dir.glob("*.pkl"))

    if not snapshot_files:
        print("  跳过：无快照文件")
        return True

    snapshot_path = str(snapshot_files[0])
    snapshot = SolverSnapshot.load(snapshot_path)

    print(f"  加载快照: {snapshot.snapshot_id}")
    print(f"  快照阶段: {snapshot.stage}")
    print(f"  时间戳: {snapshot.timestamp}")

    assert snapshot.stiffness_matrix is not None
    assert snapshot.snapshot_id is not None

    return True

def test_5_mesh_performance():
    """测试5: 网格划分性能优化"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    import time

    config = ConfigParser().load_config()

    start = time.time()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()
    mesh_time = time.time() - start

    print(f"  网格生成时间: {mesh_time:.3f}秒")
    print(f"  节点数: {mesh_data.node_count}")
    print(f"  单元数: {mesh_data.element_count}")

    assert mesh_data.node_count > 0
    assert mesh_data.element_count > 0

    return True

def test_6_post_processor_decoupled():
    """测试6: 后处理解耦接口"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver
    from src.interfaces import PostProcessingInput
    from src.post_processor import PostProcessor

    config = ConfigParser().load_config()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()

    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()

    post_input = PostProcessingInput.from_components(mesh_data, result, config)
    post = PostProcessor(post_input)

    stats = post.compute_statistics()

    print(f"  最大Mises应力: {stats.max_von_mises / 1e6:.2f} MPa")
    print(f"  最大位移: {stats.max_displacement_magnitude:.4f} m")

    assert stats is not None
    assert stats.max_von_mises > 0

    return True

def test_7_post_processor_compatibility():
    """测试7: 后处理向后兼容"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver
    from src.post_processor import PostProcessor

    config = ConfigParser().load_config()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()

    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()

    post = PostProcessor(config, mesh_data, result)
    stats = post.compute_statistics()

    print(f"  兼容模式统计计算成功")
    print(f"  平均Mises应力: {stats.mean_von_mises / 1e6:.2f} MPa")

    assert stats is not None
    return True

def test_8_solver_performance():
    """测试8: 求解器性能优化"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver

    config = ConfigParser().load_config()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()

    start = time.time()
    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()
    solve_time = time.time() - start

    print(f"  求解时间: {solve_time:.3f}秒")
    print(f"  收敛: {result.converged}")
    print(f"  有效: {result.is_valid()}")

    assert result.is_valid()

    return True

def test_9_vectorized_geometry():
    """测试9: 向量化几何计算"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    import time

    config = ConfigParser().load_config()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()

    n_elements = mesh_data.element_count
    print(f"  测试 {n_elements} 个单元")

    start = time.time()
    areas = mesh_data.get_element_areas()
    area_time = time.time() - start

    start = time.time()
    aspects = mesh_data.get_element_aspect_ratios()
    aspect_time = time.time() - start

    start = time.time()
    qualities = mesh_data.get_element_quality()
    quality_time = time.time() - start

    print(f"  面积计算: {area_time * 1000:.3f} ms")
    print(f"  长宽比计算: {aspect_time * 1000:.3f} ms")
    print(f"  质量计算: {quality_time * 1000:.3f} ms")

    assert len(areas) == n_elements
    assert len(aspects) == n_elements
    assert len(qualities) == n_elements

    return True

def test_10_full_workflow():
    """测试10: 完整优化工作流"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver
    from src.interfaces import PostProcessingInput
    from src.post_processor import PostProcessor

    print("  执行完整工作流...")

    config = ConfigParser().load_config()

    start = time.time()
    mesh_gen = MeshGenerator(config)
    mesh_data = mesh_gen.generate()
    mesh_time = time.time() - start

    start = time.time()
    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()
    solve_time = time.time() - start

    start = time.time()
    post_input = PostProcessingInput.from_components(mesh_data, result, config)
    post = PostProcessor(post_input)
    stats = post.compute_statistics()
    post_time = time.time() - start

    print(f"  总耗时: {mesh_time + solve_time + post_time:.3f}秒")
    print(f"    网格生成: {mesh_time:.3f}秒")
    print(f"    求解计算: {solve_time:.3f}秒")
    print(f"    后处理: {post_time:.3f}秒")
    print(f"  节点数: {mesh_data.node_count}")
    print(f"  单元数: {mesh_data.element_count}")
    print(f"  最大Mises应力: {stats.max_von_mises / 1e6:.2f} MPa")

    assert result.is_valid()
    assert stats is not None

    return True

if __name__ == "__main__":
    tests = [
        ("工况管理功能", test_1_case_manager),
        ("参数化研究功能", test_2_parametric_study),
        ("求解器快照保存", test_3_solver_snapshots),
        ("快照加载恢复", test_4_snapshot_load),
        ("网格划分性能", test_5_mesh_performance),
        ("后处理解耦接口", test_6_post_processor_decoupled),
        ("后处理向后兼容", test_7_post_processor_compatibility),
        ("求解器性能优化", test_8_solver_performance),
        ("向量化几何计算", test_9_vectorized_geometry),
        ("完整优化工作流", test_10_full_workflow),
    ]

    print("\n" + "=" * 70)
    print("开始运行优化功能测试")
    print("=" * 70)

    for name, func in tests:
        test_case(name, func)

    print("\n" + "=" * 70)
    print("测试总结")
    print("=" * 70)

    total = len(test_results)
    passed_count = sum(1 for _, p, _ in test_results if p)
    for name, test_passed, error in test_results:
        status = "OK" if test_passed else "FAIL"
        print(f"  {status} {name}")
        if not test_passed and error:
            print(f"      错误: {error}")

    print(f"\n总计: {passed_count}/{total} 测试通过")

    if passed_count == total:
        print(f"\nOK 所有优化功能测试通过! ({passed_count}/{total})")
        sys.exit(0)
    else:
        print(f"\nFAIL {total - passed_count} 个测试失败")
        sys.exit(1)
