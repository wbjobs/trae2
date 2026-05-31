import type {
  MonitorFactor,
  MonitorSection,
  MonitorData,
  QueryParams,
  PageResult,
  DashboardStats,
  SectionRealtimeData,
  TrendDataPoint,
  WQICalculateParams,
  WQIResult,
  TLIResult,
  ReportParams,
  ReportData,
} from '../types';
import {
  mockFactors,
  mockSections,
  generateMockData,
  mockDashboardStats,
  generateRealtimeData,
  generateTrendData,
  generateReportData,
} from './mock/data';

export const getFactors = (): Promise<MonitorFactor[]> => {
  return Promise.resolve(mockFactors);
};

export const getSections = (): Promise<MonitorSection[]> => {
  return Promise.resolve(mockSections);
};

export const getDashboardStats = (): Promise<DashboardStats> => {
  return Promise.resolve(mockDashboardStats);
};

export const getRealtimeData = (): Promise<SectionRealtimeData[]> => {
  return Promise.resolve(generateRealtimeData());
};

export const getHistoryData = (params: QueryParams): Promise<PageResult<MonitorData>> => {
  const allData = generateMockData(1000, 90);
  let filteredData = [...allData];

  if (params.sectionId) {
    filteredData = filteredData.filter(d => d.sectionId === params.sectionId);
  }
  if (params.factorId) {
    filteredData = filteredData.filter(d => d.factorId === params.factorId);
  }
  if (params.quality) {
    filteredData = filteredData.filter(d => d.quality === params.quality);
  }
  if (params.startTime) {
    filteredData = filteredData.filter(d => d.timestamp >= params.startTime!);
  }
  if (params.endTime) {
    filteredData = filteredData.filter(d => d.timestamp <= params.endTime!);
  }
  if (params.riverName) {
    const sectionIds = mockSections
      .filter(s => s.riverName.includes(params.riverName!))
      .map(s => s.id);
    filteredData = filteredData.filter(d => sectionIds.includes(d.sectionId));
  }

  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;
  const pageData = filteredData.slice(start, end);

  return Promise.resolve({
    list: pageData,
    total: filteredData.length,
    page: params.page,
    pageSize: params.pageSize,
  });
};

export const getTrendData = (
  factorId: string,
  sectionId?: string,
  days: number = 30
): Promise<TrendDataPoint[]> => {
  return Promise.resolve(generateTrendData(factorId, sectionId, days));
};

export const getMultiTrendData = (
  factorIds: string[],
  sectionId?: string,
  days: number = 30
): Promise<Record<string, TrendDataPoint[]>> => {
  const result: Record<string, TrendDataPoint[]> = {};
  factorIds.forEach(id => {
    result[id] = generateTrendData(id, sectionId, days);
  });
  return Promise.resolve(result);
};

export const calculateWQI = (params: WQICalculateParams): Promise<WQIResult> => {
  const factorScores: Record<string, number> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  Object.entries(params.factorValues).forEach(([factorId, value]) => {
    const factor = mockFactors.find(f => f.id === factorId);
    if (!factor) return;

    const weight = params.weights?.[factorId] || factor.weight || 0.1;
    let score = 0;

    switch (factorId) {
      case 'do':
        score = value >= 7.5 ? 100 : value >= 6 ? 80 : value >= 5 ? 60 : 40;
        break;
      case 'ph':
        score = (value >= 6.5 && value <= 8.5) ? 100 : (value >= 6 && value <= 9) ? 80 : 50;
        break;
      case 'cod':
        score = value <= 15 ? 100 : value <= 20 ? 80 : value <= 30 ? 60 : 40;
        break;
      case 'nh3n':
        score = value <= 0.15 ? 100 : value <= 0.5 ? 80 : value <= 1.0 ? 60 : 40;
        break;
      case 'tp':
        score = value <= 0.02 ? 100 : value <= 0.1 ? 80 : value <= 0.2 ? 60 : 40;
        break;
      case 'tn':
        score = value <= 0.2 ? 100 : value <= 0.5 ? 80 : value <= 1.5 ? 60 : 40;
        break;
      default:
        score = 70 + Math.random() * 20;
    }

    factorScores[factorId] = score;
    weightedSum += score * weight;
    totalWeight += weight;
  });

  const finalScore = Math.round(weightedSum / totalWeight);
  let level: 'excellent' | 'good' | 'moderate' | 'poor' = 'good';
  let levelText = '良好';

  if (finalScore >= 90) {
    level = 'excellent';
    levelText = '优';
  } else if (finalScore >= 70) {
    level = 'good';
    levelText = '良好';
  } else if (finalScore >= 50) {
    level = 'moderate';
    levelText = '轻度污染';
  } else {
    level = 'poor';
    levelText = '重度污染';
  }

  return Promise.resolve({
    score: finalScore,
    level,
    levelText,
    factorScores,
  });
};

