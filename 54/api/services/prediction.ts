import { calculateMean, calculateStd } from '../utils/statistics';

export interface PredictionPoint {
  timestamp: number;
  value: number;
  lower: number;
  upper: number;
}

export interface PredictionResult {
  historical: Array<{ timestamp: number; value: number }>;
  predictions: PredictionPoint[];
  confidence: number;
  trend: 'rising' | 'stable' | 'falling';
}

function simpleMovingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    result.push(calculateMean(window));
  }
  return result;
}

function exponentialMovingAverage(values: number[], alpha: number = 0.3): number[] {
  if (values.length === 0) return [];
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0 };
  }

  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function calculateForecastError(
  historical: number[],
  predicted: number[]
): { mae: number; rmse: number; std: number } {
  const errors: number[] = [];
  const startIdx = historical.length - predicted.length;

  for (let i = 0; i < predicted.length; i++) {
    errors.push(historical[startIdx + i] - predicted[i]);
  }

  const mae = calculateMean(errors.map((e) => Math.abs(e)));
  const rmse = Math.sqrt(calculateMean(errors.map((e) => e * e)));
  const std = calculateStd(errors);

  return { mae, rmse, std };
}

export function predictTrend(
  timestamps: number[],
  values: number[],
  steps: number = 12,
  intervalMs: number = 5 * 60 * 1000
): PredictionResult {
  if (values.length < 10) {
    return {
      historical: timestamps.map((t, i) => ({ timestamp: t, value: values[i] })),
      predictions: [],
      confidence: 0,
      trend: 'stable',
    };
  }

  const emaValues = exponentialMovingAverage(values, 0.2);

  const xIndices = values.map((_, i) => i);
  const { slope, intercept } = linearRegression(xIndices, emaValues);

  const historical = timestamps.map((t, i) => ({
    timestamp: t,
    value: emaValues[i],
  }));

  const lastTime = timestamps[timestamps.length - 1];
  const predictions: PredictionPoint[] = [];
  const std = calculateStd(values.slice(-20));
  const confidence = Math.max(0, Math.min(1, 1 - std / calculateMean(values.slice(-20))));

  for (let i = 1; i <= steps; i++) {
    const futureIndex = values.length + i - 1;
    const predictedValue = slope * futureIndex + intercept;
    const zScore = 1.96;
    const marginOfError = zScore * std * Math.sqrt(1 + i / values.length);

    predictions.push({
      timestamp: lastTime + i * intervalMs,
      value: parseFloat(predictedValue.toFixed(2)),
      lower: parseFloat((predictedValue - marginOfError).toFixed(2)),
      upper: parseFloat((predictedValue + marginOfError).toFixed(2)),
    });
  }

  let trend: 'rising' | 'stable' | 'falling' = 'stable';
  if (slope > 0.01) trend = 'rising';
  else if (slope < -0.01) trend = 'falling';

  return {
    historical,
    predictions,
    confidence: parseFloat(confidence.toFixed(2)),
    trend,
  };
}

export function predictSensorData(
  historicalData: Array<{ timestamp: number; temperature: number; humidity: number; co2: number; ch4: number }>,
  steps: number = 12,
  intervalMs: number = 5 * 60 * 1000
): {
  temperature: PredictionResult;
  humidity: PredictionResult;
  co2: PredictionResult;
  ch4: PredictionResult;
} {
  if (historicalData.length === 0) {
    return {
      temperature: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      humidity: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      co2: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
      ch4: { historical: [], predictions: [], confidence: 0, trend: 'stable' },
    };
  }

  const timestamps = historicalData.map((d) => d.timestamp);
  const temperatures = historicalData.map((d) => d.temperature);
  const humidities = historicalData.map((d) => d.humidity);
  const co2s = historicalData.map((d) => d.co2);
  const ch4s = historicalData.map((d) => d.ch4);

  return {
    temperature: predictTrend(timestamps, temperatures, steps, intervalMs),
    humidity: predictTrend(timestamps, humidities, steps, intervalMs),
    co2: predictTrend(timestamps, co2s, steps, intervalMs),
    ch4: predictTrend(timestamps, ch4s, steps, intervalMs),
  };
}

export function predictRiskLevel(
  prediction: PredictionResult,
  thresholds: { low: number; medium: number; high: number; critical: number }
): Array<{ timestamp: number; level: 'low' | 'medium' | 'high' | 'critical'; value: number }> {
  return prediction.predictions.map((p) => {
    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (p.value > thresholds.critical) level = 'critical';
    else if (p.value > thresholds.high) level = 'high';
    else if (p.value > thresholds.medium) level = 'medium';

    return {
      timestamp: p.timestamp,
      level,
      value: p.value,
    };
  });
}
