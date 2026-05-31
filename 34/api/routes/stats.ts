import express, { type Request, type Response } from 'express';
import { generateHistoricalFlowData, generateFlowData, getStations } from '../data-generator.js';
import { statsCache } from '../cache.js';
import { calculatePeakHourStats, calculateStationStats } from '../alert-service.js';

const router = express.Router();

router.get('/peak-hours', (req: Request, res: Response) => {
  const cacheKey = 'stats:peak-hours';
  const cached = statsCache.get(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const peakHourStats = calculatePeakHourStats(allFlows);

  const result = { success: true, data: peakHourStats };
  statsCache.set(cacheKey, result, 60000);
  res.json(result);
});

router.get('/station-stats', (req: Request, res: Response) => {
  const cacheKey = 'stats:station-stats';
  const cached = statsCache.get(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const stationStats = calculateStationStats(allFlows);

  const result = { success: true, data: stationStats };
  statsCache.set(cacheKey, result, 30000);
  res.json(result);
});

router.get('/overview', (req: Request, res: Response) => {
  const cacheKey = 'stats:overview-complete';
  const cached = statsCache.get(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const currentData = generateFlowData(new Date());
  const stationStats = calculateStationStats(allFlows);

  const stations = getStations();
  const totalFlowToday = stationStats.reduce((sum, s) => sum + s.totalFlowToday, 0);
  const currentTotalFlow = currentData.reduce((sum, d) => sum + d.totalFlow, 0);
  const avgFlowPerStation = Math.round(totalFlowToday / stations.length);
  const peakFlowStation = stationStats.reduce((max, s) => s.peakFlow > max.peakFlow ? s : max, stationStats[0]);

  const lineStats: Record<string, { lineId: string; lineName: string; totalFlow: number; stationCount: number }> = {};
  stationStats.forEach(stat => {
    const station = stations.find(s => s.stationId === stat.stationId);
    if (station) {
      if (!lineStats[station.lineId]) {
        lineStats[station.lineId] = {
          lineId: station.lineId,
          lineName: station.lineName,
          totalFlow: 0,
          stationCount: 0
        };
      }
      lineStats[station.lineId].totalFlow += stat.totalFlowToday;
      lineStats[station.lineId].stationCount++;
    }
  });

  const result = {
    success: true,
    data: {
      totalStations: stations.length,
      totalFlowToday,
      currentTotalFlow,
      avgFlowPerStation,
      peakFlowStation: peakFlowStation ? {
        stationId: peakFlowStation.stationId,
        stationName: peakFlowStation.stationName,
        peakFlow: peakFlowStation.peakFlow
      } : null,
      lineStats: Object.values(lineStats),
      stationStats
    }
  };

  statsCache.set(cacheKey, result, 15000);
  res.json(result);
});

router.get('/heatmap', (req: Request, res: Response) => {
  const cacheKey = 'stats:heatmap';
  const cached = statsCache.get(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const currentData = generateFlowData(new Date());
  const stations = getStations();

  const maxFlow = Math.max(...currentData.map(d => d.totalFlow));
  const heatmapData = currentData.map(d => {
    const station = stations.find(s => s.stationId === d.stationId);
    return {
      stationId: d.stationId,
      stationName: d.stationName,
      position: station?.position || { x: 0, y: 0 },
      intensity: Math.round((d.totalFlow / maxFlow) * 100),
      flowCount: d.totalFlow
    };
  });

  const result = { success: true, data: heatmapData };
  statsCache.set(cacheKey, result, 5000);
  res.json(result);
});

export default router;
