const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const config = require('../config');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const token = authMiddleware.generateToken({
      username,
      role: 'admin',
      permissions: ['read', 'write', 'manage']
    });

    res.json({
      success: true,
      message: '登录成功',
      code: 'SUCCESS',
      data: {
        token,
        tokenType: 'Bearer',
        expiresIn: config.jwt.expiresIn,
        user: {
          username,
          role: 'admin'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '登录失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/refresh', authMiddleware.authenticateJWT, async (req, res) => {
  try {
    const token = authMiddleware.generateToken({
      username: req.user.username,
      role: req.user.role,
      permissions: req.user.permissions
    });

    res.json({
      success: true,
      message: '令牌刷新成功',
      code: 'SUCCESS',
      data: {
        token,
        tokenType: 'Bearer',
        expiresIn: config.jwt.expiresIn
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '令牌刷新失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/verify', authMiddleware.authenticateJWT, (req, res) => {
  res.json({
    success: true,
    message: '令牌有效',
    code: 'SUCCESS',
    data: {
      user: req.user
    }
  });
});

module.exports = router;
