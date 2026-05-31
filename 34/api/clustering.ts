import type { StationFlow, ClusterResult, TimeSeriesFeature } from './types.js';
import { getStations } from './data-generator.js';
import { extractTimeSeriesFeatures } from './features/index.js';

interface ClusterCentroid {
  id: number;
  name: string;
  features: number[];
  stationCount: number;
}

const clusterDefinitions = [
  {
    name: '通勤核心站点',
    criteria: (f: number[]) => f[0] > 0.7 && f[3] >= 0.25 && f[3] <= 0.375
  },
  {
    name: '商务中心站点',
    criteria: (f: number[]) => f[0] > 0.6 && f[3] >= 0.375 && f[3] <= 0.5
  },
  {
    name: '居住型站点',
    criteria: (f: number[]) => f[0] > 0.4 && f[3] >= 0.25 && f[3] <= 0.33 && f[2] > 0.5
  },
  {
    name: '旅游景点站点',
    criteria: (f: number[]) => f[0] > 0.5 && f[4] > 0.3
  },
  {
    name: '郊区站点',
    criteria: (f: number[]) => f[0] <= 0.5
  }
];

export function performClustering(historicalData: StationFlow[]): ClusterResult[] {
  const stations = getStations();
  const features: { stationId: string; features: number[]; timeSeries: TimeSeriesFeature }[] = [];

  stations.forEach(station => {
    const timeSeriesFeature = extractTimeSeriesFeatures(station.stationId, historicalData);
    const featureVector = createFeatureVector(timeSeriesFeature);
    features.push({ stationId: station.stationId, features: featureVector, timeSeries: timeSeriesFeature });
  });

  const centroids = initializeCentroidsDeterministic(features);
  const assignments = kMeansClustering(features.map(f => ({ stationId: f.stationId, features: f.features })), centroids);

  const clusterStats = calculateClusterStats(features, assignments);
  const nameMapping = assignClusterNames(clusterStats);

  return assignments.map(assignment => {
    const station = stations.find(s => s.stationId === assignment.stationId)!;
    const featureData = features.find(f => f.stationId === assignment.stationId)!;
    const centroid = centroids.find(c => c.id === assignment.clusterId)!;

    return {
      stationId: assignment.stationId,
      stationName: station.stationName,
      clusterId: assignment.clusterId,
      clusterName: nameMapping[assignment.clusterId] || `聚类 ${assignment.clusterId + 1}`,
      features: featureData.features,
      distanceToCentroid: calculateDistance(featureData.features, centroid.features),
      avgFlow: featureData.timeSeries.avgFlow,
      peakHours: featureData.timeSeries.peakHours
    };
  });
}

function createFeatureVector(feature: TimeSeriesFeature): number[] {
  const normalizedAvg = Math.min(feature.avgFlow / 2500, 1);
  const normalizedPeak = Math.min(feature.maxFlow / 3500, 1);
  const normalizedStd = Math.min(feature.stdDev / 600, 1);
  const peakHourFactor = feature.peakHours.length > 0 ? feature.peakHours[0] / 24 : 0.5;
  const anomalyFactor = Math.min(feature.anomalies.length / 15, 1);
  const morningPeakWeight = feature.peakHours.some(h => h >= 6 && h <= 9) ? 1 : 0;
  const eveningPeakWeight = feature.peakHours.some(h => h >= 17 && h <= 20) ? 1 : 0;

  return [
    normalizedAvg,
    normalizedPeak,
    normalizedStd,
    peakHourFactor,
    anomalyFactor,
    morningPeakWeight,
    eveningPeakWeight
  ];
}

function initializeCentroidsDeterministic(features: { stationId: string; features: number[] }[]): ClusterCentroid[] {
  const sortedByFlow = [...features].sort((a, b) => b.features[0] - a.features[0]);

  const k = 5;
  const centroids: ClusterCentroid[] = [];
  const step = Math.floor(sortedByFlow.length / k);

  for (let i = 0; i < k; i++) {
    const index = Math.min(i * step, sortedByFlow.length - 1);
    centroids.push({
      id: i,
      name: `聚类 ${i + 1}`,
      features: [...sortedByFlow[index].features],
      stationCount: 0
    });
  }

  return centroids;
}

