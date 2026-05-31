import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Point3D } from '../types'

export type InteractionMode = 'orbit' | 'measure' | 'select' | 'rotate' | 'pan'

export interface MeasureResult {
  startPoint: Point3D
  endPoint: Point3D
  distance: number
  id: string
}

export interface InteractionState {
  mode: InteractionMode
  isDragging: boolean
  isMeasuring: boolean
  measurePoints: Point3D[]
  measures: MeasureResult[]
  selectedObjectId: string | null
  selectedObjectType: 'pipeline' | 'device' | null
}

export class InteractionController {
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private state: InteractionState
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  private measureLines: Map<string, THREE.Line> = new Map()
  private measureMarkers: Map<string, THREE.Mesh> = new Map()
  private previewLine: THREE.Line | null = null
  private onStateChangeCallback: ((state: InteractionState) => void) | null = null
  private onSelectCallback: ((type: 'pipeline' | 'device', id: string) => void) | null = null
  private onMeasureCompleteCallback: ((measure: MeasureResult) => void) | null = null

  constructor(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene
  ) {
    this.camera = camera
    this.controls = controls
    this.renderer = renderer
    this.scene = scene
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Line.threshold = 1
    this.mouse = new THREE.Vector2()

    this.state = {
      mode: 'orbit',
      isDragging: false,
      isMeasuring: false,
      measurePoints: [],
      measures: [],
      selectedObjectId: null,
      selectedObjectType: null
    }

    this.setupEventListeners()
  }

  private setupEventListeners() {
    const domElement = this.renderer.domElement

    domElement.addEventListener('mousedown', this.onMouseDown.bind(this))
    domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    domElement.addEventListener('mouseup', this.onMouseUp.bind(this))
    domElement.addEventListener('dblclick', this.onDoubleClick.bind(this))
    domElement.addEventListener('contextmenu', (e) => e.preventDefault())

    document.addEventListener('keydown', this.onKeyDown.bind(this))
  }

  private onMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      this.state.isDragging = true

