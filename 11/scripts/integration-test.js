#!/usr/bin/env node

const http = require('http');

const GATEWAY_URL = 'http://localhost:8080/api';
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};

let authToken = '';

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GATEWAY_URL);
    const options = {
      method,
      headers: {
        ...DEFAULT_HEADERS,
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || 'Request failed'}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('  前后端接口联调测试');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    process.stdout.write(`  ${name}... `);
    try {
      await fn();
      console.log('✓ PASS');
      passed++;
    } catch (error) {
      console.log(`✗ FAIL - ${error.message}`);
      failed++;
    }
  };

  try {
    await test('网关健康检查', async () => {
      const result = await request('GET', '/health');
      if (!result.success) throw new Error('Gateway unhealthy');
    });

    await test('用户登录', async () => {
      const result = await request('POST', '/auth/login', {
        username: 'admin',
        password: 'admin123'
      });
      if (!result.success || !result.data?.token) {
        throw new Error('Login failed');
      }
      authToken = result.data.token;
      console.log(`(Token: ${authToken.substring(0, 20)}...)`);
    });

    await test('获取日志级别列表', async () => {
      const result = await request('GET', '/logs/levels');
      if (!Array.isArray(result)) throw new Error('Invalid response');
    });

    await test('获取服务列表', async () => {
      const result = await request('GET', '/logs/services');
      if (!Array.isArray(result)) throw new Error('Invalid response');
    });

    await test('获取节点列表', async () => {
      const result = await request('GET', '/logs/nodes');
      if (!Array.isArray(result)) throw new Error('Invalid response');
    });

    await test('查询日志', async () => {
      const result = await request('POST', '/logs/query', {});
      if (!result.success) throw new Error('Query failed');
    });

    await test('获取日志统计', async () => {
      const result = await request('POST', '/logs/stats', {});
      if (!result.success) throw new Error('Stats failed');
    });

    await test('获取异常聚类', async () => {
      const result = await request('GET', '/clusters');
      if (!result.success) throw new Error('Clusters failed');
    });

    await test('获取数据源列表', async () => {
      const result = await request('GET', '/sources');
      if (!result.success) throw new Error('Sources failed');
    });

    await test('获取仪表板列表', async () => {
      const result = await request('GET', '/dashboards');
      if (!result.success) throw new Error('Dashboards failed');
    });

    await test('创建数据源', async () => {
      const result = await request('POST', '/sources', {
        name: '测试数据源',
        type: 'file',
        config: { path: '/var/log/test.log' },
        connected: false
      });
      if (!result.success) throw new Error('Create source failed');
    });

    await test('创建仪表板', async () => {
      const result = await request('POST', '/dashboards', {
        name: '测试仪表板',
        components: [],
        layout: 'grid',
        filters: {}
      });
      if (!result.success) throw new Error('Create dashboard failed');
    });

    await test('获取服务状态', async () => {
      const result = await request('GET', '/services/status');
      if (!result.success) throw new Error('Status check failed');
    });

    await test('发送测试日志', async () => {
      const result = await request('POST', '/logs/ingest', {
        traceId: `trace-test-${Date.now()}`,
        spanId: `span-test-${Date.now()}`,
        level: 'INFO',
        service: 'integration-test',
        message: 'Integration test log message',
        timestamp: new Date().toISOString()
      });
      if (!result.success) throw new Error('Ingest failed');
    });

  } catch (error) {
    console.error('\n测试执行出错:', error);
  }

  console.log('\n========================================');
  console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  if (failed > 0) {
    console.log('\n部分测试失败，请检查:');
    console.log('  1. 确保所有服务已启动');
    console.log('  2. 检查服务端口配置');
    console.log('  3. 查看服务日志获取详细错误');
    process.exit(1);
  } else {
    console.log('\n所有测试通过! 系统接口联调成功。');
  }
}

runTests().catch(console.error);