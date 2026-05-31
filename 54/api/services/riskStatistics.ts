import { SensorData, AnomalyCluster, RiskStatistics } from '../../shared/types';

function getRiskLevel(data: SensorData): number {
  let level = 0;

  if (data.temperature > 35) level += 4;
  else if (data.temperature > 30) level += 2;
  else if (data.temperature > 28) level += 1;

  if (data.humidity > 75) level += 4;
  else if (data.humidity > 70) level += 2;
  else if (data.humidity > 65) level += 1;

  if (data.gasConcentration.co2 > 1500) level += 4;
  else if (data.gasConcentration.co2 > 1000) level += 2;
  else if (data.gasConcentration.co2 > 800) level += 1;

  if (data.gasConcentration.ch4 > 50) level += 4;
  else if (data.gasConcentration.ch4 > 20) level += 2;
  else if (data.gasConcentration.ch4 > 10) level += 1;

  if (data.deviceStatus === 'error') level += 4;
  else if (data.deviceStatus === 'warning') level += 1;

  return Math.min(level, 10);
}

function classifyLevel(level: number): 'low' | 'medium' | 'high' | 'critical' {
  if (level >= 8) return 'critical';
  if (level >= 5) return 'high';
  if (level >= 2) return 'medium';
  return 'low';
}

export function calculateRiskStatistics(
  data: SensorData[],
  clusters: AnomalyCluster[]
): RiskStatistics {
  const hourlyRisk: Array<{ hour: number; level: number; count: number }> = [];
  const levelDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
  const locationRiskMap = new Map<string, { count: number; totalLevel: number }>();

  for (let hour = 0; hour < 24; hour++) {
    hourlyRisk.push({ hour, level: 0, count: 0 });
  }

  data.forEach((d) => {
    const hour = new Date(d.timestamp).getHours();
    const riskLevel = getRiskLevel(d);

    hourlyRisk[hour].level += riskLevel;
    hourlyRisk[hour].count++;

    const levelCat = classifyLevel(riskLevel);
    levelDistribution[levelCat]++;

    const locationKey = `(${d.location.x.toFixed(0)}, ${d.location.y.toFixed(0)})`;
    const existing = locationRiskMap.get(locationKey) || { count: 0, totalLevel: 0 };
    existing.count++;
    existing.totalLevel += riskLevel;
    locationRiskMap.set(locationKey, existing);
  });

  hourlyRisk.forEach((h) => {
    if (h.count > 0) {
      h.level = parseFloat((h.level / h.count).toFixed(2));
    }
  });

  const topRiskLocations = Array.from(locationRiskMap.entries())
    .map(([location, stats]) => ({
      location,
      riskCount: stats.count,
      avgLevel: parseFloat((stats.totalLevel / stats.count).toFixed(2)),
    }))
    .sort((a, b) => b.avgLevel - a.avgLevel)
    .slice(0, 10);

  clusters.forEach((cluster) => {
    levelDistribution[cluster.level]++;
  });

  return {
    hourlyRisk,
    levelDistribution,
    topRiskLocations,
  };
}

export function getCurrentRiskLevel(data: SensorData[]): { level: number; category: string } {
  if (data.length === 0) return { level: 0, category: 'low' };

  const latestData = data.slice(-20);
  const avgRisk =
    latestData.reduce((sum, d) => sum + getRiskLevel(d), 0) / latestData.length;
  const category = classifyLevel(avgRisk);

  return {
    level: parseFloat(avgRisk.toFixed(2)),
    category,
  };
}
