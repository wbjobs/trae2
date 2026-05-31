import express, { type Request, type Response } from 'express';
import { getThresholds, updateThresholds, getAlerts, getAlertsByStation, getActiveAlertCount } from '../alert-service.js';
import { alertCache } from '../cache.js';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const cacheKey = `alerts:all:${limit}`;

  const cached = alertCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const alerts = getAlerts(limit);
  const result = { success: true, data: alerts, total: alerts.length };

  alertCache.set(cacheKey, result, 5000);
  res.json(result);
});

router.get('/station/:stationId', (req: Request, res: Response) => {
  const { stationId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;
  const cacheKey = `alerts:station:${stationId}:${limit}`;

  const cached = alertCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const alerts = getAlertsByStation(stationId, limit);
  const result = { success: true, data: alerts, total: alerts.length };

  alertCache.set(cacheKey, result, 5000);
  res.json(result);
});

router.get('/active-count', (req: Request, res: Response) => {
  const count = getActiveAlertCount();
  res.json({ success: true, data: { activeAlertCount: count } });
});

router.get('/thresholds', (req: Request, res: Response) => {
  const thresholds = getThresholds();
  res.json({ success: true, data: thresholds });
});

router.put('/thresholds', (req: Request, res: Response) => {
  const thresholds = req.body;
  const updated = updateThresholds(thresholds);
  alertCache.clear();
  res.json({ success: true, data: updated });
});

export default router;
