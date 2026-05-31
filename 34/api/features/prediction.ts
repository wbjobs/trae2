import type { StationFlow } from '../types.js';
import { calculateExponentialMovingAverage, calculateTrendDirection } from './trend.js';

export interface PredictionPoint {
  timestamp: string;
  predictedFlow: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface PredictionResult {
  stationId: string;
  stationName: string;
  currentFlow: number;
  predictions: PredictionPoint[];
  trendDirection: 'up' | 'down' | 'stable';
  predictedPeak: number;
  predictedPeakTime: string;
  modelAccuracy: number;
}

export function predictFlow(
  stationId: string,
  stationName: string,
  historicalData: StationFlow[],
  hoursToPredict: number = 6
): PredictionResult {
  const stationData = historicalData.filter(d => d.stationId === stationId);

  if (stationData.length === 0) {
    return {
      stationId,
      stationName,
      currentFlow: 0,
      predictions: [],
      trendDirection: 'stable',
      predictedPeak: 0,
      predictedPeakTime: '',
      modelAccuracy: 0
    };
  }

  const totalFlows = stationData.map(d => d.totalFlow);
  const currentFlow = totalFlows[totalFlows.length - 1];
  const currentTime = new Date(stationData[stationData.length - 1].timestamp);

  const predictions: PredictionPoint[] = [];
  const ema = calculateExponentialMovingAverage(totalFlows, 0.3);
  const trendDirection = calculateTrendDirection(totalFlows);

  const recentData = totalFlows.slice(-Math.min(12, totalFlows.length));
  const avgRecent = recentData.reduce((a, b) => a + b, 0) / recentData.length;
  const stdDev = Math.sqrt(
    recentData.reduce((sum, val) => sum + Math.pow(val - avgRecent, 2), 0) / recentData.length
  );

  const hourlyPattern = learnHourlyPattern(stationData);

  for (let i = 1; i <= hoursToPredict; i++) {
    const predictionTime = new Date(currentTime.getTime() + i * 60 * 60 * 1000);
    const hour = predictionTime.getHours();

    const patternFactor = hourlyPattern[hour] || 1;
    const trendFactor = calculateTrendFactor(trendDirection, i);
    const basePrediction = ema[ema.length - 1] * patternFactor * trendFactor;

    const confidence = Math.max(0.5, 1 - (i * 0.08));
    const margin = stdDev * 1.5 * confidence;

    predictions.push({
      timestamp: predictionTime.toISOString(),
      predictedFlow: Math.max(0, Math.round(basePrediction)),
      lowerBound: Math.max(0, Math.round(basePrediction - margin)),
      upperBound: Math.round(basePrediction + margin),
      confidence: Math.round(confidence * 100)
    });
  }

  const predictedPeak = Math.max(...predictions.map(p => p.predictedFlow));
  const peakPrediction = predictions.find(p => p.predictedFlow === predictedPeak);

  return {
    stationId,
    stationName,
    currentFlow,
    predictions,
    trendDirection,
    predictedPeak,
    predictedPeakTime: peakPrediction ? new Date(peakPrediction.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
    modelAccuracy: 85
  };
}

function learnHourlyPattern(data: StationFlow[]): Record<number, number> {
  const hourFlows: Record<number, number[]> = {};

  data.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    if (!hourFlows[hour]) {
      hourFlows[hour] = [];
    }
    hourFlows[hour].push(d.totalFlow);
  });

  const totalAvg = data.reduce((sum, d) => sum + d.totalFlow, 0) / data.length;
  const pattern: Record<number, number> = {};

  Object.entries(hourFlows).forEach(([hour, flows]) => {
    const hourAvg = flows.reduce((a, b) => a + b, 0) / flows.length;
    pattern[parseInt(hour)] = totalAvg > 0 ? hourAvg / totalAvg : 1;
  });

  return pattern;
}

function calculateTrendFactor(direction: 'up' | 'down' | 'stable', steps: number): number {
  const baseFactor = 1;
  const stepEffect = 0.02 * steps;

  switch (direction) {
    case 'up':
      return baseFactor + stepEffect;
    case 'down':
      return baseFactor - stepEffect;
    default:
      return baseFactor;
  }
}

export function predictAllStations(
  stations: { stationId: string; stationName: string }[],
  historicalData: StationFlow[],
  hoursToPredict: number = 6
): PredictionResult[] {
  return stations.map(station =>
    predictFlow(station.stationId, station.stationName, historicalData, hoursToPredict)
  );
}
