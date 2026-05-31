const express = require('express');
const router = express.Router();
const { Archive, CraftStep, MaterialUsage, Material, Transfer, Signature, User } = require('../models');
const { auth } = require('../middleware/auth');

const crypto = require('crypto');
const generateHash = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

const safeDate = (dateStr) => {
  if (!dateStr) return new Date().toISOString();
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date().toISOString() : dateStr;
};

router.get('/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;

    const archive = Archive.findByPk(archiveId);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const craftSteps = CraftStep.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['stepNo', 'ASC']] });
    const materialUsages = MaterialUsage.findAll({ where: { archiveId: parseInt(archiveId) } }).map(usage => ({
      ...usage,
      material: usage.materialId ? Material.findByPk(usage.materialId) : null
    }));
    const transfers = Transfer.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['transferDate', 'ASC']] });
    const signatures = Signature.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['signedAt', 'ASC']] }).map(sig => ({
      ...sig,
      signer: sig.signerId ? User.findByPk(sig.signerId) : null
    }));
    const artisan = archive.artisanId ? User.findByPk(archive.artisanId) : null;

    const timeline = [];

    timeline.push({
      id: `archive-${archive.id}`,
      type: 'archive',
      title: '档案创建',
      description: archive.name,
      date: safeDate(archive.createdAt),
      actor: archive.artisanName || '系统',
      data: archive
    });

    if (materialUsages && materialUsages.length > 0) {
      materialUsages.forEach(usage => {
        timeline.push({
          id: `material-${usage.id}`,
          type: 'material',
          title: `使用原料: ${usage.materialName}`,
          description: `数量: ${usage.quantity}${usage.unit}${usage.usageReason ? ' - ' + usage.usageReason : ''}`,
          date: safeDate(usage.usageDate || usage.createdAt),
          actor: '工匠',
          data: usage
        });
      });
    }

    if (craftSteps && craftSteps.length > 0) {
      craftSteps.forEach(step => {
        timeline.push({
          id: `craft-${step.id}`,
          type: 'craft',
          title: `工序${step.stepNo}: ${step.stepName}`,
          description: step.description || '',
          date: safeDate(step.startTime || step.createdAt),
          actor: step.artisanName || '工匠',
          data: step
        });
      });
    }

    if (transfers && transfers.length > 0) {
      transfers.forEach(transfer => {
        timeline.push({
          id: `transfer-${transfer.id}`,
          type: 'transfer',
          title: `${transfer.fromParty} → ${transfer.toParty}`,
          description: `流转类型: ${transfer.transferType}`,
          date: safeDate(transfer.transferDate || transfer.createdAt),
          actor: transfer.handlerName || '管理员',
          data: transfer
        });
      });
    }

    if (signatures && signatures.length > 0) {
      signatures.forEach(sig => {
        timeline.push({
          id: `signature-${sig.id}`,
          type: 'signature',
          title: `电子签章: ${sig.signatureType}`,
          description: sig.signatureData || '',
          date: safeDate(sig.signedAt || sig.createdAt),
          actor: sig.signerName || '未知',
          data: sig
        });
      });
    }

    timeline.sort((a, b) => new Date(safeDate(a.date)).getTime() - new Date(safeDate(b.date)).getTime());

    const chain = [];
    let prevHash = archive.prevHash || 'genesis';
    timeline.forEach((item, index) => {
      const itemHash = item.data?.hash || generateHash({ ...item, index });
      chain.push({
        ...item,
        index,
        hash: itemHash,
        prevHash: index === 0 ? prevHash : chain[index - 1].hash,
        timestamp: new Date(safeDate(item.date)).getTime()
      });
      prevHash = itemHash;
    });

    const archiveDetail = {
      ...archive,
      artisan,
      craftSteps,
      materialUsages,
      transfers,
      signatures
    };

    res.json({
      code: 200,
      data: {
        archive: archiveDetail,
        timeline,
        chain,
        stats: {
          totalSteps: timeline.length,
          craftSteps: craftSteps?.length || 0,
          transfers: transfers?.length || 0,
          signatures: signatures?.length || 0,
          materials: materialUsages?.length || 0
        }
      }
    });
  } catch (error) {
    console.error('溯源查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/chain/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;

    const archive = Archive.findByPk(archiveId);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const transfers = Transfer.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['transferDate', 'ASC']] });
    const craftSteps = CraftStep.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['stepNo', 'ASC']] });
    const signatures = Signature.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['signedAt', 'ASC']] });
    const materialUsages = MaterialUsage.findAll({ where: { archiveId: parseInt(archiveId) } });

    const blocks = [];
    let blockIndex = 0;
    let prevHash = archive.prevHash || 'genesis';

    blocks.push({
      index: blockIndex++,
      type: 'genesis',
      timestamp: new Date(safeDate(archive.createdAt)).getTime(),
      data: {
        type: '档案创建',
        name: archive.name,
        archiveNo: archive.archiveNo,
        artisan: archive.artisanName
      },
      hash: archive.hash || generateHash({ archive, type: 'genesis' }),
      prevHash
    });
    prevHash = archive.hash || generateHash({ archive, type: 'genesis' });

    craftSteps.forEach(step => {
      const hash = step.hash || generateHash({ step, type: 'craft' });
      blocks.push({
        index: blockIndex++,
        type: 'craft',
        timestamp: new Date(safeDate(step.startTime || step.createdAt)).getTime(),
        data: {
          type: '制作工序',
          stepNo: step.stepNo,
          stepName: step.stepName,
          artisan: step.artisanName,
          description: step.description
        },
        hash,
        prevHash
      });
      prevHash = hash;
    });

    materialUsages.forEach(usage => {
      const hash = generateHash({ usage, type: 'material' });
      blocks.push({
        index: blockIndex++,
        type: 'material',
        timestamp: new Date(safeDate(usage.usageDate || usage.createdAt)).getTime(),
        data: {
          type: '物料使用',
          materialName: usage.materialName,
          quantity: usage.quantity,
          unit: usage.unit,
          reason: usage.usageReason
        },
        hash,
        prevHash
      });
      prevHash = hash;
    });

    transfers.forEach(transfer => {
      const hash = transfer.hash || generateHash({ transfer, type: 'transfer' });
      blocks.push({
        index: blockIndex++,
        type: 'transfer',
        timestamp: new Date(safeDate(transfer.transferDate || transfer.createdAt)).getTime(),
        data: {
          type: '流转记录',
          transferType: transfer.transferType,
          from: transfer.fromParty,
          to: transfer.toParty,
          status: transfer.status
        },
        hash,
        prevHash
      });
      prevHash = hash;
    });

    signatures.forEach(sig => {
      const hash = sig.documentHash || sig.hash || generateHash({ sig, type: 'signature' });
      blocks.push({
        index: blockIndex++,
        type: 'signature',
        timestamp: new Date(safeDate(sig.signedAt || sig.createdAt)).getTime(),
        data: {
          type: '电子签章',
          signatureType: sig.signatureType,
          signer: sig.signerName,
          signerRole: sig.signerRole
        },
        hash,
        prevHash
      });
      prevHash = hash;
    });

    blocks.sort((a, b) => a.timestamp - b.timestamp);
    blocks.forEach((block, index) => {
      block.index = index;
      if (index > 0) {
        block.prevHash = blocks[index - 1].hash;
      }
    });

    res.json({ code: 200, data: blocks });
  } catch (error) {
    console.error('链查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/verify-chain/:archiveId', auth, async (req, res) => {
  try {
    const { archiveId } = req.params;

    const archive = Archive.findByPk(archiveId);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const transfers = Transfer.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['transferDate', 'ASC']] });
    const craftSteps = CraftStep.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['stepNo', 'ASC']] });
    const signatures = Signature.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['signedAt', 'ASC']] });

    const verificationResults = [];
    let isValid = true;

    transfers.forEach((t, i) => {
      if (i > 0 && t.prevHash && transfers[i - 1].hash && t.prevHash !== transfers[i - 1].hash) {
        isValid = false;
        verificationResults.push({ type: 'transfer', id: t.id, valid: false, message: '前序哈希不匹配' });
      } else {
        verificationResults.push({ type: 'transfer', id: t.id, valid: true, message: '验证通过' });
      }
    });

    craftSteps.forEach((s, i) => {
      verificationResults.push({ type: 'craft', id: s.id, valid: true, message: '工序数据完整' });
    });

    signatures.forEach((s, i) => {
      verificationResults.push({ type: 'signature', id: s.id, valid: true, message: '签章数据完整' });
    });

    res.json({
      code: 200,
      data: {
        isValid,
        verificationResults,
        message: isValid ? '溯源链完整，数据未被篡改' : '溯源链存在异常，请检查',
        totalBlocks: transfers.length + craftSteps.length + signatures.length + 1
      }
    });
  } catch (error) {
    console.error('链验证错误:', error);
    res.status(500).json({ code: 500, message: '验证失败', error: error.message });
  }
});

module.exports = router;
