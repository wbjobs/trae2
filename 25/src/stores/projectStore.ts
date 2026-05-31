import { create } from 'zustand'
import type { Project, CreateProjectRequest, RubbingImage } from '@/lib/types'
import api from '@/lib/api'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  images: RubbingImage[]
  currentImage: RubbingImage | null
  loading: boolean
  error: string | null
  fetchProjects: () => Promise<void>
  fetchProject: (id: number) => Promise<void>
  createProject: (data: CreateProjectRequest) => Promise<Project>
  updateProject: (id: number, data: Partial<CreateProjectRequest>) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  fetchImages: (projectId: number) => Promise<void>
  uploadImage: (projectId: number, file: File, name: string) => Promise<RubbingImage>
  setCurrentProject: (project: Project | null) => void
  setCurrentImage: (image: RubbingImage | null) => void
  clearError: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  images: [],
  currentImage: null,
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await api.projects.list()
      set({ projects, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '获取项目列表失败',
      })
    }
  },

  fetchProject: async (id) => {
    set({ loading: true, error: null })
    try {
      const project = await api.projects.get(id)
      set({ currentProject: project, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '获取项目失败',
      })
    }
  },

  createProject: async (data) => {
    set({ loading: true, error: null })
    try {
      const project = await api.projects.create(data)
      set((state) => ({
        projects: [project, ...state.projects],
        loading: false,
      }))
      return project
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '创建项目失败',
      })
      throw err
    }
  },

  updateProject: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const updated = await api.projects.update(id, data)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        currentProject:
          state.currentProject?.id === id ? updated : state.currentProject,
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '更新项目失败',
      })
      throw err
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null })
    try {
      await api.projects.delete(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject:
          state.currentProject?.id === id ? null : state.currentProject,
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '删除项目失败',
      })
      throw err
    }
  },

  fetchImages: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const images = await api.projects.getImages(projectId)
      set({ images, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '获取图片列表失败',
      })
    }
  },

  uploadImage: async (projectId, file, name) => {
    set({ loading: true, error: null })
    try {
      const image = await api.images.upload(projectId, file, name)
      set((state) => ({
        images: [...state.images, image],
        loading: false,
      }))
      return image
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '上传图片失败',
      })
      throw err
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentImage: (image) => set({ currentImage: image }),

  clearError: () => set({ error: null }),
}))