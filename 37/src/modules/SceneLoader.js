import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class SceneLoader {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.components = [];
    this.componentMap = new Map();
    this.selectedObject = null;
    this.hoveredObject = null;
    this.wireframeMode = false;
    this.xrayMode = false;
    this.animationId = null;
    this.onComponentSelect = null;
    this.onComponentHover = null;
    this.boundingBox = new THREE.Box3();
  }

  async init() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createControls();
    this.setupLighting();
    this.setupEnvironment();
    this.setupEventListeners();
    this.animate();
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);
    this.scene.fog = new THREE.Fog(0x0a0e17, 100, 500);
  }

  createCamera() {
    const { clientWidth, clientHeight } = this.container;
    this.camera = new THREE.PerspectiveCamera(
      60,
      clientWidth / clientHeight,
      0.1,
      2000
    );
    this.camera.position.set(80, 60, 80);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);
  }

  createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 300;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    this.controls.target.set(0, 0, 0);
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(50, 100, 50);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 500;
    mainLight.shadow.camera.left = -100;
    mainLight.shadow.camera.right = 100;
    mainLight.shadow.camera.top = 100;
    mainLight.shadow.camera.bottom = -100;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x6080ff, 0.3);
    fillLight.position.set(-50, 30, -50);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff8060, 0.2);
    rimLight.position.set(0, 50, -80);
    this.scene.add(rimLight);
  }

  setupEnvironment() {
    const gridHelper = new THREE.GridHelper(200, 40, 0x2d3a4f, 0x1a2332);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);

    const groundGeometry = new THREE.PlaneGeometry(300, 300);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1117,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.position.set(-95, 0.01, -95);
    this.scene.add(axesHelper);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  highlightObject(object) {
    if (!object.userData.originalMaterial) {
      object.userData.originalMaterial = object.material;
    }
    
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });
    
    object.traverse((child) => {
      if (child.isMesh) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        child.material = highlightMaterial.clone();
      }
    });
  }

  hoverObject(object) {
    if (!object.userData.originalMaterial) {
      object.userData.originalMaterial = object.material;
    }
    
    const hoverMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.95
    });
    
    object.traverse((child) => {
      if (child.isMesh) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        child.material = hoverMaterial.clone();
      }
    });
  }

  restoreObjectMaterial(object) {
    object.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
      }
    });
  }

  addComponent(mesh, componentData) {
    mesh.userData = { ...mesh.userData, ...componentData };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.components.push(mesh);
    this.componentMap.set(componentData.componentId, mesh);
    this.boundingBox.expandByObject(mesh);
  }

  clearComponents() {
    this.components.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    });
    this.components = [];
    this.componentMap.clear();
    this.boundingBox = new THREE.Box3();
  }

  fitView() {
    if (this.components.length === 0) return;

    const box = this.boundingBox.clone();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.4,
      center.z + cameraZ * 0.5
    );
    this.controls.update();
  }

  setView(view) {
    const center = this.boundingBox.getCenter(new THREE.Vector3());
    const distance = this.boundingBox.getSize(new THREE.Vector3()).length() * 0.8;

    switch (view) {
      case 'top':
        this.camera.position.set(center.x, center.y + distance, center.z);
        this.controls.target.set(center.x, center.y, center.z);
        break;
      case 'front':
        this.camera.position.set(center.x, center.y, center.z + distance);
        this.controls.target.set(center.x, center.y, center.z);
        break;
      case 'side':
        this.camera.position.set(center.x + distance, center.y, center.z);
        this.controls.target.set(center.x, center.y, center.z);
        break;
      case 'iso':
        this.camera.position.set(
          center.x + distance * 0.5,
          center.y + distance * 0.5,
          center.z + distance * 0.5
        );
        this.controls.target.set(center.x, center.y, center.z);
        break;
    }
    this.controls.update();
  }

  toggleWireframe() {
    this.wireframeMode = !this.wireframeMode;
    this.components.forEach(mesh => {
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.wireframe = this.wireframeMode;
        }
      });
    });
    return this.wireframeMode;
  }

  toggleXray() {
    this.xrayMode = !this.xrayMode;
    this.components.forEach(mesh => {
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = this.xrayMode;
          child.material.opacity = this.xrayMode ? 0.3 : 1;
        }
      });
    });
    return this.xrayMode;
  }

  setLayerVisibility(layerId, visible) {
    this.components.forEach(mesh => {
      if (mesh.userData.layer === layerId) {
        mesh.visible = visible;
      }
    });
  }

  getCameraPosition() {
    return this.camera.position.clone();
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.clearComponents();
    this.renderer.dispose();
    this.controls.dispose();
  }
}

export default SceneLoader;
