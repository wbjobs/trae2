import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, Annotation, AnnotationReply } from '../../../shared/types';
import { AuthRequest, authenticateToken } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

const annotationSchema = z.object({
  specimenId: z.string().min(1, '标本ID不能为空'),
  content: z.string().min(1, '批注内容不能为空'),
  target: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  mentions: z.array(z.string()).optional()
});

const replySchema = z.object({
  content: z.string().min(1, '回复内容不能为空')
});

router.get('/specimen/:specimenId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { specimenId } = req.params;

    const annotations = Array.from(store.annotations.values())
      .filter(a => a.specimenId === specimenId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(annotation => {
        const replies = Array.from(store.annotationReplies.values())
          .filter(r => r.annotationId === annotation.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(reply => ({
            ...reply,
            createdBy: store.users.get(reply.createdBy)
          }));

        return {
          ...annotation,
          createdBy: store.users.get(annotation.createdBy),
          replies
        };
      });

    res.json({
      success: true,
      data: annotations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取批注列表失败' });
  }
});

router.post('/', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = annotationSchema.parse(req.body);
    const now = new Date();

    const specimen = store.specimens.get(validated.specimenId);
    if (!specimen) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const id = generateId();
    const annotation: Annotation = {
      id,
      specimenId: validated.specimenId,
      createdBy: req.userId!,
      content: validated.content,
      target: validated.target,
      position: validated.position,
      status: 'open',
      mentions: validated.mentions || [],
      createdAt: now,
      updatedAt: now
    };

    store.annotations.set(id, annotation);

    res.status(201).json({
      success: true,
      data: {
        ...annotation,
        createdBy: store.users.get(annotation.createdBy)
      },
      message: '批注创建成功'
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
    res.status(500).json({ success: false, message: '创建批注失败' });
  }
});

router.post('/:id/reply', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const annotation = store.annotations.get(req.params.id);

    if (!annotation) {
      res.status(404).json({ success: false, message: '批注不存在' });
      return;
    }

    const validated = replySchema.parse(req.body);
    const now = new Date();

    const reply: AnnotationReply = {
      id: generateId(),
      annotationId: req.params.id,
      createdBy: req.userId!,
      content: validated.content,
      createdAt: now
    };

    store.annotationReplies.set(reply.id, reply);
    annotation.updatedAt = now;
    store.annotations.set(annotation.id, annotation);

    res.status(201).json({
      success: true,
      data: {
        ...reply,
        createdBy: store.users.get(reply.createdBy)
      },
      message: '回复成功'
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
    res.status(500).json({ success: false, message: '回复失败' });
  }
});

router.put('/:id/status', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const annotation = store.annotations.get(req.params.id);

    if (!annotation) {
      res.status(404).json({ success: false, message: '批注不存在' });
      return;
    }

    const { status } = req.body;
    if (!['open', 'resolved', 'closed'].includes(status)) {
      res.status(400).json({ success: false, message: '无效的状态值' });
      return;
    }

    annotation.status = status;
    annotation.updatedAt = new Date();
    store.annotations.set(annotation.id, annotation);

    res.json({
      success: true,
      data: annotation,
      message: '批注状态更新成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新批注状态失败' });
  }
});

router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const annotation = store.annotations.get(req.params.id);

    if (!annotation) {
      res.status(404).json({ success: false, message: '批注不存在' });
      return;
    }

    if (annotation.createdBy !== req.userId && req.userRole !== 'admin') {
      res.status(403).json({ success: false, message: '无权删除此批注' });
      return;
    }

    const repliesToDelete = Array.from(store.annotationReplies.values())
      .filter(r => r.annotationId === req.params.id)
      .map(r => r.id);
    repliesToDelete.forEach(id => store.annotationReplies.delete(id));

    store.annotations.delete(req.params.id);

    res.json({
      success: true,
      message: '批注删除成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除批注失败' });
  }
});

export default router;
