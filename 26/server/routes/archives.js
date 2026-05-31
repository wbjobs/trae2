const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Archive = require('../models/Archive');
const CraftStep = require('../models/CraftStep');
const MaterialUsage = require('../models/MaterialUsage');
const Material = require('../models/Material');
const Transfer = require('../models/Transfer');
const Signature = require('../models/Signature');
const User = require('../models/User');
const OperationLog = require('../models/OperationLog');
const { auth, requireRoles } = require('../middleware/auth');
const { queryCache, QueryOptimizer } = require('../utils/queryOptimizer');

const generateHash = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

router.get('/', auth, (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, category, status, artisanId } = req.query;
    const offset = (page - 1) * pageSize;

    const cacheKey = queryCache.generateKey('archives', 'list', req.query);
    const cached = queryCache.get(cacheKey);
    if (cached) {
      return res.json({ code: 200, data: { ...cached, page: parseInt(page), pageSize: parseInt(pageSize) } });
    }

    const allArchives = Archive.findAll();
    
    const { rows, count } = QueryOptimizer.optimizeFindAll(allArchives, {
      where: {
        ...(keyword ? { name: { $like: keyword } } : {}),
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(artisanId ? { artisanId: parseInt(artisanId) } : {})
      },
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(pageSize)
    });

    const list = rows.map(archive => ({
      ...archive,
      artisan: archive.artisanId ? User.findByPk(archive.artisanId) : null
    }));

    const result = { list, total: count };
    queryCache.set(cacheKey, result);

    res.json({
      code: 200,
      data: { ...result, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('档案查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/light', auth, (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const allArchives = Archive.findAll();
    const { rows, count } = QueryOptimizer.optimizeFindAll(allArchives, {
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(pageSize),
      attributes: ['id', 'archiveNo', 'name', 'category', 'craftType', 'artisanName', 'status', 'estimatedValue', 'createdAt']
    });

    res.json({
      code: 200,
      data: { list: rows, total: count, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/:id', auth, (req, res) => {
  try {
    const { lazy } = req.query;
    const archive = Archive.findByPk(req.params.id);

    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    if (lazy === 'true') {
      return res.json({ code: 200, data: archive });
    }

    const artisan = archive.artisanId ? User.findByPk(archive.artisanId) : null;
    const craftSteps = CraftStep.findAll({ where: { archiveId: parseInt(req.params.id) }, order: [['stepNo', 'ASC']] });
    const materialUsages = MaterialUsage.findAll({ where: { archiveId: parseInt(req.params.id) } }).map(u => ({
      ...u,
      material: u.materialId ? Material.findByPk(u.materialId) : null
    }));
    const transfers = Transfer.findAll({ where: { archiveId: parseInt(req.params.id) }, order: [['transferDate', 'ASC']] });
    const signatures = Signature.findAll({ where: { archiveId: parseInt(req.params.id) }, order: [['signedAt', 'DESC']] });

    res.json({
      code: 200,
      data: {
        ...archive,
        artisan,
        craftSteps,
        materialUsages,
        transfers,
        signatures
      }
    });
  } catch (error) {
    console.error('档案详情错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, requireRoles('admin', 'artisan'), (req, res) => {
  try {
    const { name, category, description, craftType, dimensions, weight, materials, creationDate, artisanId, artisanName, images, estimatedValue } = req.body;

    const archiveNo = 'ARC' + new Date().getFullYear() + String(Date.now()).slice(-6);
    const allArchives = Archive.findAll({ order: [['createdAt', 'DESC']] });
    const lastArchive = allArchives[0];
    const hash = generateHash({ name, category, craftType, timestamp: Date.now() });

    const archive = Archive.create({
      archiveNo,
      name,
      category,
      description,
      craftType,
      dimensions,
      weight,
      materials,
      creationDate,
      artisanId: artisanId || req.user.id,
      artisanName: artisanName || req.user.realName || req.user.username,
      images: JSON.stringify(images || []),
      estimatedValue: parseFloat(estimatedValue) || 0,
      currentHolder: artisanName || req.user.realName || req.user.username,
      currentLocation: '工作室',
      status: 'pending',
      hash,
      prevHash: lastArchive?.hash
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '创建档案',
      module: 'archive',
      targetId: archive.id,
      targetType: 'archive',
      detail: `创建档案: ${name}`,
      ipAddress: req.ip
    });

    queryCache.invalidate('archives');
    res.json({ code: 200, message: '创建成功', data: archive });
  } catch (error) {
    console.error('创建档案错误:', error);
    res.status(500).json({ code: 500, message: '创建失败', error: error.message });
  }
});

router.put('/:id', auth, requireRoles('admin', 'artisan'), (req, res) => {
  try {
    const archive = Archive.findByPk(req.params.id);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const { name, category, description, craftType, dimensions, weight, materials, creationDate, images, status, currentLocation, currentHolder, estimatedValue } = req.body;

    const updated = Archive.update(req.params.id, {
      name: name || archive.name,
      category: category || archive.category,
      description: description || archive.description,
      craftType: craftType || archive.craftType,
      dimensions: dimensions || archive.dimensions,
      weight: weight || archive.weight,
      materials: materials || archive.materials,
      creationDate: creationDate || archive.creationDate,
      images: images ? JSON.stringify(images) : archive.images,
      status: status || archive.status,
      currentLocation: currentLocation || archive.currentLocation,
      currentHolder: currentHolder || archive.currentHolder,
      estimatedValue: estimatedValue !== undefined ? parseFloat(estimatedValue) : archive.estimatedValue
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '更新档案',
      module: 'archive',
      targetId: archive.id,
      targetType: 'archive',
      detail: `更新档案: ${name || archive.name}`,
      ipAddress: req.ip
    });

    queryCache.invalidate('archives');
    res.json({ code: 200, message: '更新成功', data: updated });
  } catch (error) {
    console.error('更新档案错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', error: error.message });
  }
});

router.delete('/:id', auth, requireRoles('admin'), (req, res) => {
  try {
    const archive = Archive.findByPk(req.params.id);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    Archive.destroy(req.params.id);

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '删除档案',
      module: 'archive',
      targetId: req.params.id,
      targetType: 'archive',
      detail: `删除档案: ${archive.name}`,
      ipAddress: req.ip
    });

    queryCache.invalidate('archives');
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', error: error.message });
  }
});

router.post('/:id/craft-steps', auth, requireRoles('admin', 'artisan'), (req, res) => {
  try {
    const archive = Archive.findByPk(req.params.id);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const { stepNo, stepName, description, startTime, endTime, tools, environment, qualityCheck } = req.body;

    const craftStep = CraftStep.create({
      archiveId: archive.id,
      stepNo,
      stepName,
      description,
      startTime,
      endTime,
      artisanId: req.user.id,
      artisanName: req.user.realName || req.user.username,
      tools: JSON.stringify(tools || []),
      environment,
      qualityCheck,
      status: qualityCheck ? 'completed' : 'in_progress',
      hash: generateHash({ stepNo, stepName, timestamp: Date.now() })
    });

    queryCache.invalidate('archives');
    res.json({ code: 200, message: '工序添加成功', data: craftStep });
  } catch (error) {
    console.error('添加工序错误:', error);
    res.status(500).json({ code: 500, message: '添加工序失败', error: error.message });
  }
});

router.get('/:id/craft-steps', auth, (req, res) => {
  try {
    const steps = CraftStep.findAll({ where: { archiveId: parseInt(req.params.id) }, order: [['stepNo', 'ASC']] });
    res.json({ code: 200, data: steps });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/options/categories', auth, (req, res) => {
  try {
    const archives = Archive.findAll();
    const categories = [...new Set(archives.map(a => a.category).filter(Boolean))];
    res.json({ code: 200, data: categories });
  } catch (error) {
    res.json({ code: 200, data: [] });
  }
});

router.get('/stats/summary', auth, (req, res) => {
  try {
    const cacheKey = queryCache.generateKey('archives', 'stats', {});
    const cached = queryCache.get(cacheKey);
    if (cached) {
      return res.json({ code: 200, data: cached });
    }

    const archives = Archive.findAll();
    const total = archives.length;
    const statusMap = {};
    const categoryMap = {};

    archives.forEach(a => {
      statusMap[a.status] = (statusMap[a.status] || 0) + 1;
      categoryMap[a.category] = (categoryMap[a.category] || 0) + 1;
    });

    const totalValue = archives.reduce((sum, a) => sum + (parseFloat(a.estimatedValue) || 0), 0);
    const categories = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));

    const result = { total, byStatus: statusMap, byCategory: categories, totalValue };
    queryCache.set(cacheKey, result);

    res.json({ code: 200, data: result });
  } catch (error) {
    res.json({ code: 200, data: { total: 0, byStatus: {}, byCategory: [], totalValue: 0 } });
  }
});

module.exports = router;
