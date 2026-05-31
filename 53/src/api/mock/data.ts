import dayjs from 'dayjs';
import type {
  MonitorFactor,
  MonitorSection,
  MonitorData,
  DashboardStats,
  SectionRealtimeData,
  TrendDataPoint,
  ReportData,
} from '../../types';

export const mockFactors: MonitorFactor[] = [
  { id: 'do', name: '溶解氧', unit: 'mg/L', standardMin: 5, standardMax: 100, weight: 0.15, category: '常规指标' },
  { id: 'ph', name: 'PH值', unit: '', standardMin: 6, standardMax: 9, weight: 0.10, category: '常规指标' },
  { id: 'cod', name: '化学需氧量(COD)', unit: 'mg/L', standardMin: 0, standardMax: 20, weight: 0.15, category: '有机污染' },
  { id: 'nh3n', name: '氨氮(NH3-N)', unit: 'mg/L', standardMin: 0, standardMax: 1.0, weight: 0.15, category: '营养盐' },
  { id: 'tp', name: '总磷(TP)', unit: 'mg/L', standardMin: 0, standardMax: 0.2, weight: 0.12, category: '营养盐' },
  { id: 'tn', name: '总氮(TN)', unit: 'mg/L', standardMin: 0, standardMax: 1.5, weight: 0.12, category: '营养盐' },
  { id: 'algae', name: '藻类密度', unit: 'cells/L', standardMin: 0, standardMax: 1000000, weight: 0.10, category: '生物指标' },
  { id: 'chla', name: '叶绿素a', unit: 'μg/L', standardMin: 0, standardMax: 10, weight: 0.11, category: '生物指标' },
];

export const mockSections: MonitorSection[] = [
  { id: 's001', name: '长江大桥断面', longitude: 118.7969, latitude: 32.0617, riverName: '长江', level: 'national', address: '江苏省南京市', setupDate: '2010-03-15' },
  { id: 's002', name: '燕子矶断面', longitude: 118.8312, latitude: 32.1356, riverName: '长江', level: 'provincial', address: '江苏省南京市栖霞区', setupDate: '2012-05-20' },
  { id: 's003', name: '秦淮新河断面', longitude: 118.7783, latitude: 31.9534, riverName: '秦淮河', level: 'city', address: '江苏省南京市雨花台区', setupDate: '2015-08-10' },
  { id: 's004', name: '玄武湖断面', longitude: 118.7969, latitude: 32.0717, riverName: '玄武湖', level: 'provincial', address: '江苏省南京市玄武区', setupDate: '2008-01-01' },
  { id: 's005', name: '石臼湖断面', longitude: 118.9512, latitude: 31.4678, riverName: '石臼湖', level: 'national', address: '江苏省南京市溧水区', setupDate: '2011-11-25' },
  { id: 's006', name: '固城湖断面', longitude: 118.9867, latitude: 31.3456, riverName: '固城湖', level: 'provincial', address: '江苏省南京市高淳区', setupDate: '2013-06-18' },
  { id: 's007', name: '滁河断面', longitude: 118.6234, latitude: 32.1890, riverName: '滁河', level: 'city', address: '江苏省南京市浦口区', setupDate: '2016-04-05' },
  { id: 's008', name: '水阳江断面', longitude: 118.8901, latitude: 31.5678, riverName: '水阳江', level: 'county', address: '江苏省南京市江宁区', setupDate: '2018-09-12' },
];

const getQualityByValue = (factorId: string, value: number): 'excellent' | 'good' | 'moderate' | 'poor' => {
  const factor = mockFactors.find(f => f.id === factorId);
  if (!factor) return 'good';

  if (factorId === 'do') {
    if (value >= 7.5) return 'excellent';
    if (value >= 6) return 'good';
    if (value >= 5) return 'moderate';
    return 'poor';
  }
  if (factorId === 'ph') {
    if (value >= 6.5 && value <= 8.5) return 'excellent';
    if (value >= 6 && value <= 9) return 'good';
    return 'poor';
  }
  if (factorId === 'cod') {
    if (value <= 15) return 'excellent';
    if (value <= 20) return 'good';
    if (value <= 30) return 'moderate';
    return 'poor';
  }
  if (factorId === 'nh3n') {
    if (value <= 0.15) return 'excellent';
    if (value <= 0.5) return 'good';
    if (value <= 1.0) return 'moderate';
    return 'poor';
  }
  if (factorId === 'tp') {
    if (value <= 0.02) return 'excellent';
    if (value <= 0.1) return 'good';
    if (value <= 0.2) return 'moderate';
    return 'poor';
  }
  if (factorId === 'tn') {
    if (value <= 0.2) return 'excellent';
    if (value <= 0.5) return 'good';
    if (value <= 1.5) return 'moderate';
    return 'poor';
  }
  if (factorId === 'algae') {
    if (value <= 100000) return 'excellent';
    if (value <= 300000) return 'good';
    if (value <= 1000000) return 'moderate';
    return 'poor';
  }
  if (factorId === 'chla') {
    if (value <= 2) return 'excellent';
    if (value <= 5) return 'good';
    if (value <= 10) return 'moderate';
    return 'poor';
  }
  return 'good';
};

