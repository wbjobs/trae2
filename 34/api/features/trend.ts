export function calculateTrend(data: number[], windowSize?: number): number[] {
  if (data.length < 2) return data;

  const ws = windowSize || Math.min(5, Math.floor(data.length / 3));
  const trend: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(ws / 2));
    const end = Math.min(data.length, i + Math.ceil(ws / 2));
    const window = data.slice(start, end);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    trend.push(Math.round(avg));
  }

  return trend;
}

export function calculateMovingAverage(data: number[], period: number = 3): number[] {
  if (data.length < period) return data;

  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    const window = data.slice(start, i + 1);
    result.push(Math.round(window.reduce((a, b) => a + b, 0) / window.length));
  }
  return result;
}

export function calculateExponentialMovingAverage(data: number[], alpha: number = 0.3): number[] {
  if (data.length === 0) return data;

  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(Math.round(alpha * data[i] + (1 - alpha) * result[i - 1]));
  }
  return result;
}

export function calculateTrendDirection(data: number[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';

  const recent = data.slice(-Math.min(5, data.length));
  const older = data.slice(0, Math.max(1, data.length - Math.min(5, data.length)));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = (recentAvg - olderAvg) / olderAvg;

  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

export function calculateTrendStrength(data: number[]): number {
  if (data.length < 3) return 0;

  const mid = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid);
  const secondHalf = data.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (firstAvg === 0) return 0;

  return Math.round(((secondAvg - firstAvg) / firstAvg) * 100) / 100;
}
