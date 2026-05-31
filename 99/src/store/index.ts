import { create } from 'zustand';
import type {
  Borehole,
  GeoLayer,
  Annotation,
  DEMData,
  ToolMode,
  LayerVisibility,
  LayerOpacity,
  SelectedFeature,
  MeasurementResult,
  SectionPlane,
  BoreholeLayerVisibility,
} from '@/types';

interface GeoStore {
  boreholes: Borehole[];
  geoLayers: GeoLayer[];
  annotations: Annotation[];
  demData: DEMData | null;
  toolMode: ToolMode;
  layerVisibility: LayerVisibility;
  layerOpacity: LayerOpacity;
  selectedFeature: SelectedFeature | null;
  measurements: MeasurementResult[];
  currentCoordinates: [number, number, number] | null;
  sectionPlanes: SectionPlane[];
  boreholeLayerVisibility: BoreholeLayerVisibility;

  setBoreholes: (boreholes: Borehole[]) => void;
  setGeoLayers: (geoLayers: GeoLayer[]) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  setDemData: (demData: DEMData | null) => void;
  setToolMode: (mode: ToolMode) => void;
  setLayerVisibility: (layer: keyof LayerVisibility, visible: boolean) => void;
  setLayerOpacity: (layer: keyof LayerOpacity, opacity: number) => void;
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  addMeasurement: (measurement: MeasurementResult) => void;
  removeMeasurement: (index: number) => void;
  clearMeasurements: () => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setCurrentCoordinates: (coords: [number, number, number] | null) => void;
  addSectionPlane: (plane: Omit<SectionPlane, 'id'>) => void;
  removeSectionPlane: (id: string) => void;
  updateSectionPlane: (id: string, updates: Partial<SectionPlane>) => void;
  toggleSectionPlane: (id: string) => void;
  setBoreholeLayerVisibility: (layerName: string, visible: boolean) => void;
  toggleAllBoreholeLayers: (visible: boolean) => void;
  loadMockData: () => void;
}

const initialLayerVisibility: LayerVisibility = {
  terrain: true,
  boreholes: true,
  geoLayers: true,
  annotations: true,
  measurements: true,
};

const initialLayerOpacity: LayerOpacity = {
  terrain: 1,
  boreholes: 1,
  geoLayers: 0.8,
  annotations: 1,
  measurements: 1,
};

