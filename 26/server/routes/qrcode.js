const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Archive = require('../models/Archive');
const CraftStep = require('../models/CraftStep');
const Transfer = require('../models/Transfer');
const Signature = require('../models/Signature');
const User = require('../models/User');
const OperationLog = require('../models/OperationLog');
const { auth } = require('../middleware/auth');

const generateQRCode = async (content, options = {}) => {
  try {
    const defaultOptions = {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    };
    const qrData = await QRCode.toDataURL(content, { ...defaultOptions, ...options });
    return qrData;
  } catch (error) {
    throw error;
  }
};

const generateTraceUrl = (archiveId, baseUrl = 'http://localhost:5173') => {
  return `${baseUrl}/trace/${archiveId}`;
};

const generateArchiveInfo = (archive) => {
  return {
    id: archive.id,
    archiveNo: archive.archiveNo,
    name: archive.name,
    category: archive.category,
    craftType: archive.craftType,
    artisanName: archive.artisanName,
    creationDate: archive.creationDate,
    hash: archive.hash,
    traceUrl: generateTraceUrl(archive.id)
  };
};

router.get('/single/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;
    const archive = Archive.findByPk(archiveId);

    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const traceInfo = generateArchiveInfo(archive);
    const qrContent = JSON.stringify(traceInfo);
    const qrCode = await generateQRCode(qrContent, { width: parseInt(req.query.width) || 300 });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '生成溯源二维码',
      module: 'qrcode',
      targetId: archiveId,
      targetType: 'archive',
      detail: `为档案 ${archive.name} 生成溯源二维码`,
      ipAddress: req.ip
    });

    res.json({
      code: 200,
      data: {
        archive: traceInfo,
        qrCode,
        qrContent
      }
    });
  } catch (error) {
    console.error('二维码生成错误:', error);
    res.status(500).json({ code: 500, message: '生成失败', error: error.message });
  }
});

router.post('/batch', auth, async (req, res) => {
  try {
    const { archiveIds, category, craftType, page, pageSize } = req.body;
    let archives = [];

    if (archiveIds && archiveIds.length > 0) {
      archives = archiveIds.map(id => Archive.findByPk(id)).filter(Boolean);
    } else {
      let allArchives = Archive.findAll({ order: [['createdAt', 'DESC']] });
      
      if (category) {
        allArchives = allArchives.filter(a => a.category === category);
      }
      if (craftType) {
        allArchives = allArchives.filter(a => a.craftType === craftType);
      }

      if (page && pageSize) {
        const offset = (page - 1) * pageSize;
        archives = allArchives.slice(offset, offset + parseInt(pageSize));
      } else {
        archives = allArchives.slice(0, 50);
      }
    }

    const results = [];
    for (const archive of archives) {
      const traceInfo = generateArchiveInfo(archive);
      const qrContent = JSON.stringify(traceInfo);
      const qrCode = await generateQRCode(qrContent, { width: 200 });
      results.push({
        archive: traceInfo,
        qrCode,
        qrContent
      });
    }

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '批量生成溯源二维码',
      module: 'qrcode',
      targetId: null,
      targetType: 'archive',
      detail: `批量生成 ${results.length} 个档案的溯源二维码`,
      ipAddress: req.ip
    });

    res.json({
      code: 200,
      data: {
        list: results,
        total: results.length
      }
    });
  } catch (error) {
    console.error('批量二维码生成错误:', error);
    res.status(500).json({ code: 500, message: '生成失败', error: error.message });
  }
});

router.get('/download/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;
    const archive = Archive.findByPk(archiveId);

    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const traceInfo = generateArchiveInfo(archive);
    const qrContent = JSON.stringify(traceInfo);
    const qrCode = await generateQRCode(qrContent, { width: 512 });

    res.json({
      code: 200,
      data: {
        qrCode,
        filename: `${archive.archiveNo}_溯源二维码.png`,
        archive: traceInfo
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '下载失败', error: error.message });
  }
});

router.get('/verify/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;
    const archive = Archive.findByPk(archiveId);

    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const craftSteps = CraftStep.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['stepNo', 'ASC']] });
    const transfers = Transfer.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['transferDate', 'ASC']] });
    const signatures = Signature.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['signedAt', 'ASC']] });

    const verifyInfo = {
      archive: {
        id: archive.id,
        archiveNo: archive.archiveNo,
        name: archive.name,
        category: archive.category,
        craftType: archive.craftType,
        artisanName: archive.artisanName,
        creationDate: archive.creationDate,
        currentLocation: archive.currentLocation,
        currentHolder: archive.currentHolder,
        estimatedValue: archive.estimatedValue,
        hash: archive.hash
      },
      craftSteps: craftSteps.map(s => ({
        stepNo: s.stepNo,
        stepName: s.stepName,
        artisanName: s.artisanName,
        startTime: s.startTime,
        status: s.status
      })),
      transfers: transfers.map(t => ({
        transferNo: t.transferNo,
        transferType: t.transferType,
        fromParty: t.fromParty,
        toParty: t.toParty,
        transferDate: t.transferDate,
        status: t.status
      })),
      signatures: signatures.map(s => ({
        signatureNo: s.signatureNo,
        signatureType: s.signatureType,
        signerName: s.signerName,
        signedAt: s.signedAt,
        status: s.status
      })),
      verifyTime: new Date().toISOString(),
      traceUrl: generateTraceUrl(archiveId)
    };

    const qrContent = JSON.stringify({
      archiveNo: archive.archiveNo,
      name: archive.name,
      verifyTime: verifyInfo.verifyTime,
      traceUrl: verifyInfo.traceUrl
    });
    const qrCode = await generateQRCode(qrContent, { width: 256 });

    res.json({
      code: 200,
      data: { verifyInfo, qrCode }
    });
  } catch (error) {
    console.error('验证信息错误:', error);
    res.status(500).json({ code: 500, message: '获取失败', error: error.message });
  }
});

module.exports = router;
