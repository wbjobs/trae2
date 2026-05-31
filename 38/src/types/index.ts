export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainData {
  id: string;
  demData: number[][];
  resolution: number;
  bounds: Bounds;
}

export interface GeologyLayer {
  id: string;
  name: string;
  rockType: string;
  description: string;
  thickness: number;
  color: string;
  depth: number;
  properties: Record<string, any>;
}

export interface SectionPlane {
  id: string;
  name: string;
  normal: [number, number, number];
  origin: [number, number, number];
  visible: boolean;
}

export type MeasurementType = 'distance' | 'angle' | 'height';

export interface Measurement {
  id: string;
  type: MeasurementType;
  points: [number, number, number][];
  value: number;
  unit: string;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type ToolMode = 'navigate' | 'section' | 'measure-distance' | 'measure-angle' | 'measure-height' | 'query';

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface LayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface QueryResult {
  position: [number, number, number];
  layerName: string;
  rockType: string;
  depth: number;
  properties: Record<string, any>;
}
