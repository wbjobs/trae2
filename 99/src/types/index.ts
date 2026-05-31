import type { Geometry } from 'geojson';

export interface Borehole {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  elevation: number;
  depth: number;
  coordinateSystem: string;
  layers: BoreholeLayer[];
}

export interface BoreholeLayer {
  id: string;
  boreholeId: string;
  layerName: string;
  topDepth: number;
  bottomDepth: number;
  layerType: string;
  color: string;
  description: string;
}

export interface GeoLayer {
  id: string;
  name: string;
  type: string;
  color: string;
  opacity: number;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface Annotation {
  id: string;
  type: 'pin' | 'label' | 'area';
  name: string;
  description: string;
  position: [number, number, number];
  color: string;
  createdAt: string;
}

export interface DEMData {
  width: number;
  height: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  elevations: number[];
}

export interface CoordinateSystem {
  id: string;
  name: string;
  description: string;
}

export type ToolMode = 'navigate' | 'distance' | 'thickness' | 'annotate';
export type ViewPreset = 'top' | 'front' | 'side' | 'perspective';

export interface LayerVisibility {
  terrain: boolean;
  boreholes: boolean;
  geoLayers: boolean;
  annotations: boolean;
  measurements: boolean;
}

export interface LayerOpacity {
  terrain: number;
  boreholes: number;
  geoLayers: number;
  annotations: number;
  measurements: number;
}

export interface MeasurementResult {
  type: 'distance' | 'thickness';
  points: [number, number, number][];
  value: number;
  horizontalDistance?: number;
  verticalDistance?: number;
}

export interface SelectedFeature {
  type: 'borehole' | 'layer' | 'annotation';
  id: string;
  data: Borehole | GeoLayer | Annotation;
}

export interface SectionPlane {
  id: string;
  normal: [number, number, number];
  position: [number, number, number];
  visible: boolean;
  color: string;
}

export type BoreholeLayerVisibility = Record<string, boolean>;
