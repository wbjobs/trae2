import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../models/User.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

interface LoginRequest {
  username: string;
  password: string;
}

export const authController = {
  async login(req: AuthRequest, res: Response) {
    try {
      const { username, password } = req.body as LoginRequest;

      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }

      const user = await User.findOne({ where: { username } });
      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: '账号已被禁用' });
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      await user.update({ lastLogin: new Date() });

      res.json({
        token,
        user: user.toJSON(),
        message: '登录成功'
      });
    } catch (error) {
      logger.error('登录失败:', error);
      res.status(500).json({ error: '登录失败', message: error instanceof Error ? error.message : '未知错误' });
    }
  },

  async register(req: AuthRequest, res: Response) {
    try {
      const { username, email, password, fullName, phone, department } = req.body;

      if (!username || !email || !password || !fullName) {
        return res.status(400).json({ error: '缺少必要字段' });
      }

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ error: '用户名已存在' });
      }

      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ error: '邮箱已被注册' });
      }

      const user = await User.create({
        username,
        email,
        password,
        fullName,
        phone,
        department,
        role: UserRole.GUEST,
        isActive: true
      });

      res.status(201).json({
        user: user.toJSON(),
        message: '注册成功，请等待管理员审核'
      });
    } catch (error) {
      logger.error('注册失败:', error);
      res.status(500).json({ error: '注册失败', message: error instanceof Error ? error.message : '未知错误' });
    }
  },

  async getCurrentUser(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: '未认证' });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      res.json({ user: user.toJSON() });
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      res.status(500).json({ error: '获取用户信息失败' });
    }
  },

  async changePassword(req: AuthRequest, res: Response) {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '旧密码和新密码不能为空' });
      }

      if (!req.user) {
        return res.status(401).json({ error: '未认证' });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      const isOldPasswordValid = await user.comparePassword(oldPassword);
      if (!isOldPasswordValid) {
        return res.status(400).json({ error: '旧密码错误' });
      }

      await user.update({ password: newPassword });

      res.json({ message: '密码修改成功' });
    } catch (error) {
      logger.error('修改密码失败:', error);
      res.status(500).json({ error: '修改密码失败' });
    }
  },

  async logout(req: AuthRequest, res: Response) {
    res.json({ message: '登出成功' });
  }
};
