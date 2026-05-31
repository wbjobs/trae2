import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, User } from '../../../shared/types';
import { AuthRequest, authenticateToken, authorizeRoles } from '../../common/middleware/auth';
import { generateId, paginate } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  email: z.string().email('邮箱格式不正确'),
  realName: z.string().min(1, '真实姓名不能为空'),
  password: z.string().min(6, '密码至少6个字符'),
  role: z.enum(['admin', 'department_head', 'specimen_admin', 'researcher']),
  departmentId: z.string().optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  realName: z.string().min(1).optional(),
  role: z.enum(['admin', 'department_head', 'specimen_admin', 'researcher']).optional(),
  departmentId: z.string().optional().nullable(),
  status: z.enum(['active', 'disabled']).optional()
});

router.get('/', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const pageSize = parseInt(req.query.pageSize as string || '10');
    const keyword = req.query.keyword as string;
    const role = req.query.role as string;
    const departmentId = req.query.departmentId as string;
    const status = req.query.status as string;

    let users = Array.from(store.users.values());

    if (keyword) {
      const kw = keyword.toLowerCase();
      users = users.filter(u =>
        u.username.toLowerCase().includes(kw) ||
        u.email.toLowerCase().includes(kw) ||
        u.realName.toLowerCase().includes(kw)
      );
    }

    if (role) {
      users = users.filter(u => u.role === role);
    }

    if (departmentId) {
      users = users.filter(u => u.departmentId === departmentId);
    }

    if (status) {
      users = users.filter(u => u.status === status);
    }

    users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = users.length;
    const start = (page - 1) * pageSize;
    const paginatedUsers = users.slice(start, start + pageSize)
      .map(u => {
        const { password, ...userWithoutPassword } = u as any;
        return userWithoutPassword;
      });

    res.json({
      success: true,
      data: paginatedUsers,
      pagination: paginate(total, page, pageSize)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const user = store.users.get(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    const { password, ...userWithoutPassword } = user as any;

    if (req.userRole !== 'admin' && req.userId !== user.id) {
      res.status(403).json({ success: false, message: '无权访问此用户信息' });
      return;
    }

    res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户信息失败' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = createUserSchema.parse(req.body);
    const now = new Date();

    const existingUser = Array.from(store.users.values()).find(
      u => u.username === validated.username || u.email === validated.email
    );

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: '用户名或邮箱已存在'
      });
      return;
    }

    const id = generateId();
    const user = {
      id,
      ...validated,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now
    };

    store.users.set(id, user);

    const { password, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      message: '用户创建成功'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '创建用户失败' });
  }
});

router.put('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const user = store.users.get(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    if (req.userRole !== 'admin' && req.userId !== user.id) {
      res.status(403).json({ success: false, message: '无权修改此用户信息' });
      return;
    }

    const validated = updateUserSchema.parse(req.body);

    if (validated.email && validated.email !== user.email) {
      const emailExists = Array.from(store.users.values()).find(
        u => u.email === validated.email && u.id !== user.id
      );
      if (emailExists) {
        res.status(409).json({ success: false, message: '邮箱已被其他用户使用' });
        return;
      }
    }

    const updatedUser = {
      ...user,
      ...validated,
      updatedAt: new Date()
    };

    store.users.set(req.params.id, updatedUser);

    const { password, ...userWithoutPassword } = updatedUser as any;

    res.json({
      success: true,
      data: userWithoutPassword,
      message: '用户信息更新成功'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '更新用户信息失败' });
  }
});

router.put('/:id/password', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const user = store.users.get(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    if (req.userRole !== 'admin' && req.userId !== user.id) {
      res.status(403).json({ success: false, message: '无权修改此用户密码' });
      return;
    }

    const { oldPassword, newPassword } = req.body;

    if (req.userRole !== 'admin') {
      if ((user as any).password !== oldPassword) {
        res.status(400).json({ success: false, message: '原密码错误' });
        return;
      }
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ success: false, message: '新密码至少6个字符' });
      return;
    }

    (user as any).password = newPassword;
    user.updatedAt = new Date();

    store.users.set(req.params.id, user);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '修改密码失败' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    if (req.params.id === req.userId) {
      res.status(400).json({ success: false, message: '不能删除自己的账号' });
      return;
    }

    if (!store.users.has(req.params.id)) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    store.users.delete(req.params.id);

    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除用户失败' });
  }
});

export default router;
