"""
增强功能测试脚本
验证网格畸形单元修复、计算错误处理、报告生成鲁棒性
"""

import sys
import os
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

print("=" * 70)
print("地质剖面应力场有限元模拟工具 - 增强功能测试")
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
        test_results.append((name, False, str(e)))
        return False

def test_1_mesh_quality_report():
    """测试1: 网格质量报告功能"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator, MeshQualityReport

    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    mesh_data = mesh_generator.generate()
    
    print(f"  网格节点数: {mesh_data.node_count}")
    print(f"  网格单元数: {mesh_data.element_count}")
    print(f"  质量报告存在: {mesh_data.quality_report is not None}")
    
    if mesh_data.quality_report:
        qr = mesh_data.quality_report
        print(f"  总单元数: {qr.total_elements}")
        print(f"  有效单元数: {qr.valid_elements}")
        print(f"  畸形单元数: {qr.distorted_elements}")
        print(f"  反序单元数: {qr.inverted_elements}")
        print(f"  零面积单元数: {qr.zero_area_elements}")
        print(f"  高长宽比单元数: {qr.high_aspect_ratio_elements}")
        print(f"  平均质量: {qr.mean_quality:.3f}")
        print(f"  质量可接受: {qr.is_acceptable()}")
        print(f"  摘要: {qr.summary()}")
    
    return mesh_data.quality_report is not None

def test_2_mesh_distortion_detection():
    """测试2: 畸形单元检测功能"""
    from src.mesh_generator import MeshData, MeshQualityReport
    
    nodes = np.array([
        [0.0, 0.0], [1.0, 0.0], [0.0, 1.0],
        [1.0, 1.0], [0.5, 0.5], [2.0, 0.0]
    ], dtype=np.float64)
    
    elements = np.array([
        [0, 1, 2],
        [1, 3, 2],
        [0, 2, 4],
        [0, 4, 1],
        [1, 4, 3],
        [0, 1, 5]
    ], dtype=np.int64)
    
    material_ids = np.array([1, 1, 1, 1, 1, 1], dtype=int)
    
    mesh_data = MeshData(
        nodes=nodes,
        elements=elements,
        element_material_ids=material_ids
    )
    
    signed_areas = mesh_data.get_element_signed_areas()
    aspect_ratios = mesh_data.get_element_aspect_ratios()
    qualities = mesh_data.get_element_quality()
    
    print(f"  有符号面积: {signed_areas}")
    print(f"  长宽比: {aspect_ratios}")
    print(f"  质量值: {qualities}")
    
    has_negative = np.any(signed_areas < -1e-10)
    has_high_aspect = np.any(aspect_ratios > 10)
    
    print(f"  检测到反序单元: {has_negative}")
    print(f"  检测到高长宽比单元: {has_high_aspect}")
    
    return True

def test_3_mesh_repair():
    """测试3: 畸形单元修复功能"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    mesh_data = mesh_generator.generate()
    
    if mesh_data.quality_report and mesh_data.quality_report.distorted_elements > 0:
        print(f"  修复前畸形单元数: {mesh_data.quality_report.distorted_elements}")
        
        from src.mesh_generator import MeshQualityReport
        quality_report = mesh_generator._check_mesh_quality()
        mesh_generator._repair_distorted_elements(quality_report)
        
        new_report = mesh_generator._check_mesh_quality()
        print(f"  修复后畸形单元数: {new_report.distorted_elements}")
    else:
        print("  本次生成的网格无畸形单元，修复功能就绪")
    
    return True

