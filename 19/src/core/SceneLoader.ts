import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SceneConfig, Pipeline, Device, Point3D } from '../types'

export class SceneLoader {
  public scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private container: HTMLElement
  private animationId: number | null = null
  private pipelineMeshes: Map<string, THREE.Group> = new Map()
  private deviceMeshes: Map<string, THREE.Group> = new Map()
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  private onSelectCallback: ((type: 'pipeline' | 'device', id: string) => void) | null = null
  private frustum: THREE.Frustum = new THREE.Frustum()
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private isDragging: boolean = false
  private dragStartTime: number = 0

  constructor(config: SceneConfig) {
    this.container = document.getElementById(config.containerId) || document.body
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Line.threshold = 1
    this.raycaster.params.Points.threshold = 1
    this.mouse = new THREE.Vector2()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(config.backgroundColor)
    this.scene.fog = new THREE.Fog(config.backgroundColor, 200, 800)

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.5,
      2000
    )
    this.camera.position.set(
      config.cameraPosition.x,
      config.cameraPosition.y,
      config.cameraPosition.z
    )

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      alpha: false
    })
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(
      config.cameraTarget.x,
      config.cameraTarget.y,
      config.cameraTarget.z
    )
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 5
    this.controls.maxDistance = 500
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.screenSpacePanning = true

    this.setupLighting(config)
    this.setupGround()
    this.setupEventListeners()
  }

  private setupLighting(config: SceneConfig) {
    const ambientLight = new THREE.AmbientLight(0xffffff, config.ambientLightIntensity)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, config.directionalLightIntensity)
    directionalLight.position.set(100, 150, 100)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -200
    directionalLight.shadow.camera.right = 200
    directionalLight.shadow.camera.top = 200
    directionalLight.shadow.camera.bottom = -200
    directionalLight.shadow.bias = -0.0001
    this.scene.add(directionalLight)

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d26, 0.4)
    this.scene.add(hemisphereLight)

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
    fillLight.position.set(-50, 30, -50)
    this.scene.add(fillLight)
  }

  private setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(600, 600)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.9,
      metalness: 0.1
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.position.y = -0.1
    this.scene.add(ground)

    const gridHelper = new THREE.GridHelper(600, 120, 0x2d3748, 0x1a202c)
    this.scene.add(gridHelper)
  }

  private setupEventListeners() {
    window.addEventListener('resize', this.onResize.bind(this))
    
    const domElement = this.renderer.domElement
    domElement.addEventListener('mousedown', this.onMouseDown.bind(this))
    domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    domElement.addEventListener('mouseup', this.onMouseUp.bind(this))
    domElement.addEventListener('click', this.onClick.bind(this))
  }

  private onMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      this.isDragging = true
      this.dragStartTime = Date.now()
    }
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private onMouseUp(event: MouseEvent) {
    this.isDragging = false
  }

  private onResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
  }

  private onClick(event: MouseEvent) {
    const dragDuration = Date.now() - this.dragStartTime
    if (dragDuration > 200) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)

    const allMeshes: THREE.Object3D[] = []
    this.pipelineMeshes.forEach(group => {
      if (group.visible) allMeshes.push(group)
    })
    this.deviceMeshes.forEach(group => {
      if (group.visible) allMeshes.push(group)
    })

    const intersects = this.raycaster.intersectObjects(allMeshes, true)

    if (intersects.length > 0) {
      let object: THREE.Object3D | null = intersects[0].object
      while (object) {
        if (object.userData.type === 'pipeline' && object.userData.id) {
          this.onSelectCallback?.('pipeline', object.userData.id)
          return
        }
        if (object.userData.type === 'device' && object.userData.id) {
          this.onSelectCallback?.('device', object.userData.id)
          return
        }
        object = object.parent
      }
    }
  }

  public setOnSelectCallback(callback: (type: 'pipeline' | 'device', id: string) => void) {
    this.onSelectCallback = callback
  }

  public createPipeline(pipeline: Pipeline): THREE.Group {
    const group = new THREE.Group()
    group.userData = { type: 'pipeline', id: pipeline.id, layerId: pipeline.layerId }

    const start = new THREE.Vector3(pipeline.startPoint.x, pipeline.startPoint.y, pipeline.startPoint.z)
    const end = new THREE.Vector3(pipeline.endPoint.x, pipeline.endPoint.y, pipeline.endPoint.z)
    const length = start.distanceTo(end)

    const colorMap: Record<string, number> = {
      water: 0x3b82f6,
      gas: 0xf59e0b,
      oil: 0x1f2937,
      steam: 0xe5e7eb,
      electric: 0xfbbf24
    }

    const statusColorMap: Record<string, number> = {
      normal: colorMap[pipeline.type],
      warning: 0xfbbf24,
      alarm: 0xef4444
    }

    const lod = new THREE.LOD()

    const highDetailGeometry = new THREE.CylinderGeometry(
      pipeline.diameter / 2,
      pipeline.diameter / 2,
      length,
      16
    )
    const mediumDetailGeometry = new THREE.CylinderGeometry(
      pipeline.diameter / 2,
      pipeline.diameter / 2,
      length,
      8
    )
    const lowDetailGeometry = new THREE.CylinderGeometry(
      pipeline.diameter / 2,
      pipeline.diameter / 2,
      length,
      4
    )

    const material = new THREE.MeshStandardMaterial({
      color: statusColorMap[pipeline.status],
      roughness: 0.3,
      metalness: 0.7
    })

    const highDetailMesh = new THREE.Mesh(highDetailGeometry, material)
    highDetailMesh.castShadow = true
    highDetailMesh.receiveShadow = true
    this.positionPipelineMesh(highDetailMesh, start, end)

    const mediumDetailMesh = new THREE.Mesh(mediumDetailGeometry, material)
    mediumDetailMesh.castShadow = true
    mediumDetailMesh.receiveShadow = true
    this.positionPipelineMesh(mediumDetailMesh, start, end)

    const lowDetailMesh = new THREE.Mesh(lowDetailGeometry, material)
    lowDetailMesh.castShadow = true
    lowDetailMesh.receiveShadow = true
    this.positionPipelineMesh(lowDetailMesh, start, end)

    lod.addLevel(highDetailMesh, 0)
    lod.addLevel(mediumDetailMesh, 80)
    lod.addLevel(lowDetailMesh, 150)

    group.add(lod)

    if (length > 10) {
      const flangeGeometry = new THREE.CylinderGeometry(
        pipeline.diameter / 2 + 0.3,
        pipeline.diameter / 2 + 0.3,
        0.2,
        8
      )
      const flangeMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.4,
        metalness: 0.6
      })

      const startFlange = new THREE.Mesh(flangeGeometry, flangeMaterial)
      startFlange.position.copy(start)
      startFlange.lookAt(end)
      startFlange.rotateX(Math.PI / 2)
      startFlange.castShadow = true
      group.add(startFlange)

      const endFlange = new THREE.Mesh(flangeGeometry, flangeMaterial)
      endFlange.position.copy(end)
      endFlange.lookAt(start)
      endFlange.rotateX(Math.PI / 2)
      endFlange.castShadow = true
      group.add(endFlange)
    }

    this.pipelineMeshes.set(pipeline.id, group)
    this.scene.add(group)

    return group
  }

  private positionPipelineMesh(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    const midPoint = start.clone().add(end).multiplyScalar(0.5)
    mesh.position.copy(midPoint)
    mesh.lookAt(end)
    mesh.rotateX(Math.PI / 2)
  }

  public createDevice(device: Device): THREE.Group {
    const group = new THREE.Group()
    group.userData = { type: 'device', id: device.id, layerId: device.layerId }

    const statusColorMap: Record<string, number> = {
      running: 0x22c55e,
      stopped: 0x6b7280,
      maintenance: 0xf59e0b,
      fault: 0xef4444
    }

    const color = statusColorMap[device.status]

    switch (device.type) {
      case 'pump':
        this.createPump(group, device.position, color)
        break
      case 'valve':
        this.createValve(group, device.position, color)
        break
      case 'tank':
        this.createTank(group, device.position, color)
        break
      case 'sensor':
        this.createSensor(group, device.position, color)
        break
      case 'heatExchanger':
        this.createHeatExchanger(group, device.position, color)
        break
      default:
        this.createDefaultDevice(group, device.position, color)
    }

    const indicatorGeometry = new THREE.SphereGeometry(0.6, 12, 12)
    const indicatorMaterial = new THREE.MeshBasicMaterial({ color })
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial)
    indicator.position.set(device.position.x, device.position.y + 6, device.position.z)
    group.add(indicator)

    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.createStatusSprite(device.status),
      transparent: true,
      depthTest: false
    })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.position.set(device.position.x, device.position.y + 8, device.position.z)
    sprite.scale.set(2, 2, 1)
    group.add(sprite)

    this.deviceMeshes.set(device.id, group)
    this.scene.add(group)

    return group
  }

  private createStatusSprite(status: string): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    
    const colorMap: Record<string, string> = {
      running: '#22c55e',
      stopped: '#6b7280',
      maintenance: '#f59e0b',
      fault: '#ef4444'
    }
    
    const color = colorMap[status] || '#9ca3af'
    
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, color)
    gradient.addColorStop(0.5, color + '80')
    gradient.addColorStop(1, 'transparent')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  private createPump(group: THREE.Group, position: Point3D, color: number) {
    const bodyGeometry = new THREE.CylinderGeometry(2, 2.5, 3, 12)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.set(position.x, position.y + 1.5, position.z)
    body.castShadow = true
    group.add(body)

    const motorGeometry = new THREE.BoxGeometry(3, 2, 3)
    const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.5 })
    const motor = new THREE.Mesh(motorGeometry, motorMaterial)
    motor.position.set(position.x, position.y + 4, position.z)
    motor.castShadow = true
    group.add(motor)
  }

  private createValve(group: THREE.Group, position: Point3D, color: number) {
    const bodyGeometry = new THREE.SphereGeometry(1.5, 12, 12)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.set(position.x, position.y + 1.5, position.z)
    body.castShadow = true
    group.add(body)

    const handleGeometry = new THREE.BoxGeometry(0.3, 2.5, 0.3)
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.5 })
    const handle = new THREE.Mesh(handleGeometry, handleMaterial)
    handle.position.set(position.x, position.y + 3.5, position.z)
    handle.castShadow = true
    group.add(handle)
  }

  private createTank(group: THREE.Group, position: Point3D, color: number) {
    const bodyGeometry = new THREE.CylinderGeometry(4, 4, 8, 16)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.set(position.x, position.y + 4, position.z)
    body.castShadow = true
    group.add(body)

    const topGeometry = new THREE.ConeGeometry(4.5, 2, 16)
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.3, metalness: 0.7 })
    const top = new THREE.Mesh(topGeometry, topMaterial)
    top.position.set(position.x, position.y + 9, position.z)
    top.castShadow = true
    group.add(top)
  }

  private createSensor(group: THREE.Group, position: Point3D, color: number) {
    const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 12)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.set(position.x, position.y + 1, position.z)
    body.castShadow = true
    group.add(body)

    const displayGeometry = new THREE.BoxGeometry(1.2, 0.8, 0.2)
    const displayMaterial = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.1, metalness: 0.9 })
    const display = new THREE.Mesh(displayGeometry, displayMaterial)
    display.position.set(position.x, position.y + 1.5, position.z + 0.6)
    group.add(display)
  }

  private createHeatExchanger(group: THREE.Group, position: Point3D, color: number) {
    const bodyGeometry = new THREE.CylinderGeometry(2.5, 2.5, 6, 12)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.set(position.x, position.y + 3, position.z)
    body.rotation.z = Math.PI / 2
    body.castShadow = true
    group.add(body)

    const tubeGeometry = new THREE.CylinderGeometry(0.8, 0.8, 7, 8)
    const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.4, metalness: 0.6 })
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
    tube.position.set(position.x, position.y + 3, position.z)
    tube.rotation.z = Math.PI / 2
    tube.castShadow = true
    group.add(tube)
  }

  private createDefaultDevice(group: THREE.Group, position: Point3D, color: number) {
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(position.x, position.y + 1, position.z)
    mesh.castShadow = true
    group.add(mesh)
  }

  public removePipeline(id: string) {
    const group = this.pipelineMeshes.get(id)
    if (group) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      this.scene.remove(group)
      this.pipelineMeshes.delete(id)
    }
  }

  public removeDevice(id: string) {
    const group = this.deviceMeshes.get(id)
    if (group) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      this.scene.remove(group)
      this.deviceMeshes.delete(id)
    }
  }

  public setLayerVisibility(layerId: string, visible: boolean) {
    this.pipelineMeshes.forEach((group) => {
      if (group.userData.layerId === layerId) {
        group.visible = visible
      }
    })
    this.deviceMeshes.forEach((group) => {
      if (group.userData.layerId === layerId) {
        group.visible = visible
      }
    })
  }

  public setLayerOpacity(layerId: string, opacity: number) {
    this.pipelineMeshes.forEach((group) => {
      if (group.userData.layerId === layerId) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = opacity < 1
            child.material.opacity = opacity
          }
        })
      }
    })
    this.deviceMeshes.forEach((group) => {
      if (group.userData.layerId === layerId) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = opacity < 1
            child.material.opacity = opacity
          }
        })
      }
    })
  }

  public highlightObject(type: 'pipeline' | 'device', id: string) {
    const meshes = type === 'pipeline' ? this.pipelineMeshes : this.deviceMeshes
    const group = meshes.get(id)
    if (group) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive = new THREE.Color(0xffffff)
          child.material.emissiveIntensity = 0.3
        }
      })
    }
  }

  public clearHighlight() {
    const clearEmissive = (group: THREE.Group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive = new THREE.Color(0x000000)
          child.material.emissiveIntensity = 0
        }
      })
    }
    this.pipelineMeshes.forEach(clearEmissive)
    this.deviceMeshes.forEach(clearEmissive)
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public getControls(): OrbitControls {
    return this.controls
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  public getScreenPosition(point: Point3D): { x: number; y: number } | null {
    const vector = new THREE.Vector3(point.x, point.y + 2, point.z)
    vector.project(this.camera)

    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-vector.y * 0.5 + 0.5) * rect.height + rect.top
    }
  }

  public isObjectInView(point: Point3D): boolean {
    const vector = new THREE.Vector3(point.x, point.y, point.z)
    vector.project(this.camera)
    return Math.abs(vector.x) < 1 && Math.abs(vector.y) < 1 && vector.z < 1
  }

  public startAnimation() {
    let lastTime = performance.now()
    const targetFPS = 60
    const frameTime = 1000 / targetFPS

    const animate = (currentTime: number) => {
      this.animationId = requestAnimationFrame(animate)

      const deltaTime = currentTime - lastTime
      if (deltaTime >= frameTime) {
        this.controls.update()
        this.updateLOD()
        this.renderer.render(this.scene, this.camera)
        lastTime = currentTime - (deltaTime % frameTime)
      }
    }

    animate(performance.now())
  }

  private updateLOD() {
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix)
  }

  public stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  public dispose() {
    this.stopAnimation()
    window.removeEventListener('resize', this.onResize.bind(this))
    
    const domElement = this.renderer.domElement
    domElement.removeEventListener('mousedown', this.onMouseDown.bind(this))
    domElement.removeEventListener('mousemove', this.onMouseMove.bind(this))
    domElement.removeEventListener('mouseup', this.onMouseUp.bind(this))
    domElement.removeEventListener('click', this.onClick.bind(this))

    this.pipelineMeshes.forEach((_, id) => this.removePipeline(id))
    this.deviceMeshes.forEach((_, id) => this.removeDevice(id))

    this.controls.dispose()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
