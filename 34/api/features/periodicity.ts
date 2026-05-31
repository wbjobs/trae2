export function calculatePeriodicity(data: number[]): number {
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

export function calculateSeasonalityIndex(data: number[], period: number = 24): number[] {
  if (data.length < period) return [];

  const seasonality: number[] = [];
  const totalAvg = data.reduce((a, b) => a + b, 0) / data.length;

  for (let i = 0; i < period; i++) {
    const periodValues: number[] = [];
    for (let j = i; j < data.length; j += period) {
      periodValues.push(data[j]);
    }
    const periodAvg = periodValues.reduce((a, b) => a + b, 0) / periodValues.length;
    seasonality.push(totalAvg > 0 ? Math.round((periodAvg / totalAvg) * 100) / 100 : 1);
  }

  return seasonality;
}

export function findPeakPeriods(data: number[], threshold: number = 0.8): number[] {
  if (data.length === 0) return [];

  const maxVal = Math.max(...data);
  const peakThreshold = maxVal * threshold;

  const peaks: number[] = [];
  let inPeak = false;
  let peakStart = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i] >= peakThreshold && !inPeak) {
      inPeak = true;
      peakStart = i;
    } else if (data[i] < peakThreshold && inPeak) {
      inPeak = false;
      peaks.push(Math.round((peakStart + i - 1) / 2));
    }
  }

  if (inPeak) {
    peaks.push(Math.round((peakStart + data.length - 1) / 2));
  }

  return peaks;
}
