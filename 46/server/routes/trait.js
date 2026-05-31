const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { germplasm_id, trait_category, growth_stage, observer, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = 'WHERE 1=1';
    const params = [];

    if (germplasm_id) { whereSql += ' AND t.germplasm_id = ?'; params.push(germplasm_id); }
    if (trait_category) { whereSql += ' AND t.trait_category = ?'; params.push(trait_category); }
    if (growth_stage) { whereSql += ' AND t.growth_stage = ?'; params.push(growth_stage); }
    if (observer) { whereSql += ' AND t.observer LIKE ?'; params.push(`%${observer}%`); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM traits t ${whereSql}`).get(...params).cnt;

    const rows = db.prepare(`
      SELECT t.*, g.resource_no, g.name as germplasm_name, g.english_name
      FROM traits t
      LEFT JOIN germplasm g ON t.germplasm_id = g.id
      ${whereSql}
      ORDER BY t.observation_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize), offset);

    rows.forEach(row => {
      if (row.images) {
        try { row.images = JSON.parse(row.images); } catch (e) { row.images = []; }
      } else { row.images = []; }
    });

    res.json({ code: 200, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/stats/by-category', (req, res) => {
  try {
    const db = getDb();
    const { germplasm_id } = req.query;
    let sql = 'SELECT trait_category, COUNT(*) as count FROM traits WHERE 1=1';
    const params = [];
    if (germplasm_id) { sql += ' AND germplasm_id = ?'; params.push(germplasm_id); }
    sql += ' GROUP BY trait_category ORDER BY count DESC';
    const rows = db.prepare(sql).all(...params);
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT t.*, g.resource_no, g.name as germplasm_name, g.english_name, g.origin, g.classification_id
      FROM traits t
      LEFT JOIN germplasm g ON t.germplasm_id = g.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ code: 404, message: '性状记录不存在' });
    }

    if (row.images) {
      try { row.images = JSON.parse(row.images); } catch (e) { row.images = []; }
    } else { row.images = []; }

    const linkedImages = db.prepare(`SELECT * FROM field_images WHERE trait_id = ? ORDER BY created_at DESC`).all(req.params.id);
    row.field_images = linkedImages;

    res.json({ code: 200, data: row });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      germplasm_id, trait_name, trait_category, trait_value, trait_unit,
      observation_date, observer, field_location, latitude, longitude,
      growth_stage, environment, notes, images
    } = req.body;

    if (!germplasm_id || !trait_name || !trait_value) {
      return res.status(400).json({ code: 400, message: '种质ID、性状名称和性状值为必填项' });
    }

    const germplasm = db.prepare('SELECT id FROM germplasm WHERE id = ?').get(germplasm_id);
    if (!germplasm) {
      return res.status(400).json({ code: 400, message: '关联的种质资源不存在' });
    }

    const imagesJson = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : null;

    const result = db.prepare(`
      INSERT INTO traits (
        germplasm_id, trait_name, trait_category, trait_value, trait_unit,
        observation_date, observer, field_location, latitude, longitude,
        growth_stage, environment, notes, images
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      germplasm_id, trait_name, trait_category || null, trait_value, trait_unit || null,
      observation_date || null, observer || null, field_location || null,
      latitude || null, longitude || null,
      growth_stage || null, environment || null, notes || null, imagesJson
    );

    res.json({ code: 200, data: { id: result.lastInsertRowid }, message: '性状记录创建成功' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM traits WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '性状记录不存在' });
    }

    const fields = [
      'trait_name', 'trait_category', 'trait_value', 'trait_unit',
      'observation_date', 'observer', 'field_location', 'latitude', 'longitude',
      'growth_stage', 'environment', 'notes', 'images'
    ];

    const updates = [];
    const values = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        if (f === 'images') {
          values.push(typeof req.body[f] === 'string' ? req.body[f] : JSON.stringify(req.body[f]));
        } else {
          values.push(req.body[f] === '' ? null : req.body[f]);
        }
      }
    });

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now','localtime')");
      values.push(req.params.id);
      db.prepare(`UPDATE traits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ code: 200, message: '性状记录更新成功' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM traits WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '性状记录不存在' });
    }
    db.prepare('DELETE FROM traits WHERE id = ?').run(req.params.id);
    res.json({ code: 200, message: '性状记录删除成功' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
