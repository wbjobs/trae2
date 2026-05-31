export type PipelineType =
  | 'water_supply'
  | 'drainage'
  | 'gas'
  | 'power'
  | 'telecom'
  | 'heating';

export type Vec3 = [number, number, number];

export interface Section {
  id: string;
  name: string;
  length: number;
}

export interface Pipeline {
  id: string;
  code: string;
  type: PipelineType;
  material: string;
  diameter: number;
  startPoint: Vec3;
  endPoint: Vec3;
  elevation: number;
  depth: number;
  pressure: number;
  installedAt: string;
  sectionId: string;
}

export type CollisionLevel = 'warning' | 'danger';

export interface Collision {
  id: string;
  a: string;
  b: string;
  point: Vec3;
  distance: number;
  level: CollisionLevel;
}

export interface Annotation {
  id: string;
  type: 'distance' | 'diameter' | 'elevation';
  points: Vec3[];
  value: number;
  unit: string;
  label?: string;
}

export const PIPELINE_TYPE_LABEL: Record<PipelineType, string> = {
  water_supply: '给水',
  drainage: '排水',
  gas: '燃气',
  power: '电力',
  telecom: '通信',
  heating: '热力',
};

export const PIPELINE_TYPE_COLOR: Record<PipelineType, string> = {
  water_supply: '#3ba7ff',
  drainage: '#8b6f47',
  gas: '#ffd23b',
  power: '#ff5c5c',
  telecom: '#a78bfa',
  heating: '#ff8a3b',
};
