import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, Department } from '../../../shared/types';
import { AuthRequest, authenticateToken, authorizeRoles } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

const departmentSchema = z.object({
  name: z.string().min(1, '部门名称不能为空'),
  parentId: z.string().nullable().optional(),
  description: z.string().optional()
});

router.get('/', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const departments = Array.from(store.departments.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取部门列表失败' });
  }
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const department = store.departments.get(req.params.id);

    if (!department) {
      res.status(404).json({ success: false, message: '部门不存在' });
      return;
    }

    const members = Array.from(store.users.values())
      .filter(u => u.departmentId === req.params.id)
      .map(u => {
        const { password, ...userWithoutPassword } = u as any;
        return userWithoutPassword;
      });

    res.json({
      success: true,
      data: {
        ...department,
        members
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取部门信息失败' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = departmentSchema.parse(req.body);
    const now = new Date();

    if (validated.parentId && !store.departments.has(validated.parentId)) {
      res.status(400).json({ success: false, message: '父部门不存在' });
      return;
    }

    const id = generateId();
    const department: Department = {
      id,
      ...validated,
      createdAt: now,
      updatedAt: now
    };

    store.departments.set(id, department);

    res.status(201).json({
      success: true,
      data: department,
      message: '部门创建成功'
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
    res.status(500).json({ success: false, message: '创建部门失败' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const department = store.departments.get(req.params.id);

    if (!department) {
      res.status(404).json({ success: false, message: '部门不存在' });
      return;
    }

    const validated = departmentSchema.partial().parse(req.body);

    if (validated.parentId && validated.parentId === req.params.id) {
      res.status(400).json({ success: false, message: '父部门不能是自己' });
      return;
    }

    const updatedDepartment: Department = {
      ...department,
      ...validated,
      updatedAt: new Date()
    };

    store.departments.set(req.params.id, updatedDepartment);

    res.json({
      success: true,
      data: updatedDepartment,
      message: '部门更新成功'
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
    res.status(500).json({ success: false, message: '更新部门失败' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    if (!store.departments.has(req.params.id)) {
      res.status(404).json({ success: false, message: '部门不存在' });
      return;
    }

    const hasMembers = Array.from(store.users.values()).some(
      u => u.departmentId === req.params.id
    );

    if (hasMembers) {
      res.status(400).json({ success: false, message: '部门下还有用户，无法删除' });
      return;
    }

    const hasSpecimens = Array.from(store.specimens.values()).some(
      s => s.departmentId === req.params.id
    );

    if (hasSpecimens) {
      res.status(400).json({ success: false, message: '部门下还有标本，无法删除' });
      return;
    }

    store.departments.delete(req.params.id);

    res.json({
      success: true,
      message: '部门删除成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除部门失败' });
  }
});

export default router;
