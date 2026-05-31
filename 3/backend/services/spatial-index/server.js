const express = require('express');
const cors = require('cors');
const createRoutes = require('./src/routes');

const ServiceRegistry = require('../../common/ServiceRegistry');

const PORT = process.env.PORT || 3002;
const SERVICE_NAME = 'spatial-index';

async function startServer() {
  const app = express();
  const serviceRegistry = new ServiceRegistry();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  await serviceRegistry.register(SERVICE_NAME, {
    name: SERVICE_NAME,
    url: `http://localhost:${PORT}`,
    port: PORT,
    endpoints: [
      '/api/query/bounds',
      '/api/query/point',
      '/api/query/radius',
      '/api/query/view',
      '/api/layers'
    ]
  });

  const routes = createRoutes(serviceRegistry);
  app.use('/api', routes);

  app.get('/', (req, res) => {
    res.json({
      service: SERVICE_NAME,
      version: '1.0.0',
      description: 'Spatial Index Service using R-tree for point cloud data'
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`\n🔍 ${SERVICE_NAME} running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/index/tile/:layerId`);
    console.log(`   POST /api/index/tiles/:layerId`);
    console.log(`   POST /api/query/bounds/:layerId`);
    console.log(`   POST /api/query/point/:layerId`);
    console.log(`   POST /api/query/radius/:layerId`);
    console.log(`   POST /api/query/view/:layerId`);
    console.log(`   POST /api/query/multi`);
    console.log(`   GET  /api/layers`);
    console.log(`   GET  /api/stats`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await serviceRegistry.unregister(SERVICE_NAME);
    server.close(() => {
      console.log(`${SERVICE_NAME} shutdown complete`);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch(console.error);
