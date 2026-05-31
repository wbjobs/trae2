import type {
  WaterQualityData,
  NutrientData,
  PlanktonData,
  MonitoringStation,
  FusedMonitoringData,
  AggregatedData,
} from '@/types';

const VALUE_RANGES: Record<string, [number, number]> = {
  'waterQuality.temperature': [-10, 40],
  'waterQuality.ph': [0, 14],
  'waterQuality.dissolvedOxygen': [0, 20],
  'waterQuality.conductivity': [0, 2000],
  'waterQuality.turbidity': [0, 1000],
  'nutrient.totalNitrogen': [0, 20],
  'nutrient.totalPhosphorus': [0, 5],
  'nutrient.ammoniaNitrogen': [0, 20],
  'nutrient.nitrateNitrogen': [0, 20],
  'plankton.density': [0, 1000000],
  'plankton.biomass': [0, 10000],
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key] as Record<string, unknown>;
  }, obj);
  target[lastKey] = value;
}

export function fuseData(
  wq: WaterQualityData[],
  nt: NutrientData[],
  pl: PlanktonData[],
  stations: MonitoringStation[],
): FusedMonitoringData[] {
  const stationMap = new Map(stations.map((s) => [s.id, s]));
  const nutrientMap = new Map<string, NutrientData>();
  for (const n of nt) {
    nutrientMap.set(`${n.stationId}_${n.timestamp}`, n);
  }

  const planktonMap = new Map<string, PlanktonData[]>();
  for (const p of pl) {
    const key = `${p.stationId}_${p.timestamp}`;
    if (planktonMap.has(key)) {
      planktonMap.get(key)!.push(p);
    } else {
      planktonMap.set(key, [p]);
    }
  }

  const result: FusedMonitoringData[] = [];

  for (const wqItem of wq) {
    const key = `${wqItem.stationId}_${wqItem.timestamp}`;
    const station = stationMap.get(wqItem.stationId);
    const nutrient = nutrientMap.get(key);
    const plankton = planktonMap.get(key) ?? [];

    if (!station) continue;

    result.push({
      stationId: wqItem.stationId,
      stationName: station.name,
      timestamp: wqItem.timestamp,
      waterQuality: wqItem,
      nutrient: nutrient ?? {
        id: `nt-fallback-${wqItem.id}`,
        stationId: wqItem.stationId,
        timestamp: wqItem.timestamp,
        totalNitrogen: 0,
        totalPhosphorus: 0,
        ammoniaNitrogen: 0,
        nitrateNitrogen: 0,
      },
      plankton,
    });
  }

  return result.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function cleanData(data: FusedMonitoringData[]): FusedMonitoringData[] {
  return data.filter((item) => {
    for (const [field, range] of Object.entries(VALUE_RANGES)) {
      if (field.startsWith('plankton.')) {
        for (const p of item.plankton) {
          const value = getNestedValue({ plankton: p } as unknown as Record<string, unknown>, field);
          if (typeof value === 'number') {
            if (isNaN(value) || value < range[0] || value > range[1]) {
              return false;
            }
          }
        }
      } else {
        const value = getNestedValue(item as unknown as Record<string, unknown>, field);
        if (typeof value === 'number') {
          if (isNaN(value) || value < range[0] || value > range[1]) {
            return false;
          }
        }
      }
    }
    return true;
  });
}

export function normalizeData(data: FusedMonitoringData[], field: string): FusedMonitoringData[] {
  const values: number[] = [];

  for (const item of data) {
    if (field.startsWith('plankton.')) {
      for (const p of item.plankton) {
        const value = getNestedValue({ plankton: p } as unknown as Record<string, unknown>, field);
        if (typeof value === 'number' && !isNaN(value)) {
          values.push(value);
        }
      }
    } else {
      const value = getNestedValue(item as unknown as Record<string, unknown>, field);
      if (typeof value === 'number' && !isNaN(value)) {
        values.push(value);
      }
    }
  }

  if (values.length === 0) return data;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    return data.map((d) => {
      const copy = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
      if (field.startsWith('plankton.')) {
        const plankton = copy.plankton as unknown[];
        for (let i = 0; i < plankton.length; i++) {
          setNestedValue(copy, `plankton.${i}.${field.split('.').slice(1).join('.')}`, 0.5);
        }
      } else {
        setNestedValue(copy, field, 0.5);
      }
      return copy as unknown as FusedMonitoringData;
    });
  }

  return data.map((d) => {
    const copy = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    if (field.startsWith('plankton.')) {
      const planktonField = field.split('.').slice(1).join('.');
      for (let i = 0; i < (copy.plankton as unknown[]).length; i++) {
        const val = getNestedValue(copy, `plankton.${i}.${planktonField}`);
        if (typeof val === 'number' && !isNaN(val)) {
          setNestedValue(copy, `plankton.${i}.${planktonField}`, (val - min) / range);
        }
      }
    } else {
      const val = getNestedValue(copy, field);
      if (typeof val === 'number' && !isNaN(val)) {
        setNestedValue(copy, field, (val - min) / range);
      }
    }
    return copy as unknown as FusedMonitoringData;
  });
}

export function getCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const d1 = xs.slice(0, n);
  const d2 = ys.slice(0, n);

  const mean1 = d1.reduce((a, b) => a + b, 0) / n;
  const mean2 = d2.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = d1[i] - mean1;
    const dy = d2[i] - mean2;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator === 0) return 0;

  return sumXY / denominator;
}

export function aggregateByTime(
  data: FusedMonitoringData[],
  interval: 'day' | 'week' | 'month',
): AggregatedData[] {
  const groups = new Map<string, FusedMonitoringData[]>();

  for (const item of data) {
    const date = new Date(item.timestamp);
    let key: string;

    if (interval === 'day') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } else if (interval === 'week') {
      const janFirst = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((date.getTime() - janFirst.getTime()) / 86400000 + janFirst.getDay() + 1) / 7);
      key = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const groupKey = `${key}_${item.stationId}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  }

  const numericFields = [
    'waterQuality.temperature',
    'waterQuality.ph',
    'waterQuality.dissolvedOxygen',
    'waterQuality.conductivity',
    'waterQuality.turbidity',
    'nutrient.totalNitrogen',
    'nutrient.totalPhosphorus',
    'nutrient.ammoniaNitrogen',
    'nutrient.nitrateNitrogen',
  ];

  const result: AggregatedData[] = [];

  for (const [groupKey, items] of groups) {
    const [timestamp, ...stationParts] = groupKey.split('_');
    const stationId = stationParts.join('_');

    const values: AggregatedData['values'] = {};

    for (const field of numericFields) {
      const fieldValues: number[] = [];
      for (const item of items) {
        const value = getNestedValue(item as unknown as Record<string, unknown>, field);
        if (typeof value === 'number' && !isNaN(value)) {
          fieldValues.push(value);
        }
      }
      if (fieldValues.length > 0) {
        values[field] = {
          avg: fieldValues.reduce((a, b) => a + b, 0) / fieldValues.length,
          min: Math.min(...fieldValues),
          max: Math.max(...fieldValues),
          count: fieldValues.length,
        };
      }
    }

    result.push({ timestamp, stationId, values });
  }

  return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
