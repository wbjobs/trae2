import type { FusedMonitoringData, EcoIndexResult, PlanktonData } from '@/types';

export function calcShannonIndex(species: { name: string; density: number }[]): number {
  const totalDensity = species.reduce((sum, s) => sum + s.density, 0);
  if (totalDensity === 0 || species.length === 0) return 0;

  let H = 0;
  for (const s of species) {
    if (s.density <= 0) continue;
    const pi = s.density / totalDensity;
    H -= pi * Math.log(pi);
  }

  return H;
}

export function calcSimpsonIndex(species: { name: string; density: number }[]): number {
  const totalDensity = species.reduce((sum, s) => sum + s.density, 0);
  if (totalDensity === 0 || species.length === 0) return 0;

  let sumPi2 = 0;
  for (const s of species) {
    if (s.density <= 0) continue;
    const pi = s.density / totalDensity;
    sumPi2 += pi * pi;
  }

  return 1 - sumPi2;
}

export function calcEvennessIndex(shannon: number, speciesCount: number): number {
  if (speciesCount <= 1) return 0;
  const lnS = Math.log(speciesCount);
  if (lnS === 0) return 0;
  return shannon / lnS;
}

export function calcMargalefIndex(speciesCount: number, totalIndividuals: number): number {
  if (totalIndividuals <= 1) return 0;
  return (speciesCount - 1) / Math.log(totalIndividuals);
}

export function calcTrophicLevelIndex(
  tn: number,
  tp: number,
): { index: number; level: 'oligotrophic' | 'mesotrophic' | 'eutrophic' | 'hypertrophic' } {
  const tliTp = 10 * (9.436 + 1.624 * Math.log(Math.max(tp, 0.001)));
  const tliTn = 10 * (5.453 + 1.694 * Math.log(Math.max(tn, 0.01)));

  const wTp = 0.5153;
  const wTn = 0.4847;

  const tli = wTp * tliTp + wTn * tliTn;

  let level: 'oligotrophic' | 'mesotrophic' | 'eutrophic' | 'hypertrophic';
  if (tli < 30) {
    level = 'oligotrophic';
  } else if (tli < 50) {
    level = 'mesotrophic';
  } else if (tli < 70) {
    level = 'eutrophic';
  } else {
    level = 'hypertrophic';
  }

  return { index: tli, level };
}

export function assessWaterQuality(
  ph: number,
  dissolvedOxygen: number,
  tn: number,
  tp: number,
): 'excellent' | 'good' | 'moderate' | 'poor' | 'bad' {
  const scores: number[] = [];

  if (ph >= 6 && ph <= 9) scores.push(1);
  else if ((ph >= 5 && ph < 6) || (ph > 9 && ph <= 9.5)) scores.push(3);
  else scores.push(5);

  if (dissolvedOxygen >= 7.5) scores.push(1);
  else if (dissolvedOxygen >= 5) scores.push(2);
  else if (dissolvedOxygen >= 3) scores.push(3);
  else if (dissolvedOxygen >= 2) scores.push(4);
  else scores.push(5);

  if (tn <= 0.2) scores.push(1);
  else if (tn <= 0.5) scores.push(2);
  else if (tn <= 1.0) scores.push(3);
  else if (tn <= 2.0) scores.push(4);
  else scores.push(5);

  if (tp <= 0.02) scores.push(1);
  else if (tp <= 0.1) scores.push(2);
  else if (tp <= 0.2) scores.push(3);
  else if (tp <= 0.4) scores.push(4);
  else scores.push(5);

  const maxScore = Math.max(...scores);

  if (maxScore <= 1) return 'excellent';
  if (maxScore <= 2) return 'good';
  if (maxScore <= 3) return 'moderate';
  if (maxScore <= 4) return 'poor';
  return 'bad';
}

export function calcEcoIndices(fusedData: FusedMonitoringData): EcoIndexResult {
  const speciesList = fusedData.plankton.map((p: PlanktonData) => ({
    name: p.species,
    density: p.density,
  }));

  const speciesCount = speciesList.filter((s) => s.density > 0).length;
  const totalIndividuals = fusedData.plankton.reduce((sum, p) => sum + p.density, 0);

  const totalPhytoplanktonDensity = fusedData.plankton
    .filter((p) => p.category === 'phytoplankton')
    .reduce((sum, p) => sum + p.density, 0);

  const totalZooplanktonDensity = fusedData.plankton
    .filter((p) => p.category === 'zooplankton')
    .reduce((sum, p) => sum + p.density, 0);

  const densityMap = new Map<string, number>();
  for (const p of fusedData.plankton) {
    densityMap.set(p.species, (densityMap.get(p.species) ?? 0) + p.density);
  }
  const maxDensity = Math.max(...densityMap.values(), 0);
  const dominantSpecies = Array.from(densityMap.entries())
    .filter(([, d]) => d === maxDensity && d > 0)
    .map(([name]) => name);

  const shannonIndex = calcShannonIndex(speciesList);
  const simpsonIndex = calcSimpsonIndex(speciesList);
  const evennessIndex = calcEvennessIndex(shannonIndex, speciesCount);
  const margalefIndex = calcMargalefIndex(speciesCount, totalIndividuals);
  const trophicResult = calcTrophicLevelIndex(
    fusedData.nutrient.totalNitrogen,
    fusedData.nutrient.totalPhosphorus,
  );
  const waterQualityLevel = assessWaterQuality(
    fusedData.waterQuality.ph,
    fusedData.waterQuality.dissolvedOxygen,
    fusedData.nutrient.totalNitrogen,
    fusedData.nutrient.totalPhosphorus,
  );

  return {
    stationId: fusedData.stationId,
    period: {
      start: fusedData.timestamp,
      end: fusedData.timestamp,
    },
    shannonIndex,
    simpsonIndex,
    evennessIndex,
    margalefIndex,
    trophicLevelIndex: trophicResult.index,
    trophicLevel: trophicResult.level,
    waterQualityLevel,
    totalPhytoplanktonDensity,
    totalZooplanktonDensity,
    dominantSpecies,
  };
}
