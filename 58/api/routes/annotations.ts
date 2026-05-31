import { Router, type Request, type Response } from 'express';
import type { Annotation, Vec3 } from '../../shared/types.js';

const router = Router();

const store: Annotation[] = [];

function dist(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Partial<Annotation>;
  const annotation: Annotation = {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: body.type || 'distance',
    points: body.points || [],
    value:
      body.value ??
      (body.points && body.points.length === 2
        ? Math.round(dist(body.points[0], body.points[1]) * 1000) / 1000
        : 0),
    unit: body.unit || 'm',
    label: body.label,
  };
  store.push(annotation);
  res.json({ success: true, data: annotation });
});

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: store });
});

router.delete('/:id', (req: Request, res: Response) => {
  const idx = store.findIndex((a) => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false });
  store.splice(idx, 1);
  res.json({ success: true });
});

export default router;
