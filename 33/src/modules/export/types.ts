import { SoundingData, MeteorologicalIndex } from '@/types';

export interface ExportOptions {
  format: 'excel' | 'pdf' | 'csv';
  includeRawData: boolean;
  includeIndices: boolean;
  includeCharts: boolean;
  chartImages?: string[];
}

export interface ExportData {
  soundingData: SoundingData;
  indices?: {
    stability: MeteorologicalIndex[];
    wind: MeteorologicalIndex[];
    thermodynamic: MeteorologicalIndex[];
  };
  qualityReport?: any;
}
