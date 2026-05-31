const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Signature, Archive, User, OperationLog } = require('../models');
const { auth, requireRoles, requireVerified } = require('../middleware/auth');

const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
};

const signData = (data, privateKey) => {
  const sign = crypto.createSign('SHA256');
  sign.update(JSON.stringify(data));
  sign.end();
  return sign.sign(privateKey, 'base64');
};

const verifySignature = (data, signature, publicKey) => {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(JSON.stringify(data));
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch (error) {
    return false;
  }
};

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, archiveId, signerId, signatureType, status, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    let signatures = Signature.findAll({ order: [['signedAt', 'DESC'], ['createdAt', 'DESC']] });

    if (archiveId) {
      signatures = signatures.filter(s => s.archiveId == archiveId);
    }
    if (signerId) {
      signatures = signatures.filter(s => s.signerId == signerId);
    }
    if (signatureType) {
      signatures = signatures.filter(s => s.signatureType === signatureType);
    }
    if (status) {
      signatures = signatures.filter(s => s.status === status);
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      signatures = signatures.filter(s => 
        s.signatureNo?.toLowerCase().includes(kw) ||
        s.signerName?.toLowerCase().includes(kw) ||
        s.archiveName?.toLowerCase().includes(kw)
      );
    }

    const total = signatures.length;
    const rows = signatures.slice(offset, offset + parseInt(pageSize)).map(sig => ({
      ...sig,
      archive: sig.archiveId ? Archive.findByPk(sig.archiveId) : null,
      signer: sig.signerId ? User.findByPk(sig.signerId) : null
    }));

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
    console.error('签章查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const signature = Signature.findByPk(req.params.id);
    if (!signature) {
      return res.status(404).json({ code: 404, message: '签章不存在' });
    }

    signature.archive = signature.archiveId ? Archive.findByPk(signature.archiveId) : null;
    signature.signer = signature.signerId ? User.findByPk(signature.signerId) : null;

    res.json({ code: 200, data: signature });
  } catch (error) {
    console.error('签章详情错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, requireVerified, async (req, res) => {
  try {
    const { archiveId, signatureType, signatureData, documentHash, remark } = req.body;

    const archive = Archive.findByPk(archiveId);
    if (!archive) {
      return res.status(404).json({ code: 404, message: '档案不存在' });
    }

    const { publicKey, privateKey } = generateKeyPair();

    const signDataObj = {
      archiveId,
      signatureType,
      signatureData,
      documentHash,
      signerId: req.user.id,
      timestamp: Date.now()
    };

    const signatureValue = signData(signDataObj, privateKey);

    const signatureNo = 'SIG' + new Date().getFullYear() + String(Date.now()).slice(-6);
    const certificateNo = 'CERT' + new Date().getFullYear() + String(Date.now()).slice(-6);

    const signature = Signature.create({
      signatureNo,
      archiveId,
      archiveName: archive.name,
      signerId: req.user.id,
      signerName: req.user.realName || req.user.username,
      signerRole: req.user.role,
      signatureType,
      signatureData,
      publicKey,
      certificateNo,
      documentHash,
      signatureValue,
      status: 'valid',
      signedAt: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      remark
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '加盖签章',
      module: 'signature',
      targetId: signature.id,
      targetType: 'signature',
      detail: `为档案 ${archive.name} 加盖 ${signatureType} 签章`,
      ipAddress: req.ip
    });

    res.json({
      code: 200,
      message: '签章成功',
      data: {
        signature,
        privateKey
      }
    });
  } catch (error) {
    console.error('签章创建错误:', error);
    res.status(500).json({ code: 500, message: '签章失败', error: error.message });
  }
});

router.post('/verify', auth, async (req, res) => {
  try {
    const { signatureId } = req.body;

    const signature = Signature.findByPk(signatureId);
    if (!signature) {
      return res.status(404).json({ code: 404, message: '签章不存在' });
    }

    const signDataObj = {
      archiveId: signature.archiveId,
      signatureType: signature.signatureType,
      signatureData: signature.signatureData,
      documentHash: signature.documentHash,
      signerId: signature.signerId,
      timestamp: new Date(signature.signedAt || signature.createdAt).getTime()
    };

    const isValid = verifySignature(signDataObj, signature.signatureValue, signature.publicKey);
    const isExpired = signature.validUntil && new Date(signature.validUntil) < new Date();
    const isRevoked = signature.status === 'revoked';

    let status = 'invalid';
    if (isValid && !isExpired && !isRevoked) status = 'valid';
    else if (isExpired) status = 'expired';
    else if (isRevoked) status = 'revoked';

    res.json({
      code: 200,
      data: {
        signatureId,
        signatureNo: signature.signatureNo,
        isValid,
        status,
        isExpired,
        isRevoked,
        signerName: signature.signerName,
        signedAt: signature.signedAt,
        validUntil: signature.validUntil,
        message: status === 'valid' ? '签章有效' :
                 status === 'expired' ? '签章已过期' :
                 status === 'revoked' ? '签章已撤销' : '签章无效'
      }
    });
  } catch (error) {
    console.error('签章验证错误:', error);
    res.status(500).json({ code: 500, message: '验证失败', error: error.message });
  }
});

router.put('/:id/revoke', auth, requireRoles('admin'), async (req, res) => {
  try {
    const signature = Signature.findByPk(req.params.id);
    if (!signature) {
      return res.status(404).json({ code: 404, message: '签章不存在' });
    }

    Signature.update(req.params.id, { status: 'revoked' });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '撤销签章',
      module: 'signature',
      targetId: signature.id,
      targetType: 'signature',
      detail: `撤销签章: ${signature.signatureNo}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: '撤销成功' });
  } catch (error) {
    console.error('签章撤销错误:', error);
    res.status(500).json({ code: 500, message: '撤销失败', error: error.message });
  }
});

router.get('/archive/:archiveId', auth, async (req, res) => {
  try {
    let signatures = Signature.findAll({ where: { archiveId: parseInt(req.params.archiveId) }, order: [['signedAt', 'DESC']] });
    signatures = signatures.map(sig => ({
      ...sig,
      signer: sig.signerId ? User.findByPk(sig.signerId) : null
    }));
    res.json({ code: 200, data: signatures });
  } catch (error) {
    console.error('档案签章查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/stats/summary', auth, async (req, res) => {
  try {
    const all = Signature.findAll();
    const total = all.length;
    const valid = all.filter(s => s.status === 'valid').length;
    const expired = all.filter(s => s.status === 'expired').length;
    const revoked = all.filter(s => s.status === 'revoked').length;

    res.json({
      code: 200,
      data: { total, valid, verifying: total - valid - expired - revoked, expired, revoked }
    });
  } catch (error) {
    res.json({ code: 200, data: { total: 0, valid: 0, verifying: 0, expired: 0, revoked: 0 } });
  }
});

module.exports = router;
