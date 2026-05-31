import type { WaterQualityData, NutrientData, FusedMonitoringData } from '../types/monitoring';
import type { PlanktonData } from '../types/plankton';
import { stations } from './stations';
import { planktonData } from './planktonData';

const stationIds = [
  'station-001',
  'station-002',
  'station-003',
  'station-004',
  'station-005',
  'station-006',
  'station-007',
  'station-008',
];

const stationNutrientProfiles: Record<string, { tnBase: number; tpBase: number; nh3Base: number; no3Base: number }> = {
  'station-001': { tnBase: 3.2, tpBase: 0.18, nh3Base: 0.45, no3Base: 1.8 },
  'station-002': { tnBase: 2.1, tpBase: 0.10, nh3Base: 0.25, no3Base: 1.2 },
  'station-003': { tnBase: 3.8, tpBase: 0.22, nh3Base: 0.55, no3Base: 2.0 },
  'station-004': { tnBase: 2.5, tpBase: 0.12, nh3Base: 0.30, no3Base: 1.4 },
  'station-005': { tnBase: 5.2, tpBase: 0.35, nh3Base: 0.80, no3Base: 2.8 },
  'station-006': { tnBase: 4.1, tpBase: 0.28, nh3Base: 0.65, no3Base: 2.2 },
  'station-007': { tnBase: 1.8, tpBase: 0.08, nh3Base: 0.18, no3Base: 0.9 },
  'station-008': { tnBase: 2.0, tpBase: 0.09, nh3Base: 0.20, no3Base: 1.0 },
};

function getTemperature(month: number): number {
  const temps = [5.2, 6.1, 10.5, 16.3, 22.8, 27.4, 30.1, 29.6, 25.2, 18.7, 12.3, 6.8];
  return temps[month - 1] + (Math.random() - 0.5) * 2;
}

function getPH(temperature: number): number {
  return 7.2 + (temperature - 18) * 0.02 + (Math.random() - 0.5) * 0.3;
}

function getDissolvedOxygen(temperature: number): number {
  const base = 14.6 - 0.36 * temperature;
  return base + (Math.random() - 0.5) * 1.5;
}

function getConductivity(stationId: string): number {
  const bases: Record<string, number> = {
    'station-001': 450,
    'station-002': 380,
    'station-003': 520,
    'station-004': 410,
    'station-005': 680,
    'station-006': 590,
    'station-007': 280,
    'station-008': 310,
  };
  return bases[stationId] + (Math.random() - 0.5) * 60;
}

function getTurbidity(month: number, stationId: string): number {
  const seasonFactor = month >= 6 && month <= 9 ? 1.5 : 1.0;
  const bases: Record<string, number> = {
    'station-001': 25,
    'station-002': 15,
    'station-003': 30,
    'station-004': 18,
    'station-005': 40,
    'station-006': 35,
    'station-007': 20,
    'station-008': 22,
  };
  return bases[stationId] * seasonFactor + (Math.random() - 0.5) * 10;
}

function getNutrientSeasonFactor(month: number): number {
  if (month >= 5 && month <= 8) return 1.3;
  if (month >= 3 && month <= 4) return 1.1;
  if (month >= 9 && month <= 10) return 1.15;
  return 0.85;
}

let waterQualityId = 0;
let nutrientId = 0;

export const waterQualityData: WaterQualityData[] = [];
export const nutrientData: NutrientData[] = [];

for (const stationId of stationIds) {
  for (let month = 1; month <= 12; month++) {
    const timestamp = `2024-${String(month).padStart(2, '0')}-15T08:00:00Z`;
    const temp = getTemperature(month);

    waterQualityData.push({
      id: `wq-${String(++waterQualityId).padStart(3, '0')}`,
      stationId,
      timestamp,
      temperature: Math.round(temp * 10) / 10,
      ph: Math.round(getPH(temp) * 100) / 100,
      dissolvedOxygen: Math.round(getDissolvedOxygen(temp) * 100) / 100,
      conductivity: Math.round(getConductivity(stationId) * 10) / 10,
      turbidity: Math.round(getTurbidity(month, stationId) * 10) / 10,
    });

    const profile = stationNutrientProfiles[stationId];
    const seasonFactor = getNutrientSeasonFactor(month);

    nutrientData.push({
      id: `nt-${String(++nutrientId).padStart(3, '0')}`,
      stationId,
      timestamp,
      totalNitrogen: Math.round((profile.tnBase * seasonFactor + (Math.random() - 0.5) * 0.5) * 100) / 100,
      totalPhosphorus: Math.round((profile.tpBase * seasonFactor + (Math.random() - 0.5) * 0.05) * 1000) / 1000,
      ammoniaNitrogen: Math.round((profile.nh3Base * seasonFactor + (Math.random() - 0.5) * 0.1) * 100) / 100,
      nitrateNitrogen: Math.round((profile.no3Base * seasonFactor + (Math.random() - 0.5) * 0.3) * 100) / 100,
    });
  }
}

export const fusedMonitoringData: FusedMonitoringData[] = (() => {
  const nutrientByStationTime = new Map<string, NutrientData>();
  for (const nt of nutrientData) {
    nutrientByStationTime.set(`${nt.stationId}_${nt.timestamp}`, nt);
  }

  const planktonByStationTime = new Map<string, PlanktonData[]>();
  for (const pl of planktonData) {
    const key = `${pl.stationId}_${pl.timestamp}`;
    if (planktonByStationTime.has(key)) {
      planktonByStationTime.get(key)!.push(pl);
    } else {
      planktonByStationTime.set(key, [pl]);
    }
  }

  const result: FusedMonitoringData[] = [];

  for (const station of stations) {
    const stationWQ = waterQualityData.filter((d) => d.stationId === station.id);
    
    for (const wq of stationWQ) {
      const key = `${wq.stationId}_${wq.timestamp}`;
      const nt = nutrientByStationTime.get(key);
      const pl = planktonByStationTime.get(key) ?? [];

      result.push({
        stationId: station.id,
        stationName: station.name,
        timestamp: wq.timestamp,
        waterQuality: wq,
        nutrient: nt ?? {
          id: `nt-fallback-${wq.id}`,
          stationId: wq.stationId,
          timestamp: wq.timestamp,
          totalNitrogen: 0,
          totalPhosphorus: 0,
          ammoniaNitrogen: 0,
          nitrateNitrogen: 0,
        },
        plankton: pl,
      });
    }
  }

  return result.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
})();
