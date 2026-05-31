const xlsx = require('xlsx');
const { Material, User, MaterialUsage, Archive } = require('../models');
const { QueryOptimizer } = require('./queryOptimizer');

const statusMap = {
  'in_stock': '在库',
  'in_use': '使用中',
  'used': '已用完',
  'disposed': '已处置'
};

const categoryMap = {
  'pigment': '颜料',
  'wood': '木材',
  'fabric': '布料',
  'metal': '金属',
  'lacquer': '漆料',
  'other': '其他'
};

class MaterialExportService {
  static generateExportData(filters = {}) {
    const { keyword, category, status, storageLocation } = filters;
    let materials = Material.findAll({ order: [['createdAt', 'DESC']] });

    if (keyword) {
      const kw = keyword.toLowerCase();
      materials = materials.filter(m => 
        m.name?.toLowerCase().includes(kw) ||
        m.materialNo?.toLowerCase().includes(kw) ||
        m.supplier?.toLowerCase().includes(kw)
      );
    }
    if (category) materials = materials.filter(m => m.category === category);
    if (status) materials = materials.filter(m => m.status === status);
    if (storageLocation) {
      const loc = storageLocation.toLowerCase();
      materials = materials.filter(m => m.storageLocation?.toLowerCase().includes(loc));
    }

    return materials.map((m, index) => {
      const receiver = m.receivedBy ? User.findByPk(m.receivedBy) : null;
      return {
        '序号': index + 1,
        '物料编号': m.materialNo || '',
        '物料名称': m.name || '',
        '分类': m.category || '',
        '分类名称': categoryMap[m.category] || '',
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
        '创建时间': m.createdAt ? new Date(m.createdAt).toLocaleString('zh-CN') : ''
      };
    });
  }

  static generateExcel(data) {
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '物料台账');
    return xlsx.write(workbook, { type: 'base64' });
  }

  static generateTemplate() {
    const templateData = [
      { 
        '物料编号': 'MAT2024123456',
        '物料名称': '天然朱砂',
        '分类': 'pigment',
        '分类名称': '颜料',
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
        '接收人': '系统管理员',
        '描述': '示例数据，请删除后填写实际数据'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '物料台账');
    return xlsx.write(workbook, { type: 'base64' });
  }

  static generateUsageReport(materialId) {
    const material = Material.findByPk(materialId);
    if (!material) return null;

    const usages = MaterialUsage.findAll({ where: { materialId: parseInt(materialId) } });
    const data = usages.map((u, index) => {
      const archive = u.archiveId ? Archive.findByPk(u.archiveId) : null;
      const user = u.usedBy ? User.findByPk(u.usedBy) : null;
      return {
        '序号': index + 1,
        '物料名称': material.name,
        '使用数量': u.quantity,
        '单位': u.unit,
        '使用原因': u.usageReason || '',
        '使用人': user?.realName || user?.username || u.usedByName || '',
        '使用日期': u.usageDate ? new Date(u.usageDate).toLocaleDateString('zh-CN') : '',
        '关联档案': archive?.name || '',
        '档案编号': archive?.archiveNo || ''
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '物料使用记录');
    return xlsx.write(workbook, { type: 'base64' });
  }

  static generateInventoryReport() {
    const materials = Material.findAll();
    const categories = {};

    materials.forEach(m => {
      const cat = m.category || 'other';
      if (!categories[cat]) {
        categories[cat] = { name: categoryMap[cat] || cat, count: 0, totalValue: 0, items: [] };
      }
      categories[cat].count++;
      categories[cat].totalValue += parseFloat(m.totalValue) || 0;
      categories[cat].items.push(m);
    });

    const summary = Object.entries(categories).map(([key, cat]) => ({
      '分类': cat.name,
      '物料种类': cat.count,
      '总价值': cat.totalValue.toFixed(2)
    }));

    return { summary, categories };
  }

  static importExcel(base64Data) {
    const workbook = xlsx.read(base64Data, { type: 'base64' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet);
  }

  static generateStockWarning() {
    const materials = Material.findAll();
    const warnings = [];

    materials.forEach(m => {
      if (parseFloat(m.quantity) <= 0) {
        warnings.push({ ...m, warningType: 'out_of_stock', message: '库存为空' });
      } else if (parseFloat(m.quantity) < 10) {
        warnings.push({ ...m, warningType: 'low_stock', message: '库存不足' });
      }
    });

    return warnings;
  }
}

module.exports = MaterialExportService;
