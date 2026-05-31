import { MeteorologicalIndex } from '@/types';

export interface IndexResult extends MeteorologicalIndex {
  calculationMethod: string;
}

export interface AtmosphericStabilityIndices {
  cape: IndexResult;
  cin: IndexResult;
  liftedIndex: IndexResult;
  showalterIndex: IndexResult;
  kIndex: IndexResult;
  totalTotalsIndex: IndexResult;
  convectiveInhibition: IndexResult;
  equilibriumLevel: IndexResult;
  levelOfFreeConvection: IndexResult;
  convectiveCondensationLevel: IndexResult;
  liftingCondensationLevel: IndexResult;
}

export interface WindIndices {
  maxWindSpeed: IndexResult;
  maxWindHeight: IndexResult;
  windShear0_6km: IndexResult;
  windShear0_1km: IndexResult;
  bulkRichardsonNumber: IndexResult;
}

export interface ThermodynamicIndices {
  convectiveAvailablePotentialEnergy: IndexResult;
  precipitableWater: IndexResult;
  surfaceBasedCAPE: IndexResult;
  mostUnstableCAPE: IndexResult;
  mixedLayerCAPE: IndexResult;
}

export interface AllCalculatedIndices {
  stability: AtmosphericStabilityIndices;
  wind: WindIndices;
  thermodynamic: ThermodynamicIndices;
}

export interface Layer {
  bottomPressure: number;
  topPressure: number;
  bottomHeight: number;
  topHeight: number;
}