export const useGeoStore = create<GeoStore>((set, get) => ({
  boreholes: [],
  geoLayers: [],
  annotations: [],
  demData: null,
  toolMode: 'navigate',
  layerVisibility: initialLayerVisibility,
  layerOpacity: initialLayerOpacity,
  selectedFeature: null,
  measurements: [],
  currentCoordinates: null,
  sectionPlanes: [],
  boreholeLayerVisibility: {},

  setBoreholes: (boreholes) => {
    const layerNames = [...new Set(boreholes.flatMap((b) => b.layers.map((l) => l.layerName)))];
    const visibility: BoreholeLayerVisibility = {};
    layerNames.forEach((name) => {
      visibility[name] = true;
    });
    set({ boreholes, boreholeLayerVisibility: visibility });
  },
  setGeoLayers: (geoLayers) => set({ geoLayers }),
  setAnnotations: (annotations) => set({ annotations }),
  setDemData: (demData) => set({ demData }),
  setToolMode: (toolMode) => set({ toolMode }),
  setLayerVisibility: (layer, visible) =>
    set((state) => ({
      layerVisibility: { ...state.layerVisibility, [layer]: visible },
    })),
  setLayerOpacity: (layer, opacity) =>
    set((state) => ({
      layerOpacity: { ...state.layerOpacity, [layer]: opacity },
    })),
  setSelectedFeature: (selectedFeature) => set({ selectedFeature }),
  addMeasurement: (measurement) =>
    set((state) => ({
      measurements: [...state.measurements, measurement],
    })),
  removeMeasurement: (index) =>
    set((state) => ({
      measurements: state.measurements.filter((_, i) => i !== index),
    })),
  clearMeasurements: () => set({ measurements: [] }),
  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
    })),
  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    })),
  setCurrentCoordinates: (currentCoordinates) => set({ currentCoordinates }),
  addSectionPlane: (plane) =>
    set((state) => ({
      sectionPlanes: [...state.sectionPlanes, { ...plane, id: `plane-${Date.now()}` }],
    })),
  removeSectionPlane: (id) =>
    set((state) => ({
      sectionPlanes: state.sectionPlanes.filter((p) => p.id !== id),
    })),
  updateSectionPlane: (id, updates) =>
    set((state) => ({
      sectionPlanes: state.sectionPlanes.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
  toggleSectionPlane: (id) =>
    set((state) => ({
      sectionPlanes: state.sectionPlanes.map((p) =>
        p.id === id ? { ...p, visible: !p.visible } : p
      ),
    })),
  setBoreholeLayerVisibility: (layerName, visible) =>
    set((state) => ({
      boreholeLayerVisibility: {
        ...state.boreholeLayerVisibility,
        [layerName]: visible,
      },
    })),
  toggleAllBoreholeLayers: (visible) =>
    set((state) => {
      const visibility: BoreholeLayerVisibility = {};
      Object.keys(state.boreholeLayerVisibility).forEach((key) => {
        visibility[key] = visible;
      });
      return { boreholeLayerVisibility: visibility };
    }),
  loadMockData: () => {
    const mockBoreholes: Borehole[] = [
      {
        id: 'bh-001',
        name: 'ZK-001',
        longitude: 116.397,
        latitude: 39.908,
        elevation: 43.5,
        depth: 120,
        coordinateSystem: 'WGS84',
        layers: [
          {
            id: 'bh-001-l1',
            boreholeId: 'bh-001',
            layerName: '表层填土',
            topDepth: 0,
            bottomDepth: 2.5,
            layerType: 'fill',
            color: '#a0aec0',
            description: '人工堆积，松散',
          },
          {
            id: 'bh-001-l2',
            boreholeId: 'bh-001',
            layerName: '粉质黏土',
            topDepth: 2.5,
            bottomDepth: 8.2,
            layerType: 'clay',
            color: '#d69e2e',
            description: '可塑，中等压缩性',
          },
          {
            id: 'bh-001-l3',
            boreholeId: 'bh-001',
            layerName: '砂层',
            topDepth: 8.2,
            bottomDepth: 15.6,
            layerType: 'sand',
            color: '#ecc94b',
            description: '中粗砂，密实',
          },
          {
            id: 'bh-001-l4',
            boreholeId: 'bh-001',
            layerName: '基岩',
            topDepth: 15.6,
            bottomDepth: 120,
            layerType: 'rock',
            color: '#718096',
            description: '花岗岩，中风化',
          },
        ],
      },
      {
        id: 'bh-002',
        name: 'ZK-002',
        longitude: 116.402,
        latitude: 39.912,
        elevation: 45.2,
        depth: 150,
        coordinateSystem: 'WGS84',
        layers: [
          {
            id: 'bh-002-l1',
            boreholeId: 'bh-002',
            layerName: '表层填土',
            topDepth: 0,
            bottomDepth: 3.1,
            layerType: 'fill',
            color: '#a0aec0',
            description: '人工堆积，稍密',
          },
          {
            id: 'bh-002-l2',
            boreholeId: 'bh-002',
            layerName: '粉土',
            topDepth: 3.1,
            bottomDepth: 7.8,
            layerType: 'silt',
            color: '#ecc94b',
            description: '中密，湿',
          },
          {
            id: 'bh-002-l3',
            boreholeId: 'bh-002',
            layerName: '卵石层',
            topDepth: 7.8,
            bottomDepth: 22.3,
            layerType: 'gravel',
            color: '#805ad5',
            description: '卵石，密实，承载力高',
          },
          {
            id: 'bh-002-l4',
            boreholeId: 'bh-002',
            layerName: '基岩',
            topDepth: 22.3,
            bottomDepth: 150,
            layerType: 'rock',
            color: '#4a5568',
            description: '片麻岩，微风化',
          },
        ],
      },
      {
        id: 'bh-003',
        name: 'ZK-003',
        longitude: 116.392,
        latitude: 39.915,
        elevation: 42.8,
        depth: 100,
        coordinateSystem: 'WGS84',
        layers: [
          {
            id: 'bh-003-l1',
            boreholeId: 'bh-003',
            layerName: '杂填土',
            topDepth: 0,
            bottomDepth: 1.8,
            layerType: 'fill',
            color: '#718096',
            description: '含建筑垃圾',
          },
          {
            id: 'bh-003-l2',
            boreholeId: 'bh-003',
            layerName: '黏土',
            topDepth: 1.8,
            bottomDepth: 6.5,
            layerType: 'clay',
            color: '#c05621',
            description: '可塑-硬塑',
          },
          {
            id: 'bh-003-l3',
            boreholeId: 'bh-003',
            layerName: '含砾砂',
            topDepth: 6.5,
            bottomDepth: 18.9,
            layerType: 'sand',
            color: '#d69e2e',
            description: '中密，含砾石约30%',
          },
          {
            id: 'bh-003-l4',
            boreholeId: 'bh-003',
            layerName: '基岩',
            topDepth: 18.9,
            bottomDepth: 100,
            layerType: 'rock',
            color: '#2d3748',
            description: '石灰岩，微风化',
          },
        ],
      },
    ];

    const mockGeoLayers: GeoLayer[] = [
      {
        id: 'gl-001',
        name: '第三系地层',
        type: 'stratum',
        color: '#e87c3e',
        opacity: 0.7,
        geometry: null,
        properties: { age: 'N', thickness: 150, lithology: '砂岩、泥岩互层' },
      },
      {
        id: 'gl-002',
        name: '白垩系地层',
        type: 'stratum',
        color: '#38a169',
        opacity: 0.7,
        geometry: null,
        properties: { age: 'K', thickness: 320, lithology: '砾岩、砂岩' },
      },
      {
        id: 'gl-003',
        name: '侏罗系地层',
        type: 'stratum',
        color: '#4299e1',
        opacity: 0.7,
        geometry: null,
        properties: { age: 'J', thickness: 280, lithology: '火山碎屑岩' },
      },
      {
        id: 'gl-004',
        name: '断层F1',
        type: 'fault',
        color: '#e53e3e',
        opacity: 1,
        geometry: null,
        properties: { type: '正断层', strike: 'NE35°', dip: 65, length: 2500 },
      },
      {
        id: 'gl-005',
        name: '矿体M1',
        type: 'orebody',
        color: '#d69e2e',
        opacity: 0.9,
        geometry: null,
        properties: { type: '铁矿', grade: 35.5, reserves: 1250000, unit: '吨' },
      },
    ];

    const mockAnnotations: Annotation[] = [
      {
        id: 'ann-001',
        type: 'pin',
        name: '勘探点1',
        description: '现场踏勘标记点',
        position: [116.3975, 39.909, 45.0],
        color: '#e87c3e',
        createdAt: new Date().toISOString(),
      },
    ];

    const mockDem: DEMData = {
      width: 100,
      height: 100,
      minLon: 116.38,
      minLat: 39.90,
      maxLon: 116.41,
      maxLat: 39.92,
      elevations: Array.from({ length: 10000 }, () => 40 + Math.random() * 15),
    };

    set({
      boreholes: mockBoreholes,
      geoLayers: mockGeoLayers,
      annotations: mockAnnotations,
      demData: mockDem,
    });
  },
}));
