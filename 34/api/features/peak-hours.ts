import type { StationFlow } from '../types.js';

export function findPeakHours(data: StationFlow[], topN: number = 3): number[] {
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
  return hourAvgs.slice(0, topN).map(h => h.hour).sort();
}

export function classifyHourType(hour: number): 'morning_peak' | 'evening_peak' | 'midday' | 'night' | 'early_morning' {
  if (hour >= 6 && hour <= 9) return 'morning_peak';
  if (hour >= 17 && hour <= 20) return 'evening_peak';
  if (hour >= 11 && hour <= 14) return 'midday';
  if (hour >= 22 || hour <= 5) return 'night';
  return 'early_morning';
}

export function getHourlyStats(data: StationFlow[]): Map<number, { avg: number; max: number; min: number; count: number }> {
  const hourlyData = new Map<number, number[]>();

  data.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    if (!hourlyData.has(hour)) {
      hourlyData.set(hour, []);
    }
    hourlyData.get(hour)!.push(d.totalFlow);
  });

  const stats = new Map<number, { avg: number; max: number; min: number; count: number }>();
  hourlyData.forEach((flows, hour) => {
    stats.set(hour, {
      avg: Math.round(flows.reduce((a, b) => a + b, 0) / flows.length),
      max: Math.max(...flows),
      min: Math.min(...flows),
      count: flows.length
    });
  });

  return stats;
}

export function calculatePeakIntensity(data: StationFlow[]): number {
  const hourFlows: Record<number, number[]> = {};

  data.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    if (!hourFlows[hour]) {
      hourFlows[hour] = [];
    }
    hourFlows[hour].push(d.totalFlow);
  });

  const hourAvgs = Object.values(hourFlows).map(flows =>
    flows.reduce((a, b) => a + b, 0) / flows.length
  );

  if (hourAvgs.length === 0) return 0;

  const maxAvg = Math.max(...hourAvgs);
  const minAvg = Math.min(...hourAvgs);

  return maxAvg > 0 ? Math.round(((maxAvg - minAvg) / maxAvg) * 100) / 100 : 0;
}
