export type WaterQuality = 'excellent' | 'good' | 'moderate' | 'poor';

export type DataStatus = 'valid' | 'invalid' | 'estimated';

export interface AnomalyRange {
  id: string;
  factorId: string;
  factorName: string;
  sectionId?: string;
  sectionName?: string;
  startTime: string;
  endTime: string;
  minValue: number;
  maxValue: number;
  type: 'exceed_standard' | 'sudden_change' | 'missing_data' | 'abnormal_trend';
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'active' | 'resolved' | 'acknowledged';
}

export interface ComparisonData {
  sectionId: string;
  sectionName: string;
  factorId: string;
  factorName: string;
  avgValue: number;
  maxValue: number;
  minValue: number;
  stdDev: number;
  exceedRate: number;
  trend: number;
  dataPoints: TrendDataPoint[];
}

export interface AnomalyDetectionParams {
  factorIds?: string[];
  sectionIds?: string[];
  startTime?: string;
  endTime?: string;
  threshold?: number;
  windowSize?: number;
}

export interface MonitorFactor {
  id: string;
  name: string;
  unit: string;
  standardMin: number;
  standardMax: number;
  weight?: number;
  category?: string;
}

export interface MonitorSection {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  riverName: string;
  level: 'national' | 'provincial' | 'city' | 'county';
  address?: string;
  setupDate?: string;
}

export interface MonitorData {
  id: string;
  sectionId: string;
  sectionName: string;
  factorId: string;
  factorName: string;
  value: number;
  unit: string;
  timestamp: string;
  quality: WaterQuality;
  dataStatus: DataStatus;
  standardValue?: number;
  exceedRate?: number;
}

export interface FusedData {
  sectionId: string;
  sectionName: string;
  timestamp: string;
  factors: Record<string, number>;
  quality: WaterQuality;
  overallScore: number;
}

export interface QueryParams {
  page: number;
  pageSize: number;
  sectionId?: string;
  factorId?: string;
  startTime?: string;
  endTime?: string;
  quality?: WaterQuality;
  riverName?: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  sectionId?: string;
  factorId?: string;
}

export interface WQICalculateParams {
  factorValues: Record<string, number>;
  weights?: Record<string, number>;
}

export interface WQIResult {
  score: number;
  level: WaterQuality;
  levelText: string;
  factorScores: Record<string, number>;
}

export interface TLIResult {
  score: number;
  level: 'oligotrophic' | 'mesotrophic' | 'light_eutrophic' | 'mid_eutrophic' | 'hyper_eutrophic';
  levelText: string;
  factorScores: Record<string, number>;
}

export interface EcoHealthResult {
  overallScore: number;
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
  dimensions: {
    waterQuality: number;
    biodiversity: number;
    habitat: number;
    ecosystemFunction: number;
  };
}

export interface ReportParams {
  reportType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
  startTime: string;
  endTime: string;
  sectionIds?: string[];
  factorIds?: string[];
  includeCharts?: boolean;
  format: 'excel' | 'pdf';
}

export interface ReportData {
  title: string;
  generateTime: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalRecords: number;
    excellentRate: number;
    goodRate: number;
    moderateRate: number;
    poorRate: number;
    avgWQI: number;
  };
  sectionStats: Array<{
    sectionId: string;
    sectionName: string;
    sampleCount: number;
    avgWQI: number;
    mainPollutants: string[];
  }>;
  factorStats: Array<{
    factorId: string;
    factorName: string;
    avgValue: number;
    maxValue: number;
    minValue: number;
    exceedRate: number;
  }>;
  trendData: TrendDataPoint[];
}

export interface DashboardStats {
  totalSections: number;
  onlineSections: number;
  todaySamples: number;
  excellentRate: number;
  avgWQI: number;
  alertCount: number;
  trend: {
    wqi: number;
    excellentRate: number;
  };
}

export interface SectionRealtimeData {
  section: MonitorSection;
  factors: Array<{
    factor: MonitorFactor;
    value: number;
    quality: WaterQuality;
    updateTime: string;
  }>;
  overallQuality: WaterQuality;
  wqi: number;
}