const generateValue = (factorId: string, qualityBias: number = 0.7): number => {
  const random = Math.random();
  const isGood = random < qualityBias;

  switch (factorId) {
    case 'do':
      return isGood ? 6 + Math.random() * 4 : 3 + Math.random() * 3;
    case 'ph':
      return isGood ? 6.5 + Math.random() * 2 : 5 + Math.random() * 5;
    case 'cod':
      return isGood ? 5 + Math.random() * 15 : 15 + Math.random() * 25;
    case 'nh3n':
      return isGood ? 0.05 + Math.random() * 0.45 : 0.3 + Math.random() * 1.2;
    case 'tp':
      return isGood ? 0.01 + Math.random() * 0.09 : 0.08 + Math.random() * 0.2;
    case 'tn':
      return isGood ? 0.1 + Math.random() * 0.4 : 0.5 + Math.random() * 1.5;
    case 'algae':
      return isGood ? 50000 + Math.random() * 250000 : 200000 + Math.random() * 1000000;
    case 'chla':
      return isGood ? 1 + Math.random() * 4 : 3 + Math.random() * 10;
    default:
      return 0;
  }
};

export const generateMockData = (count: number, days: number = 30): MonitorData[] => {
  const data: MonitorData[] = [];
  const now = dayjs();

  for (let i = 0; i < count; i++) {
    const section = mockSections[Math.floor(Math.random() * mockSections.length)];
    const factor = mockFactors[Math.floor(Math.random() * mockFactors.length)];
    const value = generateValue(factor.id, 0.75);
    const quality = getQualityByValue(factor.id, value);

    data.push({
      id: `data_${Date.now()}_${i}`,
      sectionId: section.id,
      sectionName: section.name,
      factorId: factor.id,
      factorName: factor.name,
      value: Number(value.toFixed(4)),
      unit: factor.unit,
      timestamp: now.subtract(Math.floor(Math.random() * days * 24), 'hour').format('YYYY-MM-DD HH:mm:ss'),
      quality,
      dataStatus: Math.random() > 0.05 ? 'valid' : 'estimated',
      standardValue: factor.standardMax,
      exceedRate: value > factor.standardMax ? ((value - factor.standardMax) / factor.standardMax * 100) : 0,
    });
  }

  return data.sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf());
};

export const mockDashboardStats: DashboardStats = {
  totalSections: 8,
  onlineSections: 7,
  todaySamples: 256,
  excellentRate: 62.5,
  avgWQI: 78.5,
  alertCount: 3,
  trend: {
    wqi: 3.2,
    excellentRate: 5.8,
  },
};

export const generateRealtimeData = (): SectionRealtimeData[] => {
  return mockSections.map(section => {
    const factors = mockFactors.map(factor => {
      const value = generateValue(factor.id, 0.75);
      return {
        factor,
        value: Number(value.toFixed(4)),
        quality: getQualityByValue(factor.id, value),
        updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      };
    });

    const validFactors = factors.filter(f => f.quality !== 'poor');
    const overallQuality = validFactors.length >= factors.length * 0.9 ? 'excellent' :
      validFactors.length >= factors.length * 0.75 ? 'good' :
        validFactors.length >= factors.length * 0.6 ? 'moderate' : 'poor';

    const wqi = Math.round(70 + Math.random() * 25);

    return {
      section,
      factors,
      overallQuality,
      wqi,
    };
  });
};

export const generateTrendData = (factorId: string, sectionId?: string, days: number = 30): TrendDataPoint[] => {
  const data: TrendDataPoint[] = [];
  const now = dayjs();
  const factor = mockFactors.find(f => f.id === factorId);

  for (let i = days; i >= 0; i--) {
    const value = generateValue(factorId, 0.7);
    data.push({
      timestamp: now.subtract(i, 'day').format('YYYY-MM-DD'),
      value: Number(value.toFixed(4)),
      sectionId,
      factorId,
    });
  }

  return data;
};

export const generateReportData = (): ReportData => {
  const now = dayjs();
  const startDate = now.subtract(30, 'day');

  return {
    title: '流域水生态环境监测月报',
    generateTime: now.format('YYYY-MM-DD HH:mm:ss'),
    period: {
      start: startDate.format('YYYY-MM-DD'),
      end: now.format('YYYY-MM-DD'),
    },
    summary: {
      totalRecords: 5824,
      excellentRate: 62.5,
      goodRate: 25.3,
      moderateRate: 9.2,
      poorRate: 3.0,
      avgWQI: 78.5,
    },
    sectionStats: mockSections.slice(0, 5).map(section => ({
      sectionId: section.id,
      sectionName: section.name,
      sampleCount: 600 + Math.floor(Math.random() * 400),
      avgWQI: 70 + Math.floor(Math.random() * 25),
      mainPollutants: ['总磷', '氨氮'].slice(0, Math.floor(Math.random() * 2) + 1),
    })),
    factorStats: mockFactors.map(factor => ({
      factorId: factor.id,
      factorName: factor.name,
      avgValue: generateValue(factor.id, 0.8),
      maxValue: generateValue(factor.id, 0.5),
      minValue: generateValue(factor.id, 0.9),
      exceedRate: Math.random() * 15,
    })),
    trendData: generateTrendData('wqi', undefined, 30).map(d => ({
      ...d,
      value: 70 + Math.random() * 25,
    })),
  };
};
