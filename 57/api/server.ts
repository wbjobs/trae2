/**
 * local server entry file, for local development
 */
import app from './app.js';
import { initDatabase } from './database/init.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3002;

async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized');
    const server = app.listen(PORT, () => {
      console.log(`Server ready on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;