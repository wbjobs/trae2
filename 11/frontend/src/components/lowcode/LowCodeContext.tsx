import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { LowCodeComponent, DashboardConfig } from '../../types'

interface LowCodeContextType {
  components: LowCodeComponent[]
  selectedComponent: string | null
  setComponents: (components: LowCodeComponent[]) => void
  selectComponent: (id: string | null) => void
  addComponent: (type: LowCodeComponent['type']) => void
  updateComponent: (id: string, config: Partial<LowCodeComponent>) => void
  removeComponent: (id: string) => void
  moveComponent: (id: string, position: { x: number; y: number }) => void
  resizeComponent: (id: string, size: { width: number; height: number }) => void
  saveDashboard: (name: string) => Promise<DashboardConfig>
  loadDashboard: (config: DashboardConfig) => void
}

const LowCodeContext = createContext<LowCodeContextType | null>(null)

export const LowCodeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [components, setComponents] = useState<LowCodeComponent[]>([])
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)

  const selectComponent = useCallback((id: string | null) => {
    setSelectedComponent(id)
  }, [])

  const addComponent = useCallback((type: LowCodeComponent['type']) => {
    const newComponent: LowCodeComponent = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      config: {},
      position: { x: 20, y: 20 },
      size: { width: 400, height: 300 }
    }
    setComponents((prev) => [...prev, newComponent])
    setSelectedComponent(newComponent.id)
  }, [])

  const updateComponent = useCallback((id: string, config: Partial<LowCodeComponent>) => {
    setComponents((prev) =>
      prev.map((comp) => (comp.id === id ? { ...comp, ...config } : comp))
    )
  }, [])

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((comp) => comp.id !== id))
    if (selectedComponent === id) {
      setSelectedComponent(null)
    }
  }, [selectedComponent])

  const moveComponent = useCallback((id: string, position: { x: number; y: number }) => {
    updateComponent(id, { position })
  }, [updateComponent])

  const resizeComponent = useCallback((id: string, size: { width: number; height: number }) => {
    updateComponent(id, { size })
  }, [updateComponent])

  const saveDashboard = useCallback(async (name: string): Promise<DashboardConfig> => {
    const config: DashboardConfig = {
      id: `dash-${Date.now()}`,
      name,
      components,
      layout: 'free',
      filters: {}
    }
    return config
  }, [components])

  const loadDashboard = useCallback((config: DashboardConfig) => {
    setComponents(config.components || [])
  }, [])

  return (
    <LowCodeContext.Provider
      value={{
        components,
        selectedComponent,
        setComponents,
        selectComponent,
        addComponent,
        updateComponent,
        removeComponent,
        moveComponent,
        resizeComponent,
        saveDashboard,
        loadDashboard
      }}
    >
      {children}
    </LowCodeContext.Provider>
  )
}

export const useLowCode = (): LowCodeContextType => {
  const context = useContext(LowCodeContext)
  if (!context) {
    throw new Error('useLowCode must be used within a LowCodeProvider')
  }
  return context
}