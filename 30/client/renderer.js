class RenderEngine {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.vehicles = new Map();
    this.obstacles = new Map();
    this.samples = new Map();
    this.particles = [];
    this.lights = {};
    this.clock = new THREE.Clock();
    this.isInitialized = false;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    
    this.performanceOptimizer = new PerformanceOptimizer(config);
    this.sonarRenderer = null;
    this.cameraController = null;
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.RENDERING.FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(
      this.config.RENDERING.FOG_COLOR,
      this.config.RENDERING.FOG_DENSITY
    );

    this.camera = new THREE.PerspectiveCamera(
      this.config.RENDERING.FOV,
      window.innerWidth / window.innerHeight,
      this.config.RENDERING.NEAR_PLANE,
      this.config.RENDERING.FAR_PLANE
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.performanceOptimizer.setRenderer(this.renderer);
    this.performanceOptimizer.init();

    this.sonarRenderer = new SonarRenderer(this.scene, this.config);
    this.cameraController = new CameraController(this.camera);

    this.setupLights();
    this.createWaterEffect();
    this.createBoundary();
    this.setupEventListeners();

    this.isInitialized = true;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(
      this.config.RENDERING.AMBIENT_LIGHT,
      0.4
    );
    this.scene.add(ambientLight);
    this.lights.ambient = ambientLight;

    const directionalLight = new THREE.DirectionalLight(
      this.config.RENDERING.DIRECTIONAL_LIGHT,
      0.8
    );
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;
    this.scene.add(directionalLight);
    this.lights.directional = directionalLight;

    const pointLight = new THREE.PointLight(0x44aaff, 0.5, 200);
    pointLight.position.set(0, -50, 0);
    this.scene.add(pointLight);
    this.lights.point = pointLight;
  }

  createWaterEffect() {
    const waterGeometry = new THREE.PlaneGeometry(
      this.config.WORLD.SIZE,
      this.config.WORLD.SIZE,
      50,
      50
    );
    
    const waterMaterial = new THREE.MeshPhongMaterial({
      color: this.config.RENDERING.WATER_COLOR,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      shininess: 100
    });
    
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -5;
    this.scene.add(water);
    this.water = water;

    const floorGeometry = new THREE.PlaneGeometry(
      this.config.WORLD.SIZE,
      this.config.WORLD.SIZE,
      100,
      100
    );
    
    const floorMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a3a2a,
      side: THREE.DoubleSide
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -this.config.WORLD.DEPTH;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;
  }

  createBoundary() {
    const boundarySize = this.config.WORLD.SIZE;
    const boundaryGeometry = new THREE.BoxGeometry(boundarySize, 10, boundarySize);
    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0x0066aa,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    
    const boundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
    boundary.position.y = -this.config.WORLD.DEPTH / 2;
    this.scene.add(boundary);
  }

  updateVehicles(vehicleStates) {
    const currentIds = new Set();

    for (const state of vehicleStates) {
      currentIds.add(state.id);
      
      let vehicle = this.vehicles.get(state.id);
      if (!vehicle) {
        const color = state.color ? parseInt(state.color.replace('#', ''), 16) : 0x00ff88;
        vehicle = VehicleFactory.createVehicle(color);
        this.scene.add(vehicle);
        this.vehicles.set(state.id, vehicle);
      }

      VehicleFactory.updateVehicle(vehicle, state);
    }

    for (const [id, vehicle] of this.vehicles) {
      if (!currentIds.has(id)) {
        this.scene.remove(vehicle);
        this.vehicles.delete(id);
      }
    }
  }

  updateObstacles(obstacleStates) {
    const currentIds = new Set();
    const cameraPos = this.camera.position;
    const renderDistance = 300;

    for (const state of obstacleStates) {
      currentIds.add(state.id);
      
      let obstacle = this.obstacles.get(state.id);
      
      const distance = Utils.distance(
        cameraPos.x, cameraPos.y, cameraPos.z,
        state.position.x, state.position.y, state.position.z
      );

      if (distance < renderDistance) {
        if (!obstacle) {
          obstacle = EnvironmentFactory.createObstacle(state);
          this.scene.add(obstacle);
          this.obstacles.set(state.id, obstacle);
        }

        obstacle.position.set(
          state.position.x,
          state.position.y,
          state.position.z
        );
      } else if (obstacle) {
        this.scene.remove(obstacle);
        this.obstacles.delete(state.id);
      }
    }

    for (const [id, obstacle] of this.obstacles) {
      if (!currentIds.has(id)) {
        this.scene.remove(obstacle);
        this.obstacles.delete(id);
      }
    }
  }

  updateSamples(sampleStates) {
    const currentIds = new Set();

    for (const state of sampleStates) {
      currentIds.add(state.id);
      
      let sample = this.samples.get(state.id);
      if (!sample) {
        sample = EnvironmentFactory.createSample(state);
        this.scene.add(sample);
        this.samples.set(state.id, sample);
      }

      EnvironmentFactory.updateSample(sample, state);
    }

    for (const [id, sample] of this.samples) {
      if (!currentIds.has(id)) {
        this.scene.remove(sample);
        this.samples.delete(id);
      }
    }
  }

  updateSonar(sensorData, vehiclePosition, vehicleRotation) {
    this.sonarRenderer.updateSonar(sensorData, vehiclePosition, vehicleRotation);
  }

  followVehicle(vehicleId) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    this.cameraController.followVehicle(vehicle);
  }

  freeCamera(deltaX, deltaY, deltaZ) {
    this.cameraController.freeCamera(deltaX, deltaY, deltaZ);
  }

  rotateCamera(deltaX, deltaY) {
    this.cameraController.rotateCamera(deltaX, deltaY);
  }

  setCameraMode(mode) {
    this.cameraController.setMode(mode);
  }

  toggleCameraMode() {
    return this.cameraController.toggleMode();
  }

  getCameraMode() {
    return this.cameraController.getMode();
  }

  render() {
    if (!this.isInitialized) return;

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    if (this.water && this.performanceOptimizer.getQuality() !== 'low') {
      const positions = this.water.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const wave = Math.sin(x * 0.02 + time) * Math.cos(z * 0.02 + time) * 0.3;
        positions.setY(i, wave);
      }
      positions.needsUpdate = true;
    }

    if (this.lights.point) {
      this.lights.point.position.y = -50 + Math.sin(time * 0.5) * 10;
    }

    this.performanceOptimizer.updateFps();
    this.renderer.render(this.scene, this.camera);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  getCamera() {
    return this.camera;
  }

  getScene() {
    return this.scene;
  }

  getPerformanceOptimizer() {
    return this.performanceOptimizer;
  }

  getVehicle(vehicleId) {
    return this.vehicles.get(vehicleId);
  }
}
