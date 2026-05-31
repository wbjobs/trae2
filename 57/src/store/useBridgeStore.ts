import { create } from 'zustand';
import type { BridgeModel, DefectData, Layer, StressResult, ViewMode, ToolMode, CameraPosition } from '../../shared';
import { bridgeApi } from '../services/api';

interface BridgeState {
  bridges: BridgeModel[];
  currentBridge: BridgeModel | null;
  defects: DefectData[];
  layers: Layer[];
  stressResults: StressResult[];
  selectedDefect: DefectData | null;
  viewMode: ViewMode;
  toolMode: ToolMode;
  isLoading: boolean;
  error: string | null;
  cameraPosition: CameraPosition;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;

  loadBridges: () => Promise<void>;
  selectBridge: (bridge: BridgeModel) => Promise<void>;
  loadBridgeData: (bridgeId: string) => Promise<void>;
  addDefect: (defect: Omit<DefectData, 'id' | 'detectedAt'>) => Promise<void>;
  updateDefect: (id: string, updates: Partial<DefectData>) => Promise<void>;
  removeDefect: (id: string) => Promise<void>;
  selectDefect: (defect: DefectData | null) => void;
  toggleLayer: (layerId: string) => Promise<void>;
  addLayer: (layer: Omit<Layer, 'id'>) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setToolMode: (mode: ToolMode) => void;
  setCameraPosition: (pos: CameraPosition) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
}

export const useBridgeStore = create<BridgeState>((set, get) => ({
  bridges: [],
  currentBridge: null,
  defects: [],
  layers: [],
  stressResults: [],
  selectedDefect: null,
  viewMode: 'default',
  toolMode: 'select',
  isLoading: false,
  error: null,
  cameraPosition: {
    position: [15, 10, 15],
    target: [0, 2, 0],
  },
  leftPanelOpen: true,
  rightPanelOpen: true,

  loadBridges: async () => {
    set({ isLoading: true, error: null });
    try {
      const bridges = await bridgeApi.getAllBridges();
      set({ bridges });
    } catch (error) {
      set({ error: 'Failed to load bridges' });
    } finally {
      set({ isLoading: false });
    }
  },

  selectBridge: async (bridge) => {
    set({ currentBridge: bridge });
    await get().loadBridgeData(bridge.id);
  },

  loadBridgeData: async (bridgeId) => {
    set({ isLoading: true, error: null });
    try {
      const [defects, layers, stress] = await Promise.all([
        bridgeApi.getDefects(bridgeId),
        bridgeApi.getLayers(bridgeId),
        bridgeApi.getStressResults(bridgeId),
      ]);
      set({ defects, layers, stressResults: stress });
    } catch (error) {
      set({ error: 'Failed to load bridge data' });
    } finally {
      set({ isLoading: false });
    }
  },

  addDefect: async (defect) => {
    const newDefect = await bridgeApi.createDefect(defect);
    set((state) => ({ defects: [...state.defects, newDefect] }));
  },

  updateDefect: async (id, updates) => {
    const updated = await bridgeApi.updateDefect(id, updates);
    set((state) => ({
      defects: state.defects.map((d) => (d.id === id ? updated : d)),
      selectedDefect: state.selectedDefect?.id === id ? updated : state.selectedDefect,
    }));
  },

  removeDefect: async (id) => {
    await bridgeApi.deleteDefect(id);
    set((state) => ({
      defects: state.defects.filter((d) => d.id !== id),
      selectedDefect: state.selectedDefect?.id === id ? null : state.selectedDefect,
    }));
  },

  selectDefect: (defect) => set({ selectedDefect: defect }),

  toggleLayer: async (layerId) => {
    const layer = get().layers.find((l) => l.id === layerId);
    if (!layer) return;
    const updated = await bridgeApi.updateLayer(layerId, { visible: !layer.visible });
    set((state) => ({
      layers: state.layers.map((l) => (l.id === layerId ? updated : l)),
    }));
  },

  addLayer: async (layer) => {
    const newLayer = await bridgeApi.createLayer(layer);
    set((state) => ({ layers: [...state.layers, newLayer] }));
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setToolMode: (mode) => set({ toolMode: mode }),
  setCameraPosition: (pos) => set({ cameraPosition: pos }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
}));
