import { FieldValidationRule } from './types';

export const fieldValidationRules: FieldValidationRule[] = [
  { field: 'pressure', min: 0, max: 1100, required: true },
  { field: 'height', min: 0, max: 40000, required: true },
  { field: 'temperature', min: -100, max: 60, required: true },
  { field: 'dewPoint', min: -100, max: 50, required: true },
  { field: 'relativeHumidity', min: 0, max: 100, required: true },
  { field: 'windSpeed', min: 0, max: 150, required: true },
  { field: 'windDirection', min: 0, max: 360, required: true },
  { field: 'uWind', min: -100, max: 100, required: false },
  { field: 'vWind', min: -100, max: 100, required: false }
];

export const STANDARD_PRESSURE_LEVELS = [
  1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10
];
