const ServiceGateway = require('./common/ServiceGateway');

const PORT = process.env.PORT || 3000;

async function startGateway() {
  const gateway = new ServiceGateway({ port: PORT });
  
  await gateway.registerService('tile-service', {
    name: 'tile-service',
    url: 'http://localhost:3001',
    port: 3001,
    status: 'healthy'
  });
  
  await gateway.registerService('spatial-index', {
    name: 'spatial-index',
    url: 'http://localhost:3002',
    port: 3002,
    status: 'healthy'
  });
  
  await gateway.start();
  
  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down gateway...`);
    await gateway.stop();
    process.exit(0);
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startGateway().catch(console.error);
