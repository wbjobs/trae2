import type { PlanktonData } from '../types/plankton';

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

interface SpeciesProfile {
  species: string;
  category: 'phytoplankton' | 'zooplankton';
  baseDensity: number;
  baseBiomass: number;
  peakMonth: number;
}

const speciesProfiles: SpeciesProfile[] = [
  { species: '微囊藻', category: 'phytoplankton', baseDensity: 2500, baseBiomass: 8.5, peakMonth: 7 },
  { species: '鱼腥藻', category: 'phytoplankton', baseDensity: 1200, baseBiomass: 4.2, peakMonth: 8 },
  { species: '硅藻', category: 'phytoplankton', baseDensity: 800, baseBiomass: 3.8, peakMonth: 4 },
  { species: '绿藻', category: 'phytoplankton', baseDensity: 1500, baseBiomass: 5.1, peakMonth: 6 },
  { species: '隐藻', category: 'phytoplankton', baseDensity: 600, baseBiomass: 2.0, peakMonth: 5 },
  { species: '裸藻', category: 'phytoplankton', baseDensity: 400, baseBiomass: 1.5, peakMonth: 7 },
  { species: '甲藻', category: 'phytoplankton', baseDensity: 350, baseBiomass: 1.8, peakMonth: 8 },
  { species: '轮虫', category: 'zooplankton', baseDensity: 500, baseBiomass: 1.2, peakMonth: 6 },
  { species: '枝角类', category: 'zooplankton', baseDensity: 300, baseBiomass: 2.5, peakMonth: 5 },
  { species: '桡足类', category: 'zooplankton', baseDensity: 250, baseBiomass: 3.0, peakMonth: 7 },
  { species: '原生动物', category: 'zooplankton', baseDensity: 800, baseBiomass: 0.8, peakMonth: 8 },
  { species: '剑水蚤', category: 'zooplankton', baseDensity: 180, baseBiomass: 1.6, peakMonth: 6 },
];

const stationEutrophicationFactor: Record<string, number> = {
  'station-001': 1.4,
  'station-002': 1.0,
  'station-003': 1.5,
  'station-004': 1.1,
  'station-005': 1.8,
  'station-006': 1.5,
  'station-007': 0.8,
  'station-008': 0.9,
};

function getSeasonFactor(month: number, peakMonth: number): number {
  const diff = Math.abs(month - peakMonth);
  const monthDiff = Math.min(diff, 12 - diff);
  return Math.max(0.2, 1.0 - monthDiff * 0.15);
}

let id = 0;

export const planktonData: PlanktonData[] = [];

for (const stationId of stationIds) {
  const eutrophFactor = stationEutrophicationFactor[stationId];

  for (let month = 1; month <= 12; month++) {
    const timestamp = `2024-${String(month).padStart(2, '0')}-15T08:00:00Z`;

    for (const profile of speciesProfiles) {
      const seasonFactor = getSeasonFactor(month, profile.peakMonth);
      const density = Math.round(
        profile.baseDensity * seasonFactor * eutrophFactor * (0.8 + Math.random() * 0.4)
      );
      const biomass = Math.round(
        profile.baseBiomass * seasonFactor * eutrophFactor * (0.8 + Math.random() * 0.4) * 100
      ) / 100;

      planktonData.push({
        id: `pl-${String(++id).padStart(4, '0')}`,
        stationId,
        timestamp,
        species: profile.species,
        category: profile.category,
        density,
        biomass,
      });
    }
  }
}
