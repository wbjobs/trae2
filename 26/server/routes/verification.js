const express = require('express');
const router = express.Router();
const { IdentityVerification, User, OperationLog } = require('../models');
const { auth, requireRoles } = require('../middleware/auth');

const mockThirdPartyVerify = async (idCard, realName) => {
  const random = Math.random();
  return {
    success: random > 0.1,
    confidence: random > 0.1 ? Math.floor(80 + random * 20) : Math.floor(30 + random * 40),
    service: '阿里云实人认证',
    orderNo: 'ALIYUN' + Date.now(),
    result: random > 0.1 ? '一致' : '不一致',
    rawData: {
      idCardVerified: random > 0.1,
      nameVerified: random > 0.1,
      riskLevel: random > 0.9 ? 'low' : random > 0.5 ? 'medium' : 'high'
    }
  };
};

router.get('/', auth, requireRoles('admin'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, userId, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    let data = IdentityVerification.getAll();
    if (status) data = data.filter(d => d.status === status);
    if (userId) data = data.filter(d => d.userId === parseInt(userId));
    if (keyword) {
      data = data.filter(d =>
        d.realName?.includes(keyword) || d.idCard?.includes(keyword)
      );
    }

    const total = data.length;
    data = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rows = data.slice(offset, offset + parseInt(pageSize));

    const list = rows.map(item => ({
      ...item,
      user: User.findByPk(item.userId)
    }));

    res.json({
      code: 200,
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const verifications = IdentityVerification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json({ code: 200, data: verifications });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const verification = IdentityVerification.findByPk(req.params.id);

    if (!verification) {
      return res.status(404).json({ code: 404, message: '核验记录不存在' });
    }

    if (verification.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权查看' });
    }

    verification.user = User.findByPk(verification.userId);
    res.json({ code: 200, data: verification });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { realName, idCard, idCardFront, idCardBack, facePhoto, phone, verifyMethod } = req.body;

    const all = IdentityVerification.getAll();
    const existingVerify = all.find(v =>
      v.userId === req.user.id && ['pending', 'verifying'].includes(v.status)
    );

    if (existingVerify) {
      return res.status(400).json({ code: 400, message: '存在待审核的核验申请，请耐心等待' });
    }

    const verifyNo = 'VER' + new Date().getFullYear() + String(Date.now()).slice(-6);

    const verification = IdentityVerification.create({
      verifyNo,
      userId: req.user.id,
      realName,
      idCard,
      idCardFront,
      idCardBack,
      facePhoto,
      phone: phone || req.user.phone,
      verifyMethod: verifyMethod || 'third_party',
      status: 'pending'
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '提交身份核验',
      module: 'verification',
      targetId: verification.id,
      targetType: 'verification',
      detail: `提交身份核验申请: ${verifyNo}`,
      ipAddress: req.ip
    });

    if (verifyMethod === 'third_party' || !verifyMethod) {
      setTimeout(async () => {
        try {
          const result = await mockThirdPartyVerify(idCard, realName);
          IdentityVerification.update(verification.id, {
            status: result.success ? 'approved' : 'rejected',
            thirdPartyService: result.service,
            thirdPartyOrderNo: result.orderNo,
            thirdPartyResult: JSON.stringify(result.rawData),
            confidence: result.confidence,
            verifiedAt: new Date(),
            rejectReason: result.success ? null : '身份信息核验不通过，请检查信息是否正确'
          });

          User.update(req.user.id, {
            verified: result.success,
            verifyStatus: result.success ? 'approved' : 'rejected'
          });
        } catch (err) {
          console.error('自动核验失败:', err);
        }
      }, 2000);
    }

    res.json({
      code: 200,
      message: '核验申请已提交' + (verifyMethod === 'third_party' ? '，正在进行第三方核验' : ''),
      data: verification
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '提交失败', error: error.message });
  }
});

router.put('/:id/audit', auth, requireRoles('admin'), async (req, res) => {
  try {
    const verification = IdentityVerification.findByPk(req.params.id);
    if (!verification) {
      return res.status(404).json({ code: 404, message: '核验记录不存在' });
    }

    const { status, rejectReason } = req.body;

    IdentityVerification.update(req.params.id, {
      status,
      verifiedAt: new Date(),
      verifierId: req.user.id,
      verifierName: req.user.realName,
      rejectReason: status === 'rejected' ? rejectReason : null
    });

    User.update(verification.userId, {
      verified: status === 'approved',
      verifyStatus: status
    });

    OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '审核身份核验',
      module: 'verification',
      targetId: verification.id,
      targetType: 'verification',
      detail: `${status === 'approved' ? '通过' : '拒绝'}核验申请: ${verification.verifyNo}`,
      ipAddress: req.ip
    });

    res.json({ code: 200, message: status === 'approved' ? '审核通过' : '已拒绝' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '审核失败', error: error.message });
  }
});

router.post('/third-party-verify', auth, async (req, res) => {
  try {
    const { idCard, realName } = req.body;
    const result = await mockThirdPartyVerify(idCard, realName);
    res.json({ code: 200, data: result });
  } catch (error) {
    res.status(500).json({ code: 500, message: '核验失败', error: error.message });
  }
});

module.exports = router;
