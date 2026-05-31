import { Router, type Request, type Response } from 'express';
import { designDb } from '../data/seed.js';
import type { PipelineType } from '../../shared/types.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const type = req.query.type as PipelineType | undefined;
  const section = req.query.section as string | undefined;
  const q = req.query.q as string | undefined;
  let list = designDb.pipelines;
  if (type) list = list.filter((p) => p.type === type);
  if (section) list = list.filter((p) => p.sectionId === section);
  if (q) {
    const key = q.toLowerCase();
    list = list.filter(
      (p) =>
        p.code.toLowerCase().includes(key) ||
        p.id.toLowerCase().includes(key) ||
        p.material.toLowerCase().includes(key),
    );
  }
  res.json({ success: true, data: list });
});

router.get('/:id', (req: Request, res: Response) => {
  const item = designDb.pipelines.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: item });
});

export default router;
