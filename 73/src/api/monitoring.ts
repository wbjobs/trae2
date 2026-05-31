import type {
  MonitoringStation,
  WaterQualityData,
  NutrientData,
  PlanktonData,
  FusedMonitoringData,
  PaginationParams,
  PaginatedResponse,
  DashboardStats,
} from '@/types';
import {
  stations,
  waterQualityData,
  nutrientData,
  planktonData,
  fusedMonitoringData,
} from '@/mock';

function delay(ms: number = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function filterByTimeAndStation<T extends { timestamp: string; stationId?: string }>(
  data: T[],
  params: PaginationParams
): T[] {
  let filtered = data;
  if (params.startTime) {
    filtered = filtered.filter((item) => item.timestamp >= params.startTime!);
  }
  if (params.endTime) {
    filtered = filtered.filter((item) => item.timestamp <= params.endTime!);
  }
  if (params.stationId) {
    filtered = filtered.filter((item) => 'stationId' in item && item.stationId === params.stationId);
  }
  return filtered;
}

function paginate<T>(data: T[], params: PaginationParams): PaginatedResponse<T> {
  const total = data.length;
  const totalPages = Math.ceil(total / params.pageSize);
  const start = (params.page - 1) * params.pageSize;
  const pageData = data.slice(start, start + params.pageSize);
  return {
    data: pageData,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
  };
}

export async function getStations(): Promise<MonitoringStation[]> {
  await delay();
  return stations;
}

export async function getWaterQualityData(
  params: PaginationParams
): Promise<PaginatedResponse<WaterQualityData>> {
  await delay();
  const filtered = filterByTimeAndStation(waterQualityData, params);
  return paginate(filtered, params);
}

export async function getNutrientData(
  params: PaginationParams
): Promise<PaginatedResponse<NutrientData>> {
  await delay();
  const filtered = filterByTimeAndStation(nutrientData, params);
  return paginate(filtered, params);
}

export async function getPlanktonData(
  params: PaginationParams
): Promise<PaginatedResponse<PlanktonData>> {
  await delay();
  const filtered = filterByTimeAndStation(planktonData, params);
  return paginate(filtered, params);
}

export async function getFusedMonitoringData(
  params: PaginationParams
): Promise<PaginatedResponse<FusedMonitoringData>> {
  await delay();
  const filtered = filterByTimeAndStation(fusedMonitoringData, params);
  return paginate(filtered, params);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await delay();
  const onlineStations = stations.filter((s) => s.status === 'online').length;
  const latestUpdateTime = stations
    .reduce((latest, s) => (s.lastUpdate > latest ? s.lastUpdate : latest), '');
  const avgTemperature =
    waterQualityData.reduce((sum, d) => sum + d.temperature, 0) / waterQualityData.length;
  const avgPh = waterQualityData.reduce((sum, d) => sum + d.ph, 0) / waterQualityData.length;
  const avgDissolvedOxygen =
    waterQualityData.reduce((sum, d) => sum + d.dissolvedOxygen, 0) / waterQualityData.length;
  const avgTotalNitrogen =
    nutrientData.reduce((sum, d) => sum + d.totalNitrogen, 0) / nutrientData.length;
  const avgTotalPhosphorus =
    nutrientData.reduce((sum, d) => sum + d.totalPhosphorus, 0) / nutrientData.length;
  const totalPhytoplanktonDensity = planktonData
    .filter((d) => d.category === 'phytoplankton')
    .reduce((sum, d) => sum + d.density, 0);
  const totalZooplanktonDensity = planktonData
    .filter((d) => d.category === 'zooplankton')
    .reduce((sum, d) => sum + d.density, 0);

  return {
    stationCount: stations.length,
    onlineStations,
    latestUpdateTime,
    avgTemperature: Math.round(avgTemperature * 100) / 100,
    avgPh: Math.round(avgPh * 100) / 100,
    avgDissolvedOxygen: Math.round(avgDissolvedOxygen * 100) / 100,
    avgTotalNitrogen: Math.round(avgTotalNitrogen * 100) / 100,
    avgTotalPhosphorus: Math.round(avgTotalPhosphorus * 100) / 100,
    totalPhytoplanktonDensity: Math.round(totalPhytoplanktonDensity),
    totalZooplanktonDensity: Math.round(totalZooplanktonDensity),
  };
}
