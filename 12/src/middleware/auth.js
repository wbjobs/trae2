const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

const authMiddleware = {
  authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
        code: 'NO_TOKEN'
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: '认证令牌格式错误',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: '认证令牌已过期',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        message: '无效的认证令牌',
        code: 'INVALID_TOKEN'
      });
    }
  },

  authenticateAPIKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: '未提供API密钥',
        code: 'NO_API_KEY'
      });
    }

    if (!config.apiKeys.includes(apiKey)) {
      logger.warn(`无效的API密钥尝试: ${apiKey.substring(0, 8)}...`);
      return res.status(403).json({
        success: false,
        message: '无效的API密钥',
        code: 'INVALID_API_KEY'
      });
    }

    req.apiKey = apiKey;
    next();
  },

  authenticateDevice(req, res, next) {
    const deviceId = req.headers['x-device-id'];
    const deviceToken = req.headers['x-device-token'];

    if (!deviceId || !deviceToken) {
      return res.status(401).json({
        success: false,
        message: '缺少设备认证信息',
        code: 'NO_DEVICE_AUTH'
      });
    }

    const validDeviceToken = `${deviceId}_${config.jwt.secret.substring(0, 16)}`;
    if (deviceToken !== validDeviceToken) {
      logger.warn(`设备认证失败: ${deviceId}`);
      return res.status(403).json({
        success: false,
        message: '设备认证失败',
        code: 'DEVICE_AUTH_FAILED'
      });
    }

    req.deviceId = deviceId;
    next();
  },

  generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
  }
};

module.exports = authMiddleware;
