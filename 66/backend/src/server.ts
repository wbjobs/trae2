import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getDatabase } from './models/database';
import resourceRoutes from './routes/resourceRoutes';
import growthRoutes from './routes/growthRoutes';
import categoryRoutes from './routes/categoryRoutes';
import imageRoutes from './routes/imageRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

getDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: '林木种质资源调查与生长监测平台 API 服务运行正常',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/resources', resourceRoutes);
app.use('/api/growth', growthRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/images', imageRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  林木种质资源调查与生长监测平台`);
  console.log(`  API 服务已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});

export default app;
