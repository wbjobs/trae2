import { Response } from 'express';
import { Op } from 'sequelize';
import { User, UserRole } from '../models/User.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const userController = {
  async getAllUsers(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search = '', role } = req.query;

      const where: any = {};
      if (search) {
        where[Op.or] = [
          { username: { [Op.like]: `%${search}%` } },
          { fullName: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }
      if (role) {
        where.role = role;
      }

      const { count, rows } = await User.findAndCountAll({
        where,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['password'] }
      });

      res.json({
        users: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      res.status(500).json({ error: '获取用户列表失败' });
    }
  },

  async getUserById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id, { attributes: { exclude: ['password'] } });

      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      res.json({ user });
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      res.status(500).json({ error: '获取用户信息失败' });
    }
  },

  async createUser(req: AuthRequest, res: Response) {
    try {
      const { username, email, password, fullName, role, phone, department } = req.body;

      if (!username || !email || !password || !fullName) {
        return res.status(400).json({ error: '缺少必要字段' });
      }

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ error: '用户名已存在' });
      }

      const user = await User.create({
        username,
        email,
        password,
        fullName,
        role: role || UserRole.GUEST,
        phone,
        department,
        isActive: true
      });

      res.status(201).json({
        user: user.toJSON(),
        message: '用户创建成功'
      });
    } catch (error) {
      logger.error('创建用户失败:', error);
      res.status(500).json({ error: '创建用户失败' });
    }
  },

  async updateUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { fullName, email, role, phone, department, isActive } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      await user.update({ fullName, email, role, phone, department, isActive });

      res.json({
        user: user.toJSON(),
        message: '用户更新成功'
      });
    } catch (error) {
      logger.error('更新用户失败:', error);
      res.status(500).json({ error: '更新用户失败' });
    }
  },

  async deleteUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      if (req.user && req.user.id === Number(id)) {
        return res.status(400).json({ error: '不能删除自己的账号' });
      }

      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      await user.destroy();

      res.json({ message: '用户删除成功' });
    } catch (error) {
      logger.error('删除用户失败:', error);
      res.status(500).json({ error: '删除用户失败' });
    }
  },

  async updateUserRole(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
      }

      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }

      await user.update({ role });

      res.json({
        user: user.toJSON(),
        message: '角色更新成功'
      });
    } catch (error) {
      logger.error('更新用户角色失败:', error);
      res.status(500).json({ error: '更新用户角色失败' });
    }
  }
};
