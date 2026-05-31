import { Router, Request, Response } from 'express';
import { predictionService } from '../services/PredictionService.js';
import { TimeRange } from '../../shared/types.js';

const router = Router();

router.get('/risk', (req: Request, res: Response) => {
  try {
    const area = req.query.area as string | undefined;
    const hours = parseInt(req.query.hours as string) || 6;

    const predictions = predictionService.predictRisk(area, Math.min(hours, 12));

    res.status(200).json({
      success: true,
      data: predictions
    });
  } catch (error) {
    console.error('Error predicting risk:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/device-ranking', (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as TimeRange) || '24h';
    const limit = parseInt(req.query.limit as string) || 20;

    const ranking = predictionService.getDeviceRanking(timeRange, limit);

    res.status(200).json({
      success: true,
      data: ranking
    });
  } catch (error) {
    console.error('Error getting device ranking:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
