import * as THREE from 'three'
import { Point3D } from '../types'

export interface MeasureResult {
  id: string
  startPoint: Point3D
  endPoint: Point3D
  distance: number
}

export interface MeasureToolState {
  isActive: boolean
  measurePoints: Point3D[]
  measures: MeasureResult[]
}

export class MeasureTool {
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  private measureLines: Map<string, THREE.Line> = new Map()
  private measureMarkers: Map<string, THREE.Mesh> = new Map()
  private previewLine: THREE.Line | null = null
  private markersGroup: THREE.Group
  private linesGroup: THREE.Group
  private state: MeasureToolState = {
    isActive: false,
    measurePoints: [],
    measures: []
  }
  private onStateChangeCallback: ((state: MeasureToolState) => void | null = null
  private onMeasureCompleteCallback: ((measure: MeasureResult) => void | null = null

  constructor(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene
  ) {
    this.camera = camera
    this.renderer = renderer
    this.scene = scene
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Line.threshold = 1
    this.mouse = new THREE.Vector2()

    this.markersGroup = new THREE.Group()
    this.markersGroup.name = 'measure_markers'
    this.scene.add(this.markersGroup)

    this.linesGroup = new THREE.Group()
    this.linesGroup.name = 'measure_lines'
    this.scene.add(this.linesGroup)
  }

  public activate() {
    this.state.isActive = true
    this.state.measurePoints = []
    this.notifyStateChange()
  }

  public deactivate() {
    this.state.isActive = false
    this.clearPreview()
    this.state.measurePoints = []
    this.notifyStateChange()
  }

  public handleClick(event: MouseEvent) {
    if (!this.state.isActive) {
      return
    }

    const point = this.getIntersectionPoint(event)
    if (!point) {
      return
    }

    this.state.measurePoints.push({ x: point.x, y: point.y, z: point.z })

    if (this.state.measurePoints.length === 2) {
      this.completeMeasure()
    } else {
      this.addMeasureMarker(point)
    }

    this.notifyStateChange()
  }

  public handleMouseMove(event: MouseEvent) {
    if (!this.state.isActive || this.state.measurePoints.length !== 1) {
      return
    }

    this.updateMeasurePreview(event)
  }

  public cancelMeasure() {
    this.state.measurePoints = []
    this.clearMarkers()
    this.clearPreview()
    this.notifyStateChange()
  }

  public clearAll() {
    this.state.measurePoints = []
    this.state.measures = []
    this.clearMarkers()
    this.clearPreview()
    this.clearLines()
    this.notifyStateChange()
  }

  public clearMeasureById(id: string) {
    const index = this.state.measures.findIndex(m => m.id === id)
    if (index !== -1) {
      this.state.measures.splice(index, 1)
      this.clearLineById(id)
    }
    this.notifyStateChange()
  }

  public getState(): MeasureToolState {
    return { ...this.state }
  }

  public getMeasures(): MeasureResult[] {
    return [...this.state.measures]
  }

  public calculateDistance(p1: Point3D, p2: Point3D): number {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dz = p2.z - p1.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  public formatDistance(distance: number): string {
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(2)} km`
    } else if (distance >= 1) {
      return `${distance.toFixed(2)} m`
    } else {
      return `${(distance * 100).toFixed(2)} cm`
    }
  }

  public setOnStateChangeCallback(callback: (state: MeasureToolState) => void) {
    this.onStateChangeCallback = callback
  }

  public setOnMeasureCompleteCallback(callback: (measure: MeasureResult) => void) {
    this.onMeasureCompleteCallback = callback
  }

  public dispose() {
    this.clearAll()
    this.scene.remove(this.markersGroup)
    this.scene.remove(this.linesGroup)
  }

  private getIntersectionPoint(event: MouseEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const intersectPoint = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(groundPlane, intersectPoint)

    if (intersectPoint && isFinite(intersectPoint.x) && isFinite(intersectPoint.y) && isFinite(intersectPoint.z)) {
      return intersectPoint
    }

    return null
  }

  private addMeasureMarker(point: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(0.4, 16, 16)
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff3333, 
      depthTest: false,
      transparent: true,
      opacity: 0.9
    })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(point)
    marker.renderOrder = 999
    marker.userData.type = 'measure_marker'
    
    this.markersGroup.add(marker)

    const id = `marker_${Date.now()}_${this.state.measurePoints.length}`
    this.measureMarkers.set(id, marker)

    this.addMarkerLabel(point)
  }

  private addMarkerLabel(point: THREE.Vector3) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    canvas.width = 128
    canvas.height = 64

    context.fillStyle = '#ff3333'
    context.beginPath()
    context.arc(64, 32, 20, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#ffffff'
    context.font = 'bold 24px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(`${this.state.measurePoints.length}`, 64, 32)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      depthTest: false,
      transparent: true
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(point.x, point.y + 2, point.z)
    sprite.scale.set(2, 1, 1)
    sprite.renderOrder = 999
    sprite.userData.type = 'measure_label'
    
    this.markersGroup.add(sprite)
  }

  private updateMeasurePreview(event: MouseEvent) {
    const endPoint = this.getIntersectionPoint(event)
    if (!endPoint || this.state.measurePoints.length === 0) {
      return
    }

    const startPoint = this.state.measurePoints[0]
    const startVector = new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z)

    this.clearPreview()

    const points = [startVector, endPoint]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({ 
      color: 0xff3333, 
      linewidth: 2,
      dashSize: 0.5,
      gapSize: 0.3,
      transparent: true,
      opacity: 0.8
    })
    this.previewLine = new THREE.Line(geometry, material)
    this.previewLine.computeLineDistances()
    this.previewLine.renderOrder = 998
    this.linesGroup.add(this.previewLine)

    const distance = this.calculateDistance(startPoint, { 
      x: endPoint.x, 
      y: endPoint.y, 
      z: endPoint.z 
    })
    
    this.showDistanceLabel(startVector, endPoint, distance)
  }

  private showDistanceLabel(start: THREE.Vector3, end: THREE.Vector3, distance: number) {
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    canvas.width = 256
    canvas.height = 64

    context.fillStyle = 'rgba(255, 51, 51, 0.9)'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.beginPath()
    context.roundRect(10, 10, 236, 44, 8)
    context.fill()
    context.stroke()

    context.fillStyle = '#ffffff'
    context.font = 'bold 20px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(this.formatDistance(distance), 128, 32)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      depthTest: false,
      transparent: true
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(midPoint)
    sprite.position.y += 1
    sprite.scale.set(4, 1, 1)
    sprite.renderOrder = 999
    sprite.name = 'distance_preview'
    
    this.markersGroup.children = this.markersGroup.children.filter(
      child => child.name !== 'distance_preview'
    )
    this.markersGroup.add(sprite)
  }

  private completeMeasure() {
    const [start, end] = this.state.measurePoints
    const distance = this.calculateDistance(start, end)

    const measure: MeasureResult = {
      id: `measure_${Date.now()}`,
      startPoint: start,
      endPoint: end,
      distance
    }

    this.state.measures.push(measure)
    this.addMeasureLine(measure)
    this.state.measurePoints = []

    this.clearPreview()

    this.onMeasureCompleteCallback?.(measure)
    this.notifyStateChange()
  }

  private addMeasureLine(measure: MeasureResult) {
    const points = [
      new THREE.Vector3(measure.startPoint.x, measure.startPoint.y, measure.startPoint.z),
      new THREE.Vector3(measure.endPoint.x, measure.endPoint.y, measure.endPoint.z)
    ]

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ 
      color: 0xff3333, 
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    })
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 999
    line.userData.measureId = measure.id
    
    this.linesGroup.add(line)
    this.measureLines.set(measure.id, line)

    this.addMeasureResultLabel(measure)
  }

  private addMeasureResultLabel(measure: MeasureResult) {
    const start = new THREE.Vector3(measure.startPoint.x, measure.startPoint.y, measure.startPoint.z)
    const end = new THREE.Vector3(measure.endPoint.x, measure.endPoint.y, measure.endPoint.z)
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    canvas.width = 256
    canvas.height = 64

    context.fillStyle = 'rgba(255, 51, 51, 0.95)'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.beginPath()
    context.roundRect(10, 10, 236, 44, 8)
    context.fill()
    context.stroke()

    context.fillStyle = '#ffffff'
    context.font = 'bold 20px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(this.formatDistance(measure.distance), 128, 32)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      depthTest: false,
      transparent: true
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(midPoint)
    sprite.position.y += 1
    sprite.scale.set(4, 1, 1)
    sprite.renderOrder = 999
    sprite.userData.measureId = measure.id
    sprite.name = 'measure_result'
    
    this.markersGroup.add(sprite)
  }

  private clearPreview() {
    if (this.previewLine) {
      this.linesGroup.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      if (this.previewLine.material instanceof THREE.Material) {
        this.previewLine.material.dispose()
      }
      this.previewLine = null
    }

    this.markersGroup.children = this.markersGroup.children.filter(
      child => child.name !== 'distance_preview'
    )
  }

  private clearMarkers() {
    this.measureMarkers.forEach(marker => {
      this.markersGroup.remove(marker)
      marker.geometry.dispose()
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose()
      }
    })
    this.measureMarkers.clear()

    this.markersGroup.children = this.markersGroup.children.filter(
      child => child.userData.type !== 'measure_marker' && 
               child.userData.type !== 'measure_label' &&
               child.name !== 'distance_preview'
    )
  }

  private clearLines() {
    this.measureLines.forEach(line => {
      this.linesGroup.remove(line)
      line.geometry.dispose()
      if (line.material instanceof THREE.Material) {
        line.material.dispose()
      }
    })
    this.measureLines.clear()
  }

  private clearLineById(id: string) {
    const line = this.measureLines.get(id)
    if (line) {
      this.linesGroup.remove(line)
      line.geometry.dispose()
      if (line.material instanceof THREE.Material) {
        line.material.dispose()
      }
      this.measureLines.delete(id)
    }

    this.markersGroup.children = this.markersGroup.children.filter(
      child => child.userData.measureId !== id
    )
  }

  private notifyStateChange() {
    this.onStateChangeCallback?.({ ...this.state })
  }

  public setVisible(visible: boolean) {
    this.markersGroup.visible = visible
    this.linesGroup.visible = visible
  }
}
