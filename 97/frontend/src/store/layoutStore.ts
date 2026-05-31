import { create } from 'zustand'

export interface LayoutWidget {
  id: string
  type: string
  title: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  props?: Record<string, any>
}

export interface GridConfig {
  cols: number
  rowHeight: number
  margin: [number, number]
  isDraggable: boolean
  isResizable: boolean
  isBounded: boolean
}

interface LayoutConfig {
  widgets: LayoutWidget[]
  grid: GridConfig
  theme: string
}

interface LayoutState {
  currentLayoutId: string
  layoutName: string
  layoutConfig: LayoutConfig | null
  isEditMode: boolean
  isDragging: boolean
  isResizing: boolean
  selectedWidgetId: string | null
  savedLayouts: any[]
  templates: any[]
  
  setCurrentLayout: (layoutId: string) => void
  setLayoutConfig: (config: LayoutConfig) => void
  setLayoutName: (name: string) => void
  setEditMode: (isEdit: boolean) => void
  setDragging: (isDragging: boolean) => void
  setResizing: (isResizing: boolean) => void
  setSelectedWidget: (widgetId: string | null) => void
  
  updateWidgetPosition: (id: string, x: number, y: number, width: number, height: number) => void
  updateWidgetProps: (id: string, props: Record<string, any>) => void
  addWidget: (widget: LayoutWidget) => void
  removeWidget: (id: string) => void
  
  loadLayout: (layoutId: string, userId: string) => Promise<void>
  saveLayout: (userId: string, layoutName?: string) => Promise<string | null>
  loadSavedLayouts: (userId: string) => Promise<void>
  loadTemplates: () => Promise<void>
  
  resetLayout: () => void
}

const DEFAULT_LAYOUT: LayoutConfig = {
  widgets: [
    {
      id: 'stats-1',
      type: 'StatsCard',
      title: '统计概览',
      x: 0,
      y: 0,
      w: 24,
      h: 2,
      minW: 12,
      minH: 1
    },
    {
      id: 'trend-1',
      type: 'MetricTrendChart',
      title: '指标趋势',
      x: 0,
      y: 2,
      w: 16,
      h: 6,
      minW: 8,
      minH: 4,
      props: { metricName: 'temperature' }
    },
    {
      id: 'anomaly-1',
      type: 'AnomalyAlertList',
      title: '异常告警',
      x: 16,
      y: 2,
      w: 8,
      h: 6,
      minW: 4,
      minH: 4
    },
    {
      id: 'device-status-1',
      type: 'DeviceStatusList',
      title: '设备状态',
      x: 0,
      y: 8,
      w: 14,
      h: 7,
      minW: 8,
      minH: 4
    },
    {
      id: 'comparison-1',
      type: 'DeviceComparisonChart',
      title: '设备对比',
      x: 14,
      y: 8,
      w: 10,
      h: 7,
      minW: 6,
      minH: 4
    },
    {
      id: 'realtime-1',
      type: 'RealtimeDataPanel',
      title: '实时监控',
      x: 0,
      y: 15,
      w: 24,
      h: 4,
      minW: 12,
      minH: 2
    }
  ],
  grid: {
    cols: 24,
    rowHeight: 50,
    margin: [10, 10],
    isDraggable: true,
    isResizable: true,
    isBounded: true
  },
  theme: 'dark'
}

const WIDGET_TYPES = [
  { type: 'StatsCard', name: '统计卡片', icon: 'BarChartOutlined' },
  { type: 'MetricTrendChart', name: '指标趋势', icon: 'LineChartOutlined' },
  { type: 'DeviceComparisonChart', name: '设备对比', icon: 'BarChartOutlined' },
  { type: 'DeviceStatusList', name: '设备状态', icon: 'TableOutlined' },
  { type: 'AnomalyAlertList', name: '异常告警', icon: 'WarningOutlined' },
  { type: 'RealtimeDataPanel', name: '实时监控', icon: ' ThunderboltOutlined' }
]

