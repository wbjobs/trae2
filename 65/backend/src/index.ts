import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { sequelize, testConnection } from './config/database';
import { logger } from './utils/logger';
import authRoutes from './routes/auth.routes';
import specimenRoutes from './routes/specimen.routes';
import imageRoutes from './routes/image.routes';
import traceabilityRoutes from './routes/traceability.routes';
import userRoutes from './routes/user.routes';
import sharingRoutes from './routes/sharing.routes';
import searchRoutes from './routes/search.routes';
import uploadRoutes from './routes/upload.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

app.use((req, res, next) => {
  res.setTimeout(600000);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'GET' && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'public, max-age=60');
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/specimens', specimenRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/traceability', traceabilityRoutes);
app.use('/api/sharing', sharingRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '海洋生物标本系统服务运行正常' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

const startServer = async () => {
  try {
    await testConnection();
    await sequelize.sync({ alter: true });
    logger.info('数据库同步完成');
    
    app.listen(PORT, () => {
      logger.info(`服务器运行在 http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
};

startServer();