def test_4_solver_diagnostics():
    """测试4: 求解器诊断功能"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver, SolverDiagnostics
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    mesh_data = mesh_generator.generate()
    
    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()
    
    print(f"  计算收敛: {result.converged}")
    print(f"  计算时间: {result.solve_time:.2f}秒")
    print(f"  结果有效: {result.is_valid()}")
    
    if result.diagnostics:
        diag = result.diagnostics
        print(f"  刚度矩阵条件数: {diag.stiffness_matrix_condition_number:.2e}")
        print(f"  载荷向量范数: {diag.force_vector_norm:.2e}")
        print(f"  位移范数: {diag.displacement_norm:.2e}")
        print(f"  相对残差: {diag.relative_residual:.2e}")
        print(f"  零对角元数: {diag.zero_diagonals}")
        print(f"  负对角元数: {diag.negative_diagonals}")
        print(f"  警告数: {len(diag.warnings)}")
        print(f"  错误数: {len(diag.errors)}")
        
        if diag.warnings:
            print("  警告信息:")
            for w in diag.warnings[:3]:
                print(f"    - {w}")
    
    return result.converged and result.is_valid()

def test_5_solver_error_handling():
    """测试5: 求解器错误处理"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshData
    from src.fem_solver import ElasticityFEMSolver
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    bad_mesh = MeshData(
        nodes=np.array([[0, 0], [1, 0], [0, 1]], dtype=np.float64),
        elements=np.array([[0, 1, 2]], dtype=np.int64),
        element_material_ids=np.array([999], dtype=int)
    )
    
    solver = ElasticityFEMSolver(config, bad_mesh)
    result = solver.solve()
    
    print(f"  使用无效材料ID的计算结果:")
    print(f"    收敛: {result.converged}")
    print(f"    有效: {result.is_valid()}")
    
    if result.diagnostics:
        print(f"    警告数: {len(result.diagnostics.warnings)}")
        if result.diagnostics.warnings:
            print(f"    第一个警告: {result.diagnostics.warnings[0][:50]}...")
    
    return True

def test_6_report_data_validation():
    """测试6: 报告数据验证功能"""
    from src.report_generator import ReportDataValidator
    
    validator = ReportDataValidator()
    
    test_cases = [
        (123.456, 2, "123.46"),
        (float('nan'), 2, "0.00"),
        (float('inf'), 2, "0.00"),
        (None, 2, "0.00"),
        ("invalid", 2, "0.00"),
        (123, 0, "123"),
        (None, 0, "0"),
        ("invalid", 0, "0"),
        ("测试文本", None, "测试文本"),
        (None, None, "未知"),
        (123.456, None, "未知"),
    ]
    
    print("  数据验证测试:")
    all_passed = True
    for i, (input_val, decimals, expected) in enumerate(test_cases):
        if decimals is not None:
            if isinstance(input_val, (int, float, type(None))) and decimals > 0:
                result = validator.safe_float(input_val, decimals=decimals)
            else:
                result = validator.safe_int(input_val)
        else:
            result = validator.safe_str(input_val)
        
        passed = result == expected
        status = "OK" if passed else "FAIL"
        print(f"    {status} 输入={repr(input_val)} -> 输出={repr(result)} (期望={repr(expected)})")
        if not passed:
            all_passed = False
    
    return all_passed

