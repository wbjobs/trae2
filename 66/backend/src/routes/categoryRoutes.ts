import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as categoryService from '../services/categoryService';

const router = Router();

const categorySchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  parent_id: z.string().nullable().optional(),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  sort_order: z.number().optional().default(0)
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = categoryService.getAllCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/tree', async (_req: Request, res: Response) => {
  try {
    const tree = categoryService.getCategoryTree();
    res.json({ success: true, data: tree });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const category = categoryService.getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/descendants', async (req: Request, res: Response) => {
  try {
    const descendants = categoryService.getCategoryWithDescendants(req.params.id);
    res.json({ success: true, data: descendants });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validated = categorySchema.parse(req.body);
    const category = categoryService.createCategory(validated);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: '数据验证失败',
        details: error.errors
      });
    }
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const validated = categorySchema.partial().parse(req.body);
    const category = categoryService.updateCategory(req.params.id, validated);

    if (!category) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: '数据验证失败',
        details: error.errors
      });
    }
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = categoryService.deleteCategory(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
