export type { PlanktonData, PlanktonCategory } from './plankton';
export type {
  StationStatus,
  MonitoringStation,
  WaterQualityData,
  NutrientData,
  PaginationParams,
  PaginatedResponse,
  FilterState,
  FusedMonitoringData,
  EcoIndexResult,
  ReportConfig,
  DashboardStats,
} from './monitoring';

export interface AggregatedData {
  timestamp: string;
  stationId: string;
  values: Record<string, { avg: number; min: number; max: number; count: number }>;
}
