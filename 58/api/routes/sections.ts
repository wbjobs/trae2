import { Router, type Request, type Response } from 'express';
import { designDb } from '../data/seed.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: designDb.sections });
});

export default router;
