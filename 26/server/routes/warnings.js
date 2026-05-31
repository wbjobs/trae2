const express = require('express');
const router = express.Router();
const TransferWarning = require('../models/TransferWarning');
const Transfer = require('../models/Transfer');
const Archive = require('../models/Archive');
const User = require('../models/User');
const OperationLog = require('../models/OperationLog');
const { auth, requireRoles } = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, warningLevel, warningType, archiveId } = req.query;
    const offset = (page - 1) * pageSize;

    let warnings = TransferWarning.findAll({ order: [['createdAt', 'DESC']] });

    if (status) warnings = warnings.filter(w => w.status === status);
    if (warningLevel) warnings = warnings.filter(w => w.warningLevel === warningLevel);
    if (warningType) warnings = warnings.filter(w => w.warningType === warningType);
    if (archiveId) warnings = warnings.filter(w => w.archiveId == archiveId);

    const total = warnings.length;
    const rows = warnings.slice(offset, offset + parseInt(pageSize)).map(w => ({
      ...w,
      archive: w.archiveId ? Archive.findByPk(w.archiveId) : null,
      transfer: w.transferId ? Transfer.findByPk(w.transferId) : null
    }));

    res.json({
      code: 200,
      data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('预警查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/stats', auth, (req, res) => {
  try {
    const stats = TransferWarning.getStats();
    res.json({ code: 200, data: stats });
  } catch (error) {
    res.json({ code: 200, data: { total: 0, pending: 0, resolved: 0, critical: 0, warning: 0, normal: 0 } });
  }
});

router.get('/:id', auth, (req, res) => {
  try {
    const warning = TransferWarning.findByPk(req.params.id);
    if (!warning) {
      return res.status(404).json({ code: 404, message: '预警不存在' });
    }
    warning.archive = warning.archiveId ? Archive.findByPk(warning.archiveId) : null;
    warning.transfer = warning.transferId ? Transfer.findByPk(warning.transferId) : null;
    res.json({ code: 200, data: warning });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { transferId, warningType, warningLevel, title, message, expectedArrival, actualArrival } = req.body;

    const transfer = Transfer.findByPk(transferId);
    if (!transfer) {
      return res.status(404).json({ code: 404, message: '流转记录不存在' });
    }

    const warning = TransferWarning.create({
      archiveId: transfer.archiveId,
      archiveName: transfer.archiveName,
      transferId,
      warningType,
      warningLevel: warningLevel || 'normal',
      title,
      message,
      expectedArrival,
      actualArrival,
      handlerId: transfer.handlerId,
      handlerName: transfer.handlerName,
      status: 'pending'
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '创建流转预警',
      module: 'warning',
      targetId: warning.id,
      targetType: 'warning',
      detail: `为流转记录 ${transfer.transferNo} 创建预警: ${title}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: '预警创建成功', data: warning });
  } catch (error) {
    console.error('预警创建错误:', error);
    res.status(500).json({ code: 500, message: '创建失败', error: error.message });
  }
});

router.put('/:id/resolve', auth, requireRoles('admin', 'inspector'), (req, res) => {
  try {
    const warning = TransferWarning.findByPk(req.params.id);
    if (!warning) {
      return res.status(404).json({ code: 404, message: '预警不存在' });
    }

    const { remark } = req.body;
    TransferWarning.resolve(req.params.id, req.user.realName || req.user.username, remark);

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '处理预警',
      module: 'warning',
      targetId: warning.id,
      targetType: 'warning',
      detail: `处理预警: ${warning.title}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: '处理成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '处理失败', error: error.message });
  }
});

router.delete('/:id', auth, requireRoles('admin'), (req, res) => {
  try {
    const warning = TransferWarning.findByPk(req.params.id);
    if (!warning) {
      return res.status(404).json({ code: 404, message: '预警不存在' });
    }
    TransferWarning.destroy(req.params.id);
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', error: error.message });
  }
});

router.post('/check-transfers', auth, requireRoles('admin'), (req, res) => {
  try {
    const transfers = Transfer.findAll({ where: { status: 'transit' } });
    const warnings = [];
    const now = new Date();

    for (const transfer of transfers) {
      if (!transfer.expectedArrival) continue;
      
      const expectedDate = new Date(transfer.expectedArrival);
      const daysDiff = Math.ceil((expectedDate - now) / (1000 * 60 * 60 * 24));

      const existing = TransferWarning.findAll({ where: { transferId: transfer.id, status: 'pending' } });
      if (existing.length > 0) continue;

      if (daysDiff < 0 && !transfer.actualArrival) {
        warnings.push(TransferWarning.create({
          archiveId: transfer.archiveId,
          archiveName: transfer.archiveName,
          transferId: transfer.id,
          warningType: 'overdue',
          warningLevel: 'critical',
          title: '流转逾期预警',
          message: `作品 ${transfer.archiveName} 已逾期 ${Math.abs(daysDiff)} 天未到达`,
          expectedArrival: transfer.expectedArrival,
          handlerId: transfer.handlerId,
          handlerName: transfer.handlerName,
          status: 'pending'
        }));
      } else if (daysDiff <= 1 && daysDiff >= 0 && !transfer.actualArrival) {
        warnings.push(TransferWarning.create({
          archiveId: transfer.archiveId,
          archiveName: transfer.archiveName,
          transferId: transfer.id,
          warningType: 'upcoming',
          warningLevel: 'warning',
          title: '即将到期提醒',
          message: `作品 ${transfer.archiveName} 将在 ${daysDiff} 天后到达预计日期`,
          expectedArrival: transfer.expectedArrival,
          handlerId: transfer.handlerId,
          handlerName: transfer.handlerName,
          status: 'pending'
        }));
      }
    }

    res.json({ 
      code: 200, 
      message: `扫描完成，生成 ${warnings.length} 条预警`,
      data: warnings 
    });
  } catch (error) {
    console.error('预警扫描错误:', error);
    res.status(500).json({ code: 500, message: '扫描失败', error: error.message });
  }
});

module.exports = router;
