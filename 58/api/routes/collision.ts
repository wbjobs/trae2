import { Router, type Request, type Response } from 'express';
import { designDb } from '../data/seed.js';
import { detectCollisions } from '../services/collision.js';

const router = Router();

router.post('/detect', (req: Request, res: Response) => {
  const pipelineIds = (req.body.pipelineIds as string[]) || [];
  const threshold = Number(req.body.threshold) || 0.15;
  const list = pipelineIds.length
    ? designDb.pipelines.filter((p) => pipelineIds.includes(p.id))
    : designDb.pipelines;
  const conflicts = detectCollisions(list, threshold);
  res.json({ success: true, data: { conflicts, total: conflicts.length } });
});

export default router;
