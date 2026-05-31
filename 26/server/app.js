const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const db = require('./config/database');

db.authenticate()
  .then(() => console.log('数据库连接成功'))
  .catch(err => console.error('数据库连接失败:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/archives', require('./routes/archives'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/signatures', require('./routes/signatures'));
app.use('/api/traceability', require('./routes/traceability'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/warnings', require('./routes/warnings'));
app.use('/api/qrcode', require('./routes/qrcode'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '非遗溯源档案服务运行中', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

module.exports = app;
