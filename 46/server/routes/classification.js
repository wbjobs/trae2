const express = require('express');
const router = express.Router();
const { getDb, waitForSave } = require('../config/db');

function getAllChildIds(db, parentId) {
  const childIds = [];
  const stack = [parentId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    const children = db.prepare('SELECT id FROM classifications WHERE parent_id = ?').all(currentId);
    for (const child of children) {
      childIds.push(child.id);
      stack.push(child.id);
    }
  }

  return childIds;
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const all = db.prepare(`SELECT * FROM classifications ORDER BY parent_id, sort_order, id`).all();

    const tree = [];
    const map = {};

    all.forEach(item => {
      map[item.id] = { ...item, children: [] };
    });

    all.forEach(item => {
      const parentId = item.parent_id;
      if (parentId && parentId > 0 && map[parentId]) {
        map[parentId].children.push(map[item.id]);
      } else {
        tree.push(map[item.id]);
      }
    });

    res.json({ code: 200, data: tree });
  } catch (err) {
    console.error('分类树查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/flat', (req, res) => {
  try {
    const db = getDb();
    const { parent_id, level } = req.query;

    let whereSql = 'WHERE 1=1';
    const params = [];

    if (parent_id !== undefined && parent_id !== '') {
      whereSql += ' AND c.parent_id = ?';
      params.push(parseInt(parent_id));
    }
    if (level !== undefined && level !== '') {
      whereSql += ' AND c.level = ?';
      params.push(parseInt(level));
    }

    const rows = db.prepare(`
      SELECT c.*, p.name as parent_name,
             (SELECT COUNT(*) FROM germplasm g WHERE g.classification_id = c.id) as germplasm_count
      FROM classifications c
      LEFT JOIN classifications p ON c.parent_id = p.id
      ${whereSql}
      ORDER BY c.sort_order, c.id
    `).all(...params);

    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('分类列表查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
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
      SELECT c.*, p.name as parent_name,
             (SELECT COUNT(*) FROM germplasm g WHERE g.classification_id = c.id) as germplasm_count
      FROM classifications c
      LEFT JOIN classifications p ON c.parent_id = p.id
      WHERE c.id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ code: 404, message: '分类不存在' });
    }

    row.path = [];
    let current = row;
    while (current) {
      row.path.unshift({ id: current.id, name: current.name, code: current.code });
      current = current.parent_id && current.parent_id > 0
        ? db.prepare('SELECT * FROM classifications WHERE id = ?').get(current.parent_id)
        : null;
    }

    row.children = db.prepare('SELECT * FROM classifications WHERE parent_id = ? ORDER BY sort_order, id').all(id);
    row.all_child_ids = getAllChildIds(db, id);

    res.json({ code: 200, data: row });
  } catch (err) {
    console.error('分类详情查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/:id/germplasm', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const { include_children = true, page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;

    const classIds = [id];
    if (include_children === true || include_children === 'true') {
      classIds.push(...getAllChildIds(db, id));
    }

    const placeholders = classIds.map(() => '?').join(',');

    const total = db.prepare(`
      SELECT COUNT(*) as cnt FROM germplasm g WHERE g.classification_id IN (${placeholders})
    `).get(...classIds).cnt;

    const rows = db.prepare(`
      SELECT g.*, c.name as classification_name, c.code as classification_code
      FROM germplasm g
      LEFT JOIN classifications c ON g.classification_id = c.id
      WHERE g.classification_id IN (${placeholders})
      ORDER BY g.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...classIds, parseInt(pageSize), offset);

    for (const row of rows) {
      const traitCount = db.prepare('SELECT COUNT(*) as cnt FROM traits WHERE germplasm_id = ?').get(row.id).cnt;
      const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM field_images WHERE germplasm_id = ?').get(row.id).cnt;
      row.trait_count = traitCount;
      row.image_count = imageCount;
    }

    res.json({
      code: 200,
      data: {
        list: rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        class_ids: classIds
      }
    });
  } catch (err) {
    console.error('分类种质查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, code, parent_id, level, description, sort_order } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ code: 400, message: '分类名称不能为空' });
    }

    const cleanName = name.trim();
    const cleanCode = code ? code.trim() : null;
    const cleanParentId = parent_id ? parseInt(parent_id) : 0;
    const cleanLevel = level ? parseInt(level) : 1;
    const cleanSortOrder = sort_order ? parseInt(sort_order) : 0;

    if (cleanCode) {
      const existingCode = db.prepare('SELECT id FROM classifications WHERE code = ?').get(cleanCode);
      if (existingCode) {
        return res.status(400).json({ code: 400, message: `分类编码 "${cleanCode}" 已存在` });
      }
    }

    if (cleanParentId > 0) {
      const parent = db.prepare('SELECT id FROM classifications WHERE id = ?').get(cleanParentId);
      if (!parent) {
        return res.status(400).json({ code: 400, message: '父级分类不存在' });
      }
    }

    const result = db.prepare(`
      INSERT INTO classifications (name, code, parent_id, level, description, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanName, cleanCode, cleanParentId, cleanLevel, description || null, cleanSortOrder);

    await waitForSave();
    res.json({ code: 200, data: { id: result.lastInsertRowid }, message: '分类创建成功' });
  } catch (err) {
    console.error('分类创建错误:', err);
    res.status(500).json({ code: 500, message: '创建失败: ' + err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的ID' });
    }

    const existing = db.prepare('SELECT * FROM classifications WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '分类不存在' });
    }

    const { name, code, parent_id, level, description, sort_order } = req.body;

    if (code && code !== existing.code) {
      const duplicateCode = db.prepare('SELECT id FROM classifications WHERE code = ? AND id != ?').get(code.trim(), id);
      if (duplicateCode) {
        return res.status(400).json({ code: 400, message: `分类编码 "${code.trim()}" 已存在` });
      }
    }

    if (parent_id !== undefined) {
      const newParentId = parent_id ? parseInt(parent_id) : 0;
      if (newParentId > 0) {
        const parent = db.prepare('SELECT id FROM classifications WHERE id = ?').get(newParentId);
        if (!parent) {
          return res.status(400).json({ code: 400, message: '父级分类不存在' });
        }
        if (newParentId === id) {
          return res.status(400).json({ code: 400, message: '不能将自己设为父级分类' });
        }
        const childIds = getAllChildIds(db, id);
        if (childIds.includes(newParentId)) {
          return res.status(400).json({ code: 400, message: '不能将自己的子分类设为父级分类' });
        }
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name ? name.trim() : null);
    }
    if (code !== undefined) {
      updates.push('code = ?');
      values.push(code ? code.trim() : null);
    }
    if (parent_id !== undefined) {
      updates.push('parent_id = ?');
      values.push(parent_id ? parseInt(parent_id) : 0);
    }
    if (level !== undefined) {
      updates.push('level = ?');
      values.push(parseInt(level));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(parseInt(sort_order));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now','localtime')");
      values.push(id);
      db.prepare(`UPDATE classifications SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    await waitForSave();
    res.json({ code: 200, message: '分类更新成功' });
  } catch (err) {
    console.error('分类更新错误:', err);
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

    const existing = db.prepare('SELECT * FROM classifications WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '分类不存在' });
    }

    const childCount = db.prepare('SELECT COUNT(*) as cnt FROM classifications WHERE parent_id = ?').get(id).cnt;
    if (childCount > 0) {
      return res.status(400).json({ code: 400, message: `该分类下存在 ${childCount} 个子分类，无法删除` });
    }

    const germplasmCount = db.prepare('SELECT COUNT(*) as cnt FROM germplasm WHERE classification_id = ?').get(id).cnt;
    if (germplasmCount > 0) {
      return res.status(400).json({ code: 400, message: `该分类下存在 ${germplasmCount} 个种质资源，无法删除` });
    }

    db.prepare('DELETE FROM classifications WHERE id = ?').run(id);
    await waitForSave();

    res.json({ code: 200, message: '分类删除成功' });
  } catch (err) {
    console.error('分类删除错误:', err);
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

module.exports = router;
