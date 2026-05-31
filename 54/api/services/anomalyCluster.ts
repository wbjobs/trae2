import { SensorData, AnomalyCluster } from '../../shared/types';

interface DataPoint {
  x: number;
  y: number;
  value: number;
  timestamp: number;
  deviceId: string;
}

function euclideanDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function getAnomalyLevel(value: number, type: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (type) {
    case 'temperature':
      if (value > 35) return 'critical';
      if (value > 30) return 'high';
      if (value > 28) return 'medium';
      return 'low';
    case 'humidity':
      if (value > 75) return 'critical';
      if (value > 70) return 'high';
      if (value > 65) return 'medium';
      return 'low';
    case 'gas':
      if (value > 1500) return 'critical';
      if (value > 1000) return 'high';
      if (value > 800) return 'medium';
      return 'low';
    case 'device':
      if (value >= 100) return 'critical';
      if (value >= 75) return 'high';
      if (value >= 50) return 'medium';
      return 'low';
    default:
      return 'low';
  }
}

function detectTemperatureAnomalies(data: SensorData[]): DataPoint[] {
  const anomalies: DataPoint[] = [];
  const tempThreshold = 28;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.temperature > tempThreshold) {
      anomalies.push({
        x: d.location.x,
        y: d.location.y,
        value: d.temperature,
        timestamp: d.timestamp,
        deviceId: d.deviceId,
      });
    }
  }

  return anomalies;
}

function detectHumidityAnomalies(data: SensorData[]): DataPoint[] {
  const anomalies: DataPoint[] = [];
  const humidityThreshold = 65;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.humidity > humidityThreshold) {
      anomalies.push({
        x: d.location.x,
        y: d.location.y,
        value: d.humidity,
        timestamp: d.timestamp,
        deviceId: d.deviceId,
      });
    }
  }

  return anomalies;
}

function detectGasAnomalies(data: SensorData[]): DataPoint[] {
  const anomalies: DataPoint[] = [];
  const co2Threshold = 800;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.gasConcentration.co2 > co2Threshold) {
      anomalies.push({
        x: d.location.x,
        y: d.location.y,
        value: d.gasConcentration.co2,
        timestamp: d.timestamp,
        deviceId: d.deviceId,
      });
    }
  }

  return anomalies;
}

function detectDeviceAnomalies(data: SensorData[]): DataPoint[] {
  const anomalies: DataPoint[] = [];

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.deviceStatus === 'error' || d.deviceStatus === 'warning') {
      const value = d.deviceStatus === 'error' ? 100 : 50;
      anomalies.push({
        x: d.location.x,
        y: d.location.y,
        value,
        timestamp: d.timestamp,
        deviceId: d.deviceId,
      });
    }
  }

  return anomalies;
}

interface PointWithIndex extends DataPoint {
  index: number;
}

function dbscanCluster(
  points: DataPoint[],
  eps: number = 15,
  minPts: number = 3
): Array<DataPoint[]> {
  if (points.length === 0) return [];

  const indexedPoints: PointWithIndex[] = points.map((p, i) => ({ ...p, index: i }));
  const clusters: Array<DataPoint[]> = [];
  const visited = new Set<number>();

  const distanceMatrix: number[][] = [];
  for (let i = 0; i < indexedPoints.length; i++) {
    distanceMatrix[i] = [];
    for (let j = 0; j < indexedPoints.length; j++) {
      if (i === j) {
        distanceMatrix[i][j] = 0;
      } else if (j < i) {
        distanceMatrix[i][j] = distanceMatrix[j][i];
      } else {
        distanceMatrix[i][j] = euclideanDistance(indexedPoints[i], indexedPoints[j]);
      }
    }
  }

  for (let i = 0; i < indexedPoints.length; i++) {
    if (visited.has(i)) continue;

    visited.add(i);
    const neighbors: number[] = [];

    for (let j = 0; j < indexedPoints.length; j++) {
      if (i !== j && distanceMatrix[i][j] <= eps) {
        neighbors.push(j);
      }
    }

    if (neighbors.length >= minPts) {
      const cluster: DataPoint[] = [indexedPoints[i]];
      const queue = [...neighbors];

      while (queue.length > 0) {
        const idx = queue.shift()!;
        if (visited.has(idx)) continue;

        visited.add(idx);
        cluster.push(indexedPoints[idx]);

        const newNeighbors: number[] = [];
        for (let j = 0; j < indexedPoints.length; j++) {
          if (j !== idx && distanceMatrix[idx][j] <= eps) {
            newNeighbors.push(j);
          }
        }

        if (newNeighbors.length >= minPts) {
          for (const n of newNeighbors) {
            if (!visited.has(n)) {
              queue.push(n);
            }
          }
        }
      }

      clusters.push(cluster);
    }
  }

  return clusters;
}

function createClusterFromPoints(
  points: DataPoint[],
  type: 'temperature' | 'humidity' | 'gas' | 'device'
): AnomalyCluster | null {
  if (points.length === 0) return null;

  const timestamps = points.map((p) => p.timestamp);
  const startTime = Math.min(...timestamps);
  const endTime = Math.max(...timestamps);
  const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const avgValue = points.reduce((sum, p) => sum + p.value, 0) / points.length;

  const level = getAnomalyLevel(avgValue, type);

  return {
    id: `${type}-${startTime}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    level,
    startTime,
    endTime,
    dataPoints: points.map((p) => ({ x: p.x, y: p.y, value: p.value })),
    location: { x: avgX, y: avgY },
    deviceId: points[0].deviceId,
  };
}

export function analyzeAnomalies(data: SensorData[]): AnomalyCluster[] {
  const clusters: AnomalyCluster[] = [];

  if (data.length === 0) return clusters;

  const tempAnomalies = detectTemperatureAnomalies(data);
  if (tempAnomalies.length > 0) {
    const tempClusters = dbscanCluster(tempAnomalies);
    tempClusters.forEach((cluster) => {
      const c = createClusterFromPoints(cluster, 'temperature');
      if (c) clusters.push(c);
    });
  }

  const humAnomalies = detectHumidityAnomalies(data);
  if (humAnomalies.length > 0) {
    const humClusters = dbscanCluster(humAnomalies);
    humClusters.forEach((cluster) => {
      const c = createClusterFromPoints(cluster, 'humidity');
      if (c) clusters.push(c);
    });
  }

  const gasAnomalies = detectGasAnomalies(data);
  if (gasAnomalies.length > 0) {
    const gasClusters = dbscanCluster(gasAnomalies);
    gasClusters.forEach((cluster) => {
      const c = createClusterFromPoints(cluster, 'gas');
      if (c) clusters.push(c);
    });
  }

  const deviceAnomalies = detectDeviceAnomalies(data);
  if (deviceAnomalies.length > 0) {
    const deviceClusters = dbscanCluster(deviceAnomalies);
    deviceClusters.forEach((cluster) => {
      const c = createClusterFromPoints(cluster, 'device');
      if (c) clusters.push(c);
    });
  }

  return clusters.sort((a, b) => {
    const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return levelOrder[a.level] - levelOrder[b.level];
  });
}
