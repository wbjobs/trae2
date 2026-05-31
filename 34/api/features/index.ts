import type { StationFlow, TimeSeriesFeature } from '../types.js';
import { getStations } from '../data-generator.js';
import { calculateTrend, calculateTrendDirection, calculateTrendStrength } from './trend.js';
import { calculatePeriodicity } from './periodicity.js';
import { detectAnomalies } from './anomaly.js';
import { findPeakHours, calculatePeakIntensity } from './peak-hours.js';

export interface ExtendedTimeSeriesFeature extends TimeSeriesFeature {
  trendDirection: 'up' | 'down' | 'stable';
  trendStrength: number;
  peakIntensity: number;
}

export function extractTimeSeriesFeatures(
  stationId: string,
  historicalData: StationFlow[]
): ExtendedTimeSeriesFeature {
  const stationData = historicalData.filter(d => d.stationId === stationId);
  const totalFlows = stationData.map(d => d.totalFlow);

  if (totalFlows.length === 0) {
    return {
      stationId,
      trend: [],
      periodicity: 0,
      anomalies: [],
      peakHours: [],
      avgFlow: 0,
      maxFlow: 0,
      minFlow: 0,
      stdDev: 0,
      trendDirection: 'stable',
      trendStrength: 0,
      peakIntensity: 0
    };
  }

  const avgFlow = totalFlows.reduce((a, b) => a + b, 0) / totalFlows.length;
  const maxFlow = Math.max(...totalFlows);
  const minFlow = Math.min(...totalFlows);
  const variance = totalFlows.reduce((sum, val) => sum + Math.pow(val - avgFlow, 2), 0) / totalFlows.length;
  const stdDev = Math.sqrt(variance);

  const trend = calculateTrend(totalFlows);
  const periodicity = calculatePeriodicity(totalFlows);
  const anomalies = detectAnomalies(stationData, avgFlow, stdDev);
  const peakHours = findPeakHours(stationData);
  const trendDirection = calculateTrendDirection(totalFlows);
  const trendStrength = calculateTrendStrength(totalFlows);
  const peakIntensity = calculatePeakIntensity(stationData);

  return {
    stationId,
    trend,
    periodicity,
    anomalies,
    peakHours,
    avgFlow: Math.round(avgFlow),
    maxFlow,
    minFlow,
    stdDev: Math.round(stdDev),
    trendDirection,
    trendStrength,
    peakIntensity
  };
}

export function extractAllFeatures(
  historicalData: StationFlow[]
): ExtendedTimeSeriesFeature[] {
  const stations = getStations();
  return stations.map(station => extractTimeSeriesFeatures(station.stationId, historicalData));
}

export function extractFeaturesBatch(
  stationIds: string[],
  historicalData: StationFlow[]
): ExtendedTimeSeriesFeature[] {
  return stationIds.map(stationId => extractTimeSeriesFeatures(stationId, historicalData));
}
