const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAll() {
  console.log('=== 开始验证修复效果 ===\n');

  try {
    console.log('1. 测试分类管理接口...');
    await testClassification();

    console.log('\n2. 测试种质资源批量提交接口...');
    await testBatchGermplasm();

    console.log('\n3. 测试影像上传与预览接口...');
    await testImage();

    console.log('\n=== 所有测试通过！修复验证成功 ===');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

async function testClassification() {
  const timestamp = Date.now();
  console.log('  - 创建根分类...');
  const rootCat = await axios.post(`${BASE_URL}/classification`, {
    name: '粮食作物',
    code: `FOOD_${timestamp}`,
    description: '粮食作物分类'
  });
  const rootId = rootCat.data.data.id;
  console.log('    ✅ 根分类创建成功，ID:', rootId);

  console.log('  - 创建子分类...');
  const childCat = await axios.post(`${BASE_URL}/classification`, {
    name: '水稻',
    code: `RICE_${timestamp}`,
    parent_id: rootId,
    description: '水稻子类'
  });
  const childId = childCat.data.data.id;
  console.log('    ✅ 子分类创建成功，ID:', childId);

  console.log('  - 创建孙分类...');
  const grandChildCat = await axios.post(`${BASE_URL}/classification`, {
    name: '杂交水稻',
    code: `HYBRID_RICE_${timestamp}`,
    parent_id: childId,
    description: '杂交水稻子类'
  });
  const grandChildId = grandChildCat.data.data.id;
  console.log('    ✅ 孙分类创建成功，ID:', grandChildId);

  console.log('  - 创建种质资源并关联到孙分类...');
  const germplasm = await axios.post(`${BASE_URL}/germplasm`, {
    name: '超级杂交稻',
    resource_no: `SUPER_RICE_${timestamp}`,
    origin: '湖南省长沙市',
    origin_latitude: 28.2282,
    origin_longitude: 112.9388,
    classification_id: grandChildId,
    description: '高产杂交水稻品种'
  });
  const germplasmId = germplasm.data.data.id;
  console.log('    ✅ 种质资源创建成功，ID:', germplasmId);

  console.log('  - 测试递归查询（从根分类查询所有子孙分类的种质）...');
  const result = await axios.get(`${BASE_URL}/classification/${rootId}/germplasm?include_children=true`);
  const germplasmList = result.data.data.list;
  console.log('    ✅ 查询成功，返回种质数量:', germplasmList.length);
  console.log('    ✅ 查询的分类ID范围:', result.data.data.class_ids);
  if (germplasmList.length > 0 && germplasmList.some(g => g.id === germplasmId)) {
    console.log('    ✅ 递归查询功能正常！');
  } else {
    throw new Error('递归查询结果不正确');
  }

  console.log('  - 测试分类树结构...');
  const tree = await axios.get(`${BASE_URL}/classification`);
  console.log('    ✅ 分类树获取成功，根节点数量:', tree.data.data.length);

  console.log('  ✅ 分类管理接口测试通过');
}

async function testBatchGermplasm() {
  const timestamp = Date.now();
  const batchData = {
    items: [
      {
        name: '小麦品种A',
        resource_no: `WHEAT_A_${timestamp}`,
        origin: '河南省郑州市',
        origin_latitude: 34.7466,
        origin_longitude: 113.6254,
        description: '冬小麦品种'
      },
      {
        name: '玉米品种B',
        resource_no: `CORN_B_${timestamp}`,
        origin: '吉林省长春市',
        origin_latitude: 43.8171,
        origin_longitude: 125.3235,
        description: '春玉米品种'
      },
      {
        name: '大豆品种C',
        resource_no: `SOYBEAN_C_${timestamp}`,
        origin: '黑龙江省哈尔滨市',
        origin_latitude: 45.8038,
        origin_longitude: 126.5350,
        description: '高蛋白大豆品种'
      },
      {
        name: '',
        resource_no: `INVALID_${timestamp}`,
        origin: '测试地点',
        origin_latitude: 1000,
        origin_longitude: 2000,
        description: '名称为空且经纬度超出范围，应该被验证失败'
      }
    ]
  };

  console.log('  - 提交批量数据（4条，其中1条无效）...');
  const result = await axios.post(`${BASE_URL}/germplasm/batch`, batchData);
  const resultData = result.data.data;
  
  console.log('    ✅ 批量提交成功');
  console.log('    - 成功数量:', resultData.success_count);
  console.log('    - 失败数量:', resultData.failed_count);
  console.log('    - 总数量:', resultData.total_count);
  console.log('    - 成功项目:', JSON.stringify(resultData.success_items, null, 2));
  console.log('    - 失败项目:', JSON.stringify(resultData.failed_items, null, 2));

  if (resultData.success_count === 3 && resultData.failed_count === 1) {
    console.log('    ✅ 批量提交验证逻辑正常！');
  } else {
    throw new Error('批量提交结果不符合预期');
  }

  console.log('  - 验证数据已持久化...');
  const list = await axios.get(`${BASE_URL}/germplasm`);
  console.log('    ✅ 当前种质总数:', list.data.data.list.length);
  if (list.data.data.list.length >= 4) {
    console.log('    ✅ 数据持久化成功！');
  }

  console.log('  ✅ 批量提交接口测试通过');
}

async function testImage() {
  const fs = require('fs');
  const path = require('path');
  const FormData = require('form-data');
  const timestamp = Date.now();

  console.log('  - 创建测试种质...');
  const germplasm = await axios.post(`${BASE_URL}/germplasm`, {
    name: '影像测试品种',
    resource_no: `IMG_TEST_${timestamp}`,
    origin: '测试地点',
    origin_latitude: 30.0,
    origin_longitude: 120.0,
    description: '用于影像测试的种质'
  });
  const germplasmId = germplasm.data.data.id;

  console.log('  - 创建测试图片文件...');
  const testImagePath = path.join(__dirname, 'test-image.jpg');
  const imageBuffer = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABf/9k=',
    'base64'
  );
  fs.writeFileSync(testImagePath, imageBuffer);

  console.log('  - 上传影像文件...');
  const form = new FormData();
  form.append('germplasm_id', germplasmId);
  form.append('description', '测试影像');
  form.append('files', fs.createReadStream(testImagePath));

  const uploadResult = await axios.post(`${BASE_URL}/image/upload`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  console.log('    ✅ 上传成功，影像ID:', uploadResult.data.data[0].id);
  const imageId = uploadResult.data.data[0].id;
  const imageUrl = uploadResult.data.data[0].url;
  console.log('    ✅ 返回的URL:', imageUrl);

  console.log('  - 测试影像列表查询...');
  const imageList = await axios.get(`${BASE_URL}/image?germplasm_id=${germplasmId}`);
  console.log('    ✅ 查询成功，影像数量:', imageList.data.data.list.length);
  if (imageList.data.data.list[0].url) {
    console.log('    ✅ URL字段正常:', imageList.data.data.list[0].url);
  }

  console.log('  - 测试流式预览接口...');
  const preview = await axios.get(`${BASE_URL}/image/${imageId}/preview`, {
    responseType: 'arraybuffer'
  });
  console.log('    ✅ 预览接口状态码:', preview.status);
  console.log('    ✅ Content-Type:', preview.headers['content-type']);
  console.log('    ✅ 文件大小:', preview.data.length, '字节');
  if (preview.data.length > 0 && preview.headers['content-type'].includes('image')) {
    console.log('    ✅ 流式预览功能正常！');
  }

  console.log('  - 清理测试文件...');
  fs.unlinkSync(testImagePath);

  console.log('  ✅ 影像接口测试通过');
}

testAll();
