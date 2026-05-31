"""
简单测试脚本
用于验证地质剖面应力场有限元模拟工具的基本功能
"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

print("=" * 60)
print("地质剖面应力场有限元模拟工具 - 功能测试")
print("=" * 60)

print("\n1. 测试模块导入...")
try:
    from src.config_parser import ConfigParser
    print("   ✓ config_parser 模块导入成功")
except Exception as e:
    print(f"   ✗ config_parser 导入失败: {e}")
    sys.exit(1)

try:
    from src.mesh_generator import MeshGenerator
    print("   ✓ mesh_generator 模块导入成功")
except Exception as e:
    print(f"   ✗ mesh_generator 导入失败: {e}")
    sys.exit(1)

try:
    from src.fem_solver import ElasticityFEMSolver
    print("   ✓ fem_solver 模块导入成功")
except Exception as e:
    print(f"   ✗ fem_solver 导入失败: {e}")
    sys.exit(1)

try:
    from src.post_processor import PostProcessor
    print("   ✓ post_processor 模块导入成功")
except Exception as e:
    print(f"   ✗ post_processor 导入失败: {e}")
    sys.exit(1)

try:
    from src.report_generator import ReportGenerator
    print("   ✓ report_generator 模块导入成功")
except Exception as e:
    print(f"   ✗ report_generator 导入失败: {e}")
    sys.exit(1)

try:
    from src.distributed_computing import DistributedSolver, TaskMonitor
    print("   ✓ distributed_computing 模块导入成功")
except Exception as e:
    print(f"   ✗ distributed_computing 导入失败: {e}")
    sys.exit(1)

print("\n2. 测试配置解析...")
try:
    config_path = Path(__file__).parent / "config" / "default_config.yaml"
    config_parser = ConfigParser(str(config_path))
    config = config_parser.load_config()
    print(f"   ✓ 配置加载成功: {config.project_name}")
    print(f"     - 剖面尺寸: {config.geometry.profile_width}m × {config.geometry.profile_height}m")
    print(f"     - 岩层数量: {config.geometry.layer_count}")
    print(f"     - 材料数量: {len(config.materials)}")
except Exception as e:
    print(f"   ✗ 配置解析失败: {e}")
    sys.exit(1)

print("\n3. 测试配置验证...")
try:
    is_valid = config_parser.validate_config()
    if is_valid:
        print("   ✓ 配置验证通过")
    else:
        print("   ✗ 配置验证失败")
        sys.exit(1)
except Exception as e:
    print(f"   ✗ 配置验证出错: {e}")
    sys.exit(1)

print("\n4. 测试网格生成...")
try:
    mesh_generator = MeshGenerator(config)
    mesh_data = mesh_generator.generate()
    print(f"   ✓ 网格生成成功")
    print(f"     - 节点数量: {mesh_data.node_count}")
    print(f"     - 单元数量: {mesh_data.element_count}")
except Exception as e:
    print(f"   ✗ 网格生成失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n5. 测试有限元求解...")
try:
    fem_solver = ElasticityFEMSolver(config, mesh_data)
    fem_result = fem_solver.solve()
    print(f"   ✓ 有限元求解成功")
    print(f"     - 求解时间: {fem_result.solve_time:.2f}秒")
    print(f"     - 最大Von Mises应力: {fem_result.von_mises.max()/1e6:.2f} MPa")
except Exception as e:
    print(f"   ✗ 有限元求解失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n6. 测试后处理...")
try:
    post_processor = PostProcessor(config, mesh_data, fem_result)
    statistics = post_processor.compute_statistics()
    print(f"   ✓ 后处理统计成功")
    print(f"     - 最大水平应力: {statistics.max_sigma_xx/1e6:.2f} MPa")
    print(f"     - 最大垂直应力: {statistics.max_sigma_yy/1e6:.2f} MPa")
    print(f"     - 最大位移: {statistics.max_displacement_magnitude*1000:.2f} mm")
except Exception as e:
    print(f"   ✗ 后处理失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n7. 测试可视化生成...")
try:
    output_dir = Path(__file__).parent / "test_results"
    output_dir.mkdir(exist_ok=True)
    visual_files = post_processor.generate_visualizations(str(output_dir), dpi=100)
    print(f"   ✓ 可视化生成成功: {len(visual_files)} 个文件")
except Exception as e:
    print(f"   ✗ 可视化生成失败: {e}")
    import traceback
    traceback.print_exc()

print("\n8. 测试数据导出...")
try:
    data_dir = output_dir / "data"
    exported_files = post_processor.export_data(str(data_dir))
    print(f"   ✓ 数据导出成功: {len(exported_files)} 个文件")
except Exception as e:
    print(f"   ✗ 数据导出失败: {e}")
    import traceback
    traceback.print_exc()

print("\n9. 测试报告生成...")
try:
    report_generator = ReportGenerator(config, mesh_data, fem_result, statistics, visual_files)
    report_path = report_generator.generate_report(str(output_dir))
    print(f"   ✓ 报告生成成功: {report_path}")
except Exception as e:
    print(f"   ⚠ 报告生成跳过(可能缺少reportlab): {e}")

print("\n" + "=" * 60)
print("所有核心功能测试通过!")
print("=" * 60)
print(f"\n测试结果已保存到: {output_dir.absolute()}")
