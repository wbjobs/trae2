import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../../config';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, User } from '../../../shared/types';
import { AuthRequest, authenticateToken } from '../../common/middleware/auth';

const router = Router();
const store = DataStore.getInstance();

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  rememberMe: z.boolean().optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, '刷新令牌不能为空')
});

router.post('/login', (req: Request, res: Response<ApiResponse>) => {
  try {
    const validated = loginSchema.parse(req.body);
    const { username, password } = validated;

    const user = Array.from(store.users.values()).find(
      u => u.username === username && (u as any).password === password
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        success: false,
        message: '账号已被禁用'
      });
      return;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        departmentId: user.departmentId
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      config.jwtSecret,
      { expiresIn: config.refreshTokenExpiresIn }
    );

    user.lastLogin = new Date();

    const userResponse: Partial<User> & { password?: string } = { ...user };
    delete (userResponse as any).password;

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: userResponse
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

router.post('/refresh', (req: Request, res: Response<ApiResponse>) => {
  try {
    const validated = refreshSchema.parse(req.body);

    const decoded = jwt.verify(validated.refreshToken, config.jwtSecret) as { userId: string };
    const user = store.users.get(decoded.userId);

    if (!user || user.status !== 'active') {
      res.status(401).json({ success: false, message: '用户不存在或已被禁用' });
      return;
    }

    const newToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        departmentId: user.departmentId
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      success: true,
      data: { token: newToken }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: '刷新令牌无效或已过期' });
  }
});

router.post('/logout', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    message: '已成功登出'
  });
});

router.get('/me', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  const user = store.users.get(req.userId!);
  if (!user) {
    res.status(404).json({ success: false, message: '用户不存在' });
    return;
  }

  const userResponse: Partial<User> & { password?: string } = { ...user };
  delete (userResponse as any).password;

  res.json({
    success: true,
    data: userResponse
  });
});

export default router;
