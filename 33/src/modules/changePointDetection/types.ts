export interface ChangePoint {
  index: number;
  height: number;
  pressure: number;
  field: string;
  value: number;
  previousValue: number;
  changeRate: number;
  absoluteChange: number;
  significance: 'low' | 'medium' | 'high';
  description: string;
}

export interface DetectionConfig {
  threshold: number;
  windowSize: number;
  minSignificance: 'low' | 'medium' | 'high';
  fields: string[];
}

export interface FieldChangePoints {
  field: string;
  fieldName: string;
  unit: string;
  points: ChangePoint[];
}
