const express = require('express');
const router = express.Router();
const apiResponse = require('../utils/response');
const os = require('os');

router.get('/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'pipeline-corrosion-monitoring-api',
    workerId: process.env.WORKER_ID || 'master',
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
      loadAverage: os.loadavg()
    },
    process: {
      pid: process.pid,
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      }
    }
  };

  apiResponse.success(res, healthCheck);
});

router.get('/ready', (req, res) => {
  apiResponse.success(res, {
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

router.get('/ping', (req, res) => {
  res.send('pong');
});

module.exports = router;
