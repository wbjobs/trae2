const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/device/report',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'device_key_001'
  }
};

const testData = {
  deviceId: 'CNC_MACHINE_001',
  timestamp: Date.now(),
  protocol: 'Modbus',
  points: [
    {
      tagId: 'axis_x_position',
      value: 123.456,
      quality: 192
    },
    {
      tagId: 'axis_y_position',
      value: 789.012,
      quality: 192
    },
    {
      tagId: 'spindle_speed',
      value: 3000,
      quality: 192
    },
    {
      tagId: 'coolant_level',
      value: 85.5,
      quality: 192
    },
    {
      tagId: 'machine_status',
      value: 'running',
      quality: 192
    },
    {
      tagId: 'emergency_stop',
      value: false,
      quality: 192
    }
  ],
  metadata: {
    workshop: 'A01',
    shift: 'morning',
    operator: 'ZhangSan'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  console.log(`状态码: ${res.statusCode}`);
  console.log(`响应头: ${JSON.stringify(res.headers)}`);

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`响应体: ${data}`);
  });
});

req.on('error', (error) => {
  console.error(`请求错误: ${error.message}`);
});

req.write(JSON.stringify(testData));
req.end();
