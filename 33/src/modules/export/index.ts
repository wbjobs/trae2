export * from './types';
export { ExcelExporter, excelExporter } from './excelExporter';
export { PDFExporter, pdfExporter } from './pdfExporter';
export { CSVExporter, csvExporter } from './csvExporter';

import { SoundingData, MeteorologicalIndex } from '@/types';
import { excelExporter } from './excelExporter';
import { pdfExporter } from './pdfExporter';
import { csvExporter } from './csvExporter';

export interface ExportParams {
  format: 'excel' | 'pdf' | 'csv';
  soundingData: SoundingData;
  indices?: {
    stability: MeteorologicalIndex[];
    wind: MeteorologicalIndex[];
    thermodynamic: MeteorologicalIndex[];
  };
  qualityReport?: any;
  includeRawData?: boolean;
  filename?: string;
}

export const exportReport = (params: ExportParams): void => {
  const filename = params.filename || `探空数据报表_${params.soundingData.stationId}_${new Date().toISOString().slice(0, 10)}`;

  const exportData = {
    soundingData: params.soundingData,
    indices: params.indices,
    qualityReport: params.qualityReport,
    includeRawData: params.includeRawData !== false
  };

  switch (params.format) {
    case 'excel':
      excelExporter.export(exportData, filename);
      break;
    case 'pdf':
      pdfExporter.export(exportData, filename);
      break;
    case 'csv':
      csvExporter.export(exportData, filename);
      break;
    default:
      excelExporter.export(exportData, filename);
  }
};
