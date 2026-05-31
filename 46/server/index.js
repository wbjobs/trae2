const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, getDb } = require('./config/db');

async function startServer() {
  await initDatabase();

  const app = express();
  const PORT = process.env.PORT || 3000;

  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(uploadDir));

  const germplasmRoutes = require('./routes/germplasm');
  const classificationRoutes = require('./routes/classification');
  const traitRoutes = require('./routes/trait');
  const imageRoutes = require('./routes/image');
  const geolocationRoutes = require('./routes/geolocation');
  const analyticsRoutes = require('./routes/analytics');

  app.use('/api/germplasm', germplasmRoutes);
  app.use('/api/classification', classificationRoutes);
  app.use('/api/trait', traitRoutes);
  app.use('/api/image', imageRoutes);
  app.use('/api/geolocation', geolocationRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: '农业种质资源圃平台服务运行中' });
  });

  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  农业种质资源圃资源登记与性状观测平台`);
    console.log(`  后端服务已启动: http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