export const useLayoutStore = create<LayoutState>((set, get) => ({
  currentLayoutId: 'default',
  layoutName: '默认布局',
  layoutConfig: DEFAULT_LAYOUT,
  isEditMode: false,
  isDragging: false,
  isResizing: false,
  selectedWidgetId: null,
  savedLayouts: [],
  templates: [],
  
  widgetTypes: WIDGET_TYPES,

  setCurrentLayout: (layoutId: string) => set({ currentLayoutId: layoutId }),
  
  setLayoutConfig: (config: LayoutConfig) => set({ layoutConfig: config }),
  
  setLayoutName: (name: string) => set({ layoutName: name }),
  
  setEditMode: (isEdit: boolean) => set({ isEditMode: isEdit }),
  
  setDragging: (isDragging: boolean) => set({ isDragging }),
  
  setResizing: (isResizing: boolean) => set({ isResizing }),
  
  setSelectedWidget: (widgetId: string | null) => set({ selectedWidgetId: widgetId }),

  updateWidgetPosition: (id: string, x: number, y: number, width: number, height: number) => {
    const config = get().layoutConfig
    if (!config) return
    
    const updatedWidgets = config.widgets.map(w => 
      w.id === id ? { ...w, x, y, w: width, h: height } : w
    )
    
    set({
      layoutConfig: {
        ...config,
        widgets: updatedWidgets
      }
    })
  },
  
  updateWidgetProps: (id: string, props: Record<string, any>) => {
    const config = get().layoutConfig
    if (!config) return
    
    const updatedWidgets = config.widgets.map(w => 
      w.id === id ? { ...w, props: { ...w.props, ...props } } : w
    )
    
    set({
      layoutConfig: {
        ...config,
        widgets: updatedWidgets
      }
    })
  },
  
  addWidget: (widget: LayoutWidget) => {
    const config = get().layoutConfig
    if (!config) return
    
    set({
      layoutConfig: {
        ...config,
        widgets: [...config.widgets, widget]
      }
    })
  },
  
  removeWidget: (id: string) => {
    const config = get().layoutConfig
    if (!config) return
    
    set({
      layoutConfig: {
        ...config,
        widgets: config.widgets.filter(w => w.id !== id)
      },
      selectedWidgetId: null
    })
  },

  loadLayout: async (layoutId: string, userId: string) => {
    try {
      const { layoutApi } = await import('@/services/api')
      const response = await layoutApi.getLayout(layoutId, userId)
      if (response.data.success) {
        set({
          currentLayoutId: layoutId,
          layoutName: response.data.layout_name,
          layoutConfig: response.data.config
        })
      }
    } catch (error) {
      console.error('加载布局失败:', error)
      set({ layoutConfig: DEFAULT_LAYOUT })
    }
  },
  
  saveLayout: async (userId: string, layoutName?: string): Promise<string | null> => {
    try {
      const { layoutApi } = await import('@/services/api')
      const { layoutConfig, currentLayoutId, layoutName: currentName } = get()
      
      if (!layoutConfig) return null
      
      const name = layoutName || currentName
      
      if (currentLayoutId === 'default') {
        const response = await layoutApi.createLayout({
          layout_name: name,
          user_id: userId,
          config: layoutConfig,
          is_default: false
        })
        
        if (response.data.success) {
          set({ currentLayoutId: response.data.layout_id, layoutName: name })
          await get().loadSavedLayouts(userId)
          return response.data.layout_id
        }
      } else {
        const response = await layoutApi.updateLayout(
          currentLayoutId,
          userId,
          {
            layout_name: name,
            config: layoutConfig
          }
        )
        
        if (response.data.success) {
          set({ layoutName: name })
          await get().loadSavedLayouts(userId)
          return currentLayoutId
        }
      }
      return null
    } catch (error) {
      console.error('保存布局失败:', error)
      return null
    }
  },
  
  loadSavedLayouts: async (userId: string) => {
    try {
      const { layoutApi } = await import('@/services/api')
      const response = await layoutApi.getLayoutList(userId)
      if (response.data.success) {
        set({ savedLayouts: response.data.layouts || [] })
      }
    } catch (error) {
      console.error('加载布局列表失败:', error)
    }
  },
  
  loadTemplates: async () => {
    try {
      const { layoutApi } = await import('@/services/api')
      const response = await layoutApi.getTemplates()
      if (response.data.success) {
        set({ templates: response.data.templates || [] })
      }
    } catch (error) {
      console.error('加载模板失败:', error)
    }
  },

  resetLayout: () => set({
    layoutConfig: { ...DEFAULT_LAYOUT },
    currentLayoutId: 'default',
    layoutName: '默认布局',
    isEditMode: false,
    selectedWidgetId: null
  })
}))
