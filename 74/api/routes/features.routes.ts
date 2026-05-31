import { Router, Request, Response } from 'express';
import { featureService } from '../services/FeatureService.js';

const router = Router();

router.get('/extract', (req: Request, res: Response) => {
  try {
    const { deviceId, timeRange, period } = req.query;

    const features = featureService.getFeatures(
      deviceId as string | undefined,
      (timeRange as '1h' | '6h' | '24h' | '7d') || '24h',
      (period as 'hour' | 'day' | 'week') || 'hour'
    );

    res.status(200).json({
      success: true,
      data: features,
      total: features.length
    });
  } catch (error) {
    console.error('Error extracting features:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
