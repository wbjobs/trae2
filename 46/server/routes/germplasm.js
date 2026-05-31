const express = require('express');
const router = express.Router();
const { getDb, waitForSave } = require('../config/db');
const dayjs = require('dayjs');

function generateResourceNo(db) {
  const date = dayjs().format('YYYYMMDD');
  const count = db.prepare('SELECT COUNT(*) as cnt FROM germplasm WHERE resource_no LIKE ?').get(`GRM-${date}%`).cnt;
  return `GRM-${date}-${String(count + 1).padStart(4, '0')}`;
}

function sanitizeString(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) return trimmed.substring(0, maxLength);
  return trimmed;
}

function validateGermplasmData(data, isBatch = false) {
  const errors = [];
  const cleaned = {};

  if (!data.name || !String(data.name).trim()) {
    errors.push('种质名称不能为空');
  } else {
    cleaned.name = sanitizeString(data.name, 200);
  }

  cleaned.resource_no = sanitizeString(data.resource_no, 50);
  cleaned.english_name = sanitizeString(data.english_name, 200);
  cleaned.classification_id = data.classification_id ? parseInt(data.classification_id) : null;
  cleaned.source = sanitizeString(data.source, 200);
  cleaned.origin = sanitizeString(data.origin, 200);
  cleaned.origin_address = sanitizeString(data.origin_address, 500);
  cleaned.material_type = sanitizeString(data.material_type, 100);
  cleaned.breeding_method = sanitizeString(data.breeding_method, 200);
  cleaned.year_collected = data.year_collected ? parseInt(data.year_collected) : null;
  cleaned.collector = sanitizeString(data.collector, 100);
  cleaned.conservation_method = sanitizeString(data.conservation_method, 100);
  cleaned.conservation_location = sanitizeString(data.conservation_location, 200);
  cleaned.biological_status = sanitizeString(data.biological_status, 50);
  cleaned.description = sanitizeString(data.description, 2000);
  cleaned.status = data.status === 'inactive' ? 'inactive' : 'active';

  cleaned.origin_latitude = data.origin_latitude !== null && data.origin_latitude !== '' && !isNaN(parseFloat(data.origin_latitude))
    ? parseFloat(data.origin_latitude) : null;
  cleaned.origin_longitude = data.origin_longitude !== null && data.origin_longitude !== '' && !isNaN(parseFloat(data.origin_longitude))
    ? parseFloat(data.origin_longitude) : null;

  if (cleaned.origin_latitude !== null && (cleaned.origin_latitude < -90 || cleaned.origin_latitude > 90)) {
    errors.push('纬度必须在 -90 到 90 之间');
  }
  if (cleaned.origin_longitude !== null && (cleaned.origin_longitude < -180 || cleaned.origin_longitude > 180)) {
    errors.push('经度必须在 -180 到 180 之间');
  }
  if (cleaned.year_collected !== null && (cleaned.year_collected < 1900 || cleaned.year_collected > 2100)) {
    errors.push('采集年份必须在 1900 到 2100 之间');
  }

  return { cleaned, errors, isValid: errors.length === 0 };
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { keyword, classification_id, status, page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = 'WHERE 1=1';
    const params = [];

    if (keyword) {
      const kw = `%${keyword}%`;
      whereSql += ' AND (g.name LIKE ? OR g.resource_no LIKE ? OR g.english_name LIKE ? OR g.origin LIKE ?)';
      params.push(kw, kw, kw, kw);
    }
    if (classification_id && classification_id !== '') {
      whereSql += ' AND g.classification_id = ?';
      params.push(parseInt(classification_id));
    }
    if (status && status !== '') {
      whereSql += ' AND g.status = ?';
      params.push(status);
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM germplasm g ${whereSql}`).get(...params).cnt;

    const paramsWithPaging = [...params, parseInt(pageSize), offset];
    const rows = db.prepare(`
      SELECT g.*, c.name as classification_name, c.code as classification_code
      FROM germplasm g
      LEFT JOIN classifications c ON g.classification_id = c.id
      ${whereSql}
      ORDER BY g.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...paramsWithPaging);

    for (const row of rows) {
      const traitCount = db.prepare('SELECT COUNT(*) as cnt FROM traits WHERE germplasm_id = ?').get(row.id).cnt;
      const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM field_images WHERE germplasm_id = ?').get(row.id).cnt;
      row.trait_count = traitCount;
      row.image_count = imageCount;
    }

    res.json({ code: 200, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('种质列表查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/stats/summary', (req, res) => {
  try {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as cnt FROM germplasm').get().cnt;
    const byClassification = db.prepare(`
      SELECT c.id, c.name, COUNT(g.id) as count
      FROM classifications c
      LEFT JOIN germplasm g ON g.classification_id = c.id
      WHERE c.parent_id = 0 OR c.parent_id IS NULL
      GROUP BY c.id, c.name
      ORDER BY count DESC
    `).all();
    const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM germplasm GROUP BY status`).all();
    const recent = db.prepare(`SELECT id, resource_no, name, created_at FROM germplasm ORDER BY created_at DESC LIMIT 5`).all();
    res.json({ code: 200, data: { total, byClassification, byStatus, recent } });
  } catch (err) {
    console.error('统计查询错误:', err);
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
      SELECT g.*, c.name as classification_name, c.code as classification_code
      FROM germplasm g
      LEFT JOIN classifications c ON g.classification_id = c.id
      WHERE g.id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ code: 404, message: '种质资源不存在' });
    }

    row.traits = db.prepare(`SELECT * FROM traits WHERE germplasm_id = ? ORDER BY observation_date DESC, created_at DESC`).all(id);
    row.images = db.prepare(`SELECT * FROM field_images WHERE germplasm_id = ? ORDER BY created_at DESC`).all(id);

    for (const img of row.images) {
      img.url = `/uploads/${img.filepath}`;
    }

    row.classification_path = [];
    if (row.classification_id) {
      let current = db.prepare('SELECT * FROM classifications WHERE id = ?').get(row.classification_id);
      while (current) {
        row.classification_path.unshift({ id: current.id, name: current.name, code: current.code });
        current = current.parent_id > 0 ? db.prepare('SELECT * FROM classifications WHERE id = ?').get(current.parent_id) : null;
      }
    }

    res.json({ code: 200, data: row });
  } catch (err) {
    console.error('种质详情查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { cleaned, errors, isValid } = validateGermplasmData(req.body);

    if (!isValid) {
      return res.status(400).json({ code: 400, message: '数据校验失败', errors });
    }

    if (!cleaned.resource_no) {
      cleaned.resource_no = generateResourceNo(db);
    } else {
      const existing = db.prepare('SELECT id FROM germplasm WHERE resource_no = ?').get(cleaned.resource_no);
      if (existing) {
        return res.status(400).json({ code: 400, message: `资源编号 "${cleaned.resource_no}" 已存在` });
      }
    }

    const result = db.prepare(`
      INSERT INTO germplasm (
        resource_no, name, english_name, classification_id, source, origin,
        origin_latitude, origin_longitude, origin_address,
        material_type, breeding_method, year_collected, collector,
        conservation_method, conservation_location, biological_status, description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleaned.resource_no, cleaned.name, cleaned.english_name, cleaned.classification_id,
      cleaned.source, cleaned.origin, cleaned.origin_latitude, cleaned.origin_longitude,
      cleaned.origin_address, cleaned.material_type, cleaned.breeding_method,
      cleaned.year_collected, cleaned.collector, cleaned.conservation_method,
      cleaned.conservation_location, cleaned.biological_status, cleaned.description,
      cleaned.status
    );

    res.json({
      code: 200,
      data: { id: result.lastInsertRowid, resource_no: cleaned.resource_no },
      message: '种质资源创建成功'
    });
  } catch (err) {
    console.error('种质创建错误:', err);
    res.status(500).json({ code: 500, message: '创建失败: ' + err.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const db = getDb();
    const items = req.body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 400, message: '请提供要批量创建的种质数据数组' });
    }

    if (items.length > 100) {
      return res.status(400).json({ code: 400, message: '单次批量创建最多支持 100 条' });
    }

    const results = [];
    const errors = [];

    db.beginTransaction();

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const { cleaned, errors: itemErrors, isValid } = validateGermplasmData(item, true);

        if (!isValid) {
          errors.push({ index: i, errors: itemErrors, data: item });
          continue;
        }

        if (!cleaned.resource_no) {
          cleaned.resource_no = generateResourceNo(db);
        } else {
          const existing = db.prepare('SELECT id FROM germplasm WHERE resource_no = ?').get(cleaned.resource_no);
          if (existing) {
            errors.push({ index: i, errors: [`资源编号 "${cleaned.resource_no}" 已存在`], data: item });
            continue;
          }
        }

        const result = db.prepare(`
          INSERT INTO germplasm (
            resource_no, name, english_name, classification_id, source, origin,
            origin_latitude, origin_longitude, origin_address,
            material_type, breeding_method, year_collected, collector,
            conservation_method, conservation_location, biological_status, description, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cleaned.resource_no, cleaned.name, cleaned.english_name, cleaned.classification_id,
          cleaned.source, cleaned.origin, cleaned.origin_latitude, cleaned.origin_longitude,
          cleaned.origin_address, cleaned.material_type, cleaned.breeding_method,
          cleaned.year_collected, cleaned.collector, cleaned.conservation_method,
          cleaned.conservation_location, cleaned.biological_status, cleaned.description,
          cleaned.status
        );

        results.push({
          index: i,
          id: result.lastInsertRowid,
          resource_no: cleaned.resource_no,
          name: cleaned.name
        });
      }

      db.commit();
      await waitForSave();

      res.json({
        code: 200,
        data: {
          success_count: results.length,
          failed_count: errors.length,
          total_count: items.length,
          success_items: results,
          failed_items: errors
        },
        message: `批量创建完成：成功 ${results.length} 条，失败 ${errors.length} 条`
      });
    } catch (err) {
      db.rollback();
      throw err;
    }
  } catch (err) {
    console.error('批量创建错误:', err);
    res.status(500).json({ code: 500, message: '批量创建失败: ' + err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const existing = db.prepare('SELECT * FROM germplasm WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '种质资源不存在' });
    }

    const { cleaned, errors, isValid } = validateGermplasmData(req.body);
    if (!isValid) {
      return res.status(400).json({ code: 400, message: '数据校验失败', errors });
    }

    const fields = [
      'name', 'english_name', 'classification_id', 'source', 'origin',
      'origin_latitude', 'origin_longitude', 'origin_address',
      'material_type', 'breeding_method', 'year_collected', 'collector',
      'conservation_method', 'conservation_location', 'biological_status',
      'description', 'status'
    ];

    const updates = [];
    const values = [];
    for (const f of fields) {
      if (cleaned[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(cleaned[f]);
      }
    }

    if (req.body.resource_no && req.body.resource_no !== existing.resource_no) {
      const duplicate = db.prepare('SELECT id FROM germplasm WHERE resource_no = ? AND id != ?').get(req.body.resource_no, id);
      if (duplicate) {
        return res.status(400).json({ code: 400, message: `资源编号 "${req.body.resource_no}" 已存在` });
      }
      updates.push('resource_no = ?');
      values.push(sanitizeString(req.body.resource_no, 50));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now','localtime')");
      values.push(id);
      db.prepare(`UPDATE germplasm SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ code: 200, message: '种质资源更新成功' });
  } catch (err) {
    console.error('种质更新错误:', err);
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

    const existing = db.prepare('SELECT * FROM germplasm WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '种质资源不存在' });
    }

    db.prepare('DELETE FROM germplasm WHERE id = ?').run(id);
    await waitForSave();

    res.json({ code: 200, message: '种质资源删除成功' });
  } catch (err) {
    console.error('种质删除错误:', err);
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

module.exports = router;
