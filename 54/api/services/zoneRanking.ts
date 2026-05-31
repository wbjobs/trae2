import { SensorData } from '../../shared/types';

export interface ZoneData {
  zoneId: string;
  zoneName: string;
  avgTemperature: number;
  avgHumidity: number;
  avgCo2: number;
  avgCh4: number;
  deviceCount: number;
  anomalyCount: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'worsening';
}

function getZoneFromLocation(x: number, y: number): { zoneId: string; zoneName: string } {
  const zoneX = Math.floor(x / 25);
  const zoneY = Math.floor(y / 25);
  const zoneIndex = zoneY * 4 + zoneX;
  const zoneNames = [
    '西北区', '北区', '东北区', '东北边区',
    '西区', '中心区', '东区', '东边区',
    '西南区', '南区', '东南区', '东南边区',
    '西南边区', '南边区', '东南边区2', '东南角落',
  ];
  return {
    zoneId: `ZONE-${zoneX + 1}-${zoneY + 1}`,
    zoneName: zoneNames[zoneIndex] || `区域${zoneIndex + 1}`,
  };
}

function calculateRiskScore(
  avgTemp: number,
  avgHum: number,
  avgCo2: number,
  avgCh4: number,
  anomalyCount: number
): number {
  let score = 0;

  if (avgTemp > 35) score += 30;
  else if (avgTemp > 30) score += 15;
  else if (avgTemp > 28) score += 5;

  if (avgHum > 75) score += 25;
  else if (avgHum > 70) score += 12;
  else if (avgHum > 65) score += 4;

  if (avgCo2 > 1500) score += 35;
  else if (avgCo2 > 1000) score += 18;
  else if (avgCo2 > 800) score += 6;

  if (avgCh4 > 50) score += 40;
  else if (avgCh4 > 20) score += 20;
  else if (avgCh4 > 10) score += 8;

  score += anomalyCount * 5;

  return Math.min(100, score);
}

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

export function analyzeZones(data: SensorData[]): ZoneData[] {
  if (data.length === 0) return [];

  const zoneMap = new Map<
    string,
    {
      zoneName: string;
      temps: number[];
      hums: number[];
      co2s: number[];
      ch4s: number[];
      devices: Set<string>;
      anomalyCount: number;
      recentRiskScore: number[];
    }
  >();

  const now = Date.now();
  const recentWindow = 30 * 60 * 1000;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const { zoneId, zoneName } = getZoneFromLocation(d.location.x, d.location.y);

    if (!zoneMap.has(zoneId)) {
      zoneMap.set(zoneId, {
        zoneName,
        temps: [],
        hums: [],
        co2s: [],
        ch4s: [],
        devices: new Set(),
        anomalyCount: 0,
        recentRiskScore: [],
      });
    }

    const zone = zoneMap.get(zoneId)!;
    zone.temps.push(d.temperature);
    zone.hums.push(d.humidity);
    zone.co2s.push(d.gasConcentration.co2);
    zone.ch4s.push(d.gasConcentration.ch4);
    zone.devices.add(d.deviceId);

    const hasAnomaly =
      d.temperature > 28 ||
      d.humidity > 65 ||
      d.gasConcentration.co2 > 800 ||
      d.gasConcentration.ch4 > 10 ||
      d.deviceStatus !== 'normal';

    if (hasAnomaly) {
      zone.anomalyCount++;
    }

    if (now - d.timestamp <= recentWindow) {
      const pointScore = calculateRiskScore(
        d.temperature,
        d.humidity,
        d.gasConcentration.co2,
        d.gasConcentration.ch4,
        hasAnomaly ? 1 : 0
      );
      zone.recentRiskScore.push(pointScore);
    }
  }

  const zones: ZoneData[] = [];

  zoneMap.forEach((zone, zoneId) => {
    const avgTemp = zone.temps.reduce((a, b) => a + b, 0) / zone.temps.length;
    const avgHum = zone.hums.reduce((a, b) => a + b, 0) / zone.hums.length;
    const avgCo2 = zone.co2s.reduce((a, b) => a + b, 0) / zone.co2s.length;
    const avgCh4 = zone.ch4s.reduce((a, b) => a + b, 0) / zone.ch4s.length;

    const riskScore = calculateRiskScore(
      avgTemp,
      avgHum,
      avgCo2,
      avgCh4,
      zone.anomalyCount
    );

    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (zone.recentRiskScore.length >= 10) {
      const mid = Math.floor(zone.recentRiskScore.length / 2);
      const firstHalf = zone.recentRiskScore.slice(0, mid);
      const secondHalf = zone.recentRiskScore.slice(mid);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg < firstAvg * 0.9) trend = 'improving';
      else if (secondAvg > firstAvg * 1.1) trend = 'worsening';
    }

    zones.push({
      zoneId,
      zoneName: zone.zoneName,
      avgTemperature: parseFloat(avgTemp.toFixed(2)),
      avgHumidity: parseFloat(avgHum.toFixed(2)),
      avgCo2: parseFloat(avgCo2.toFixed(2)),
      avgCh4: parseFloat(avgCh4.toFixed(4)),
      deviceCount: zone.devices.size,
      anomalyCount: zone.anomalyCount,
      riskScore: parseFloat(riskScore.toFixed(2)),
      riskLevel: getRiskLevel(riskScore),
      trend,
    });
  });

  return zones.sort((a, b) => b.riskScore - a.riskScore);
}

export function getZoneRankings(
  zones: ZoneData[],
  limit: number = 10
): {
  highestRisk: ZoneData[];
  lowestRisk: ZoneData[];
  mostAnomalies: ZoneData[];
} {
  const sortedByRisk = [...zones].sort((a, b) => b.riskScore - a.riskScore);
  const sortedByAnomalies = [...zones].sort((a, b) => b.anomalyCount - a.anomalyCount);

  return {
    highestRisk: sortedByRisk.slice(0, limit),
    lowestRisk: sortedByRisk.slice(-limit).reverse(),
    mostAnomalies: sortedByAnomalies.slice(0, limit),
  };
}
