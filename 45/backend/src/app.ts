import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './auth/auth.routes';
import fossilRoutes from './fossil/fossil.routes';
import storageRoutes from './storage/storage.routes';
import traceRoutes from './trace/trace.routes';
import { errorHandler } from './middleware/error.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use((req, res, next) => {
  req.setTimeout(600000);
  res.setTimeout(600000);
  next();
});

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

app.use('/api/storage/file', express.static('public/uploads', {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/fossils', fossilRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/traces', traceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '古生物化石标本三维建档系统运行正常' });
});

app.use(errorHandler);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fossil3d')
  .then(() => {
    console.log('MongoDB 连接成功');
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB 连接失败:', err);
  });
