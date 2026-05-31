const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb, waitForSave } = require('../config/db');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function getRelativeFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const uploadsIndex = normalized.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return normalized.substring(uploadsIndex + '/uploads/'.length);
  }
  return path.basename(filePath);
}

function normalizeFilePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date();
    const dir = path.join(UPLOADS_DIR,
      `${date.getFullYear()}`,
      `${String(date.getMonth() + 1).padStart(2, '0')}`,
      `${String(date.getDate()).padStart(2, '0')}`
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${hash}${ext}`;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) { cb(null, true); }
  else { cb(new Error('仅支持图片文件上传（JPG/PNG/GIF/BMP/WebP/TIFF）')); }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024, files: 20 }
});

router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const db = getDb();
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, message: '未上传任何文件' });
    }

    const { germplasm_id, trait_id, shoot_date, shoot_location,
            latitude, longitude, photographer, description, image_type } = req.body;

    const savedFiles = [];
    const insertStmt = db.prepare(`
      INSERT INTO field_images (
        germplasm_id, trait_id, filename, original_name, filepath,
        mimetype, size, image_type, shoot_date, shoot_location,
        latitude, longitude, photographer, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of req.files) {
      const relativePath = getRelativeFilePath(file.path);
      const result = insertStmt.run(
        germplasm_id || null, trait_id || null,
        file.filename, file.originalname, relativePath,
        file.mimetype, file.size,
        image_type || 'field_photo',
        shoot_date || null, shoot_location || null,
        latitude || null, longitude || null,
        photographer || null, description || null
      );
      savedFiles.push({
        id: result.lastInsertRowid,
        filename: file.filename,
        original_name: file.originalname,
        filepath: relativePath,
        url: `/uploads/${relativePath}`,
        size: file.size,
        mimetype: file.mimetype
      });
    }

    await waitForSave();
    res.json({ code: 200, data: savedFiles, message: `成功上传 ${savedFiles.length} 张图片` });
  } catch (err) {
    console.error('批量上传错误:', err);
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

router.post('/upload-single', upload.single('file'), async (req, res) => {
  try {
    const db = getDb();
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '未上传文件' });
    }

    const { germplasm_id, trait_id, shoot_date, shoot_location,
            latitude, longitude, photographer, description, image_type } = req.body;

    const relativePath = getRelativeFilePath(req.file.path);

    const result = db.prepare(`
      INSERT INTO field_images (
        germplasm_id, trait_id, filename, original_name, filepath,
        mimetype, size, image_type, shoot_date, shoot_location,
        latitude, longitude, photographer, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      germplasm_id || null, trait_id || null,
      req.file.filename, req.file.originalname, relativePath,
      req.file.mimetype, req.file.size,
      image_type || 'field_photo',
      shoot_date || null, shoot_location || null,
      latitude || null, longitude || null,
      photographer || null, description || null
    );

    await waitForSave();
    res.json({
      code: 200,
      data: {
        id: result.lastInsertRowid,
        filename: req.file.filename,
        original_name: req.file.originalname,
        filepath: relativePath,
        url: `/uploads/${relativePath}`,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      message: '图片上传成功'
    });
  } catch (err) {
    console.error('单文件上传错误:', err);
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { germplasm_id, trait_id, image_type, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = 'WHERE 1=1';
    const params = [];

    if (germplasm_id && germplasm_id !== '') {
      whereSql += ' AND fi.germplasm_id = ?';
      params.push(parseInt(germplasm_id));
    }
    if (trait_id && trait_id !== '') {
      whereSql += ' AND fi.trait_id = ?';
      params.push(parseInt(trait_id));
    }
    if (image_type && image_type !== '') {
      whereSql += ' AND fi.image_type = ?';
      params.push(image_type);
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM field_images fi ${whereSql}`).get(...params).cnt;

    const paramsWithPaging = [...params, parseInt(pageSize), offset];
    const rows = db.prepare(`
      SELECT fi.*, g.resource_no, g.name as germplasm_name
      FROM field_images fi
      LEFT JOIN germplasm g ON fi.germplasm_id = g.id
      ${whereSql}
      ORDER BY fi.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...paramsWithPaging);

    rows.forEach(row => {
      const normalizedPath = normalizeFilePath(row.filepath);
      row.filepath = normalizedPath;
      row.url = `/uploads/${normalizedPath}`;
    });

    res.json({ code: 200, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('影像列表查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/stats/summary', (req, res) => {
  try {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as cnt FROM field_images').get().cnt;
    const totalSize = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM field_images').get().total;
    const byType = db.prepare(`
      SELECT image_type, COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
      FROM field_images GROUP BY image_type ORDER BY count DESC
    `).all();
    const byDate = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM field_images GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
    `).all();

    res.json({ code: 200, data: { total, totalSize, byType, byDate } });
  } catch (err) {
    console.error('影像统计错误:', err);
    res.status(500).json({ code: 500, message: '统计查询失败: ' + err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const row = db.prepare(`
      SELECT fi.*, g.resource_no, g.name as germplasm_name
      FROM field_images fi
      LEFT JOIN germplasm g ON fi.germplasm_id = g.id
      WHERE fi.id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ code: 404, message: '影像记录不存在' });
    }

    const normalizedPath = normalizeFilePath(row.filepath);
    row.filepath = normalizedPath;
    row.url = `/uploads/${normalizedPath}`;
    res.json({ code: 200, data: row });
  } catch (err) {
    console.error('影像详情查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/:id/preview', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const row = db.prepare('SELECT filepath, mimetype, original_name FROM field_images WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ code: 404, message: '影像记录不存在' });
    }

    const normalizedPath = normalizeFilePath(row.filepath);
    const fullPath = path.join(UPLOADS_DIR, normalizedPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }

    const stat = fs.statSync(fullPath);
    res.writeHead(200, {
      'Content-Type': row.mimetype || 'image/jpeg',
      'Content-Length': stat.size,
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.original_name)}"`,
      'Cache-Control': 'public, max-age=86400'
    });
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('影像预览错误:', err);
    res.status(500).json({ code: 500, message: '预览失败: ' + err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const existing = db.prepare('SELECT * FROM field_images WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '影像记录不存在' });
    }

    const { shoot_date, shoot_location, latitude, longitude,
            photographer, description, image_type, germplasm_id, trait_id } = req.body;

    db.prepare(`
      UPDATE field_images SET
        shoot_date = COALESCE(?, shoot_date),
        shoot_location = COALESCE(?, shoot_location),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        photographer = COALESCE(?, photographer),
        description = COALESCE(?, description),
        image_type = COALESCE(?, image_type),
        germplasm_id = COALESCE(?, germplasm_id),
        trait_id = COALESCE(?, trait_id)
      WHERE id = ?
    `).run(
      shoot_date || null, shoot_location || null,
      latitude || null, longitude || null,
      photographer || null, description || null,
      image_type || null, germplasm_id || null, trait_id || null,
      id
    );

    await waitForSave();
    res.json({ code: 200, message: '影像信息更新成功' });
  } catch (err) {
    console.error('影像更新错误:', err);
    res.status(500).json({ code: 500, message: '更新失败: ' + err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const existing = db.prepare('SELECT * FROM field_images WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '影像记录不存在' });
    }

    const normalizedPath = normalizeFilePath(existing.filepath);
    const fullPath = path.join(UPLOADS_DIR, normalizedPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`已删除文件: ${fullPath}`);
      } catch (e) {
        console.warn('删除文件失败:', fullPath, e.message);
      }
    }

    db.prepare('DELETE FROM field_images WHERE id = ?').run(id);
    await waitForSave();

    res.json({ code: 200, message: '影像删除成功' });
  } catch (err) {
    console.error('影像删除错误:', err);
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

module.exports = router;
