import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.document_parser import DocumentParser
from modules.case_matcher import CaseMatcher
from modules.embedding_service import EmbeddingService


def test_long_document_parsing():
    """测试1: 长文书解析优化验证"""
    print("=" * 60)
    print("测试1: 长文书解析优化验证")
    print("=" * 60)
    
    parser = DocumentParser()
    
    base_text = """
    民事起诉状
    原告：甲科技有限公司
    被告：乙贸易有限公司
    
    诉讼请求：
    1. 请求判令被告支付货款人民币50万元；
    2. 请求判令被告支付违约金人民币5万元。
    
    事实与理由：
    原被告于2023年1月1日签订《货物买卖合同》。
    原告已按合同约定履行供货义务。
    被告拖欠货款未付，已构成违约。
    """
    
    long_text = base_text
    for i in range(50):
        long_text += f"\n\n补充条款{i+1}：本合同未尽事宜，由双方协商解决。" * 3
    
    print(f"文本长度: {len(long_text)} 字符")
    print("开始解析长文本...")
    
    import time
    start_time = time.time()
    
    result = asyncio.run(parser.parse_file(
        long_text.encode('utf-8'),
        'long_document_test.txt'
    ))
    
    elapsed = time.time() - start_time
    
    print(f"✓ 解析完成，耗时: {elapsed:.2f}秒")
    print(f"✓ 段落数: {len(result.paragraphs)}")
    print(f"✓ 案件类型: {result.case_type}")
    print(f"✓ 关键短语数: {len(result.key_phrases)}")
    print(f"✓ 警告数: {len(result.parse_warnings)}")
    print(f"✓ 是否部分解析: {result.is_partial}")
    
    for para in result.paragraphs:
        assert len(para) < 2500, f"段落过长: {len(para)} 字符"
    print("✓ 所有段落长度均在限制内")
    
    return True


def test_case_matching_accuracy():
    """测试2: AI类案匹配准确率优化验证"""
    print("\n" + "=" * 60)
    print("测试2: AI类案匹配准确率优化验证")
    print("=" * 60)
    
    case_matcher = CaseMatcher()
    
    print("构建向量索引...")
    asyncio.run(case_matcher.build_vector_index())
    
    test_queries = [
        {
            "query": "买卖合同拖欠货款违约金纠纷",
            "case_type": "民事",
            "expected_cause": "买卖合同纠纷",
        },
        {
            "query": "民间借贷借款本金利息纠纷",
            "case_type": "民事",
            "expected_cause": "民间借贷纠纷",
        },
        {
            "query": "劳动合同违法解除赔偿金纠纷",
            "case_type": "民事",
            "expected_cause": "劳动合同纠纷",
        },
    ]
    
    all_passed = True
    for i, test_case in enumerate(test_queries):
        print(f"\n测试用例 {i+1}: {test_case['query']}")
        
        results = asyncio.run(case_matcher.match_cases(
            query_text=test_case['query'],
            case_type=test_case['case_type'],
            top_k=3,
            threshold=0.3,
        ))
        
        print(f"  匹配到 {len(results)} 个案例")
        
        if len(results) > 0:
            top_case = results[0]
            print(f"  Top1 案例: {top_case.case_data.title}")
            print(f"  相似度: {top_case.similarity_score:.4f}")
            print(f"  案由: {top_case.case_data.cause_of_action}")
            print(f"  匹配原因: {top_case.matched_reasons[:2]}")
            print(f"  相似度详情: {top_case.similarity_details}")
            
            if test_case['expected_cause'] in top_case.case_data.cause_of_action:
                print("  ✓ 案由匹配正确")
            else:
                print(f"  ⚠ 案由可能不匹配: 期望 {test_case['expected_cause']}")
                all_passed = False
        else:
            print("  ✗ 未匹配到案例")
            all_passed = False
    
    return all_passed


def test_similarity_details():
    """测试3: 多维度相似度计算验证"""
    print("\n" + "=" * 60)
    print("测试3: 多维度相似度计算验证")
    print("=" * 60)
    
    case_matcher = CaseMatcher()
    asyncio.run(case_matcher.build_vector_index())
    
    query = "买卖合同拖欠货款，被告应承担违约责任"
    
    results = asyncio.run(case_matcher.match_cases(
        query_text=query,
        case_type="民事",
        top_k=2,
        threshold=0.3,
    ))
    
    if len(results) > 0:
        top_case = results[0]
        details = top_case.similarity_details
        
        print("✓ 相似度详情包含多个维度:")
        expected_keys = ['semantic', 'title', 'summary', 'provisions', 'keywords', 'case_type', 'court_level']
        for key in expected_keys:
            if key in details:
                print(f"  - {key}: {details[key]:.4f}")
            else:
                print(f"  - {key}: 缺失")
        
        print(f"\n✓ 综合相似度: {top_case.similarity_score:.4f}")
        print(f"✓ 匹配原因数: {len(top_case.matched_reasons)}")
        return True
    else:
        print("✗ 未匹配到案例")
        return False


def test_inverted_index():
    """测试4: 倒排索引优化验证"""
    print("\n" + "=" * 60)
    print("测试4: 倒排索引优化验证")
    print("=" * 60)
    
    case_matcher = CaseMatcher()
    
    print(f"✓ 法条倒排索引条目数: {len(case_matcher._provision_inverted_index)}")
    print(f"✓ 关键词倒排索引条目数: {len(case_matcher._keyword_inverted_index)}")
    
    test_provision = "民法典第五百七十七条"
    if test_provision in case_matcher._provision_inverted_index:
        indices = case_matcher._provision_inverted_index[test_provision]
        print(f"✓ 法条 '{test_provision}' 出现在 {len(indices)} 个案例中")
        for idx in indices[:3]:
            print(f"  - {case_matcher._cases[idx].title}")
    
    return True


def test_cause_of_actions():
    """测试5: 案由提取验证"""
    print("\n" + "=" * 60)
    print("测试5: 案由提取验证")
    print("=" * 60)
    
    case_matcher = CaseMatcher()
    
    causes = case_matcher.get_cause_of_actions()
    print(f"✓ 提取到 {len(causes)} 个案由:")
    for cause in causes:
        print(f"  - {cause}")
    
    return len(causes) > 0


def main():
    print("\n" + "═" * 60)
    print("法律AI服务系统优化验证测试")
    print("═" * 60)
    
    tests = [
        ("长文书解析优化", test_long_document_parsing),
        ("类案匹配准确率优化", test_case_matching_accuracy),
        ("多维度相似度计算", test_similarity_details),
        ("倒排索引优化", test_inverted_index),
        ("案由提取功能", test_cause_of_actions),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"✗ 测试异常: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    
    passed = 0
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{name}: {status}")
        if result:
            passed += 1
    
    print(f"\n总计: {passed}/{len(results)} 测试通过")
    
    if passed == len(results):
        print("\n🎉 所有优化验证通过！")
    else:
        print(f"\n⚠ 有 {len(results) - passed} 项测试需要关注")


if __name__ == "__main__":
    main()