export const calculateTLI = (
  chla: number,
  tp: number,
  tn: number,
  cod: number,
  sd: number = 1.5
): Promise<TLIResult> => {
  const tliChl = 10 * (2.5 + 1.086 * Math.log(chla || 1));
  const tliTp = 10 * (9.436 + 1.624 * Math.log(tp || 0.01));
  const tliTn = 10 * (5.453 + 1.694 * Math.log(tn || 0.1));
  const tliCod = 10 * (0.109 + 2.661 * Math.log(cod || 1));
  const tliSd = 10 * (5.118 - 1.94 * Math.log(sd || 1));

  const weights = { chl: 0.27, tp: 0.18, tn: 0.18, cod: 0.19, sd: 0.18 };
  const score = Math.round(
    tliChl * weights.chl +
    tliTp * weights.tp +
    tliTn * weights.tn +
    tliCod * weights.cod +
    tliSd * weights.sd
  );

  let level: TLIResult['level'] = 'mesotrophic';
  let levelText = '中营养';

  if (score < 30) {
    level = 'oligotrophic';
    levelText = '贫营养';
  } else if (score < 50) {
    level = 'mesotrophic';
    levelText = '中营养';
  } else if (score < 60) {
    level = 'light_eutrophic';
    levelText = '轻度富营养';
  } else if (score < 70) {
    level = 'mid_eutrophic';
    levelText = '中度富营养';
  } else {
    level = 'hyper_eutrophic';
    levelText = '重度富营养';
  }

  return Promise.resolve({
    score,
    level,
    levelText,
    factorScores: {
      chla: tliChl,
      tp: tliTp,
      tn: tliTn,
      cod: tliCod,
      sd: tliSd,
    },
  });
};

export const generateReport = (params: ReportParams): Promise<ReportData> => {
  return Promise.resolve(generateReportData());
};

export const exportReport = (params: ReportParams): Promise<Blob> => {
  console.log('Export report:', params);
  return Promise.resolve(new Blob(['mock report data'], { type: 'application/octet-stream' }));
};

export const evaluateEcoHealth = (params: {
  sectionId: string;
  wqi: number;
  tli: number;
  biodiversityIndex: number;
  habitatScore: number;
}): Promise<any> => {
  const waterQuality = params.wqi;
  const biodiversity = params.biodiversityIndex * 100;
  const habitat = params.habitatScore;
  const ecologicalFunction = 75 + Math.random() * 15;

  const weights = { waterQuality: 0.35, biodiversity: 0.25, habitat: 0.2, ecologicalFunction: 0.2 };
  const score = Math.round(
    waterQuality * weights.waterQuality +
    biodiversity * weights.biodiversity +
    habitat * weights.habitat +
    ecologicalFunction * weights.ecologicalFunction
  );

  let level = '良好';
  if (score >= 85) level = '健康';
  else if (score >= 70) level = '良好';
  else if (score >= 55) level = '一般';
  else level = '较差';

  return Promise.resolve({
    score,
    level,
    subScores: {
      waterQuality: Math.round(waterQuality),
      biodiversity: Math.round(biodiversity),
      habitat: Math.round(habitat),
      ecologicalFunction: Math.round(ecologicalFunction),
    },
  });
};
