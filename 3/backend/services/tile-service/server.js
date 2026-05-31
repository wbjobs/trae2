const express = require('express');
const cors = require('cors');
const path = require('path');
const createRoutes = require('./src/routes');

const ServiceRegistry = require('../../common/ServiceRegistry');

const PORT = process.env.PORT || 3001;
const SERVICE_NAME = 'tile-service';

async function startServer() {
  const app = express();
  const serviceRegistry = new ServiceRegistry();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  await serviceRegistry.register(SERVICE_NAME, {
    name: SERVICE_NAME,
    url: `http://localhost:${PORT}`,
    port: PORT,
    endpoints: ['/api/tile', '/api/tiles/bounds', '/api/layer', '/api/layers']
  });

  const routes = createRoutes(serviceRegistry);
  app.use('/api', routes);

  app.get('/', (req, res) => {
    res.json({
      service: SERVICE_NAME,
      version: '1.0.0',
      description: 'Point Cloud Tile Loading Service'
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 ${SERVICE_NAME} running on http://localhost:${PORT}`);
    console.log(`📦 API endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/tile/:layerId/:lod/:x/:y/:z`);
    console.log(`   POST /api/tiles/bounds`);
    console.log(`   GET  /api/layer/:layerId`);
    console.log(`   GET  /api/layers`);
    console.log(`   GET  /api/cache/clear`);
    console.log(`   GET  /api/cache/stats`);
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
