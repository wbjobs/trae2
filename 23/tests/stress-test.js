const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3000';
const CONCURRENT_TERMINALS = 100;
const REQUESTS_PER_TERMINAL = 10;
const DELAY_BETWEEN_REQUESTS = 100;

const terminalIds = Array.from({ length: CONCURRENT_TERMINALS }, (_, i) => `PWR-TEST-${String(i + 1).padStart(3, '0')}`);

function generateTerminalData(terminalId) {
  return {
    terminalId,
    timestamp: Date.now(),
    location: {
      latitude: 30 + Math.random() * 10,
      longitude: 105 + Math.random() * 20,
    },
    status: Math.random() > 0.1 ? 'online' : 'fault',
    metrics: {
      voltage: 210 + Math.random() * 30,
      current: 10 + Math.random() * 20,
      temperature: 25 + Math.random() * 50,
      humidity: 30 + Math.random() * 50,
      batteryLevel: Math.random() * 100,
      signalStrength: -120 + Math.random() * 60,
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
    },
  };
}

async function sendRequest(terminalId) {
  const data = generateTerminalData(terminalId);
  const startTime = Date.now();
  
  try {
    const response = await axios.post(`${API_BASE}/api/v1/terminals/report`, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    const duration = Date.now() - startTime;
    return { success: true, duration, status: response.status, terminalId };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration,
      status: error.response?.status || 0,
      terminalId,
      error: error.message,
    };
  }
}

async function runTerminalLoadTest(terminalId) {
  const results = [];
  for (let i = 0; i < REQUESTS_PER_TERMINAL; i++) {
    const result = await sendRequest(terminalId);
    results.push(result);
    if (i < REQUESTS_PER_TERMINAL - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }
  return results;
}

async function runStressTest() {
  console.log(`🚀 开始压力测试...`);
  console.log(`📊 并发终端数: ${CONCURRENT_TERMINALS}`);
  console.log(`📊 每终端请求数: ${REQUESTS_PER_TERMINAL}`);
  console.log(`📊 总请求数: ${CONCURRENT_TERMINALS * REQUESTS_PER_TERMINAL}`);
  console.log('----------------------------------------');

  const startTime = Date.now();

  const promises = terminalIds.map(terminalId => runTerminalLoadTest(terminalId));
  const allResults = await Promise.all(promises);
  const flatResults = allResults.flat();

  const totalTime = Date.now() - startTime;
  const successCount = flatResults.filter(r => r.success).length;
  const failCount = flatResults.filter(r => !r.success).length;
  const durations = flatResults.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);
  const qps = (flatResults.length / totalTime) * 1000;

  console.log('✅ 测试完成!');
  console.log('----------------------------------------');
  console.log(`📈 总耗时: ${totalTime}ms`);
  console.log(`📈 成功请求: ${successCount}`);
  console.log(`📈 失败请求: ${failCount}`);
  console.log(`📈 成功率: ${((successCount / flatResults.length) * 100).toFixed(2)}%`);
  console.log(`📈 QPS: ${qps.toFixed(2)}`);
  console.log(`📈 平均响应时间: ${avgDuration.toFixed(2)}ms`);
  console.log(`📈 最大响应时间: ${maxDuration}ms`);
  console.log(`📈 最小响应时间: ${minDuration}ms`);
  console.log('----------------------------------------');

  if (failCount > 0) {
    console.log('❌ 失败请求示例:');
    const failures = flatResults.filter(r => !r.success).slice(0, 5);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.terminalId} - Status: ${f.status} - ${f.error}`);
    });
  }
}

runStressTest().catch(console.error);
