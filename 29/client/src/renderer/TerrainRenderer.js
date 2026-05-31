import * as THREE from 'three';

class TerrainRenderer {
  constructor(container) {
    this.container = container;
    this.size = 128;
    this.heightMap = null;
    this.terrainMesh = null;
    this.waterMesh = null;
    this.players = new Map();
    this.playerMarkers = new Map();
    
    this.useOptimizedRendering = true;
    this.lodEnabled = true;
    this.waterAnimationEnabled = true;
    this.shadowsEnabled = true;
    this.animationFrameId = null;
    
    this.pendingUpdates = [];
    this.updateBatchSize = 256;
    this.lastUpdateTime = 0;
    this.updateInterval = 16;
    
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 150, 350);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 1000);
    this.camera.position.set(80, 60, 80);
    this.camera.lookAt(0, 15, 0);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupControls();
    this.setupGridHelper();

    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0x505060, 0.5);
    this.scene.add(ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(60, 80, 60);
    this.directionalLight.castShadow = this.shadowsEnabled;
    
    if (this.shadowsEnabled) {
      this.directionalLight.shadow.mapSize.width = 1024;
      this.directionalLight.shadow.mapSize.height = 1024;
      this.directionalLight.shadow.camera.near = 0.5;
      this.directionalLight.shadow.camera.far = 300;
      this.directionalLight.shadow.camera.left = -80;
      this.directionalLight.shadow.camera.right = 80;
      this.directionalLight.shadow.camera.top = 80;
      this.directionalLight.shadow.camera.bottom = -80;
    }
    
    this.scene.add(this.directionalLight);

    const hemLight = new THREE.HemisphereLight(0x87CEEB, 0x4a3728, 0.3);
    this.scene.add(hemLight);
  }

  setupControls() {
    this.isDragging = false;
    this.previousMouse = { x: 0, y: 0 };
    this.spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 100 };
    this.target = new THREE.Vector3(0, 15, 0);

    this.container.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.container.addEventListener('mouseup', () => this.onMouseUp());
    this.container.addEventListener('mouseleave', () => this.onMouseUp());
    this.container.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });

    this.updateCamera();
  }

  setupGridHelper() {
    const gridHelper = new THREE.GridHelper(160, 40, 0x2a2a44, 0x1a1a33);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);
  }

  createTerrain(size, heightMap) {
    this.size = size;
    this.heightMap = heightMap;
    this.pendingUpdates = [];

    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
    }

    const geometry = new THREE.PlaneGeometry(size, size, size - 1, size - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        positions.setY(i, heightMap[y][x] || 0);
      }
    }

    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      roughness: 0.9,
      metalness: 0.0
    });

    const colors = new Float32Array(size * size * 3);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const height = heightMap[y][x] || 0;
        const color = this.getTerrainColor(height);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.receiveShadow = this.shadowsEnabled;
    this.terrainMesh.castShadow = this.shadowsEnabled;
    this.scene.add(this.terrainMesh);

    this.createWater(size);

    document.getElementById('vertex-count').textContent = positions.count.toLocaleString();
  }

  createWater(size) {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh.material.dispose();
    }

    const waterGeometry = new THREE.PlaneGeometry(size, size, 32, 32);
    waterGeometry.rotateX(-Math.PI / 2);

    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a90d9,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.2
    });

    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.waterMesh.position.y = 5;
    this.scene.add(this.waterMesh);
  }

  getTerrainColor(height) {
    const normalizedHeight = height / 70;
    
    if (normalizedHeight < 0.2) {
      return { r: 0.76, g: 0.70, b: 0.50 };
    } else if (normalizedHeight < 0.4) {
      return { r: 0.34, g: 0.53, b: 0.23 };
    } else if (normalizedHeight < 0.6) {
      return { r: 0.28, g: 0.42, b: 0.18 };
    } else if (normalizedHeight < 0.8) {
      return { r: 0.50, g: 0.45, b: 0.40 };
    } else {
      return { r: 0.95, g: 0.95, b: 0.97 };
    }
  }

  updateTerrainPartial(changes) {
    if (!this.terrainMesh || !changes || changes.length === 0) return;

    this.pendingUpdates.push(...changes);
    this.processPendingUpdates();
  }

  processPendingUpdates() {
    if (this.pendingUpdates.length === 0) return;
    if (!this.terrainMesh) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;

    const positions = this.terrainMesh.geometry.attributes.position;
    const colors = this.terrainMesh.geometry.attributes.color;

    const updateCount = Math.min(this.updateBatchSize, this.pendingUpdates.length);
    const updates = this.pendingUpdates.splice(0, updateCount);

    let needsUpdate = false;

    for (const change of updates) {
      const { x, y, h } = change;
      if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
        const i = y * this.size + x;
        const currentH = positions.getY(i);
        
        if (Math.abs(currentH - h) > 0.01) {
          positions.setY(i, h);
          
          const color = this.getTerrainColor(h);
          colors.setX(i, color.r);
          colors.setY(i, color.g);
          colors.setZ(i, color.b);
          
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      this.terrainMesh.geometry.computeVertexNormals();
    }
  }

  updatePlayerPosition(playerId, position) {
    let marker = this.playerMarkers.get(playerId);
    
    if (!marker) {
      const player = this.players.get(playerId);
      const color = player ? player.color : '#4ECDC4';
      
      const geometry = new THREE.ConeGeometry(0.8, 2.5, 6);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.2
      });
      
      marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = Math.PI;
      
      this.scene.add(marker);
      this.playerMarkers.set(playerId, marker);
    }
    
    const halfSize = this.size / 2;
    marker.position.set(
      position.x - halfSize,
      (position.z || 20) + 2,
      position.y - halfSize
    );
  }

  removePlayer(playerId) {
    const marker = this.playerMarkers.get(playerId);
    if (marker) {
      this.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
      this.playerMarkers.delete(playerId);
    }
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  onMouseDown(e) {
    this.isDragging = true;
    this.previousMouse = { x: e.clientX, y: e.clientY };
  }

  onMouseMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.previousMouse.x;
    const deltaY = e.clientY - this.previousMouse.y;

    this.spherical.theta -= deltaX * 0.008;
    this.spherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.1, this.spherical.phi - deltaY * 0.008));

    this.previousMouse = { x: e.clientX, y: e.clientY };
    this.updateCamera();
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onMouseWheel(e) {
    e.preventDefault();
    this.spherical.radius = Math.max(40, Math.min(200, this.spherical.radius + e.deltaY * 0.08));
    this.updateCamera();
  }

  updateCamera() {
    const { theta, phi, radius } = this.spherical;
    
    this.camera.position.x = this.target.x + radius * Math.sin(phi) * Math.cos(theta);
    this.camera.position.y = this.target.y + radius * Math.cos(phi);
    this.camera.position.z = this.target.z + radius * Math.sin(phi) * Math.sin(theta);
    
    this.camera.lookAt(this.target);
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }

  render() {
    if (this.pendingUpdates.length > 0) {
      this.processPendingUpdates();
    }

    if (this.waterMesh && this.waterAnimationEnabled) {
      const time = Date.now() * 0.0008;
      const positions = this.waterMesh.geometry.attributes.position;
      
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const wave = Math.sin(x * 0.08 + time) * Math.cos(z * 0.08 + time) * 0.2;
        positions.setY(i, wave);
      }
      
      positions.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  setShadowsEnabled(enabled) {
    this.shadowsEnabled = enabled;
    if (this.directionalLight) {
      this.directionalLight.castShadow = enabled;
    }
    if (this.terrainMesh) {
      this.terrainMesh.receiveShadow = enabled;
      this.terrainMesh.castShadow = enabled;
    }
    this.renderer.shadowMap.enabled = enabled;
  }

  setWaterAnimationEnabled(enabled) {
    this.waterAnimationEnabled = enabled;
  }

  setQuality(level) {
    switch (level) {
      case 'low':
        this.renderer.setPixelRatio(1);
        this.setShadowsEnabled(false);
        this.setWaterAnimationEnabled(false);
        this.updateBatchSize = 128;
        this.updateInterval = 32;
        break;
      case 'medium':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.setShadowsEnabled(true);
        this.setWaterAnimationEnabled(true);
        this.updateBatchSize = 256;
        this.updateInterval = 16;
        break;
      case 'high':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.setShadowsEnabled(true);
        this.setWaterAnimationEnabled(true);
        this.updateBatchSize = 512;
        this.updateInterval = 8;
        break;
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

export default TerrainRenderer;
