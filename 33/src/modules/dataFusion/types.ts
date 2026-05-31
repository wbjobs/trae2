import { SoundingDataPoint, DataQualityReport } from '@/types';

export interface FusionConfig {
  interpolationMethod: 'linear' | 'nearest' | 'cubic';
  pressureLevels: number[];
  outlierThreshold: number;
  maxGapSize: number;
}

export interface FieldValidationRule {
  field: keyof SoundingDataPoint;
  min: number;
  max: number;
  required: boolean;
}

export interface CleanedSoundingData {
  originalPoints: SoundingDataPoint[];
  cleanedPoints: SoundingDataPoint[];
  qualityReport: DataQualityReport;
}
