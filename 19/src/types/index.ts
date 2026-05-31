export interface Point3D {
  x: number
  y: number
  z: number
}

export interface Pipeline {
  id: string
  name: string
  type: 'water' | 'gas' | 'oil' | 'steam' | 'electric'
  startPoint: Point3D
  endPoint: Point3D
  diameter: number
  status: 'normal' | 'warning' | 'alarm'
  layerId: string
  flowRate?: number
  pressure?: number
  temperature?: number
}

export interface Device {
  id: string
  name: string
  type: 'pump' | 'valve' | 'tank' | 'sensor' | 'heatExchanger'
  position: Point3D
  status: 'running' | 'stopped' | 'maintenance' | 'fault'
  layerId: string
  parameters: Record<string, any>
  connectedPipelines: string[]
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  type: 'pipeline' | 'device' | 'terrain' | 'building'
  opacity: number
}

export interface TopologyNode {
  id: string
  type: 'device' | 'junction'
  position: Point3D
  connections: string[]
}

export interface TopologyPath {
  startId: string
  endId: string
  pipelineIds: string[]
  distance: number
}

export interface SceneConfig {
  containerId: string
  backgroundColor: number
  ambientLightIntensity: number
  directionalLightIntensity: number
  cameraPosition: Point3D
  cameraTarget: Point3D
}
