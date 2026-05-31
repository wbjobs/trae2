export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface OpticalElement {
  id: string;
  type: string;
  position: Position;
  parameters: Record<string, any>;
}

export interface LightSource {
  wavelength: number;
  power: number;
  beam_diameter: number;
  position: Position;
}

export interface SimulationConfig {
  elements: OpticalElement[];
  light_source: LightSource;
  simulation_type: 'ray_tracing' | 'michelson' | 'young' | 'diffraction' | 'holography';
  resolution: number;
  enable_recording?: boolean;
}

export interface RayData {
  origin: number[];
  direction: number[];
  path: number[][];
  intensity: number;
  wavelength: number;
  phase: number;
  history?: Array<{
    event_type: string;
    element_id: string;
    description: string;
    position: number[];
  }>;
}

export interface DetectorData {
  rays_count: number;
  average_intensity: number;
  total_intensity: number;
  spots: Array<{
    position: number[];
    intensity: number;
    phase: number;
  }>;
}

export interface FrameData {
  frame_index: number;
  timestamp: number;
  rays: RayData[];
  event_type: string;
  element_id: string;
  description: string;
}

export interface PerformanceData {
  total_time: number;
  avg_ray_trace_time: number;
  ray_count: number;
  total_intersections: number;
}

export interface RecordingData {
  enabled: boolean;
  frames: FrameData[];
  frame_count: number;
}

export interface SimulationResult {
  rays?: RayData[];
  detector?: DetectorData;
  intensity?: number[][];
  x?: number[];
  y?: number[];
  type: string;
  contrast?: number;
  visibility?: number;
  fringe_spacing?: number;
  fringe_count?: number;
  path_difference?: number;
  summary?: {
    total_rays: number;
    rays_reaching_detector: number;
    average_intensity: number;
  };
  recording?: RecordingData;
  performance?: PerformanceData;
}

export interface ElementType {
  type: string;
  name: string;
  parameters: string[];
}

export interface Template {
  name: string;
  elements: OpticalElement[];
  light_source: LightSource;
}

export interface BatchConfig {
  id: string;
  name: string;
  elements: OpticalElement[];
  light_source: LightSource;
  simulation_type: string;
  resolution: number;
}

export interface BatchResult {
  config_id: string;
  config_name: string;
  result?: SimulationResult;
  error?: string;
}

export interface ComparisonMetrics {
  efficiency_diff?: number;
  intensity_diff?: number;
  contrast_diff?: number;
  computation_time?: number;
}

export interface Comparison {
  config_a: string;
  config_b: string;
  metrics: ComparisonMetrics;
}

export interface BatchComparisonResult {
  results: BatchResult[];
  comparisons: Comparison[];
  total_configs: number;
  successful: number;
}
