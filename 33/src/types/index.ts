export interface SoundingDataPoint {
  pressure: number;
  height: number;
  temperature: number;
  dewPoint: number;
  relativeHumidity: number;
  windSpeed: number;
  windDirection: number;
  uWind: number;
  vWind: number;
  virtualTemperature?: number;
  potentialTemperature?: number;
  equivalentPotentialTemperature?: number;
}

export interface SoundingData {
  stationId: string;
  stationName: string;
  soundingTime: string;
  releaseTime?: string;
  latitude: number;
  longitude: number;
  elevation: number;
  maxHeight: number;
  dataPoints: SoundingDataPoint[];
  dataQuality?: 'good' | 'fair' | 'poor';
}

export interface QueryParams {
  stationId?: string;
  startTime?: string;
  endTime?: string;
  pageNum: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
  pages: number;
}

export interface MeteorologicalIndex {
  name: string;
  value: number;
  unit: string;
  description: string;
  level?: string;
}

export interface SoundingProfile {
  title: string;
  xAxisData: number[];
  yAxisData: number[];
  xAxisLabel: string;
  yAxisLabel: string;
  unit: string;
  color: string;
}

export interface DataQualityReport {
  totalPoints: number;
  validPoints: number;
  invalidPoints: number;
  missingFields: Record<string, number>;
  outliers: Record<string, number[]>;
  qualityScore: number;
}

export interface StationInfo {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  elevation: number;
  wmoId?: string;
  province?: string;
  city?: string;
}

export interface ExportConfig {
  format: 'excel' | 'pdf' | 'csv';
  includeCharts: boolean;
  includeRawData: boolean;
  includeIndices: boolean;
  filename: string;
}
