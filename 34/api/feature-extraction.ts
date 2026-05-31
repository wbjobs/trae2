import type { StationFlow, TimeSeriesFeature } from './types.js';
import { getStations } from './data-generator.js';

export function extractTimeSeriesFeatures(
  stationId: string,
  historicalData: StationFlow[]
): TimeSeriesFeature {
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
      stdDev: 0
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

  return {
    stationId,
    trend,
    periodicity,
    anomalies,
    peakHours,
    avgFlow: Math.round(avgFlow),
    maxFlow,
    minFlow,
    stdDev: Math.round(stdDev)
  };
}

function calculateTrend(data: number[]): number[] {
  if (data.length < 2) return data;

  const windowSize = Math.min(5, Math.floor(data.length / 3));
  const trend: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
    const window = data.slice(start, end);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    trend.push(Math.round(avg));
  }

  return trend;
}

function calculatePeriodicity(data: number[]): number {
  if (data.length < 24) return 0;

  let maxCorrelation = 0;
  let bestPeriod = 0;

  for (let period = 6; period <= 12; period++) {
    let correlation = 0;
    let count = 0;

    for (let i = 0; i + period < data.length; i++) {
      if (data[i] > 0 && data[i + period] > 0) {
        correlation += Math.abs(data[i] - data[i + period]) / Math.max(data[i], data[i + period]);
        count++;
      }
    }

    if (count > 0) {
      correlation = 1 - correlation / count;
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }
  }

  return bestPeriod > 0 ? Math.round(maxCorrelation * 100) / 100 : 0;
}

function detectAnomalies(
  data: StationFlow[],
  avgFlow: number,
  stdDev: number
): { timestamp: string; value: number; type: 'spike' | 'drop' }[] {
  const anomalies: { timestamp: string; value: number; type: 'spike' | 'drop' }[] = [];
  const threshold = avgFlow + stdDev * 2;
  const lowerThreshold = avgFlow - stdDev * 1.5;

  data.forEach(d => {
    if (d.totalFlow > threshold) {
      anomalies.push({
        timestamp: d.timestamp,
        value: d.totalFlow,
        type: 'spike'
      });
    } else if (d.totalFlow < lowerThreshold && d.totalFlow > 0) {
      anomalies.push({
        timestamp: d.timestamp,
        value: d.totalFlow,
        type: 'drop'
      });
    }
  });

  return anomalies.slice(0, 10);
}

function findPeakHours(data: StationFlow[]): number[] {
  const hourFlows: Record<number, number[]> = {};

  data.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    if (!hourFlows[hour]) {
      hourFlows[hour] = [];
    }
    hourFlows[hour].push(d.totalFlow);
  });

  const hourAvgs: { hour: number; avg: number }[] = [];
  Object.entries(hourFlows).forEach(([hour, flows]) => {
    hourAvgs.push({
      hour: parseInt(hour),
      avg: flows.reduce((a, b) => a + b, 0) / flows.length
    });
  });

  hourAvgs.sort((a, b) => b.avg - a.avg);
  return hourAvgs.slice(0, 3).map(h => h.hour).sort();
}

export function extractAllFeatures(
  historicalData: StationFlow[]
): TimeSeriesFeature[] {
  const stations = getStations();
  return stations.map(station => extractTimeSeriesFeatures(station.stationId, historicalData));
}
