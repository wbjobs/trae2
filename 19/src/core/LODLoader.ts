import * as THREE from 'three'
import { Pipeline, Device, Point3D } from '../types'

export interface LoadedObject {
  id: string
  type: 'pipeline' | 'device' | 'environment'
  object: THREE.Object3D
  level: 'high' | 'medium' | 'low' | 'none'
  lastActiveTime: number
  visible: boolean
}

export interface LODConfig {
  highDetailDistance: number
  mediumDetailDistance: number
  lowDetailDistance: number
  cullingDistance: number
  maxVisibleObjects: number
  updateInterval: number
}

const DEFAULT_CONFIG: LODConfig = {
  highDetailDistance: 50,
  mediumDetailDistance: 100,
  lowDetailDistance: 200,
  cullingDistance: 500,
  maxVisibleObjects: 200,
  updateInterval: 100
}

export class LODLoader {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private loadedObjects: Map<string, LoadedObject> = new Map()
  private config: LODConfig
  private lastUpdateTime: number = 0
  private cameraPosition: THREE.Vector3 = new THREE.Vector3()
  private frustum: THREE.Frustum = new THREE.Frustum()
  private projectionScreenMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private onVisibilityChangeCallback: ((visibleIds: string[], hiddenIds: string[]) => void | null = null
  private performanceMonitor: {
    totalObjects: number
    visibleObjects: number
    highDetailCount: number
    mediumDetailCount: number
    lowDetailCount: number
    culledObjects: number
    lastUpdateDuration: number
  } = {
    totalObjects: 0,
    visibleObjects: 0,
    highDetailCount: 0,
    mediumDetailCount: 0,
    lowDetailCount: 0,
    culledObjects: 0,
    lastUpdateDuration: 0
  }

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config?: Partial<LODConfig>
  ) {
    this.scene = scene
    this.camera = camera
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  public registerObject(
    id: string,
    type: 'pipeline' | 'device' | 'environment',
    object: THREE.Object3D
  ) {
    if (this.loadedObjects.has(id)) {
      return
    }

    const loadedObject: LoadedObject = {
      id,
      type,
      object,
      level: 'high',
      lastActiveTime: Date.now(),
      visible: true
    }

    this.loadedObjects.set(id, loadedObject)
    this.performanceMonitor.totalObjects++
  }

  public unregisterObject(id: string) {
    const obj = this.loadedObjects.get(id)
    if (obj) {
      this.scene.remove(obj.object)
      this.loadedObjects.delete(id)
      this.performanceMonitor.totalObjects--
    }
  }

  public update(force: boolean = false) {
    const currentTime = Date.now()

    if (!force && (currentTime - this.lastUpdateTime) < this.config.updateInterval) {
      return
    }

    this.lastUpdateTime = currentTime
    const startTime = performance.now()

    this.camera.getWorldPosition(this.cameraPosition)
    this.projectionScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    this.frustum.setFromProjectionMatrix(this.projectionScreenMatrix)

    const visibleIds: string[] = []
    const hiddenIds: string[] = []
    let highCount = 0
    let mediumCount = 0
    let lowCount = 0
    let culledCount = 0

    const objectDistances: Array<{ id: string; distance: number }> = []

    this.loadedObjects.forEach((obj, id) => {
      const objectPosition = new THREE.Vector3()
      obj.object.getWorldPosition(objectPosition)
      const distance = this.cameraPosition.distanceTo(objectPosition)
      objectDistances.push({ id, distance })
    })

    objectDistances.sort((a, b) => a.distance - b.distance)

    let visibleCount = 0

    objectDistances.forEach(({ id, distance }) => {
      const obj = this.loadedObjects.get(id)
      if (!obj) {
        return
      }

      const isInView = this.frustum.intersectsObject(obj.object)
      const shouldBeVisible = distance < this.config.cullingDistance && 
                           isInView && 
                           visibleCount < this.config.maxVisibleObjects

      if (shouldBeVisible) {
        visibleCount++
        this.updateObjectLevel(obj, distance)

        if (!obj.visible) {
          obj.visible = true
          obj.object.visible = true
          visibleIds.push(id)
        }

        obj.lastActiveTime = currentTime

        if (obj.level === 'high') highCount++
        else if (obj.level === 'medium') mediumCount++
        else lowCount++
      } else {
        if (obj.visible) {
          obj.visible = false
          obj.object.visible = false
          hiddenIds.push(id)
        }
        culledCount++
      }
    })

    this.performanceMonitor.visibleObjects = visibleCount
    this.performanceMonitor.highDetailCount = highCount
    this.performanceMonitor.mediumDetailCount = mediumCount
    this.performanceMonitor.lowDetailCount = lowCount
    this.performanceMonitor.culledObjects = culledCount
    this.performanceMonitor.lastUpdateDuration = performance.now() - startTime

    if ((visibleIds.length > 0 || hiddenIds.length > 0) && this.onVisibilityChangeCallback) {
      this.onVisibilityChangeCallback(visibleIds, hiddenIds)
    }
  }

  private updateObjectLevel(obj: LoadedObject, distance: number) {
    let newLevel: 'high' | 'medium' | 'low' = 'high'

    if (distance > this.config.lowDetailDistance) {
      newLevel = 'low'
    } else if (distance > this.config.mediumDetailDistance) {
      newLevel = 'medium'
    }

    if (newLevel !== obj.level) {
      obj.level = newLevel
      this.applyLevelToObject(obj, newLevel)
    }
  }

  private applyLevelToObject(obj: LoadedObject, level: 'high' | 'medium' | 'low') {
    if (obj.type === 'pipeline') {
      obj.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const segments = level === 'high' ? 16 : level === 'medium' ? 8 : 4
          const material = child.material as THREE.MeshStandardMaterial
          
          if (material.map) {
            material.map.minFilter = level === 'high' ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter
          }

          if (child.geometry instanceof THREE.CylinderGeometry) {
            const oldGeo = child.geometry
            const newGeo = new THREE.CylinderGeometry(
              (oldGeo.parameters as any).radiusTop,
              (oldGeo.parameters as any).radiusBottom,
              (oldGeo.parameters as any).height,
              segments
            )
            child.geometry.dispose()
            child.geometry = newGeo
          }
        }
      })
    }
  }

  public getPerformanceStats() {
    return { ...this.performanceMonitor }
  }

  public getVisibleObjects(): LoadedObject[] {
    return Array.from(this.loadedObjects.values()).filter(obj => obj.visible)
  }

  public getObjectById(id: string): LoadedObject | undefined {
    return this.loadedObjects.get(id)
  }

  public setOnVisibilityChangeCallback(callback: (visibleIds: string[], hiddenIds: string[]) => void) {
    this.onVisibilityChangeCallback = callback
  }

  public setConfig(config: Partial<LODConfig>) {
    this.config = { ...this.config, ...config }
  }

  public getConfig(): LODConfig {
    return { ...this.config }
  }

  public getRegisteredObjectIds(): string[] {
    return Array.from(this.loadedObjects.keys())
  }

  public clear() {
    this.loadedObjects.forEach((obj) => {
      this.scene.remove(obj.object)
    })
    this.loadedObjects.clear()
    this.performanceMonitor = {
      totalObjects: 0,
      visibleObjects: 0,
      highDetailCount: 0,
      mediumDetailCount: 0,
      lowDetailCount: 0,
      culledObjects: 0,
      lastUpdateDuration: 0
    }
  }

  public prioritizeObject(id: string, priority: boolean) {
    const obj = this.loadedObjects.get(id)
    if (obj) {
      obj.lastActiveTime = priority ? Date.now() + 10000 : Date.now()
    }
  }

  public getStatistics() {
    const types = {
      pipeline: 0,
      device: 0,
      environment: 0
    }

    this.loadedObjects.forEach(obj => {
      types[obj.type]++
    })

    return {
      total: this.loadedObjects.size,
      ...types,
      ...this.performanceMonitor
    }
  }
}
