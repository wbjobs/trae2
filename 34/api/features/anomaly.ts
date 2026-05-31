import type { StationFlow } from '../types.js';

export interface Anomaly {
  timestamp: string;
  value: number;
  type: 'spike' | 'drop' | 'sudden_increase' | 'sudden_drop';
  severity: 'low' | 'medium' | 'high';
  deviation: number;
}

export function detectAnomalies(
  data: StationFlow[],
  avgFlow: number,
  stdDev: number,
  maxResults: number = 10
): { timestamp: string; value: number; type: 'spike' | 'drop' }[] {
  const anomalies: { timestamp: string; value: number; type: 'spike' | 'drop' }[] = [];
  const upperThreshold = avgFlow + stdDev * 2;
  const lowerThreshold = avgFlow - stdDev * 1.5;

  data.forEach(d => {
    if (d.totalFlow > upperThreshold) {
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

  return anomalies.slice(0, maxResults);
}

export function detectSuddenChanges(
  data: StationFlow[],
  threshold: number = 0.5
): Anomaly[] {
  const changes: Anomaly[] = [];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].totalFlow;
    const curr = data[i].totalFlow;

    if (prev > 0) {
      const changeRate = (curr - prev) / prev;

      if (changeRate > threshold) {
        changes.push({
          timestamp: data[i].timestamp,
          value: curr,
          type: 'sudden_increase',
          severity: changeRate > threshold * 2 ? 'high' : changeRate > threshold * 1.5 ? 'medium' : 'low',
          deviation: Math.round(changeRate * 100)
        });
      } else if (changeRate < -threshold) {
        changes.push({
          timestamp: data[i].timestamp,
          value: curr,
          type: 'sudden_drop',
          severity: changeRate < -threshold * 2 ? 'high' : changeRate < -threshold * 1.5 ? 'medium' : 'low',
          deviation: Math.round(changeRate * 100)
        });
      }
    }
  }

  return changes;
}

export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export function isOutlier(value: number, mean: number, stdDev: number, zThreshold: number = 2): boolean {
  return Math.abs(calculateZScore(value, mean, stdDev)) > zThreshold;
}
