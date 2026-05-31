const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'heritage-traceability-secret-key-2024';

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ code: 401, message: '未提供认证令牌' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    if (user.status === false) {
      return res.status(401).json({ code: 401, message: '账户已被禁用' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '认证令牌已过期' });
    }
    return res.status(401).json({ code: 401, message: '认证失败' });
  }
};

const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '请先登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '权限不足，需要角色: ' + roles.join(', ') });
    }
    next();
  };
};

const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }
  if (!req.user.verified) {
    return res.status(403).json({ code: 403, message: '请先完成身份核验' });
  }
  next();
};

module.exports = { auth, requireRoles, requireVerified, JWT_SECRET };
