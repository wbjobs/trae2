import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, Tag } from '../../../shared/types';
import { AuthRequest, authenticateToken, authorizeRoles } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

const tagSchema = z.object({
  name: z.string().min(1, '标签名称不能为空'),
  color: z.string().min(1, '标签颜色不能为空'),
  category: z.string().min(1, '标签分类不能为空'),
  description: z.string().optional()
});

router.get('/', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const tags = Array.from(store.tags.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取标签列表失败' });
  }
});

router.get('/categories', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const categories = Array.from(new Set(Array.from(store.tags.values()).map(t => t.category)));
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取标签分类失败' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin', 'specimen_admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = tagSchema.parse(req.body);
    const now = new Date();

    const existingTag = Array.from(store.tags.values()).find(
      t => t.name.toLowerCase() === validated.name.toLowerCase()
    );

    if (existingTag) {
      res.status(409).json({ success: false, message: '标签名称已存在' });
      return;
    }

    const tag: Tag = {
      id: generateId(),
      ...validated,
      createdBy: req.userId!,
      createdAt: now
    };

    store.tags.set(tag.id, tag);

    res.status(201).json({ success: true, data: tag, message: '标签创建成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '创建标签失败' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin', 'specimen_admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const tag = store.tags.get(req.params.id);
    if (!tag) {
      res.status(404).json({ success: false, message: '标签不存在' });
      return;
    }

    const validated = tagSchema.partial().parse(req.body);

    if (validated.name && validated.name !== tag.name) {
      const existingTag = Array.from(store.tags.values()).find(
        t => t.name.toLowerCase() === validated.name!.toLowerCase() && t.id !== tag.id
      );
      if (existingTag) {
        res.status(409).json({ success: false, message: '标签名称已存在' });
        return;
      }
    }

    const updatedTag: Tag = { ...tag, ...validated };
    store.tags.set(tag.id, updatedTag);

    res.json({ success: true, data: updatedTag, message: '标签更新成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '更新标签失败' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    if (!store.tags.has(req.params.id)) {
      res.status(404).json({ success: false, message: '标签不存在' });
      return;
    }

    store.tags.delete(req.params.id);

    for (const [specimenId, tagIds] of store.specimenTags) {
      store.specimenTags.set(specimenId, tagIds.filter(id => id !== req.params.id));
    }

    res.json({ success: true, message: '标签删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除标签失败' });
  }
});

router.get('/specimen/:specimenId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const tagIds = store.specimenTags.get(req.params.specimenId) || [];
    const tags = tagIds.map(id => store.tags.get(id)).filter(Boolean);

    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取标本标签失败' });
  }
});

router.post('/specimen/:specimenId/:tagId', authenticateToken, authorizeRoles('admin', 'specimen_admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { specimenId, tagId } = req.params;

    if (!store.specimens.has(specimenId)) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    if (!store.tags.has(tagId)) {
      res.status(404).json({ success: false, message: '标签不存在' });
      return;
    }

    const currentTags = store.specimenTags.get(specimenId) || [];
    if (!currentTags.includes(tagId)) {
      currentTags.push(tagId);
      store.specimenTags.set(specimenId, currentTags);
    }

    res.json({ success: true, message: '标签添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加标签失败' });
  }
});

router.delete('/specimen/:specimenId/:tagId', authenticateToken, authorizeRoles('admin', 'specimen_admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { specimenId, tagId } = req.params;

    const currentTags = store.specimenTags.get(specimenId) || [];
    store.specimenTags.set(specimenId, currentTags.filter(id => id !== tagId));

    res.json({ success: true, message: '标签移除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '移除标签失败' });
  }
});

export default router;
