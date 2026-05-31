import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { generateDemData } from '../utils/vectorParser'
import { localToWgs84 } from '../utils/coordinateTransform'
import { LayerManager } from './LayerManager'

export class Gis3dScene {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      centerLon: options.centerLon || 116.4074,
      centerLat: options.centerLat || 39.9042,
      terrainSize: options.terrainSize || 4000,
      terrainResolution: options.terrainResolution || 20,
      showGrid: options.showGrid !== false,
      showAxes: options.showAxes !== false,
      backgroundColor: options.backgroundColor || 0x1a1a2e,
      adaptiveQuality: options.adaptiveQuality !== false,
      targetFPS: options.targetFPS || 60,
      enableLOD: options.enableLOD !== false
    }

    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    this.terrainMesh = null
    this.layerManager = null

    this.annotationObjects = []
    this.measureObjects = []

    this.animationId = null
    this.isDragging = false
    this.mouseDownPos = { x: 0, y: 0 }
    this.lastTime = 0
    this.frameInterval = 1000 / this.options.targetFPS

    this.onClickCallback = null
    this.onMouseMoveCallback = null

    this.fpsHistory = []
    this.lastFpsUpdate = 0
    this.currentQuality = 'high'

    this.frustum = new THREE.Frustum()
    this.frustumMatrix = new THREE.Matrix4()
    this.culledObjects = new Set()

    this.lodLevels = []

    this.init()
  }

  init() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.options.backgroundColor)
    this.scene.fog = new THREE.Fog(this.options.backgroundColor, 5000, 20000)

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 50000)
    this.camera.position.set(0, 1500, 2000)

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.currentQuality !== 'low',
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      alpha: false
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(this.getPixelRatioByQuality())
    this.renderer.shadowMap.enabled = this.currentQuality !== 'low'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = true
    this.controls.enableRotate = true
    this.controls.enableZoom = true
    this.controls.minDistance = 50
    this.controls.maxDistance = 15000
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.minPolarAngle = 0.1
    this.controls.screenSpacePanning = false
    this.controls.target.set(0, 0, 0)

    this.layerManager = new LayerManager(this.scene)

    this.setupLighting()
    this.createTerrain()
    this.createGridHelper()
    this.createAxesHelper()
    this.createCompass()
    this.setupEventListeners()
    this.animate()
  }

  getPixelRatioByQuality() {
    switch (this.currentQuality) {
      case 'ultra': return Math.min(window.devicePixelRatio, 2)
      case 'high': return Math.min(window.devicePixelRatio, 1.5)
      case 'medium': return 1
      case 'low': return 0.75
      default: return 1
    }
  }

  setQuality(level) {
    if (this.currentQuality === level) return

    this.currentQuality = level

    const pixelRatio = this.getPixelRatioByQuality()
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.shadowMap.enabled = level !== 'low'

    if (this.terrainMesh && this.terrainMesh.material) {
      if (level === 'low') {
        this.terrainMesh.material.wireframe = false
      }
    }

    console.log(`Render quality set to: ${level}`)
  }

  updateFPS(currentTime) {
    this.fpsHistory.push(currentTime)

    if (this.fpsHistory.length > 30) {
      this.fpsHistory.shift()
    }

    if (currentTime - this.lastFpsUpdate > 1000) {
      this.lastFpsUpdate = currentTime

      if (this.fpsHistory.length > 1) {
        const avgFrameTime = (this.fpsHistory[this.fpsHistory.length - 1] - this.fpsHistory[0]) / (this.fpsHistory.length - 1)
        const currentFPS = 1000 / avgFrameTime

        if (this.options.adaptiveQuality) {
          this.adjustQualityByFPS(currentFPS)
        }
      }
    }
  }

  adjustQualityByFPS(fps) {
    const targetFPS = this.options.targetFPS

    if (fps < targetFPS * 0.7) {
      if (this.currentQuality === 'ultra') {
        this.setQuality('high')
      } else if (this.currentQuality === 'high') {
        this.setQuality('medium')
      } else if (this.currentQuality === 'medium') {
        this.setQuality('low')
      }
    } else if (fps > targetFPS * 1.1) {
      if (this.currentQuality === 'low') {
        this.setQuality('medium')
      } else if (this.currentQuality === 'medium') {
        this.setQuality('high')
      } else if (this.currentQuality === 'high') {
        this.setQuality('ultra')
      }
    }
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(500, 1000, 500)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = this.currentQuality === 'low' ? 1024 : 2048
    directionalLight.shadow.mapSize.height = this.currentQuality === 'low' ? 1024 : 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 5000
    directionalLight.shadow.camera.left = -3000
    directionalLight.shadow.camera.right = 3000
    directionalLight.shadow.camera.top = 3000
    directionalLight.shadow.camera.bottom = -3000
    this.scene.add(directionalLight)

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c35, 0.4)
    this.scene.add(hemisphereLight)
  }

  createTerrain() {
    const demData = generateDemData(
      this.options.centerLon,
      this.options.centerLat,
      this.options.terrainSize,
      this.options.terrainResolution
    )

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(demData.vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(demData.colors, 3))
    geometry.setIndex(demData.indices)
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.userData.isTerrain = true
    this.scene.add(this.terrainMesh)

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.2 })
    )
    this.terrainMesh.add(wireframe)

    if (this.options.enableLOD) {
      this.createTerrainLOD(demData)
    }
  }

  createTerrainLOD(demData) {
    this.lodLevels = []

    const resolutions = [1, 2, 4]
    resolutions.forEach((factor, index) => {
      const lodGeometry = this.createSimplifiedGeometry(demData, factor)
      const lodMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: 1 + index,
        polygonOffsetUnits: 1 + index
      })

      const lodMesh = new THREE.Mesh(lodGeometry, lodMaterial)
      lodMesh.visible = index === 0
      lodMesh.userData.lodLevel = index
      lodMesh.userData.distanceThreshold = (index + 1) * 2000

      this.lodLevels.push(lodMesh)
      if (index > 0) {
        this.scene.add(lodMesh)
      }
    })
  }

  createSimplifiedGeometry(demData, factor) {
    const geometry = new THREE.BufferGeometry()

    if (factor === 1) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(demData.vertices, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(demData.colors, 3))
      geometry.setIndex(demData.indices)
    } else {
      const newVertices = []
      const newColors = []
      const newIndices = []

      const oldCols = demData.cols + 1
      const oldRows = demData.rows + 1
      const newCols = Math.ceil(oldCols / factor)
      const newRows = Math.ceil(oldRows / factor)

      for (let row = 0; row < oldRows; row += factor) {
        for (let col = 0; col < oldCols; col += factor) {
          const oldIndex = row * oldCols + col
          newVertices.push(
            demData.vertices[oldIndex * 3],
            demData.vertices[oldIndex * 3 + 1],
            demData.vertices[oldIndex * 3 + 2]
          )
          newColors.push(
            demData.colors[oldIndex * 3],
            demData.colors[oldIndex * 3 + 1],
            demData.colors[oldIndex * 3 + 2]
          )
        }
      }

      for (let row = 0; row < newRows - 1; row++) {
        for (let col = 0; col < newCols - 1; col++) {
          const topLeft = row * newCols + col
          const topRight = topLeft + 1
          const bottomLeft = (row + 1) * newCols + col
          const bottomRight = bottomLeft + 1

          newIndices.push(topLeft, bottomLeft, topRight)
          newIndices.push(topRight, bottomLeft, bottomRight)
        }
      }

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3))
      geometry.setIndex(newIndices)
    }

    geometry.computeVertexNormals()
    return geometry
  }

  updateTerrainLOD() {
    if (!this.options.enableLOD || this.lodLevels.length === 0) return

    const cameraDistance = this.camera.position.length()

    this.lodLevels.forEach((lod, index) => {
      const shouldBeVisible = index === 0
        ? cameraDistance < lod.userData.distanceThreshold
        : cameraDistance >= lod.userData.distanceThreshold &&
          (index === this.lodLevels.length - 1 || cameraDistance < this.lodLevels[index + 1].userData.distanceThreshold)

      if (lod.visible !== shouldBeVisible) {
        lod.visible = shouldBeVisible
        if (shouldBeVisible) {
          this.scene.add(lod)
        } else {
          this.scene.remove(lod)
        }
      }
    })
  }

  createGridHelper() {
    if (this.options.showGrid) {
      const gridSize = this.options.terrainSize * 1.5
      const gridDivisions = 40
      const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x333333)
      gridHelper.position.y = 0.1
      this.scene.add(gridHelper)
    }
  }

  createAxesHelper() {
    if (this.options.showAxes) {
      const axesHelper = new THREE.AxesHelper(200)
      axesHelper.position.set(-this.options.terrainSize / 2 - 100, 10, -this.options.terrainSize / 2 - 100)
      this.scene.add(axesHelper)
    }
  }

  createCompass() {
    const compassGroup = new THREE.Group()

    const northArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      80,
      0xff0000,
      20,
      10
    )
    compassGroup.add(northArrow)

    const eastArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      80,
      0x00ff00,
      20,
      10
    )
    compassGroup.add(eastArrow)

    compassGroup.position.set(
      this.options.terrainSize / 2 - 100,
      10,
      this.options.terrainSize / 2 - 100
    )
    this.scene.add(compassGroup)
  }

  setupEventListeners() {
    const canvas = this.renderer.domElement

    canvas.addEventListener('click', (event) => {
      if (this.isDragging) return

      this.mouse.x = (event.offsetX / this.container.clientWidth) * 2 - 1
      this.mouse.y = -(event.offsetY / this.container.clientHeight) * 2 + 1

      this.raycaster.setFromCamera(this.mouse, this.camera)

      const intersects = this.raycaster.intersectObject(this.terrainMesh, true)
      if (intersects.length > 0) {
        const point = intersects[0].point
        const lonLat = localToWgs84(
          point.x, point.z, this.options.centerLon, this.options.centerLat
        )

        if (this.onClickCallback) {
          this.onClickCallback({
            point: point,
            lon: lonLat.lon,
            lat: lonLat.lat,
            height: point.y,
            event: event
          })
        }
      }
    })

    canvas.addEventListener('mousemove', (event) => {
      this.mouse.x = (event.offsetX / this.container.clientWidth) * 2 - 1
      this.mouse.y = -(event.offsetY / this.container.clientHeight) * 2 + 1

      if (event.buttons === 1) {
        const dx = Math.abs(event.clientX - this.mouseDownPos.x)
        const dy = Math.abs(event.clientY - this.mouseDownPos.y)
        if (dx > 3 || dy > 3) {
          this.isDragging = true
        }
      }

      this.raycaster.setFromCamera(this.mouse, this.camera)

      const intersects = this.raycaster.intersectObject(this.terrainMesh, true)
      if (intersects.length > 0) {
        const point = intersects[0].point
        const lonLat = localToWgs84(
          point.x, point.z, this.options.centerLon, this.options.centerLat
        )

        if (this.onMouseMoveCallback) {
          this.onMouseMoveCallback({
            point: point,
            lon: lonLat.lon,
            lat: lonLat.lat,
            height: point.y
          })
        }
      }
    })

    canvas.addEventListener('mousedown', (event) => {
      this.isDragging = false
      this.mouseDownPos = { x: event.clientX, y: event.clientY }
    })

    window.addEventListener('resize', () => this.onResize())
  }

  onResize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  updateFrustumCulling() {
    this.frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    this.frustum.setFromProjectionMatrix(this.frustumMatrix)

    const sphere = new THREE.Sphere()

    this.layerManager.getAllLayers().forEach(layer => {
      if (!layer.visible) return

      layer.objects.forEach(obj => {
        if (!obj.geometry) return

        if (!obj.geometry.boundingSphere) {
          obj.geometry.computeBoundingSphere()
        }

        sphere.copy(obj.geometry.boundingSphere)
        sphere.applyMatrix4(obj.matrixWorld)

        const isVisible = this.frustum.intersectsSphere(sphere)
        const wasCulled = this.culledObjects.has(obj)

        if (!isVisible && !wasCulled) {
          obj.visible = false
          this.culledObjects.add(obj)
        } else if (isVisible && wasCulled) {
          obj.visible = true
          this.culledObjects.delete(obj)
        }
      })
    })
  }

  addVectorLayer(layerId, objects, options = {}) {
    return this.layerManager.addLayer(layerId, objects, options)
  }

  removeVectorLayer(layerId) {
    this.layerManager.removeLayer(layerId)
  }

  setLayerVisible(layerId, visible) {
    this.layerManager.setLayerVisible(layerId, visible)
  }

  toggleLayerVisible(layerId) {
    return this.layerManager.toggleLayerVisible(layerId)
  }

  setLayerOpacity(layerId, opacity) {
    this.layerManager.setLayerOpacity(layerId, opacity)
  }

  getLayers() {
    return this.layerManager.getAllLayers()
  }

  addAnnotation(annotation) {
    this.annotationObjects.push(annotation)
    this.scene.add(annotation)
  }

  removeAnnotation(annotation) {
    const index = this.annotationObjects.indexOf(annotation)
    if (index > -1) {
      this.scene.remove(annotation)
      this.annotationObjects.splice(index, 1)
    }
  }

  clearAnnotations() {
    this.annotationObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.annotationObjects = []
  }

  addMeasureObject(obj) {
    this.measureObjects.push(obj)
    this.scene.add(obj)
  }

  clearMeasureObjects() {
    this.measureObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.measureObjects = []
  }

  setOnClick(callback) {
    this.onClickCallback = callback
  }

  setOnMouseMove(callback) {
    this.onMouseMoveCallback = callback
  }

  flyTo(x, y, z, duration = 2000) {
    const startPos = this.camera.position.clone()
    const targetPos = new THREE.Vector3(x, y, z)
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const easeT = 1 - Math.pow(1 - t, 3)

      this.camera.position.lerpVectors(startPos, targetPos, easeT)
      this.controls.target.lerp(new THREE.Vector3(x / 2, 0, z / 2), easeT)

      if (t < 1) {
        requestAnimationFrame(animate)
      }
    }
    animate()
  }

  animate() {
    this.animationId = requestAnimationFrame((time) => {
      const deltaTime = time - this.lastTime

      if (deltaTime >= this.frameInterval) {
        this.lastTime = time - (deltaTime % this.frameInterval)

        this.updateFPS(time)
        this.controls.update()
        this.updateTerrainLOD()
        this.updateFrustumCulling()
        this.renderer.render(this.scene, this.camera)
      }

      this.animate()
    })
  }

  getTerrainHeight(x, z) {
    if (this.terrainMesh) {
      const geometry = this.terrainMesh.geometry
      const positions = geometry.attributes.position.array

      for (let i = 0; i < positions.length; i += 3) {
        const px = positions[i]
        const pz = positions[i + 2]

        if (Math.abs(px - x) < 10 && Math.abs(pz - z) < 10) {
          return positions[i + 1]
        }
      }
    }
    return 0
  }

  getStats() {
    let visibleObjectCount = 0
    let totalObjectCount = 0

    this.layerManager.getAllLayers().forEach(layer => {
      totalObjectCount += layer.objects.length
      if (layer.visible) {
        layer.objects.forEach(obj => {
          if (obj.visible) {
            visibleObjectCount++
          }
        })
      }
    })

    return {
      totalObjects: totalObjectCount,
      visibleObjects: visibleObjectCount - this.culledObjects.size,
      culledObjects: this.culledObjects.size,
      layerCount: this.layerManager.getAllLayers().length,
      quality: this.currentQuality,
      fps: this.fpsHistory.length > 1
        ? Math.round(1000 / ((this.fpsHistory[this.fpsHistory.length - 1] - this.fpsHistory[0]) / (this.fpsHistory.length - 1)))
        : 0
    }
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }

    this.layerManager.clearAll()

    this.lodLevels.forEach(lod => {
      if (lod.geometry) lod.geometry.dispose()
      if (lod.material) lod.material.dispose()
    })

    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose()
      this.terrainMesh.material.dispose()
    }

    this.clearAnnotations()
    this.clearMeasureObjects()

    if (this.renderer) {
      this.renderer.dispose()
      this.container.removeChild(this.renderer.domElement)
    }

    if (this.controls) {
      this.controls.dispose()
    }
  }
}
