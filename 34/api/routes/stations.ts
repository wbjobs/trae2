import express, { type Request, type Response } from 'express';
import { getStations, getStationById, getStationsByLine } from '../data-generator.js';
import { flowCache } from '../cache.js';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  const cached = flowCache.get('stations');
  if (cached) {
    res.json(cached);
    return;
  }

  const stations = getStations();
  flowCache.set('stations', { success: true, data: stations }, 60000);
  res.json({ success: true, data: stations });
});

router.get('/:stationId', (req: Request, res: Response) => {
  const { stationId } = req.params;
  const cacheKey = `station:${stationId}`;

  const cached = flowCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const station = getStationById(stationId);
  if (!station) {
    res.status(404).json({ success: false, error: 'Station not found' });
    return;
  }

  flowCache.set(cacheKey, { success: true, data: station }, 60000);
  res.json({ success: true, data: station });
});

router.get('/line/:lineId', (req: Request, res: Response) => {
  const { lineId } = req.params;
  const cacheKey = `stations:line:${lineId}`;

  const cached = flowCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const stations = getStationsByLine(lineId);
  flowCache.set(cacheKey, { success: true, data: stations }, 60000);
  res.json({ success: true, data: stations });
});

export default router;