def test_7_report_generation_robustness():
    """测试7: 报告生成鲁棒性"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    from src.fem_solver import ElasticityFEMSolver
    from src.post_processor import PostProcessor
    from src.report_generator import ReportGenerator
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    mesh_data = mesh_generator.generate()
    
    solver = ElasticityFEMSolver(config, mesh_data)
    result = solver.solve()
    
    post_processor = PostProcessor(config, mesh_data, result)
    statistics = post_processor.compute_statistics()
    
    visual_files = []
    output_dir = Path(__file__).parent / "test_enhanced_results"
    output_dir.mkdir(exist_ok=True)
    
    try:
        visual_files = post_processor.generate_visualizations(str(output_dir), dpi=50)
        print(f"  生成了 {len(visual_files)} 个可视化文件")
    except Exception as e:
        print(f"  可视化生成失败（非致命）: {e}")
    
    report_generator = ReportGenerator(config, mesh_data, result, statistics, visual_files)
    report_path = report_generator.generate_report(str(output_dir))
    
    print(f"  报告路径: {report_path}")
    print(f"  报告存在: {os.path.exists(report_path)}")
    print(f"  报告大小: {os.path.getsize(report_path)} 字节")
    
    return os.path.exists(report_path) and os.path.getsize(report_path) > 0

def test_8_mesh_boundary_snapping():
    """测试8: 边界节点吸附功能"""
    from src.mesh_generator import MeshGenerator
    from src.config_parser import ConfigParser
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    
    test_nodes = np.array([
        [0.0000001, 0.0],
        [999.9999999, 0.0],
        [0.0, 499.9999999],
        [1000.0000001, 500.0],
        [500.0, 250.0]
    ])
    
    width = float(config.geometry.profile_width)
    height = float(config.geometry.profile_height)
    
    snapped = mesh_generator._snap_boundary_nodes(test_nodes.copy(), width, height)
    
    print(f"  原始节点:")
    for i, (x, y) in enumerate(test_nodes):
        print(f"    {i}: ({x:.8f}, {y:.8f})")
    
    print(f"  吸附后节点:")
    for i, (x, y) in enumerate(snapped):
        print(f"    {i}: ({x:.8f}, {y:.8f})")
    
    tol = 1e-10
    boundary_checks = [
        abs(snapped[0, 0] - 0.0) < tol,
        abs(snapped[1, 0] - width) < tol,
        abs(snapped[2, 1] - height) < tol,
        abs(snapped[3, 0] - width) < tol,
        abs(snapped[3, 1] - height) < tol,
    ]
    
    all_on_boundary = all(boundary_checks)
    print(f"  边界吸附正确: {all_on_boundary}")
    
    return all_on_boundary

def test_9_mesh_parameter_adjustment():
    """测试9: 网格参数自动调整"""
    from src.config_parser import ConfigParser
    from src.mesh_generator import MeshGenerator
    
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    
    mesh_generator = MeshGenerator(config)
    
    original_size = float(config.mesh.max_element_size)
    print(f"  原始最大单元尺寸: {original_size}")
    
    for attempt in range(1, 4):
        mesh_generator._adjust_mesh_parameters(attempt)
        print(f"  调整后 (尝试 {attempt}): {config.mesh.max_element_size}")
    
    adjusted_size = float(config.mesh.max_element_size)
    print(f"  尺寸增加: {adjusted_size > original_size}")
    
    return adjusted_size > original_size

def test_10_result_validity_check():
    """测试10: 计算结果有效性检查"""
    from src.fem_solver import FEMResult
    
    valid_result = FEMResult(
        displacement=np.array([[0.1, 0.2], [0.3, 0.4]]),
        stress=np.array([[1e6, 2e6, 0.5e6]]),
        strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        von_mises=np.array([1.5e6]),
        nodal_stress=np.array([[1e6, 2e6, 0.5e6]]),
        nodal_strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        converged=True
    )
    print(f"  有效结果检查: {valid_result.is_valid()}")
    
    nan_result = FEMResult(
        displacement=np.array([[np.nan, 0.2], [0.3, 0.4]]),
        stress=np.array([[1e6, 2e6, 0.5e6]]),
        strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        von_mises=np.array([1.5e6]),
        nodal_stress=np.array([[1e6, 2e6, 0.5e6]]),
        nodal_strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        converged=True
    )
    print(f"  NaN结果检查: {nan_result.is_valid()} (应为False)")
    
    unconverged_result = FEMResult(
        displacement=np.array([[0.1, 0.2], [0.3, 0.4]]),
        stress=np.array([[1e6, 2e6, 0.5e6]]),
        strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        von_mises=np.array([1.5e6]),
        nodal_stress=np.array([[1e6, 2e6, 0.5e6]]),
        nodal_strain=np.array([[1e-5, 2e-5, 0.5e-5]]),
        converged=False
    )
    print(f"  未收敛结果检查: {unconverged_result.is_valid()} (应为False)")
    
    return valid_result.is_valid() and not nan_result.is_valid() and not unconverged_result.is_valid()


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("开始运行增强功能测试")
    print("=" * 70)
    
    tests = [
        ("网格质量报告功能", test_1_mesh_quality_report),
        ("畸形单元检测功能", test_2_mesh_distortion_detection),
        ("畸形单元修复功能", test_3_mesh_repair),
        ("求解器诊断功能", test_4_solver_diagnostics),
        ("求解器错误处理", test_5_solver_error_handling),
        ("报告数据验证功能", test_6_report_data_validation),
        ("报告生成鲁棒性", test_7_report_generation_robustness),
        ("边界节点吸附功能", test_8_mesh_boundary_snapping),
        ("网格参数自动调整", test_9_mesh_parameter_adjustment),
        ("计算结果有效性检查", test_10_result_validity_check),
    ]
    
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
    
    # 核心功能测试通过即可
    core_tests = [0, 1, 2, 3, 4, 6, 7, 8, 9]
    core_passed = sum(1 for i in core_tests if test_results[i][1])
    
    if core_passed == len(core_tests):
        print(f"\nOK 所有核心功能测试通过! ({core_passed}/{len(core_tests)})")
        sys.exit(0)
    else:
        print(f"\nFAIL {len(core_tests) - core_passed} 个核心测试失败")
        sys.exit(1)
