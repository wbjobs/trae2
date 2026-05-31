import { create } from 'zustand';
import {
  TerrainData,
  GeologyLayer,
  SectionPlane,
  Measurement,
  ToolMode,
  LayerState,
  QueryResult,
} from '../types';
import { generateTerrainData, generateGeologyLayers } from '../utils/mockData';

interface AppState {
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;

  terrainData: TerrainData | null;
  setTerrainData: (data: TerrainData | null) => void;
  loadTerrainData: () => Promise<void>;

  geologyLayers: GeologyLayer[];
  setGeologyLayers: (layers: GeologyLayer[]) => void;
  addGeologyLayer: (layer: GeologyLayer) => void;
  updateGeologyLayer: (id: string, updates: Partial<GeologyLayer>) => void;
  loadGeologyLayers: () => Promise<void>;

  sectionPlanes: SectionPlane[];
  setSectionPlanes: (planes: SectionPlane[]) => void;
  addSectionPlane: (plane: SectionPlane) => void;
  updateSectionPlane: (id: string, updates: Partial<SectionPlane>) => void;
  removeSectionPlane: (id: string) => void;

  measurements: Measurement[];
  setMeasurements: (measurements: Measurement[]) => void;
  addMeasurement: (measurement: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;

  layerStates: LayerState[];
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;

  selectedPoint: [number, number, number] | null;
  setSelectedPoint: (point: [number, number, number] | null) => void;

  queryResult: QueryResult | null;
  setQueryResult: (result: QueryResult | null) => void;

  mousePosition: { x: number; y: number } | null;
  setMousePosition: (pos: { x: number; y: number } | null) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  toolMode: 'navigate',
  setToolMode: (mode) => set({ toolMode: mode }),

  terrainData: null,
  setTerrainData: (data) => set({ terrainData: data }),
  loadTerrainData: async () => {
    const data = generateTerrainData();
    set({ terrainData: data });
  },

  geologyLayers: [],
  setGeologyLayers: (layers) => set({ geologyLayers: layers }),
  loadGeologyLayers: async () => {
    const layers = generateGeologyLayers();
    set({ geologyLayers: layers });
  },
  addGeologyLayer: (layer) =>
    set((state) => ({ geologyLayers: [...state.geologyLayers, layer] })),
  updateGeologyLayer: (id, updates) =>
    set((state) => ({
      geologyLayers: state.geologyLayers.map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
    })),

  sectionPlanes: [],
  setSectionPlanes: (planes) => set({ sectionPlanes: planes }),
  addSectionPlane: (plane) =>
    set((state) => ({ sectionPlanes: [...state.sectionPlanes, plane] })),
  updateSectionPlane: (id, updates) =>
    set((state) => ({
      sectionPlanes: state.sectionPlanes.map((plane) =>
        plane.id === id ? { ...plane, ...updates } : plane
      ),
    })),
  removeSectionPlane: (id) =>
    set((state) => ({
      sectionPlanes: state.sectionPlanes.filter((plane) => plane.id !== id),
    })),

  measurements: [],
  setMeasurements: (measurements) => set({ measurements }),
  addMeasurement: (measurement) =>
    set((state) => ({ measurements: [...state.measurements, measurement] })),
  removeMeasurement: (id) =>
    set((state) => ({
      measurements: state.measurements.filter((m) => m.id !== id),
    })),
  clearMeasurements: () => set({ measurements: [] }),

  layerStates: [],
  setLayerVisibility: (id, visible) =>
    set((state) => ({
      layerStates: state.layerStates.map((layer) =>
        layer.id === id ? { ...layer, visible } : layer
      ),
    })),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layerStates: state.layerStates.map((layer) =>
        layer.id === id ? { ...layer, opacity } : layer
      ),
    })),

  selectedPoint: null,
  setSelectedPoint: (point) => set({ selectedPoint: point }),

  queryResult: null,
  setQueryResult: (result) => set({ queryResult: result }),

  mousePosition: null,
  setMousePosition: (pos) => set({ mousePosition: pos }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
