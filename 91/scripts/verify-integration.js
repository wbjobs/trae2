const http = require('http');

const services = [
  { name: 'mirror-forward', port: 3001, path: '/api/forward/health' },
  { name: 'packet-parser', port: 3002, path: '/api/capture/health' },
  { name: 'trace-retrieval', port: 3003, path: '/api/query/health' },
  { name: 'data-ingestion', port: 3004, path: '/health' },
];

function checkService(service) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: service.port,
      path: service.path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          name: service.name,
          port: service.port,
          status: res.statusCode === 200 ? 'online' : 'error',
          statusCode: res.statusCode
        });
      });
    });

    req.on('error', () => {
      resolve({
        name: service.name,
        port: service.port,
        status: 'offline',
        statusCode: null
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: service.name,
        port: service.port,
        status: 'timeout',
        statusCode: null
      });
    });

    req.end();
  });
}

async function main() {
  console.log('\n=== 工业信令系统服务健康检查 ===\n');

  const results = await Promise.all(services.map(checkService));

  console.log('服务名称\t\t端口\t状态');
  console.log('----------------------------------------');

  let allOnline = true;
  for (const result of results) {
    const statusColor = result.status === 'online' ? '✓' : result.status === 'offline' ? '✗' : '?';
    console.log(`${statusColor} ${result.name.padEnd(16)}\t${result.port}\t${result.status}`);
    if (result.status !== 'online') allOnline = false;
  }

  console.log('\n----------------------------------------');

  if (allOnline) {
    console.log('✅ 所有后端服务运行正常！');
    console.log('📊 前端地址: http://localhost:5173');
  } else {
    console.log('⚠️  部分服务未启动，请检查上述服务');
  }

  console.log('');
}

main();
