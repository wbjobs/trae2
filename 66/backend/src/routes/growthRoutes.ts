import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as growthService from '../services/growthService';

const router = Router();

const growthRecordSchema = z.object({
  resource_id: z.string().min(1, '资源ID不能为空'),
  record_date: z.string().min(1, '记录日期不能为空'),
  height_cm: z.number().optional().nullable(),
  dbh_cm: z.number().optional().nullable(),
  crown_width_m: z.number().optional().nullable(),
  health_status: z.string().optional().nullable(),
  phenology: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  recorder: z.string().optional().nullable()
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = growthService.getGrowthRecords({
      resource_id: req.query.resource_id as string | undefined,
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt(req.query.page_size as string) || 20
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/stats/:resourceId', async (req: Request, res: Response) => {
  try {
    const stats = growthService.getGrowthStats(req.params.resourceId);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/analysis/yearly', async (req: Request, res: Response) => {
  try {
    const result = growthService.getYearlyComparison({
      start_year: req.query.start_year ? parseInt(req.query.start_year as string) : undefined,
      end_year: req.query.end_year ? parseInt(req.query.end_year as string) : undefined,
      resource_id: req.query.resource_id as string | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/analysis/trends', async (req: Request, res: Response) => {
  try {
    const result = growthService.getResourceGrowthTrends({
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      category_id: req.query.category_id as string | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const record = growthService.getGrowthRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validated = growthRecordSchema.parse(req.body);
    const record = growthService.createGrowthRecord(validated);
    res.status(201).json({ success: true, data: record });
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
    const validated = growthRecordSchema.partial().parse(req.body);
    const record = growthService.updateGrowthRecord(req.params.id, validated);

    if (!record) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }

    res.json({ success: true, data: record });
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
    const deleted = growthService.deleteGrowthRecord(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
