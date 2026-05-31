export interface BridgeModel {
  id: string;
  name: string;
  description: string;
  modelUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type DefectType = 'crack' | 'corrosion' | 'deformation' | 'spalling';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DefectData {
  id: string;
  bridgeId: string;
  position: { x: number; y: number; z: number };
  type: DefectType;
  severity: SeverityLevel;
  description: string;
  imageUrl?: string;
  detectedAt: string;
  layerId: string;
  creatorId?: string;
}

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  bridgeId: string;
}

export interface StressResult {
  id: string;
  bridgeId: string;
  elementId: string;
  maxStress: number;
  minStress: number;
  stressDistribution: number[];
  analysisDate: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'engineer' | 'guest';
  createdAt: string;
}

export type ViewMode = 'default' | 'stress' | 'defect' | 'wireframe';
export type ToolMode = 'select' | 'annotate' | 'measure' | 'none';

export interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
}

export interface StressVertexData {
  position: [number, number, number];
  stress: number;
}
