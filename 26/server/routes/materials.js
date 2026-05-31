const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const xlsx = require('xlsx');
const { Material, MaterialUsage, Archive, OperationLog, User } = require('../models');
const { auth, requireRoles } = require('../middleware/auth');

const generateHash = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, category, status, storageLocation } = req.query;
    const offset = (page - 1) * pageSize;

    let materials = Material.findAll({ order: [['createdAt', 'DESC']] });

    if (keyword) {
      const kw = keyword.toLowerCase();
      materials = materials.filter(m => 
        m.name?.toLowerCase().includes(kw) ||
        m.materialNo?.toLowerCase().includes(kw) ||
        m.supplier?.toLowerCase().includes(kw)
      );
    }
    if (category) {
      materials = materials.filter(m => m.category === category);
    }
    if (status) {
      materials = materials.filter(m => m.status === status);
    }
    if (storageLocation) {
      const loc = storageLocation.toLowerCase();
      materials = materials.filter(m => m.storageLocation?.toLowerCase().includes(loc));
    }

    const count = materials.length;
    const rows = materials.slice(offset, offset + parseInt(pageSize));

    res.json({
      code: 200,
      data: {
        list: rows,
        total: count,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('物料查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const material = Material.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ code: 404, message: '物料不存在' });
    }

    const usages = MaterialUsage.findAll({ where: { materialId: parseInt(req.params.id) } }).map(usage => ({
      ...usage,
      archive: usage.archiveId ? Archive.findByPk(usage.archiveId) : null
    }));

    material.usages = usages;

    res.json({ code: 200, data: material });
  } catch (error) {
    console.error('物料详情错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, requireRoles('admin', 'artisan'), async (req, res) => {
  try {
    const { name, category, specification, unit, quantity, unitPrice, origin, supplier, purchaseDate, batchNo, qualityLevel, storageLocation, description, images } = req.body;

    const materialNo = 'MAT' + new Date().getFullYear() + String(Date.now()).slice(-6);
    const totalValue = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

    const material = Material.create({
      materialNo,
      name,
      category,
      specification,
      unit,
      quantity: parseFloat(quantity) || 0,
      unitPrice: parseFloat(unitPrice) || 0,
      totalValue,
      origin,
      supplier,
      purchaseDate,
      batchNo,
      qualityLevel,
      storageLocation,
      description,
      images: JSON.stringify(images || []),
      receivedBy: req.user.id,
      receivedByName: req.user.realName || req.user.username,
      status: 'in_stock',
      hash: generateHash({ name, quantity, timestamp: Date.now() })
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '入库物料',
      module: 'material',
      targetId: material.id,
      targetType: 'material',
      detail: `入库物料: ${name}, 数量: ${quantity}${unit}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: '入库成功', data: material });
  } catch (error) {
    console.error('物料入库错误:', error);
    res.status(500).json({ code: 500, message: '入库失败', error: error.message });
  }
});

router.post('/batch', auth, requireRoles('admin'), async (req, res) => {
  try {
    const { materials } = req.body;
    const results = [];

    for (const item of materials) {
      const materialNo = 'MAT' + new Date().getFullYear() + String(Date.now() + Math.random()).slice(-6);
      const totalValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);

      const material = Material.create({
        materialNo,
        name: item.name,
        category: item.category,
        specification: item.specification,
        unit: item.unit,
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.unitPrice) || 0,
        totalValue,
        origin: item.origin,
        supplier: item.supplier,
        purchaseDate: item.purchaseDate,
        batchNo: item.batchNo,
        qualityLevel: item.qualityLevel,
        storageLocation: item.storageLocation,
        description: item.description,
        receivedBy: req.user.id,
        receivedByName: req.user.realName || req.user.username,
        status: 'in_stock',
        hash: generateHash({ name: item.name, quantity: item.quantity, timestamp: Date.now() })
      });
      results.push(material);
    }

    res.json({ code: 200, message: `批量入库成功，共${results.length}条记录`, data: results });
  } catch (error) {
    console.error('批量入库错误:', error);
    res.status(500).json({ code: 500, message: '批量入库失败', error: error.message });
  }
});

router.post('/import', auth, requireRoles('admin'), async (req, res) => {
  try {
    if (!req.body || !req.body.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件' });
    }

    const workbook = xlsx.read(req.body.file, { type: 'base64' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    const results = [];
    for (const row of data) {
      if (!row['物料名称'] && !row['name']) continue;
      
      const materialNo = 'MAT' + new Date().getFullYear() + String(Date.now() + Math.random()).slice(-6);
      const quantity = parseFloat(row['数量'] || row['quantity'] || 0);
      const unitPrice = parseFloat(row['单价'] || row['unitPrice'] || 0);
      const totalValue = quantity * unitPrice;

      const material = Material.create({
        materialNo,
        name: row['物料名称'] || row['name'],
        category: row['分类'] || row['category'] || '其他',
        specification: row['规格'] || row['specification'] || '',
        unit: row['单位'] || row['unit'] || '个',
        quantity,
        unitPrice,
        totalValue,
        origin: row['产地'] || row['origin'] || '',
        supplier: row['供应商'] || row['supplier'] || '',
        purchaseDate: row['采购日期'] || row['purchaseDate'] || new Date().toISOString().split('T')[0],
        batchNo: row['批次号'] || row['batchNo'] || '',
        qualityLevel: row['质量等级'] || row['qualityLevel'] || '合格',
        storageLocation: row['库位'] || row['storageLocation'] || '',
        description: row['描述'] || row['description'] || '',
        receivedBy: req.user.id,
        receivedByName: req.user.realName || req.user.username,
        status: 'in_stock',
        hash: generateHash({ name: row['物料名称'] || row['name'], timestamp: Date.now() })
      });
      results.push(material);
    }

    res.json({ code: 200, message: `导入成功，共${results.length}条记录`, data: results });
  } catch (error) {
    console.error('导入错误:', error);
    res.status(500).json({ code: 500, message: '导入失败', error: error.message });
  }
});

router.get('/export/template', auth, requireRoles('admin'), async (req, res) => {
  try {
    const templateData = [
      { 
        '物料编号': 'MAT2024123456',
        '物料名称': '天然朱砂', 
        '分类': '颜料', 
        '规格': '特级200目', 
        '单位': '克', 
        '数量': 5000, 
        '单价': 85, 
        '总价值': 425000,
        '产地': '贵州铜仁', 
        '供应商': '贵州朱砂矿业', 
        '采购日期': '2024-01-15', 
        '批次号': 'ZS202401001', 
        '质量等级': '特级', 
        '库位': 'A-01-01', 
        '状态': '在库',
        '描述': '示例数据，请删除后填写实际数据'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '物料台账');
    const buffer = xlsx.write(workbook, { type: 'base64' });

    res.json({ code: 200, data: buffer });
  } catch (error) {
    console.error('模板生成错误:', error);
    res.status(500).json({ code: 500, message: '生成模板失败', error: error.message });
  }
});

router.get('/export/data', auth, async (req, res) => {
  try {
    const { keyword, category, status, storageLocation } = req.query;

    let materials = Material.findAll({ order: [['createdAt', 'DESC']] });

    if (keyword) {
      const kw = keyword.toLowerCase();
      materials = materials.filter(m => 
        m.name?.toLowerCase().includes(kw) ||
        m.materialNo?.toLowerCase().includes(kw) ||
        m.supplier?.toLowerCase().includes(kw)
      );
    }
    if (category) {
      materials = materials.filter(m => m.category === category);
    }
    if (status) {
      materials = materials.filter(m => m.status === status);
    }
    if (storageLocation) {
      const loc = storageLocation.toLowerCase();
      materials = materials.filter(m => m.storageLocation?.toLowerCase().includes(loc));
    }

    const statusMap = {
      'in_stock': '在库',
      'in_use': '使用中',
      'used': '已用完',
      'disposed': '已处置'
    };

    const exportData = materials.map((m, index) => {
      const receiver = m.receivedBy ? User.findByPk(m.receivedBy) : null;
      return {
        '序号': index + 1,
        '物料编号': m.materialNo || '',
        '物料名称': m.name || '',
        '分类': m.category || '',
        '规格': m.specification || '',
        '单位': m.unit || '',
        '数量': m.quantity || 0,
        '单价': m.unitPrice || 0,
        '总价值': m.totalValue || 0,
        '产地': m.origin || '',
        '供应商': m.supplier || '',
        '采购日期': m.purchaseDate || '',
        '批次号': m.batchNo || '',
        '质量等级': m.qualityLevel || '',
        '库位': m.storageLocation || '',
        '状态': statusMap[m.status] || m.status || '',
        '接收人': receiver?.realName || receiver?.username || m.receivedByName || '',
        '描述': m.description || '',
        '创建时间': m.createdAt ? new Date(m.createdAt).toLocaleString() : ''
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '物料台账');
    const buffer = xlsx.write(workbook, { type: 'base64' });

    res.json({ 
      code: 200, 
      data: buffer,
      filename: `物料台账_${new Date().toISOString().split('T')[0]}.xlsx`
    });
  } catch (error) {
    console.error('导出错误:', error);
    res.status(500).json({ code: 500, message: '导出失败', error: error.message });
  }
});

router.put('/:id', auth, requireRoles('admin'), async (req, res) => {
  try {
    const material = Material.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ code: 404, message: '物料不存在' });
    }

    const { name, category, specification, unit, quantity, unitPrice, origin, supplier, purchaseDate, batchNo, qualityLevel, storageLocation, status, description, images } = req.body;
    const totalValue = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

    const updated = Material.update(req.params.id, {
      name,
      category,
      specification,
      unit,
      quantity: parseFloat(quantity) || 0,
      unitPrice: parseFloat(unitPrice) || 0,
      totalValue,
      origin,
      supplier,
      purchaseDate,
      batchNo,
      qualityLevel,
      storageLocation,
      status,
      description,
      images: images ? JSON.stringify(images) : material.images
    });

    res.json({ code: 200, message: '更新成功', data: updated });
  } catch (error) {
    console.error('更新错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', error: error.message });
  }
});

router.delete('/:id', auth, requireRoles('admin'), async (req, res) => {
  try {
    const material = Material.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ code: 404, message: '物料不存在' });
    }

    Material.delete(req.params.id);
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', error: error.message });
  }
});

router.post('/:id/usage', auth, requireRoles('admin', 'artisan'), async (req, res) => {
  try {
    const material = Material.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ code: 404, message: '物料不存在' });
    }

    const { archiveId, quantity, usageReason } = req.body;
    const qty = parseFloat(quantity) || 0;

    if (qty > parseFloat(material.quantity)) {
      return res.status(400).json({ code: 400, message: '库存不足' });
    }

    const archive = Archive.findByPk(archiveId);

    MaterialUsage.create({
      archiveId,
      archiveName: archive?.name || '',
      materialId: material.id,
      materialName: material.name,
      quantity: qty,
      unit: material.unit,
      usageReason,
      usedBy: req.user.id,
      usedByName: req.user.realName || req.user.username,
      usageDate: new Date().toISOString()
    });

    const newQuantity = parseFloat(material.quantity) - qty;
    const newStatus = newQuantity <= 0 ? 'used' : (material.status === 'in_stock' ? 'in_use' : material.status);
    Material.update(req.params.id, { quantity: newQuantity, status: newStatus });

    res.json({ code: 200, message: '领用成功' });
  } catch (error) {
    console.error('领用错误:', error);
    res.status(500).json({ code: 500, message: '领用失败', error: error.message });
  }
});

router.get('/stats/summary', auth, async (req, res) => {
  try {
    const materials = Material.findAll();
    const totalMaterials = materials.length;
    const totalValue = materials.reduce((sum, m) => sum + (parseFloat(m.totalValue) || 0), 0);
    const inStockCount = materials.filter(m => m.status === 'in_stock').length;
    
    const categoryMap = {};
    materials.forEach(m => {
      const cat = m.category || '其他';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const categories = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));

    res.json({
      code: 200,
      data: {
        totalMaterials,
        totalValue,
        inStockCount,
        categories
      }
    });
  } catch (error) {
    console.error('统计错误:', error);
    res.json({
      code: 200,
      data: { totalMaterials: 0, totalValue: 0, inStockCount: 0, categories: [] }
    });
  }
});

router.get('/options/categories', auth, async (req, res) => {
  try {
    const materials = Material.findAll();
    const categories = [...new Set(materials.map(m => m.category).filter(Boolean))];
    res.json({ code: 200, data: categories });
  } catch (error) {
    res.json({ code: 200, data: [] });
  }
});

module.exports = router;
