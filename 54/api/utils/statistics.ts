export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

export function calculateStd(values: number[], mean?: number): number {
  if (values.length <= 1) return 0;
  const m = mean ?? calculateMean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - m;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

export function calculateMax(values: number[]): number {
  if (values.length === 0) return 0;
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

export function calculateMin(values: number[]): number {
  if (values.length === 0) return 0;
  let min = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
  }
  return min;
}

export function calculateTrend(values: number[]): 'rising' | 'stable' | 'falling' {
  if (values.length < 2) return 'stable';

  const mid = Math.floor(values.length / 2);
  let firstSum = 0;
  let secondSum = 0;

  for (let i = 0; i < mid; i++) {
    firstSum += values[i];
  }
  for (let i = mid; i < values.length; i++) {
    secondSum += values[i];
  }

  const firstMean = firstSum / mid;
  const secondMean = secondSum / (values.length - mid);
  const diff = secondMean - firstMean;
  const overallMean = (firstSum + secondSum) / values.length;
  const threshold = overallMean * 0.02;

  if (diff > threshold) return 'rising';
  if (diff < -threshold) return 'falling';
  return 'stable';
}

export function calculateVolatility(values: number[], mean?: number, std?: number): number {
  const m = mean ?? calculateMean(values);
  if (m === 0) return 0;
  const s = std ?? calculateStd(values, m);
  return (s / m) * 100;
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function calculateSkewness(values: number[], mean?: number, std?: number): number {
  if (values.length < 3) return 0;
  const m = mean ?? calculateMean(values);
  const s = std ?? calculateStd(values, m);
  if (s === 0) return 0;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = (values[i] - m) / s;
    sum += diff * diff * diff;
  }
  return sum / values.length;
}

export function calculateKurtosis(values: number[], mean?: number, std?: number): number {
  if (values.length < 4) return 0;
  const m = mean ?? calculateMean(values);
  const s = std ?? calculateStd(values, m);
  if (s === 0) return 0;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = (values[i] - m) / s;
    sum += diff * diff * diff * diff;
  }
  return sum / values.length - 3;
}

export function calculateCovariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const meanX = calculateMean(x);
  const meanY = calculateMean(y);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / x.length;
}

export function calculateCorrelation(x: number[], y: number[]): number {
  const cov = calculateCovariance(x, y);
  const stdX = calculateStd(x);
  const stdY = calculateStd(y);
  if (stdX === 0 || stdY === 0) return 0;
  return cov / (stdX * stdY);
}