      if (this.state.mode === 'measure') {
        event.stopPropagation()
        this.handleMeasureClick(event)
      } else if (this.state.mode === 'select') {
        event.stopPropagation()
        this.handleSelect(event)
      }
    }

    this.notifyStateChange()
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    if (this.state.mode === 'measure' && this.state.measurePoints.length === 1) {
      this.updateMeasurePreview(event)
    }
  }

  private onMouseUp(event: MouseEvent) {
    this.state.isDragging = false
    this.notifyStateChange()
  }

  private onDoubleClick(event: MouseEvent) {
    if (this.state.mode === 'orbit') {
      this.focusOnClickedObject(event)
    }
  }

  private onKeyDown(event: KeyboardEvent) {
    switch (event.key.toLowerCase()) {
      case '1':
        this.setMode('orbit')
        break
      case '2':
        this.setMode('select')
        break
      case '3':
        this.setMode('measure')
        break
      case 'r':
        this.resetView()
        break
      case 'escape':
        if (this.state.mode === 'measure') {
          this.cancelMeasure()
        }
        this.clearSelection()
        break
      case 'delete':
        if (this.state.mode === 'measure') {
          this.clearMeasures()
        }
        break
    }
  }

  private handleMeasureClick(event: MouseEvent) {
    const point = this.getIntersectionPoint(event)
    if (!point) return

    this.state.measurePoints.push({ x: point.x, y: point.y, z: point.z })

    if (this.state.measurePoints.length === 2) {
      this.completeMeasure()
    } else {
      this.addMeasureMarker(point)
      this.state.isMeasuring = true
    }

    this.notifyStateChange()
  }

  private handleSelect(event: MouseEvent) {
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const allObjects: THREE.Object3D[] = []
    this.scene.traverse((obj) => {
      if (obj.userData.type === 'pipeline' || obj.userData.type === 'device') {
        if (obj.visible) allObjects.push(obj)
      }
    })

    const intersects = this.raycaster.intersectObjects(allObjects, true)

    if (intersects.length > 0) {
      let object: THREE.Object3D | null = intersects[0].object
      while (object) {
        if (object.userData.type && object.userData.id) {
          this.selectObject(object.userData.type, object.userData.id)
          return
        }
        object = object.parent
      }
    } else {
      this.clearSelection()
    }
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
    const material = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(point)
    marker.renderOrder = 999
    this.scene.add(marker)
    
    const id = `marker_${Date.now()}_${this.state.measurePoints.length}`
    this.measureMarkers.set(id, marker)
  }

  private updateMeasurePreview(event: MouseEvent) {
    const endPoint = this.getIntersectionPoint(event)
    if (!endPoint || this.state.measurePoints.length === 0) return

    const startPoint = this.state.measurePoints[0]
    const startVector = new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z)

    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      if (this.previewLine.material instanceof THREE.Material) {
        this.previewLine.material.dispose()
      }
    }

    const points = [startVector, endPoint]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({ 
      color: 0xff3333, 
      linewidth: 2,
      dashSize: 0.5,
      gapSize: 0.3
    })
    this.previewLine = new THREE.Line(geometry, material)
    this.previewLine.computeLineDistances()
    this.scene.add(this.previewLine)
  }

  private completeMeasure() {
    const [start, end] = this.state.measurePoints
    const distance = this.calculateDistance(start, end)

    const measure: MeasureResult = {
      startPoint: start,
      endPoint: end,
      distance,
      id: `measure_${Date.now()}`
    }

    this.state.measures.push(measure)
    this.addMeasureLine(measure)
    this.state.measurePoints = []
    this.state.isMeasuring = false

    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      if (this.previewLine.material instanceof THREE.Material) {
        this.previewLine.material.dispose()
      }
      this.previewLine = null
    }

    this.onMeasureCompleteCallback?.(measure)
    this.notifyStateChange()
  }

  private addMeasureLine(measure: MeasureResult) {
    const points = [
      new THREE.Vector3(measure.startPoint.x, measure.startPoint.y, measure.startPoint.z),
      new THREE.Vector3(measure.endPoint.x, measure.endPoint.y, measure.endPoint.z)
    ]

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: 0xff3333, linewidth: 3 })
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 999
    this.scene.add(line)

    this.measureLines.set(measure.id, line)
  }

  private calculateDistance(p1: Point3D, p2: Point3D): number {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) +
      Math.pow(p2.y - p1.y, 2) +
      Math.pow(p2.z - p1.z, 2)
    )
  }

  private cancelMeasure() {
    this.state.measurePoints = []
    this.state.isMeasuring = false
    
    this.measureMarkers.forEach(marker => this.scene.remove(marker))
    this.measureMarkers.clear()
    
    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      if (this.previewLine.material instanceof THREE.Material) {
        this.previewLine.material.dispose()
      }
      this.previewLine = null
    }
    
    this.notifyStateChange()
  }

  public clearMeasures() {
    this.state.measures = []
    this.state.measurePoints = []
    this.state.isMeasuring = false

    this.measureLines.forEach(line => {
      this.scene.remove(line)
      line.geometry.dispose()
      if (line.material instanceof THREE.Material) {
        line.material.dispose()
      }
    })
    this.measureMarkers.forEach(marker => {
      this.scene.remove(marker)
      marker.geometry.dispose()
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose()
      }
    })
    this.measureLines.clear()
    this.measureMarkers.clear()

    if (this.previewLine) {
      this.scene.remove(this.previewLine)
      this.previewLine.geometry.dispose()
      if (this.previewLine.material instanceof THREE.Material) {
        this.previewLine.material.dispose()
      }
      this.previewLine = null
    }

    this.notifyStateChange()
  }

  private selectObject(type: 'pipeline' | 'device', id: string) {
    this.state.selectedObjectId = id
    this.state.selectedObjectType = type
    this.onSelectCallback?.(type, id)
    this.notifyStateChange()
  }

  private clearSelection() {
    this.state.selectedObjectId = null
    this.state.selectedObjectType = null
    this.notifyStateChange()
  }

  private focusOnClickedObject(event: MouseEvent) {
    const point = this.getIntersectionPoint(event)
    if (point) {
      this.focusOnPoint({ x: point.x, y: point.y, z: point.z })
    }
  }

  public setMode(mode: InteractionMode) {
    this.state.mode = mode
    
    this.controls.enabled = mode === 'orbit' || mode === 'pan'
    this.controls.enableRotate = mode === 'orbit'
    this.controls.enablePan = mode === 'pan' || mode === 'orbit'

    if (mode !== 'measure') {
      this.state.measurePoints = []
      this.state.isMeasuring = false
      
      if (this.previewLine) {
        this.scene.remove(this.previewLine)
        this.previewLine.geometry.dispose()
        if (this.previewLine.material instanceof THREE.Material) {
          this.previewLine.material.dispose()
        }
        this.previewLine = null
      }
    }

    if (mode !== 'select') {
      this.clearSelection()
    }

    this.notifyStateChange()
  }

  public getMode(): InteractionMode {
    return this.state.mode
  }

  public getState(): InteractionState {
    return { ...this.state }
  }

  public focusOnPoint(point: Point3D, distance: number = 30) {
    const targetPosition = new THREE.Vector3(
      point.x + distance,
      point.y + distance,
      point.z + distance
    )

    this.animateCamera(targetPosition, new THREE.Vector3(point.x, point.y, point.z))
  }

  public fitViewToObjects(objectIds: string[]) {
    const box = new THREE.Box3()

    objectIds.forEach(id => {
      const obj = this.scene.getObjectByName(id)
      if (obj) {
        box.expandByObject(obj)
      }
    })

    this.scene.traverse((obj) => {
      if (obj.userData.id && objectIds.includes(obj.userData.id)) {
        box.expandByObject(obj)
      }
    })

    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = this.camera.fov * (Math.PI / 180)
      let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)))
      cameraZ *= 1.8

      this.animateCamera(
        new THREE.Vector3(center.x + cameraZ * 0.5, center.y + cameraZ * 0.7, center.z + cameraZ * 0.5),
        center
      )
    }
  }

  private animateCamera(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3) {
    const startPosition = this.camera.position.clone()
    const startTarget = this.controls.target.clone()
    const duration = 800
    const startTime = performance.now()

    const animate = () => {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = this.easeInOutCubic(progress)

      this.camera.position.lerpVectors(startPosition, targetPosition, eased)
      this.controls.target.lerpVectors(startTarget, targetLookAt, eased)
      this.controls.update()

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    animate()
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  public resetView() {
    this.animateCamera(
      new THREE.Vector3(80, 80, 80),
      new THREE.Vector3(0, 0, 0)
    )
  }

  public setOnStateChangeCallback(callback: (state: InteractionState) => void) {
    this.onStateChangeCallback = callback
  }

  public setOnSelectCallback(callback: (type: 'pipeline' | 'device', id: string) => void) {
    this.onSelectCallback = callback
  }

  public setOnMeasureCompleteCallback(callback: (measure: MeasureResult) => void) {
    this.onMeasureCompleteCallback = callback
  }

  private notifyStateChange() {
    this.onStateChangeCallback?.({ ...this.state })
  }

  public getScreenPosition(point: Point3D): { x: number; y: number } | null {
    const vector = new THREE.Vector3(point.x, point.y, point.z)
    vector.project(this.camera)

    if (vector.z > 1) return null

    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-vector.y * 0.5 + 0.5) * rect.height + rect.top
    }
  }

  public dispose() {
    const domElement = this.renderer.domElement
    domElement.removeEventListener('mousedown', this.onMouseDown.bind(this))
    domElement.removeEventListener('mousemove', this.onMouseMove.bind(this))
    domElement.removeEventListener('mouseup', this.onMouseUp.bind(this))
    domElement.removeEventListener('dblclick', this.onDoubleClick.bind(this))
    document.removeEventListener('keydown', this.onKeyDown.bind(this))

    this.clearMeasures()
  }
}