function kMeansClustering(
  features: { stationId: string; features: number[] }[],
  centroids: ClusterCentroid[]
): { stationId: string; clusterId: number }[] {
  let assignments = features.map(f => ({
    stationId: f.stationId,
    clusterId: findClosestCentroid(f.features, centroids)
  }));

  const maxIterations = 30;
  let prevAssignments: Map<string, number> = new Map();

  for (let iter = 0; iter < maxIterations; iter++) {
    const currentHash = assignments.map(a => `${a.stationId}:${a.clusterId}`).join(',');
    const prevHash = Array.from(prevAssignments.entries()).map(([k, v]) => `${k}:${v}`).join(',');

    if (currentHash === prevHash && iter > 3) break;

    prevAssignments = new Map(assignments.map(a => [a.stationId, a.clusterId]));

    const newCentroids = updateCentroids(features, assignments, centroids);
    const newAssignments = features.map(f => ({
      stationId: f.stationId,
      clusterId: findClosestCentroid(f.features, newCentroids)
    }));

    assignments = newAssignments;
    for (let i = 0; i < centroids.length; i++) {
      centroids[i].features = newCentroids[i].features;
    }
  }

  return assignments;
}

function findClosestCentroid(features: number[], centroids: ClusterCentroid[]): number {
  let minDist = Infinity;
  let closestId = 0;

  centroids.forEach(centroid => {
    const dist = calculateWeightedDistance(features, centroid.features);
    if (dist < minDist) {
      minDist = dist;
      closestId = centroid.id;
    }
  });

  return closestId;
}

function calculateWeightedDistance(a: number[], b: number[]): number {
  const weights = [2.0, 1.5, 1.0, 2.5, 0.5, 1.5, 1.5];
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += weights[i] * Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

function calculateDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

function updateCentroids(
  features: { stationId: string; features: number[] }[],
  assignments: { stationId: string; clusterId: number }[],
  centroids: ClusterCentroid[]
): ClusterCentroid[] {
  return centroids.map(centroid => {
    const clusterFeatures = features.filter(f => {
      const assignment = assignments.find(a => a.stationId === f.stationId);
      return assignment?.clusterId === centroid.id;
    });

    if (clusterFeatures.length === 0) {
      return { ...centroid, stationCount: 0 };
    }

    const avgFeatures = new Array(centroid.features.length).fill(0);
    clusterFeatures.forEach(f => {
      f.features.forEach((val, i) => {
        avgFeatures[i] += val;
      });
    });

    return {
      ...centroid,
      features: avgFeatures.map(v => v / clusterFeatures.length),
      stationCount: clusterFeatures.length
    };
  });
}

function calculateClusterStats(
  features: { stationId: string; features: number[] }[],
  assignments: { stationId: string; clusterId: number }[]
): Map<number, { avgFlow: number; peakHour: number; stdDev: number; stationCount: number }> {
  const stats = new Map<number, { avgFlow: number; peakHour: number; stdDev: number; stationCount: number }>();

  const groups = new Map<number, number[][]>();

  assignments.forEach(assignment => {
    const feature = features.find(f => f.stationId === assignment.stationId);
    if (feature) {
      if (!groups.has(assignment.clusterId)) {
        groups.set(assignment.clusterId, []);
      }
      groups.get(assignment.clusterId)!.push(feature.features);
    }
  });

  groups.forEach((groupFeatures, clusterId) => {
    const avgFlow = groupFeatures.reduce((sum, f) => sum + f[0], 0) / groupFeatures.length;
    const peakHour = groupFeatures.reduce((sum, f) => sum + f[3], 0) / groupFeatures.length;
    const stdDev = groupFeatures.reduce((sum, f) => sum + f[2], 0) / groupFeatures.length;

    stats.set(clusterId, {
      avgFlow,
      peakHour,
      stdDev,
      stationCount: groupFeatures.length
    });
  });

  return stats;
}

function assignClusterNames(stats: Map<number, { avgFlow: number; peakHour: number; stdDev: number; stationCount: number }>): Record<number, string> {
  const mapping: Record<number, string> = {};
  const usedNames = new Set<string>();

  const sortedClusters = Array.from(stats.entries()).sort((a, b) => b[1].avgFlow - a[1].avgFlow);

  sortedClusters.forEach(([clusterId, stat]) => {
    const featureVector = [stat.avgFlow, 0, stat.stdDev, stat.peakHour, 0];

    let assigned = false;
    for (const def of clusterDefinitions) {
      if (!usedNames.has(def.name) && def.criteria(featureVector)) {
        mapping[clusterId] = def.name;
        usedNames.add(def.name);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const availableNames = clusterDefinitions.map(d => d.name).filter(n => !usedNames.has(n));
      if (availableNames.length > 0) {
        mapping[clusterId] = availableNames[0];
        usedNames.add(availableNames[0]);
      } else {
        mapping[clusterId] = `聚类 ${clusterId + 1}`;
      }
    }
  });

  return mapping;
}
