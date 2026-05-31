const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAll() {
  console.log('=== 测试新功能模块 ===\n');

  try {
    console.log('1. 测试性状年度对比分析 API...');
    await testTraitAnalysis();

    console.log('\n2. 测试资源分布热力图 API...');
    await testDistributionMap();

    console.log('\n3. 测试分类统计 API...');
    await testClassificationStats();

    console.log('\n4. 测试快速统计 API...');
    await testQuickStats();

    console.log('\n=== 所有新功能测试通过！ ===');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

async function testTraitAnalysis() {
  console.log('  - 获取种质列表...');
  const germplasmList = await axios.get(`${BASE_URL}/germplasm?pageSize=5`);
  const germplasms = germplasmList.data.data.list || [];

  if (germplasms.length === 0) {
    console.log('  ⚠️ 没有种质数据，跳过详细测试');
    return;
  }

  const testId = germplasms[0].id;
  console.log(`  - 测试种质 ID: ${testId} (${germplasms[0].name})`);

  console.log('  - 测试年度对比分析...');
  const currentYear = new Date().getFullYear();
  const years = `${currentYear - 1},${currentYear}`;
  
  const result = await axios.get(`${BASE_URL}/analytics/trait/yearly-comparison`, {
    params: { germplasm_id: testId, years }
  });

  console.log('    ✅ 响应状态:', result.data.code);
  console.log('    - 种质ID:', result.data.data.germplasm_id);
  console.log('    - 年份范围:', result.data.data.years);
  console.log('    - 性状数量:', result.data.data.traits.length);

  if (result.data.data.traits.length > 0) {
    const firstTrait = result.data.data.traits[0];
    console.log('    - 第一个性状:', firstTrait.trait_name);
    console.log('    - 年度数据条数:', firstTrait.yearly_data.length);
    
    firstTrait.yearly_data.forEach(yd => {
      console.log(`      ${yd.year}年: ${yd.count}条记录, 平均=${yd.avg_value}, 最小=${yd.min_value}, 最大=${yd.max_value}`);
    });
  }

  console.log('  ✅ 性状年度对比分析 API 正常');
}

async function testDistributionMap() {
  console.log('  - 测试热力图数据...');
  const result = await axios.get(`${BASE_URL}/analytics/distribution/heatmap`);

  console.log('    ✅ 响应状态:', result.data.code);
  console.log('    - 热力图区域数:', result.data.data.heatmap.length);
  console.log('    - 原始数据点数:', result.data.data.raw_points.length);
  console.log('    - 统计信息:', JSON.stringify(result.data.data.stats));

  if (result.data.data.heatmap.length > 0) {
    console.log('    - Top 3 密集区域:');
    result.data.data.heatmap.slice(0, 3).forEach((area, idx) => {
      console.log(`      ${idx + 1}. [${area.lat.toFixed(2)}, ${area.lng.toFixed(2)}] - ${area.count}个资源`);
    });
  }

  console.log('  - 测试区域分布数据...');
  const regionResult = await axios.get(`${BASE_URL}/analytics/distribution/by-region`);
  console.log('    ✅ 区域数量:', regionResult.data.data.length);

  console.log('  ✅ 资源分布热力图 API 正常');
}

async function testClassificationStats() {
  console.log('  - 测试分类统计...');
  const result = await axios.get(`${BASE_URL}/analytics/classification/stats`);

  console.log('    ✅ 响应状态:', result.data.code);
  console.log('    - 分类数量:', result.data.data.classification_stats.length);
  console.log('    - 性状分类统计数:', result.data.data.trait_category_stats.length);

  if (result.data.data.classification_stats.length > 0) {
    console.log('    - 第一个分类:', result.data.data.classification_stats[0].name);
    console.log('      - 种质数量:', result.data.data.classification_stats[0].germplasm_count);
    console.log('      - 性状数量:', result.data.data.classification_stats[0].trait_count);
    console.log('      - 影像数量:', result.data.data.classification_stats[0].image_count);
    console.log('      - 子分类数量:', result.data.data.classification_stats[0].child_count);
  }

  console.log('  ✅ 分类统计 API 正常');
}

async function testQuickStats() {
  console.log('  - 测试快速统计...');
  const result = await axios.get(`${BASE_URL}/analytics/germplasm/quick-stats`);

  console.log('    ✅ 响应状态:', result.data.code);
  console.log('    - 按状态统计:', result.data.data.by_status);
  console.log('    - 按材料类型统计:', result.data.data.by_material_type.length, '种');
  console.log('    - 按年份统计:', result.data.data.by_year.length, '年');
  console.log('    - 按保存方式统计:', result.data.data.by_conservation.length, '种');
  console.log('    - 最近活动:', result.data.data.recent_activity.length, '条');

  console.log('  ✅ 快速统计 API 正常');
}

testAll();
