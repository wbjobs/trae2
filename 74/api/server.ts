/**
 * 城市综合安防可视化平台 - 本地服务器入口
 */
import app from './app.js';
import { initWebSocket } from './websocket/index.js';
import { mockDataService } from './services/MockDataService.js';
import { clusterService } from './services/ClusterService.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);

  initWebSocket(server);
  console.log('WebSocket server initialized');

  setTimeout(() => {
    console.log('Initializing historical data...');
    mockDataService.generateHistoricalData(12);

    setTimeout(() => {
      console.log('Starting real-time mock data generation...');
      mockDataService.start(3000);

      console.log('Starting periodic clustering analysis...');
      clusterService.runPeriodicClustering();

      setInterval(() => {
        clusterService.runPeriodicClustering();
      }, 60000);
    }, 2000);
  }, 1000);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  mockDataService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  mockDataService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;