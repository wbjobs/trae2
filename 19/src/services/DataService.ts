import { Pipeline, Device, Layer } from '../types'

export interface ApiConfig {
  baseUrl: string
  timeout?: number
  headers?: Record<string, string>
}

export interface DataResponse<T> {
  code: number
  message: string
  data: T
}

export class DataService {
  private config: ApiConfig
  private mockData: {
    pipelines: Pipeline[]
    devices: Device[]
    layers: Layer[]
  }

  constructor(config: ApiConfig) {
    this.config = {
      timeout: 10000,
      ...config
    }
    this.mockData = this.generateMockData()
  }

  private generateMockData(): {
    pipelines: Pipeline[]
    devices: Device[]
    layers: Layer[]
  } {
    const layers: Layer[] = [
      { id: 'layer-water', name: '水管网', visible: true, type: 'pipeline', opacity: 1 },
      { id: 'layer-gas', name: '气管网', visible: true, type: 'pipeline', opacity: 1 },
      { id: 'layer-oil', name: '油管网', visible: true, type: 'pipeline', opacity: 1 },
      { id: 'layer-steam', name: '蒸汽管网', visible: true, type: 'pipeline', opacity: 1 },
      { id: 'layer-electric', name: '电力管网', visible: true, type: 'pipeline', opacity: 1 },
      { id: 'layer-pumps', name: '泵组', visible: true, type: 'device', opacity: 1 },
      { id: 'layer-valves', name: '阀门', visible: true, type: 'device', opacity: 1 },
      { id: 'layer-tanks', name: '储罐', visible: true, type: 'device', opacity: 1 },
      { id: 'layer-sensors', name: '传感器', visible: true, type: 'device', opacity: 1 }
    ]

    const devices: Device[] = [
      {
        id: 'pump-1',
        name: '主供水泵',
        type: 'pump',
        position: { x: -30, y: 0, z: -20 },
        status: 'running',
        layerId: 'layer-pumps',
        parameters: { flowRate: 120, pressure: 3.5, power: 75, temperature: 45 },
        connectedPipelines: ['pipe-1', 'pipe-2']
      },
      {
        id: 'pump-2',
        name: '备用供水泵',
        type: 'pump',
        position: { x: -30, y: 0, z: -10 },
        status: 'stopped',
        layerId: 'layer-pumps',
        parameters: { flowRate: 0, pressure: 0, power: 0, temperature: 25 },
        connectedPipelines: ['pipe-1', 'pipe-3']
      },
      {
        id: 'valve-1',
        name: '主进水阀',
        type: 'valve',
        position: { x: -15, y: 0, z: -15 },
        status: 'running',
        layerId: 'layer-valves',
        parameters: { openPercent: 100, pressureIn: 3.2, pressureOut: 3.0 },
        connectedPipelines: ['pipe-2', 'pipe-4']
      },
      {
        id: 'valve-2',
        name: '旁通阀',
        type: 'valve',
        position: { x: -15, y: 0, z: -5 },
        status: 'maintenance',
        layerId: 'layer-valves',
        parameters: { openPercent: 0, pressureIn: 0, pressureOut: 0 },
        connectedPipelines: ['pipe-3', 'pipe-5']
      },
      {
        id: 'tank-1',
        name: '清水储罐A',
        type: 'tank',
        position: { x: 20, y: 0, z: -20 },
        status: 'running',
        layerId: 'layer-tanks',
        parameters: { capacity: 5000, currentLevel: 3800, temperature: 22 },
        connectedPipelines: ['pipe-4', 'pipe-6']
      },
      {
        id: 'tank-2',
        name: '清水储罐B',
        type: 'tank',
        position: { x: 20, y: 0, z: 0 },
        status: 'running',
        layerId: 'layer-tanks',
        parameters: { capacity: 5000, currentLevel: 4200, temperature: 23 },
        connectedPipelines: ['pipe-5', 'pipe-7']
      },
      {
        id: 'sensor-1',
        name: '流量传感器1',
        type: 'sensor',
        position: { x: 0, y: 0, z: -15 },
        status: 'running',
        layerId: 'layer-sensors',
        parameters: { flowRate: 85, unit: 'm³/h' },
        connectedPipelines: ['pipe-4']
      },
      {
        id: 'sensor-2',
        name: '压力传感器1',
        type: 'sensor',
        position: { x: 0, y: 0, z: -5 },
        status: 'fault',
        layerId: 'layer-sensors',
        parameters: { pressure: 2.8, unit: 'MPa' },
        connectedPipelines: ['pipe-5']
      },
      {
        id: 'pump-3',
        name: '循环泵1#',
        type: 'pump',
        position: { x: -20, y: 0, z: 20 },
        status: 'running',
        layerId: 'layer-pumps',
        parameters: { flowRate: 90, pressure: 2.8, power: 55, temperature: 42 },
        connectedPipelines: ['pipe-8', 'pipe-9']
      },
      {
        id: 'heat-1',
        name: '换热器1#',
        type: 'heatExchanger',
        position: { x: 0, y: 0, z: 20 },
        status: 'running',
        layerId: 'layer-pumps',
        parameters: { tempIn: 85, tempOut: 45, efficiency: 0.92 },
        connectedPipelines: ['pipe-9', 'pipe-10']
      },
      {
        id: 'valve-3',
        name: '蒸汽主阀',
        type: 'valve',
        position: { x: 20, y: 0, z: 20 },
        status: 'running',
        layerId: 'layer-valves',
        parameters: { openPercent: 75, pressureIn: 1.2, pressureOut: 1.0 },
        connectedPipelines: ['pipe-11', 'pipe-12']
      },
      {
        id: 'sensor-3',
        name: '温度传感器1',
        type: 'sensor',
        position: { x: 35, y: 0, z: 10 },
        status: 'running',
        layerId: 'layer-sensors',
        parameters: { temperature: 165, unit: '°C' },
        connectedPipelines: ['pipe-11']
      }
    ]

    const pipelines: Pipeline[] = [
      { id: 'pipe-1', name: '进水总管', type: 'water', startPoint: { x: -45, y: 0, z: -15 }, endPoint: { x: -30, y: 0, z: -15 }, diameter: 0.8, status: 'normal', layerId: 'layer-water', flowRate: 120, pressure: 3.5 },
      { id: 'pipe-2', name: '泵1出水管', type: 'water', startPoint: { x: -30, y: 0, z: -20 }, endPoint: { x: -15, y: 0, z: -15 }, diameter: 0.6, status: 'normal', layerId: 'layer-water', flowRate: 85, pressure: 3.2 },
      { id: 'pipe-3', name: '泵2出水管', type: 'water', startPoint: { x: -30, y: 0, z: -10 }, endPoint: { x: -15, y: 0, z: -5 }, diameter: 0.6, status: 'normal', layerId: 'layer-water', flowRate: 0, pressure: 0 },
      { id: 'pipe-4', name: '输水主管A', type: 'water', startPoint: { x: -15, y: 0, z: -15 }, endPoint: { x: 20, y: 0, z: -20 }, diameter: 0.8, status: 'normal', layerId: 'layer-water', flowRate: 85, pressure: 3.0 },
      { id: 'pipe-5', name: '输水主管B', type: 'water', startPoint: { x: -15, y: 0, z: -5 }, endPoint: { x: 20, y: 0, z: 0 }, diameter: 0.8, status: 'warning', layerId: 'layer-water', flowRate: 35, pressure: 2.8 },
      { id: 'pipe-6', name: '储罐A出水管', type: 'water', startPoint: { x: 20, y: 0, z: -20 }, endPoint: { x: 35, y: 0, z: -10 }, diameter: 0.6, status: 'normal', layerId: 'layer-water', flowRate: 50, pressure: 2.5 },
      { id: 'pipe-7', name: '储罐B出水管', type: 'water', startPoint: { x: 20, y: 0, z: 0 }, endPoint: { x: 35, y: 0, z: -10 }, diameter: 0.6, status: 'alarm', layerId: 'layer-water', flowRate: 60, pressure: 2.3 },
      { id: 'pipe-8', name: '循环进水管', type: 'water', startPoint: { x: -35, y: 0, z: 20 }, endPoint: { x: -20, y: 0, z: 20 }, diameter: 0.5, status: 'normal', layerId: 'layer-water', flowRate: 90, pressure: 2.8 },
      { id: 'pipe-9', name: '换热器进水管', type: 'water', startPoint: { x: -20, y: 0, z: 20 }, endPoint: { x: 0, y: 0, z: 20 }, diameter: 0.5, status: 'normal', layerId: 'layer-water', flowRate: 90, pressure: 2.6 },
      { id: 'pipe-10', name: '换热器出水管', type: 'water', startPoint: { x: 0, y: 0, z: 20 }, endPoint: { x: 20, y: 0, z: 20 }, diameter: 0.5, status: 'normal', layerId: 'layer-water', flowRate: 90, pressure: 2.4 },
      { id: 'pipe-11', name: '蒸汽主管', type: 'steam', startPoint: { x: 35, y: 0, z: 10 }, endPoint: { x: 20, y: 0, z: 20 }, diameter: 0.4, status: 'normal', layerId: 'layer-steam', flowRate: 15, pressure: 1.2, temperature: 165 },
      { id: 'pipe-12', name: '蒸汽支管', type: 'steam', startPoint: { x: 20, y: 0, z: 20 }, endPoint: { x: 5, y: 0, z: 35 }, diameter: 0.3, status: 'normal', layerId: 'layer-steam', flowRate: 8, pressure: 1.0, temperature: 160 },
      { id: 'pipe-13', name: '燃气主管', type: 'gas', startPoint: { x: -40, y: 0, z: 30 }, endPoint: { x: -10, y: 0, z: 30 }, diameter: 0.5, status: 'normal', layerId: 'layer-gas', flowRate: 200, pressure: 0.8 },
      { id: 'pipe-14', name: '燃气支管', type: 'gas', startPoint: { x: -10, y: 0, z: 30 }, endPoint: { x: 10, y: 0, z: 35 }, diameter: 0.3, status: 'normal', layerId: 'layer-gas', flowRate: 80, pressure: 0.7 },
      { id: 'pipe-15', name: '原油管道', type: 'oil', startPoint: { x: -40, y: 0, z: -30 }, endPoint: { x: -10, y: 0, z: -30 }, diameter: 0.6, status: 'normal', layerId: 'layer-oil', flowRate: 500, pressure: 4.0, temperature: 35 },
      { id: 'pipe-16', name: '电力电缆沟', type: 'electric', startPoint: { x: -30, y: 0, z: 35 }, endPoint: { x: 10, y: 0, z: 35 }, diameter: 1.0, status: 'normal', layerId: 'layer-electric' }
    ]

    return { pipelines, devices, layers }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<DataResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`
    const headers = {
      'Content-Type': 'application/json',
      ...this.config.headers
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.warn(`API request failed for ${endpoint}, using mock data:`, error)
      throw error
    }
  }

  public async getPipelines(): Promise<Pipeline[]> {
    try {
      const response = await this.request<Pipeline[]>('/api/pipelines')
      return response.data
    } catch {
      return this.mockData.pipelines
    }
  }

  public async getPipeline(id: string): Promise<Pipeline | null> {
    try {
      const response = await this.request<Pipeline>(`/api/pipelines/${id}`)
      return response.data
    } catch {
      return this.mockData.pipelines.find(p => p.id === id) || null
    }
  }

  public async getDevices(): Promise<Device[]> {
    try {
      const response = await this.request<Device[]>('/api/devices')
      return response.data
    } catch {
      return this.mockData.devices
    }
  }

  public async getDevice(id: string): Promise<Device | null> {
    try {
      const response = await this.request<Device>(`/api/devices/${id}`)
      return response.data
    } catch {
      return this.mockData.devices.find(d => d.id === id) || null
    }
  }

  public async getLayers(): Promise<Layer[]> {
    try {
      const response = await this.request<Layer[]>('/api/layers')
      return response.data
    } catch {
      return this.mockData.layers
    }
  }

  public async updateLayer(layer: Partial<Layer> & { id: string }): Promise<Layer | null> {
    try {
      const response = await this.request<Layer>('/api/layers', {
        method: 'PUT',
        body: JSON.stringify(layer)
      })
      return response.data
    } catch {
      const mockLayer = this.mockData.layers.find(l => l.id === layer.id)
      if (mockLayer) {
        Object.assign(mockLayer, layer)
        return mockLayer
      }
      return null
    }
  }

  public async getDeviceRealtimeData(deviceId: string): Promise<Record<string, any> | null> {
    try {
      const response = await this.request<Record<string, any>>(`/api/devices/${deviceId}/realtime`)
      return response.data
    } catch {
      const device = this.mockData.devices.find(d => d.id === deviceId)
      return device?.parameters || null
    }
  }

  public async getPipelineRealtimeData(pipelineId: string): Promise<Record<string, any> | null> {
    try {
      const response = await this.request<Record<string, any>>(`/api/pipelines/${pipelineId}/realtime`)
      return response.data
    } catch {
      const pipeline = this.mockData.pipelines.find(p => p.id === pipelineId)
      if (pipeline) {
        return {
          flowRate: pipeline.flowRate,
          pressure: pipeline.pressure,
          temperature: pipeline.temperature,
          status: pipeline.status
        }
      }
      return null
    }
  }

  public async getAlarms(): Promise<Array<{
    id: string
    type: string
    level: 'info' | 'warning' | 'alarm'
    message: string
    timestamp: string
    sourceId: string
    sourceType: 'pipeline' | 'device'
  }>> {
    try {
      const response = await this.request<any[]>('/api/alarms')
      return response.data
    } catch {
      return [
        {
          id: 'alarm-1',
          type: 'pressure',
          level: 'alarm',
          message: '储罐B出水管道压力异常偏低',
          timestamp: new Date().toISOString(),
          sourceId: 'pipe-7',
          sourceType: 'pipeline'
        },
        {
          id: 'alarm-2',
          type: 'flow',
          level: 'warning',
          message: '输水主管B流量低于阈值',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          sourceId: 'pipe-5',
          sourceType: 'pipeline'
        },
        {
          id: 'alarm-3',
          type: 'sensor',
          level: 'alarm',
          message: '压力传感器2通讯故障',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          sourceId: 'sensor-2',
          sourceType: 'device'
        }
      ]
    }
  }

  public async getStatistics(): Promise<{
    totalPipelines: number
    totalDevices: number
    runningDevices: number
    alarmCount: number
    warningCount: number
    totalPipelineLength: number
  }> {
    try {
      const response = await this.request<any>('/api/statistics')
      return response.data
    } catch {
      return {
        totalPipelines: this.mockData.pipelines.length,
        totalDevices: this.mockData.devices.length,
        runningDevices: this.mockData.devices.filter(d => d.status === 'running').length,
        alarmCount: this.mockData.pipelines.filter(p => p.status === 'alarm').length +
                   this.mockData.devices.filter(d => d.status === 'fault').length,
        warningCount: this.mockData.pipelines.filter(p => p.status === 'warning').length +
                      this.mockData.devices.filter(d => d.status === 'maintenance').length,
        totalPipelineLength: this.mockData.pipelines.reduce((sum, p) => {
          const dx = p.endPoint.x - p.startPoint.x
          const dy = p.endPoint.y - p.startPoint.y
          const dz = p.endPoint.z - p.startPoint.z
          return sum + Math.sqrt(dx * dx + dy * dy + dz * dz)
        }, 0)
      }
    }
  }

  public subscribeToRealtimeData(
    callback: (data: { type: 'pipeline' | 'device'; id: string; data: Record<string, any> }) => void
  ): () => void {
    const interval = setInterval(() => {
      const randomPipeline = this.mockData.pipelines[Math.floor(Math.random() * this.mockData.pipelines.length)]
      if (randomPipeline && randomPipeline.flowRate !== undefined) {
        callback({
          type: 'pipeline',
          id: randomPipeline.id,
          data: {
            flowRate: randomPipeline.flowRate + (Math.random() - 0.5) * 10,
            pressure: randomPipeline.pressure ? randomPipeline.pressure + (Math.random() - 0.5) * 0.2 : undefined
          }
        })
      }
    }, 5000)

    return () => clearInterval(interval)
  }
}
