import { Router, Request, Response } from 'express';
import { dataStore } from '../data/dataStore';
import { extractFeatures } from '../services/featureExtractor';
import { analyzeAnomalies } from '../services/anomalyCluster';
import { calculateRiskStatistics, getCurrentRiskLevel } from '../services/riskStatistics';
import { predictSensorData } from '../services/prediction';
import { analyzeZones, getZoneRankings, ZoneData } from '../services/zoneRanking';
import { featureCache, predictionCache, rankingCache } from '../utils/cacheManager';

const router = Router();

router.get('/features', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'features_main';
    const cached = featureCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = dataStore.getSensorData(1000);
    
    if (data.length < 10) {
      const emptyFeatures = {
        temperature: { mean: 0, std: 0, max: 0, min: 0, trend: 'stable', volatility: 0 },
        humidity: { mean: 0, std: 0, max: 0, min: 0, trend: 'stable', volatility: 0 },
        co2: { mean: 0, std: 0, max: 0, min: 0, trend: 'stable', volatility: 0 },
        ch4: { mean: 0, std: 0, max: 0, min: 0, trend: 'stable', volatility: 0 },
      };
      featureCache.set(cacheKey, emptyFeatures, 10000);
      return res.json(emptyFeatures);
    }

    const features = extractFeatures(data);
    featureCache.set(cacheKey, features, 30000);
    res.json(features);
  } catch (error) {
    console.error('特征提取错误:', error);
    res.status(500).json({ error: '特征提取失败' });
  }
});

router.get('/anomalies', async (_req: Request, res: Response) => {
  try {
    const data = dataStore.getSensorData(2000);
    
    const clusters = analyzeAnomalies(data);
    dataStore.setAnomalyClusters(clusters);

    res.json({
      clusters,
      totalCount: clusters.length,
    });
  } catch (error) {
    console.error('异常分析错误:', error);
    res.status(500).json({ clusters: [], totalCount: 0 });
  }
});

router.get('/risk', async (_req: Request, res: Response) => {
  try {
    const data = dataStore.getSensorData(5000);
    const clusters = dataStore.getAnomalyClusters();
    
    const statistics = calculateRiskStatistics(data, clusters);
    const currentRisk = getCurrentRiskLevel(data.slice(-100));

    res.json({
      ...statistics,
      currentRisk,
    });
  } catch (error) {
    console.error('风险统计错误:', error);
    res.status(500).json({
      hourlyRisk: [],
      levelDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      topRiskLocations: [],
      currentRisk: { level: 0, category: 'low' },
    });
  }
});

router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const { hours = '24', interval = '300' } = req.query;
    const hoursNum = parseInt(hours as string);
    const intervalNum = parseInt(interval as string) * 1000;

    const now = Date.now();
    const startTime = now - hoursNum * 60 * 60 * 1000;

    const aggregated = dataStore.getAggregatedTimeseries(startTime, now, intervalNum);

    const formatted = aggregated.map((item) => ({
      timestamp: item.timestamp,
      temperature: item.temperature,
      humidity: item.humidity,
      co2: item.co2,
      ch4: item.ch4,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('时序数据错误:', error);
    res.status(500).json([]);
  }
});

router.get('/prediction', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'prediction_main';
    const cached = predictionCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const now = Date.now();
    const startTime = now - 4 * 60 * 60 * 1000;
    const historicalData = dataStore.getAggregatedTimeseries(startTime, now, 5 * 60 * 1000);

    const predictions = predictSensorData(historicalData, 12, 5 * 60 * 1000);
    
    predictionCache.set(cacheKey, predictions, 15000);
    res.json(predictions);
  } catch (error) {
    console.error('预测错误:', error);
    res.status(500).json({
      temperature: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      humidity: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      co2: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      ch4: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
    });
  }
});

router.get('/zones', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'zones_main';
    const cached = rankingCache.get<ZoneData[]>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = dataStore.getSensorData(3000);
    const zones = analyzeZones(data);
    
    rankingCache.set(cacheKey, zones, 45000);
    res.json(zones);
  } catch (error) {
    console.error('分区分析错误:', error);
    res.status(500).json([]);
  }
});

router.get('/zones/ranking', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'zones_ranking';
    const cached = rankingCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = dataStore.getSensorData(3000);
    const zones = analyzeZones(data);
    const rankings = getZoneRankings(zones, 5);
    
    rankingCache.set(cacheKey, rankings, 45000);
    res.json(rankings);
  } catch (error) {
    console.error('分区排名错误:', error);
    res.status(500).json({
      highestRisk: [],
      lowestRisk: [],
      mostAnomalies: [],
    });
  }
});

router.get('/cache/stats', (_req: Request, res: Response) => {
  try {
    const { queryCache, featureCache, predictionCache, rankingCache } = require('../utils/cacheManager');
    res.json({
      query: queryCache.getStats(),
      feature: featureCache.getStats(),
      prediction: predictionCache.getStats(),
      ranking: rankingCache.getStats(),
    });
  } catch (error) {
    res.status(500).json({ error: '获取缓存统计失败' });
  }
});

export default router;
