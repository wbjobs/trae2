import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken } from './jwt';
import { success, error } from '../utils/response';
import logger from '../utils/logger';

interface User {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'operator' | 'device';
  permissions: string[];
}

const users: User[] = [
  {
    id: '1',
    username: 'admin',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    role: 'admin',
    permissions: ['admin:all', 'task:manage', 'device:control', 'data:upload', 'status:report'],
  },
  {
    id: '2',
    username: 'operator',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    role: 'operator',
    permissions: ['task:manage', 'device:control', 'data:upload', 'status:report'],
  },
  {
    id: '3',
    username: 'radar_device_01',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    role: 'device',
    permissions: ['data:upload', 'status:report'],
  },
];

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      error(res, 400, '用户名和密码不能为空');
      return;
    }

    const user = users.find((u) => u.username === username);

    if (!user) {
      error(res, 401, '用户名或密码错误', 401);
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      error(res, 401, '用户名或密码错误', 401);
      return;
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
    });

    logger.info(`用户 ${username} 登录成功`, { userId: user.id, role: user.role });

    success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
      },
    }, '登录成功');
  } catch (err) {
    logger.error('登录失败', { error: err });
    error(res, 500, '登录失败，请稍后重试', 500);
  }
};

export const validateToken = (req: Request, res: Response): void => {
  if (req.user) {
    success(res, {
      user: req.user }, '令牌有效');
  }
};
