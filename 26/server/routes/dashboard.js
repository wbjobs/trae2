const express = require('express');
const router = express.Router();
const { Archive, Material, Transfer, User, Signature, OperationLog } = require('../models');
const { auth, requireRoles } = require('../middleware/auth');

router.get('/overview', auth, async (req, res) => {
  try {
    const archives = Archive.getAll();
    const materials = Material.getAll();
    const transfers = Transfer.getAll();
    const users = User.getAll();
    const signatures = Signature.getAll();

    const approvedArchives = archives.filter(a => a.status === 'approved').length;
    const pendingArchives = archives.filter(a => a.status === 'reviewing').length;
    const inStockMaterials = materials.filter(m => m.status === 'in_stock').length;
    const verifiedUsers = users.filter(u => u.verified).length;

    const archiveCategoriesMap = {};
    archives.forEach(a => {
      archiveCategoriesMap[a.category] = (archiveCategoriesMap[a.category] || 0) + 1;
    });
    const archiveCategories = Object.entries(archiveCategoriesMap).map(([category, count]) => ({ category, count }));

    const materialCategoriesMap = {};
    materials.forEach(m => {
      materialCategoriesMap[m.category] = (materialCategoriesMap[m.category] || 0) + 1;
    });
    const materialCategories = Object.entries(materialCategoriesMap).map(([category, count]) => ({ category, count }));

    const recentArchives = [...archives]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    const recentTransfers = [...transfers]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(t => ({
        ...t,
        archive: Archive.findByPk(t.archiveId)
      }));

    const totalMaterialValue = materials.reduce((sum, m) => sum + (parseFloat(m.totalValue) || 0), 0);
    const totalArchiveValue = archives.reduce((sum, a) => sum + (parseFloat(a.estimatedValue) || 0), 0);

    res.json({
      code: 200,
      data: {
        stats: {
          totalArchives: archives.length,
          totalMaterials: materials.length,
          totalTransfers: transfers.length,
          totalUsers: users.length,
          totalSignatures: signatures.length,
          approvedArchives,
          pendingArchives,
          inStockMaterials,
          verifiedUsers,
          totalMaterialValue,
          totalArchiveValue
        },
        archiveCategories,
        materialCategories,
        recentArchives,
        recentTransfers
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取数据失败', error: error.message });
  }
});

router.get('/stats/trend', auth, async (req, res) => {
  try {
    const archives = Archive.getAll();
    const transfers = Transfer.getAll();

    const archivesByMonthMap = {};
    archives.forEach(a => {
      const month = new Date(a.createdAt).toISOString().slice(0, 7);
      archivesByMonthMap[month] = (archivesByMonthMap[month] || 0) + 1;
    });
    const archivesTrend = Object.entries(archivesByMonthMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    const transfersByMonthMap = {};
    transfers.forEach(t => {
      const month = new Date(t.transferDate || t.createdAt).toISOString().slice(0, 7);
      transfersByMonthMap[month] = (transfersByMonthMap[month] || 0) + 1;
    });
    const transfersTrend = Object.entries(transfersByMonthMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    res.json({
      code: 200,
      data: {
        archivesTrend,
        transfersTrend
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取趋势数据失败', error: error.message });
  }
});

router.get('/logs', auth, requireRoles('admin'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20, module, userId } = req.query;
    const offset = (page - 1) * pageSize;

    let data = OperationLog.getAll();
    if (module) data = data.filter(d => d.module === module);
    if (userId) data = data.filter(d => d.userId === parseInt(userId));

    const total = data.length;
    data = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rows = data.slice(offset, offset + parseInt(pageSize));

    res.json({
      code: 200,
      data: {
        list: rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取日志失败', error: error.message });
  }
});

module.exports = router;
