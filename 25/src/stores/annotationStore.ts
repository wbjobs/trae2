import { create } from 'zustand'
import type {
  Annotation,
  CreateAnnotationRequest,
  AnnotationStatus,
} from '@/lib/types'
import api from '@/lib/api'

type ToolType = 'select' | 'rectangle' | 'text'

interface UndoState {
  annotations: Annotation[]
}

interface AnnotationState {
  annotations: Annotation[]
  loading: boolean
  error: string | null
  selectedAnnotationId: number | null
  currentTool: ToolType
  currentColor: string
  isDrawing: boolean
  history: UndoState[]
  future: UndoState[]
  setAnnotations: (annotations: Annotation[]) => void
  fetchAnnotations: (imageId: number) => Promise<void>
  createAnnotation: (data: CreateAnnotationRequest) => Promise<void>
  updateAnnotation: (
    id: number,
    data: Partial<CreateAnnotationRequest>
  ) => Promise<void>
  deleteAnnotation: (id: number) => Promise<void>
  selectAnnotation: (id: number | null) => void
  setCurrentTool: (tool: ToolType) => void
  setCurrentColor: (color: string) => void
  setIsDrawing: (drawing: boolean) => void
  addLocalAnnotation: (annotation: Annotation) => void
  updateLocalAnnotation: (
    id: number,
    updates: Partial<Annotation>
  ) => void
  removeLocalAnnotation: (id: number) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  pushHistory: () => void
  setStatus: (id: number, status: AnnotationStatus) => void
  clearError: () => void
}

const DEFAULT_COLORS = [
  '#c44536',
  '#1a2e2a',
  '#7a9e7e',
  '#d4c5a0',
  '#88302a',
  '#355459',
]

export { DEFAULT_COLORS }

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  loading: false,
  error: null,
  selectedAnnotationId: null,
  currentTool: 'select',
  currentColor: DEFAULT_COLORS[0],
  isDrawing: false,
  history: [],
  future: [],

  setAnnotations: (annotations) => set({ annotations }),

  fetchAnnotations: async (imageId) => {
    set({ loading: true, error: null })
    try {
      const annotations = await api.annotations.list(imageId)
      set({ annotations, loading: false, history: [], future: [] })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '获取标注列表失败',
      })
    }
  },

  createAnnotation: async (data) => {
    set({ loading: true, error: null })
    try {
      const annotation = await api.annotations.create(data)
      set((state) => ({
        annotations: [...state.annotations, annotation],
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '创建标注失败',
      })
      throw err
    }
  },

  updateAnnotation: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const updated = await api.annotations.update(id, data)
      set((state) => ({
        annotations: state.annotations.map((a) => (a.id === id ? updated : a)),
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '更新标注失败',
      })
      throw err
    }
  },

  deleteAnnotation: async (id) => {
    set({ loading: true, error: null })
    try {
      await api.annotations.delete(id)
      set((state) => ({
        annotations: state.annotations.filter((a) => a.id !== id),
        selectedAnnotationId:
          state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '删除标注失败',
      })
      throw err
    }
  },

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  setCurrentTool: (tool) => set({ currentTool: tool, selectedAnnotationId: null }),

  setCurrentColor: (color) => set({ currentColor: color }),

  setIsDrawing: (drawing) => set({ isDrawing: drawing }),

  addLocalAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
    })),

  updateLocalAnnotation: (id, updates) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  removeLocalAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedAnnotationId:
        state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    })),

  undo: () => {
    const { history, annotations, future } = get()
    if (history.length === 0) return

    const previousState = history[history.length - 1]
    set({
      annotations: previousState.annotations,
      history: history.slice(0, -1),
      future: [{ annotations }, ...future],
    })
  },

  redo: () => {
    const { future, annotations, history } = get()
    if (future.length === 0) return

    const nextState = future[0]
    set({
      annotations: nextState.annotations,
      future: future.slice(1),
      history: [...history, { annotations }],
    })
  },

  canUndo: () => get().history.length > 0,

  canRedo: () => get().future.length > 0,

  pushHistory: () => {
    const { annotations, history } = get()
    set({
      history: [...history, { annotations: [...annotations] }],
      future: [],
    })
  },

  setStatus: (id, status) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, status } : a
      ),
    })),

  clearError: () => set({ error: null }),
}))