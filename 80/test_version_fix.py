#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试版本比对修复
"""

from version_compare import Version, VersionComparator


def test_version_compare():
    print("=== 测试版本比对修复 ===")
    
    test_cases = [
        ("1.0.0", "1.0.1", -1, "补丁版本升级"),
        ("1.0.0", "1.1.0", -1, "次版本升级"),
        ("1.0.0", "2.0.0", -1, "主版本升级"),
        ("1.0.1", "1.0.0", 1, "补丁版本降级"),
        ("1.1.0", "1.0.0", 1, "次版本降级"),
        ("2.0.0", "1.0.0", 1, "主版本降级"),
        ("1.0.0", "1.0.0", 0, "版本相等"),
        ("1.0.0-alpha", "1.0.0-beta", -1, "alpha < beta"),
        ("1.0.0-beta", "1.0.0-rc", -1, "beta < rc"),
        ("1.0.0-rc", "1.0.0", -1, "rc < 正式版"),
        ("1.0.0-alpha", "1.0.0", -1, "alpha < 正式版"),
        ("1.0.0-beta.1", "1.0.0-beta.2", -1, "beta.1 < beta.2"),
        ("1.0.0-1", "1.0.0-2", -1, "数字预发布版本"),
        ("1.0.0", "1.0.0.0", 0, "四部分版本相等"),
        ("1.0.0.1", "1.0.0.2", -1, "四部分版本比较"),
        ("v1.0.0", "1.0.0", 0, "带v前缀比较"),
        ("V1.0.0", "v1.0.0", 0, "大小写v前缀"),
        ("1.0.0+build1", "1.0.0+build2", 0, "构建号不影响比较"),
        ("1.0.0-alpha+build1", "1.0.0-beta+build2", -1, "预发布+构建号"),
        ("1.0.0-custom", "1.0.0-alpha", 1, "自定义标签 > alpha"),
        ("1.0.0-zzz", "1.0.0-aaa", 1, "未知标签按字母排序"),
    ]
    
    vc = VersionComparator()
    passed = 0
    failed = 0
    
    for v1, v2, expected, desc in test_cases:
        result = vc.compare(v1, v2)
        status = "✓" if result == expected else "✗"
        if result == expected:
            passed += 1
        else:
            failed += 1
        print(f"{status} {desc}: {v1} vs {v2} = {result} (expected: {expected})")
    
    print(f"\n总计: {passed} 通过, {failed} 失败")
    return failed == 0


def test_version_properties():
    print("\n=== 测试版本属性 ===")
    
    v = Version("1.2.3.4-beta")
    print(f"版本: {v}")
    print(f"  major: {v.major} (expected: 1)")
    print(f"  minor: {v.minor} (expected: 2)")
    print(f"  patch: {v.patch} (expected: 3)")
    print(f"  build: {v.build} (expected: 4)")


def test_upgrade_type():
    print("\n=== 测试升级类型 ===")
    
    vc = VersionComparator()
    
    upgrade_tests = [
        ("1.0.0", "1.0.1", "patch"),
        ("1.0.0", "1.1.0", "minor"),
        ("1.0.0", "2.0.0", "major"),
        ("1.0.0", "1.0.0.1", "build"),
        ("1.0.0", "1.0.0", "none"),
        ("2.0.0", "1.0.0", "none"),
    ]
    
    for from_v, to_v, expected in upgrade_tests:
        result = vc.check_upgrade_type(from_v, to_v)
        status = "✓" if result == expected else "✗"
        print(f"{status} {from_v} -> {to_v}: {result} (expected: {expected})")


def test_safe_upgrade():
    print("\n=== 测试安全升级 ===")
    
    vc = VersionComparator()
    
    safe_tests = [
        ("1.0.0", "1.0.1", False, True, "补丁升级安全"),
        ("1.0.0", "1.1.0", False, True, "次版本升级安全"),
        ("1.0.0", "2.0.0", False, False, "主版本升级不安全"),
        ("1.0.0", "2.0.0", True, True, "主版本升级允许"),
        ("2.0.0", "1.0.0", False, False, "降级不安全"),
        ("1.0.0", "1.0.0", False, False, "相同版本不升级"),
    ]
    
    for from_v, to_v, allow_major, expected, desc in safe_tests:
        result = vc.is_safe_upgrade(from_v, to_v, allow_major)
        status = "✓" if result == expected else "✗"
        print(f"{status} {desc}: {from_v} -> {to_v} (allow_major={allow_major}): {result}")


if __name__ == '__main__':
    success = test_version_compare()
    test_version_properties()
    test_upgrade_type()
    test_safe_upgrade()
    
    if success:
        print("\n=== 所有测试通过! ===")
        exit(0)
    else:
        print("\n=== 存在测试失败! ===")
        exit(1)
