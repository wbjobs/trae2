import type { PlanktonData } from './plankton';
export type { PlanktonData };

export type StationStatus = 'online' | 'offline' | 'maintenance';

export interface MonitoringStation {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  lakeArea: string;
  status: StationStatus;
  lastUpdate: string;
}

export interface WaterQualityData {
  id: string;
  stationId: string;
  timestamp: string;
  temperature: number;
  ph: number;
  dissolvedOxygen: number;
  conductivity: number;
  turbidity: number;
}

export interface NutrientData {
  id: string;
  stationId: string;
  timestamp: string;
  totalNitrogen: number;
  totalPhosphorus: number;
  ammoniaNitrogen: number;
  nitrateNitrogen: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  startTime?: string;
  endTime?: string;
  stationId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FusedMonitoringData {
  stationId: string;
  stationName: string;
  timestamp: string;
  waterQuality: WaterQualityData;
  nutrient: NutrientData;
  plankton: PlanktonData[];
}

export interface EcoIndexResult {
  stationId: string;
  period: { start: string; end: string };
  shannonIndex: number;
  simpsonIndex: number;
  evennessIndex: number;
  margalefIndex: number;
  trophicLevelIndex: number;
  trophicLevel: 'oligotrophic' | 'mesotrophic' | 'eutrophic' | 'hypertrophic';
  waterQualityLevel: 'excellent' | 'good' | 'moderate' | 'poor' | 'bad';
  totalPhytoplanktonDensity: number;
  totalZooplanktonDensity: number;
  dominantSpecies: string[];
}

export interface ReportConfig {
  title: string;
  period: { start: string; end: string };
  stations: string[];
  indicators: {
    waterQuality: boolean;
    nutrients: boolean;
    plankton: boolean;
    ecoIndex: boolean;
  };
  format: 'excel' | 'pdf' | 'csv';
  includeCharts: boolean;
}

export interface FilterState {
  dateRange: [string, string];
  stationIds: string[];
  species: string[];
  categories: string[];
  indicators: string[];
}

export interface DashboardStats {
  stationCount: number;
  onlineStations: number;
  latestUpdateTime: string;
  avgTemperature: number;
  avgPh: number;
  avgDissolvedOxygen: number;
  avgTotalNitrogen: number;
  avgTotalPhosphorus: number;
  totalPhytoplanktonDensity: number;
  totalZooplanktonDensity: number;
}


