import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, Specimen, SpecimenVersion } from '../../../shared/types';
import { AuthRequest, authenticateToken, authorizeRoles } from '../../common/middleware/auth';
import { EditLockManager } from './EditLockManager';
import { generateId, deepCompare, paginate } from '../../utils/helpers';
import { createOperationLog } from '../log/routes';

const router = Router();
const store = DataStore.getInstance();
const lockManager = new EditLockManager();

const specimenSchema = z.object({
  specimenNo: z.string().min(1, '标本编号不能为空'),
  name: z.string().min(1, '标本名称不能为空'),
  scientificName: z.string().optional(),
  category: z.string().min(1, '分类不能为空'),
  description: z.string().optional(),
  collector: z.string().optional(),
  collectionDate: z.string().optional(),
  collectionLocation: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  habitat: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  customFields: z.record(z.any()).optional()
});

const listQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('10'),
  keyword: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  departmentId: z.string().optional(),
  collector: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

router.get('/', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const page = parseInt(query.page || '1');
    const pageSize = parseInt(query.pageSize || '10');

    let specimens = Array.from(store.specimens.values());

    if (req.userRole !== 'admin') {
      specimens = specimens.filter(s => s.departmentId === req.userDepartmentId);
    }

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      specimens = specimens.filter(s =>
        s.name.toLowerCase().includes(keyword) ||
        s.specimenNo.toLowerCase().includes(keyword) ||
        s.scientificName?.toLowerCase().includes(keyword)
      );
    }

    if (query.category) {
      specimens = specimens.filter(s => s.category === query.category);
    }

    if (query.status) {
      specimens = specimens.filter(s => s.status === query.status);
    }

    if (query.departmentId) {
      specimens = specimens.filter(s => s.departmentId === query.departmentId);
    }

    if (query.collector) {
      specimens = specimens.filter(s => s.collector === query.collector);
    }

    specimens.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const total = specimens.length;
    const start = (page - 1) * pageSize;
    const paginatedSpecimens = specimens.slice(start, start + pageSize);

    res.json({
      success: true,
      data: paginatedSpecimens,
      pagination: paginate(total, page, pageSize)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '获取标本列表失败' });
  }
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimen = store.specimens.get(req.params.id);

    if (!specimen) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    if (req.userRole !== 'admin' && specimen.departmentId !== req.userDepartmentId) {
      res.status(403).json({ success: false, message: '无权访问此标本' });
      return;
    }

    const lock = lockManager.getLock(req.params.id);

    res.json({
      success: true,
      data: {
        ...specimen,
        editLock: lock ? {
          userId: lock.userId,
          userName: lock.userName,
          acquiredAt: lock.acquiredAt,
          expiresAt: lock.expiresAt
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取标本详情失败' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin', 'specimen_admin', 'department_head'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = specimenSchema.parse(req.body);
    const now = new Date();
    const id = generateId();

    const specimen: Specimen = {
      id,
      ...validated,
      collectionDate: validated.collectionDate ? new Date(validated.collectionDate) : undefined,
      departmentId: req.userDepartmentId || validated.departmentId || store.departments.keys().next().value || '',
      createdBy: req.userId!,
      updatedBy: req.userId!,
      version: 1,
      lastModifiedAt: now,
      createdAt: now,
      updatedAt: now
    };

    store.specimens.set(id, specimen);

    const version: SpecimenVersion = {
      id: generateId(),
      specimenId: id,
      version: 1,
      snapshot: specimen,
      changeDescription: '初始版本',
      changedBy: req.userId!,
      changes: [],
      changedAt: now
    };
    store.specimenVersions.set(version.id, version);

    createOperationLog(
      req.userId!,
      'create_specimen',
      'specimen',
      id,
      { specimenNo: specimen.specimenNo, name: specimen.name },
      req.ip
    );

    res.status(201).json({
      success: true,
      data: specimen,
      message: '标本创建成功'
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
    res.status(500).json({ success: false, message: '创建标本失败' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin', 'specimen_admin', 'department_head'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimenId = req.params.id;
    const existingSpecimen = store.specimens.get(specimenId);

    if (!existingSpecimen) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    if (req.userRole !== 'admin' && existingSpecimen.departmentId !== req.userDepartmentId) {
      res.status(403).json({ success: false, message: '无权修改此标本' });
      return;
    }

    const lock = lockManager.getLock(specimenId);
    if (lock && lock.userId !== req.userId) {
      res.status(409).json({
        success: false,
        message: `标本正在被 ${lock.userName} 编辑，请稍后再试`,
        data: {
          lockedBy: lock.userName,
          lockedAt: lock.acquiredAt,
          expiresAt: lock.expiresAt
        }
      });
      return;
    }

    if (req.body.expectedVersion && req.body.expectedVersion !== existingSpecimen.version) {
      res.status(409).json({
        success: false,
        message: '标本已被他人修改，请刷新页面后重试',
        data: {
          currentVersion: existingSpecimen.version,
          expectedVersion: req.body.expectedVersion
        }
      });
      return;
    }

    const validated = specimenSchema.partial().parse(req.body);
    const now = new Date();

    const changes = deepCompare(existingSpecimen, {
      ...existingSpecimen,
      ...validated,
      updatedAt: now
    });

    const updatedSpecimen: Specimen = {
      ...existingSpecimen,
      ...validated,
      updatedBy: req.userId!,
      version: existingSpecimen.version + 1,
      lastModifiedAt: now,
      updatedAt: now
    };

    store.specimens.set(specimenId, updatedSpecimen);

    if (changes.length > 0) {
      const version: SpecimenVersion = {
        id: generateId(),
        specimenId,
        version: updatedSpecimen.version,
        snapshot: updatedSpecimen,
        changeDescription: req.body.changeDescription || `更新了 ${changes.length} 个字段`,
        changedBy: req.userId!,
        changes,
        changedAt: now
      };
      store.specimenVersions.set(version.id, version);
    }

    lockManager.releaseLock(specimenId, req.userId!);

    createOperationLog(
      req.userId!,
      'update_specimen',
      'specimen',
      specimenId,
      { 
        specimenNo: updatedSpecimen.specimenNo, 
        name: updatedSpecimen.name,
        changes: changes.length 
      },
      req.ip
    );

    res.json({
      success: true,
      data: updatedSpecimen,
      message: '标本更新成功'
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
    res.status(500).json({ success: false, message: '更新标本失败' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimenId = req.params.id;
    
    if (!store.specimens.has(specimenId)) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const specimen = store.specimens.get(specimenId);

    store.specimens.delete(specimenId);

    const versionsToDelete = Array.from(store.specimenVersions.values())
      .filter(v => v.specimenId === specimenId)
      .map(v => v.id);
    versionsToDelete.forEach(id => store.specimenVersions.delete(id));

    const filesToDelete = Array.from(store.specimenFiles.values())
      .filter(f => f.specimenId === specimenId)
      .map(f => f.id);
    filesToDelete.forEach(id => store.specimenFiles.delete(id));

    createOperationLog(
      req.userId!,
      'delete_specimen',
      'specimen',
      specimenId,
      { 
        specimenNo: specimen?.specimenNo, 
        name: specimen?.name 
      },
      req.ip
    );

    res.json({
      success: true,
      message: '标本删除成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除标本失败' });
  }
});

router.post('/:id/lock', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimenId = req.params.id;
    const user = store.users.get(req.userId!);

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    const existingLock = lockManager.getLock(specimenId);

    if (existingLock && existingLock.userId !== req.userId) {
      res.status(409).json({
        success: false,
        message: `标本正在被 ${existingLock.userName} 编辑`,
        data: {
          lockedBy: existingLock.userName,
          lockedAt: existingLock.acquiredAt,
          expiresAt: existingLock.expiresAt
        }
      });
      return;
    }

    const lock = lockManager.acquireLock(specimenId, req.userId!, user.realName);

    res.json({
      success: true,
      data: lock,
      message: lock ? '获取编辑锁成功' : '获取编辑锁失败'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取编辑锁失败' });
  }
});

router.post('/:id/lock/renew', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimenId = req.params.id;
    const renewed = lockManager.renewLock(specimenId, req.userId!);

    if (!renewed) {
      res.status(409).json({
        success: false,
        message: '无法续期编辑锁'
      });
      return;
    }

    const lock = lockManager.getLock(specimenId);
    res.json({
      success: true,
      data: lock,
      message: '编辑锁续期成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '续期编辑锁失败' });
  }
});

router.post('/:id/lock/release', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const specimenId = req.params.id;
    const released = lockManager.releaseLock(specimenId, req.userId!);

    if (!released) {
      res.status(409).json({
        success: false,
        message: '无法释放编辑锁，您不是锁的持有者'
      });
      return;
    }

    res.json({
      success: true,
      message: '编辑锁已释放'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '释放编辑锁失败' });
  }
});

export default router;
