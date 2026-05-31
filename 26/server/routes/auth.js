const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, OperationLog } = require('../models');
const { auth, JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(400).json({ code: 400, message: '用户名或密码错误' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ code: 400, message: '用户名或密码错误' });
    }

    if (user.status === false) {
      return res.status(400).json({ code: 400, message: '账户已被禁用' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    await OperationLog.create({
      userId: user.id,
      username: user.username,
      operation: '用户登录',
      module: 'auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          realName: user.realName,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          verified: user.verified,
          verifyStatus: user.verifyStatus
        }
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '登录失败', error: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, realName, phone, idCard, role } = req.body;

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ code: 400, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
      realName,
      phone,
      idCard,
      role: role || 'viewer'
    });

    await OperationLog.create({
      userId: user.id,
      username: user.username,
      operation: '用户注册',
      module: 'auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ code: 200, message: '注册成功', data: { userId: user.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '注册失败', error: error.message });
  }
});

router.get('/profile', auth, async (req, res) => {
  try {
    res.json({ code: 200, data: req.user });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取用户信息失败', error: error.message });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { realName, phone, avatar } = req.body;
    await req.user.update({ realName, phone, avatar });
    res.json({ code: 200, message: '更新成功', data: req.user });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新失败', error: error.message });
  }
});

router.put('/password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const isMatch = await bcrypt.compare(oldPassword, req.user.password);
    if (!isMatch) {
      return res.status(400).json({ code: 400, message: '原密码错误' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await req.user.update({ password: hashedPassword });

    res.json({ code: 200, message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '密码修改失败', error: error.message });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    await OperationLog.create({
      userId: req.user.id,
      username: req.user.username,
      operation: '用户退出',
      module: 'auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.json({ code: 200, message: '退出成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '退出失败', error: error.message });
  }
});

module.exports = router;
