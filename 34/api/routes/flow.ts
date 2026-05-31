import express, { type Request, type Response } from 'express';
import { generateFlowData, generateHistoricalFlowData, getStations } from '../data-generator.js';
import { flowCache, featureCache, statsCache, historyCache } from '../cache.js';
import { extractTimeSeriesFeatures, extractAllFeatures, extractFeaturesBatch } from '../features/index.js';
import { predictFlow, predictAllStations } from '../features/prediction.js';
import { calculateRankings, calculateStationRankings } from '../features/ranking.js';
import { checkAlerts, calculatePeakHourStats, calculateStationStats } from '../alert-service.js';

const router = express.Router();

let previousFlowData = generateFlowData(new Date());

setInterval(() => {
  previousFlowData = generateFlowData(new Date());
}, 30000);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

router.get('/realtime', (req: Request, res: Response) => {
  const cacheKey = 'flow:realtime';
  const cached = flowCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 5000) {
    res.json(cached);
    return;
  }

  const timestamp = new Date();
  const currentData = generateFlowData(timestamp);

  checkAlerts(currentData, previousFlowData);
  previousFlowData = currentData;

  const result = {
    success: true,
    timestamp: Date.now(),
    data: currentData
  };

  flowCache.set(cacheKey, result, 5000);
  res.json(result);
});

router.get('/history', async (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const cacheKey = `flow:history:${hours}`;

  try {
    const result = await withTimeout(
      historyCache.getOrSet(cacheKey, async () => {
        const historicalData = generateHistoricalFlowData(hours);
        return {
          success: true,
          data: historicalData,
          hours
        };
      }, Math.min(180000, hours * 10000)),
      10000,
      'History data query timeout'
    );
    res.json(result);
  } catch (error) {
    console.error('History query error:', error);
    res.status(500).json({
      success: false,
      error: '历史数据查询超时，请减少查询时间范围',
      fallback: true
    });
  }
});

router.get('/station/:stationId', async (req: Request, res: Response) => {
  const { stationId } = req.params;
  const hours = parseInt(req.query.hours as string) || 24;
  const cacheKey = `flow:station:${stationId}:${hours}`;

  try {
    const result = await withTimeout(
      historyCache.getOrSet(cacheKey, async () => {
        const historicalData = generateHistoricalFlowData(Math.min(hours, 12));
        const stationData: Record<string, any> = {};

        Object.entries(historicalData).forEach(([timestamp, flows]) => {
          const stationFlow = flows.find(f => f.stationId === stationId);
          if (stationFlow) {
            stationData[timestamp] = stationFlow;
          }
        });

        return {
          success: true,
          data: stationData,
          stationId
        };
      }, 120000),
      8000,
      `Station ${stationId} data query timeout`
    );
    res.json(result);
  } catch (error) {
    console.error(`Station ${stationId} query error:`, error);

    const cachedShort = historyCache.get(`flow:station:${stationId}:6`);
    if (cachedShort) {
      res.json({
        ...cachedShort,
        note: '返回缓存数据（6小时）'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: '站点数据查询超时，请稍后重试'
    });
  }
});

router.get('/timeseries-features', async (req: Request, res: Response) => {
  const { stationId } = req.query;
  const cacheKey = stationId ? `features:${stationId}` : 'features:all';

  try {
    const result = await withTimeout(
      featureCache.getOrSet(cacheKey, async () => {
        const historicalData = generateHistoricalFlowData(24);
        const allFlows = Object.values(historicalData).flat();

        if (stationId) {
          const features = extractTimeSeriesFeatures(stationId as string, allFlows);
          return { success: true, data: features };
        } else {
          const features = extractAllFeatures(allFlows);
          return { success: true, data: features };
        }
      }, 180000),
      12000,
      'Feature extraction timeout'
    );
    res.json(result);
  } catch (error) {
    console.error('Feature extraction error:', error);

    const cached = featureCache.get(cacheKey);
    if (cached) {
      res.json({
        ...cached,
        note: '返回缓存数据'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: '特征提取超时，请稍后重试'
    });
  }
});

router.get('/predict/:stationId', async (req: Request, res: Response) => {
  const { stationId } = req.params;
  const hours = parseInt(req.query.hours as string) || 6;
  const cacheKey = `predict:${stationId}:${hours}`;

  try {
    const result = await withTimeout(
      featureCache.getOrSet(cacheKey, async () => {
        const historicalData = generateHistoricalFlowData(24);
        const allFlows = Object.values(historicalData).flat();
        const stations = getStations();
        const station = stations.find(s => s.stationId === stationId);

        if (!station) {
          return { success: false, error: 'Station not found' };
        }

        const prediction = predictFlow(stationId, station.stationName, allFlows, hours);
        return { success: true, data: prediction };
      }, 60000),
      10000,
      'Prediction timeout'
    );
    res.json(result);
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      success: false,
      error: '预测计算超时，请稍后重试'
    });
  }
});

router.get('/predict-all', async (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 3;
  const cacheKey = `predict:all:${hours}`;

  try {
    const result = await withTimeout(
      featureCache.getOrSet(cacheKey, async () => {
        const historicalData = generateHistoricalFlowData(24);
        const allFlows = Object.values(historicalData).flat();
        const stations = getStations().slice(0, 15);

        const predictions = predictAllStations(stations, allFlows, hours);
        return { success: true, data: predictions };
      }, 120000),
      15000,
      'Batch prediction timeout'
    );
    res.json(result);
  } catch (error) {
    console.error('Batch prediction error:', error);
    res.status(500).json({
      success: false,
      error: '批量预测超时，请稍后重试'
    });
  }
});

router.get('/rankings', async (req: Request, res: Response) => {
  const cacheKey = 'rankings:current';

  try {
    const result = await withTimeout(
      flowCache.getOrSet(cacheKey, async () => {
        const currentData = generateFlowData(new Date());
        const historicalData = generateHistoricalFlowData(6);
        const allFlows = Object.values(historicalData).flat();
        const stationStats = calculateStationStats(allFlows);

        const alertCount = new Map<string, number>();
        stationStats.forEach(s => alertCount.set(s.stationId, s.alertCount));

        const rankings = calculateRankings(currentData, allFlows, alertCount);
        return { success: true, data: rankings };
      }, 10000),
      8000,
      'Ranking calculation timeout'
    );
    res.json(result);
  } catch (error) {
    console.error('Ranking error:', error);
    res.status(500).json({
      success: false,
      error: '排名计算超时'
    });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  const cacheKey = 'stats:overview';
  const cached = statsCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const stationStats = calculateStationStats(allFlows);
  const peakHourStats = calculatePeakHourStats(allFlows);

  const stations = getStations();
  const totalFlowToday = stationStats.reduce((sum, s) => sum + s.totalFlowToday, 0);
  const totalAlerts = stationStats.reduce((sum, s) => sum + s.alertCount, 0);
  const peakStation = stationStats.reduce((max, s) => s.peakFlow > max.peakFlow ? s : max, stationStats[0]);

  const result = {
    success: true,
    data: {
      totalStations: stations.length,
      totalFlowToday,
      totalAlerts,
      peakStation: peakStation ? {
        stationId: peakStation.stationId,
        stationName: peakStation.stationName,
        peakFlow: peakStation.peakFlow
      } : null,
      stationStats,
      peakHourStats
    }
  };

  statsCache.set(cacheKey, result, 60000);
  res.json(result);
});

export default router;
