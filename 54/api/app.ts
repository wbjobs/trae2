import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/dataReceiver.js';
import analysisRoutes from './routes/analysis.js';
import { dataStore } from './data/dataStore.js';
import { generateHistoricalData, generateSensorData } from './data/mockData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/analysis', analysisRoutes);

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    });
  }
);

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  });
});

function initializeMockData() {
  console.log('正在初始化历史数据...');
  const historicalData = generateHistoricalData(24);
  dataStore.addSensorDataBatch(historicalData);
  console.log(`已加载 ${historicalData.length} 条历史数据`);
}

initializeMockData();

setInterval(() => {
  const newData = generateSensorData();
  dataStore.addSensorData(newData);
}, 2000);

export default app;
