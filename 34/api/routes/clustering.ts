import express, { type Request, type Response } from 'express';
import { generateHistoricalFlowData } from '../data-generator.js';
import { performClustering } from '../clustering.js';
import { clusterCache } from '../cache.js';

const router = express.Router();

router.get('/results', (req: Request, res: Response) => {
  const cacheKey = 'clustering:results';
  const cached = clusterCache.get(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const clusteringResults = performClustering(allFlows);

  const clusterGroups: Record<number, { clusterId: number; clusterName: string; stations: any[] }> = {};

  clusteringResults.forEach(result => {
    if (!clusterGroups[result.clusterId]) {
      clusterGroups[result.clusterId] = {
        clusterId: result.clusterId,
        clusterName: result.clusterName,
        stations: []
      };
    }
    clusterGroups[result.clusterId].stations.push(result);
  });

  const result = {
    success: true,
    data: {
      clusters: Object.values(clusterGroups),
      results: clusteringResults
    }
  };

  clusterCache.set(cacheKey, result, 300000);
  res.json(result);
});

router.get('/station/:stationId', (req: Request, res: Response) => {
  const { stationId } = req.params;
  const cacheKey = `clustering:station:${stationId}`;

  const cached = clusterCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const historicalData = generateHistoricalFlowData(24);
  const allFlows = Object.values(historicalData).flat();
  const clusteringResults = performClustering(allFlows);
  const stationResult = clusteringResults.find(r => r.stationId === stationId);

  if (!stationResult) {
    res.status(404).json({ success: false, error: 'Station not found in clustering results' });
    return;
  }

  clusterCache.set(cacheKey, { success: true, data: stationResult }, 300000);
  res.json({ success: true, data: stationResult });
});

export default router;
