import { create } from 'zustand';
import type { Annotation, Collision, Pipeline, PipelineType, Section, Vec3 } from '@shared/types';

export type ToolMode = 'select' | 'measure' | 'annotate' | 'clip' | 'collision';

export interface ClipConfig {
  enabled: boolean;
  axis: 'x' | 'y' | 'z';
  position: number;
  invert: boolean;
}

export interface StyleConfig {
  opacity: number;
  lineWidth: number;
  showOutline: boolean;
  showWireframe: boolean;
  roughness: number;
  metalness: number;
  lodBias: number;
  frustumCulling: boolean;
}

interface SceneState {
  pipelines: Pipeline[];
  sections: Section[];
  collisions: Collision[];
  annotations: Annotation[];
  selectedId: string | null;
  hoveredId: string | null;
  selectedType: PipelineType | null;
  hiddenTypes: Set<PipelineType>;
  focusId: string | null;
  tool: ToolMode;
  measurePoints: Vec3[];
  clip: ClipConfig;
  style: StyleConfig;
  loading: boolean;
  setPipelines: (list: Pipeline[]) => void;
  setSections: (list: Section[]) => void;
  setCollisions: (list: Collision[]) => void;
  setAnnotations: (list: Annotation[]) => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setSelectedType: (t: PipelineType | null) => void;
  toggleHiddenType: (t: PipelineType) => void;
  setFocusId: (id: string | null) => void;
  setTool: (t: ToolMode) => void;
  pushMeasurePoint: (p: Vec3) => void;
  clearMeasurePoints: () => void;
  setClip: (c: Partial<ClipConfig>) => void;
  setStyle: (s: Partial<StyleConfig>) => void;
  setLoading: (v: boolean) => void;
}

export const useScene = create<SceneState>((set) => ({
  pipelines: [],
  sections: [],
  collisions: [],
  annotations: [],
  selectedId: null,
  hoveredId: null,
  selectedType: null,
  hiddenTypes: new Set(),
  focusId: null,
  tool: 'select',
  measurePoints: [],
  clip: { enabled: false, axis: 'x', position: 0, invert: false },
  style: {
    opacity: 1,
    lineWidth: 1.2,
    showOutline: true,
    showWireframe: false,
    roughness: 0.65,
    metalness: 0.1,
    lodBias: 0,
    frustumCulling: true,
  },
  loading: false,
  setPipelines: (list) => set({ pipelines: list }),
  setSections: (list) => set({ sections: list }),
  setCollisions: (list) => set({ collisions: list }),
  setAnnotations: (list) => set({ annotations: list }),
  addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((x) => x.id !== id) })),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setSelectedType: (t) => set({ selectedType: t }),
  toggleHiddenType: (t) =>
    set((s) => {
      const next = new Set(s.hiddenTypes);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return { hiddenTypes: next };
    }),
  setFocusId: (id) => set({ focusId: id }),
  setTool: (t) => set({ tool: t, measurePoints: [] }),
  pushMeasurePoint: (p) =>
    set((s) => ({
      measurePoints:
        s.measurePoints.length >= 2 ? [p] : [...s.measurePoints, p],
    })),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  setClip: (c) => set((s) => ({ clip: { ...s.clip, ...c } })),
  setStyle: (s) => set((st) => ({ style: { ...st.style, ...s } })),
  setLoading: (v) => set({ loading: v }),
}));
