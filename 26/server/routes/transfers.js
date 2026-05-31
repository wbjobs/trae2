const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Transfer, Archive, OperationLog } = require('../models');
const { auth, requireRoles } = require('../middleware/auth');

const generateHash = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, archiveId, transferType, status, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (archiveId) where.archiveId = archiveId;
    if (transferType) where.transferType = transferType;
    if (status) where.status = status;
    if (keyword) {
      where[Op.or] = [
        { transferNo: { [Op.like]: `%${keyword}%` } },
        { archiveName: { [Op.like]: `%${keyword}%` } },
        { fromParty: { [Op.like]: `%${keyword}%` } },
        { toParty: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const { count, rows } = await Transfer.findAndCountAll({
      where,
      include: [{ model: Archive, as: 'archive', attributes: ['id', 'archiveNo', 'name', 'images'] }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(pageSize)
    });

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
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const transfer = await Transfer.findByPk(req.params.id, {
      include: [{ model: Archive, as: 'archive' }]
    });

    if (!transfer) {
      return res.status(404).json({ code: 404, message: '流转记录不存在' });
    }

    res.json({ code: 200, data: transfer });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, requireRoles('admin', 'artisan'), async (req, res) => {
  try {
    const { archiveId, transferType, fromParty, fromPartyContact, fromAddress, toParty, toPartyContact, toAddress, transferDate, estimatedArrival, logisticsCompany, trackingNo, insuranceAmount, transferFee, description, attachment } = req.body;

    const archive = await Archive.findByPk(archiveId);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const transferNo = 'TRF' + new Date().getFullYear() + String(Date.now()).slice(-6);

    const lastTransfer = await Transfer.findOne({ where: { archiveId }, order: [['createdAt', 'DESC']] });
    const hash = generateHash({ transferNo, archiveId, toParty, timestamp: Date.now() });

    const transfer = await Transfer.create({
      transferNo,
      archiveId,
      archiveName: archive.name,
      transferType,
      fromParty,
      fromPartyContact,
      fromAddress,
      toParty,
      toPartyContact,
      toAddress,
      transferDate,
      estimatedArrival,
      logisticsCompany,
      trackingNo,
      insuranceAmount,
      transferFee,
      description,
      attachment: JSON.stringify(attachment || []),
      handlerId: req.user.id,
      handlerName: req.user.realName,
      hash,
      prevHash: lastTransfer?.hash
    });

    await OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '创建流转',
      module: 'transfer',
      targetId: transfer.id,
      targetType: 'transfer',
      detail: `创建流转记录: ${transferNo}, 从 ${fromParty} 到 ${toParty}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: '创建成功', data: transfer });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建失败', error: error.message });
  }
});

router.put('/:id', auth, requireRoles('admin'), async (req, res) => {
  try {
    const transfer = await Transfer.findByPk(req.params.id);
    if (!transfer) {
      return res.status(404).json({ code: 404, message: '流转记录不存在' });
    }

    const { status, actualArrival, trackingNo, description } = req.body;

    await transfer.update({ status, actualArrival, trackingNo, description });

    if (status === 'delivered' || status === 'confirmed') {
      const archive = await Archive.findByPk(transfer.archiveId);
      if (archive) {
        await archive.update({
          currentLocation: transfer.toAddress,
          currentHolder: transfer.toParty
        });
      }
    }

    res.json({ code: 200, message: '更新成功', data: transfer });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新失败', error: error.message });
  }
});

router.delete('/:id', auth, requireRoles('admin'), async (req, res) => {
  try {
    const transfer = await Transfer.findByPk(req.params.id);
    if (!transfer) {
      return res.status(404).json({ code: 404, message: '流转记录不存在' });
    }

    await transfer.destroy();
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败', error: error.message });
  }
});

router.get('/archive/:archiveId', auth, async (req, res) => {
  try {
    const transfers = await Transfer.findAll({
      where: { archiveId: req.params.archiveId },
      order: [['transferDate', 'ASC']]
    });
    res.json({ code: 200, data: transfers });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/stats/timeline', auth, async (req, res) => {
  try {
    const { archiveId } = req.query;
    const where = archiveId ? { archiveId } : {};

    const transfers = await Transfer.findAll({
      where,
      order: [['transferDate', 'ASC']],
      attributes: ['id', 'transferNo', 'transferType', 'archiveId', 'archiveName', 'fromParty', 'toParty', 'transferDate', 'status']
    });

    const timeline = transfers.map(t => ({
      id: t.id,
      date: t.transferDate,
      type: t.transferType,
      title: `${t.fromParty} → ${t.toParty}`,
      description: `${t.archiveName}`,
      status: t.status,
      transferNo: t.transferNo
    }));

    res.json({ code: 200, data: timeline });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

module.exports = router;
