import type { StationFlow, StationStats } from '../types.js';
import { getStations } from '../data-generator.js';

export interface RankedStation {
  stationId: string;
  stationName: string;
  lineId: string;
  lineName: string;
  totalFlow: number;
  avgFlowPerHour: number;
  peakFlow: number;
  growthRate: number;
  rank: number;
  prevRank: number;
  rankChange: number;
  alertCount: number;
}

export interface RankingResult {
  timestamp: number;
  rankings: RankedStation[];
  topGainers: RankedStation[];
  topLosers: RankedStation[];
  mostAlerted: RankedStation[];
}

let previousRankings: Map<string, number> = new Map();

export function calculateRankings(
  currentData: StationFlow[],
  historicalData: StationFlow[],
  alertCount: Map<string, number>
): RankingResult {
  const stations = getStations();
  const now = Date.now();

  const stationStats: Map<string, {
    totalFlow: number;
    avgFlowPerHour: number;
    peakFlow: number;
    prevTotalFlow: number;
    growthRate: number;
  }> = new Map();

  const currentStationFlows: Record<string, number> = {};
  currentData.forEach(d => {
    currentStationFlows[d.stationId] = (currentStationFlows[d.stationId] || 0) + d.totalFlow;
  });

  const historicalStationFlows: Record<string, number[]> = {};
  historicalData.forEach(d => {
    if (!historicalStationFlows[d.stationId]) {
      historicalStationFlows[d.stationId] = [];
    }
    historicalStationFlows[d.stationId].push(d.totalFlow);
  });

  stations.forEach(station => {
    const currentFlow = currentStationFlows[station.stationId] || 0;
    const historicalFlows = historicalStationFlows[station.stationId] || [];
    const prevTotalFlow = historicalFlows.length > 0
      ? historicalFlows.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, historicalFlows.length)
      : currentFlow;

    const growthRate = prevTotalFlow > 0
      ? Math.round(((currentFlow - prevTotalFlow) / prevTotalFlow) * 100) / 100
      : 0;

    stationStats.set(station.stationId, {
      totalFlow: currentFlow,
      avgFlowPerHour: currentFlow,
      peakFlow: historicalFlows.length > 0 ? Math.max(...historicalFlows) : currentFlow,
      prevTotalFlow,
      growthRate
    });
  });

  const rankedList = stations.map(station => {
    const stats = stationStats.get(station.stationId)!;
    const prevRank = previousRankings.get(station.stationId) || 0;

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      lineId: station.lineId,
      lineName: station.lineName,
      totalFlow: stats.totalFlow,
      avgFlowPerHour: stats.avgFlowPerHour,
      peakFlow: stats.peakFlow,
      growthRate: stats.growthRate,
      rank: 0,
      prevRank,
      rankChange: 0,
      alertCount: alertCount.get(station.stationId) || 0
    };
  });

  rankedList.sort((a, b) => b.totalFlow - a.totalFlow);
  rankedList.forEach((station, index) => {
    station.rank = index + 1;
    station.rankChange = station.prevRank > 0 ? station.prevRank - station.rank : 0;
  });

  rankedList.forEach(station => {
    previousRankings.set(station.stationId, station.rank);
  });

  const sortedByGrowth = [...rankedList].sort((a, b) => b.growthRate - a.growthRate);
  const topGainers = sortedByGrowth.filter(s => s.growthRate > 0).slice(0, 5);
  const topLosers = sortedByGrowth.filter(s => s.growthRate < 0).slice(-5).reverse();

  const mostAlerted = [...rankedList]
    .filter(s => s.alertCount > 0)
    .sort((a, b) => b.alertCount - a.alertCount)
    .slice(0, 5);

  return {
    timestamp: now,
    rankings: rankedList,
    topGainers,
    topLosers,
    mostAlerted
  };
}

export function calculateStationRankings(
  stationStats: StationStats[]
): RankedStation[] {
  const rankedList = stationStats.map((stat, index) => {
    const prevRank = previousRankings.get(stat.stationId) || 0;
    return {
      stationId: stat.stationId,
      stationName: stat.stationName,
      lineId: '',
      lineName: '',
      totalFlow: stat.totalFlowToday,
      avgFlowPerHour: stat.avgFlowPerHour,
      peakFlow: stat.peakFlow,
      growthRate: 0,
      rank: 0,
      prevRank,
      rankChange: 0,
      alertCount: stat.alertCount
    };
  });

  rankedList.sort((a, b) => b.totalFlow - a.totalFlow);
  rankedList.forEach((station, index) => {
    station.rank = index + 1;
    station.rankChange = station.prevRank > 0 ? station.prevRank - station.rank : 0;
  });

  rankedList.forEach(station => {
    previousRankings.set(station.stationId, station.rank);
  });

  return rankedList;
}
