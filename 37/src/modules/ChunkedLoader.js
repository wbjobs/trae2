import * as THREE from 'three';

class ChunkedLoader {
  constructor(sceneLoader, componentFactory, options = {}) {
    this.sceneLoader = sceneLoader;
    this.componentFactory = componentFactory;
    
    this.chunkSize = options.chunkSize || 20;
    this.viewDistance = options.viewDistance || 150;
    this.lodLevels = options.lodLevels || [30, 60, 100];
    
    this.chunks = new Map();
    this.loadedChunks = new Set();
    this.visibleChunks = new Set();
    
    this.frustum = new THREE.Frustum();
    this.frustumMatrix = new THREE.Matrix4();
    
    this.isLoading = false;
    this.loadQueue = [];
    this.maxConcurrentLoads = 4;
    
    this.onChunkLoad = null;
    this.onProgress = null;
    
    this.lastCameraPosition = new THREE.Vector3();
    this.updateThreshold = 5;
  }

  createChunks(componentsData) {
    this.chunks.clear();
    this.loadedChunks.clear();
    this.visibleChunks.clear();
    
    componentsData.forEach((data, index) => {
      const chunkKey = this.getChunkKey(data.position);
      
      if (!this.chunks.has(chunkKey)) {
        this.chunks.set(chunkKey, {
          key: chunkKey,
          center: this.getChunkCenter(data.position),
          components: [],
          loaded: false,
          meshes: []
        });
      }
      
      this.chunks.get(chunkKey).components.push(data);
    });
    
    console.log(`Created ${this.chunks.size} chunks from ${componentsData.length} components`);
    
    return this.chunks;
  }

  getChunkKey(position) {
    const x = Math.floor(position.x / this.chunkSize);
    const z = Math.floor(position.z / this.chunkSize);
    return `${x},${z}`;
  }

  getChunkCenter(position) {
    const x = Math.floor(position.x / this.chunkSize) * this.chunkSize + this.chunkSize / 2;
    const z = Math.floor(position.z / this.chunkSize) * this.chunkSize + this.chunkSize / 2;
    return new THREE.Vector3(x, 0, z);
  }

  async loadAllChunks(onProgress = null) {
    const chunks = Array.from(this.chunks.values());
    const total = chunks.length;
    let loaded = 0;
    
    for (const chunk of chunks) {
      await this.loadChunk(chunk);
      loaded++;
      
      if (onProgress) {
        onProgress(loaded / total, chunk);
      }
      
      await this.yield();
    }
  }

  async loadChunk(chunk) {
    if (chunk.loaded || this.loadedChunks.has(chunk.key)) {
      return chunk;
    }
    
    chunk.loaded = true;
    this.loadedChunks.add(chunk.key);
    
    for (const data of chunk.components) {
      try {
        const mesh = this.componentFactory.createComponent(data);
        if (mesh) {
          this.sceneLoader.addComponent(mesh, data);
          chunk.meshes.push(mesh);
        }
      } catch (e) {
        console.warn(`Failed to create component ${data.componentId}:`, e);
      }
    }
    
    if (this.onChunkLoad) {
      this.onChunkLoad(chunk);
    }
    
    return chunk;
  }

  unloadChunk(chunk) {
    if (!chunk.loaded) return;
    
    chunk.meshes.forEach(mesh => {
      this.sceneLoader.scene.remove(mesh);
      const index = this.sceneLoader.components.indexOf(mesh);
      if (index > -1) {
        this.sceneLoader.components.splice(index, 1);
      }
      this.sceneLoader.componentMap.delete(mesh.userData.componentId);
    });
    
    chunk.meshes = [];
    chunk.loaded = false;
    this.loadedChunks.delete(chunk.key);
    this.visibleChunks.delete(chunk.key);
  }

  updateVisibility(camera) {
    const cameraMoved = camera.position.distanceTo(this.lastCameraPosition) > this.updateThreshold;
    if (!cameraMoved && this.visibleChunks.size > 0) return;
    
    this.lastCameraPosition.copy(camera.position);
    
    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    
    const toLoad = [];
    const toUnload = [];
    
    this.chunks.forEach((chunk, key) => {
      const distance = chunk.center.distanceTo(camera.position);
      const inFrustum = this.isChunkInFrustum(chunk, this.frustum);
      const inRange = distance < this.viewDistance;
      const shouldBeVisible = inFrustum && inRange;
      
      if (shouldBeVisible && !chunk.loaded) {
        toLoad.push({ chunk, distance });
      } else if (!shouldBeVisible && chunk.loaded && distance > this.viewDistance * 1.2) {
        toUnload.push(chunk);
      }
      
      if (chunk.loaded) {
        this.applyLOD(chunk, distance);
      }
    });
    
    toLoad.sort((a, b) => a.distance - b.distance);
    toLoad.forEach(item => this.queueLoad(item.chunk));
    
    toUnload.forEach(chunk => this.unloadChunk(chunk));
    
    this.processLoadQueue();
  }

  isChunkInFrustum(chunk, frustum) {
    const sphere = new THREE.Sphere(chunk.center, this.chunkSize * 0.7);
    return frustum.intersectsSphere(sphere);
  }

  applyLOD(chunk, distance) {
    const lodLevel = this.getLODLevel(distance);
    
    chunk.meshes.forEach(mesh => {
      if (mesh.userData.currentLOD === lodLevel) return;
      mesh.userData.currentLOD = lodLevel;
      
      mesh.traverse(child => {
        if (child.isMesh && child.material) {
          if (lodLevel >= 2) {
            child.material.wireframe = false;
          }
        }
      });
    });
  }

  getLODLevel(distance) {
    for (let i = 0; i < this.lodLevels.length; i++) {
      if (distance < this.lodLevels[i]) {
        return i;
      }
    }
    return this.lodLevels.length;
  }

  queueLoad(chunk) {
    if (this.loadQueue.find(item => item.chunk.key === chunk.key)) return;
    this.loadQueue.push({ chunk, priority: Date.now() });
  }

  async processLoadQueue() {
    if (this.isLoading || this.loadQueue.length === 0) return;
    
    this.isLoading = true;
    
    const concurrent = Math.min(this.maxConcurrentLoads, this.loadQueue.length);
    const items = this.loadQueue.splice(0, concurrent);
    
    await Promise.all(items.map(item => this.loadChunk(item.chunk)));
    
    this.isLoading = false;
    
    if (this.loadQueue.length > 0) {
      setTimeout(() => this.processLoadQueue(), 50);
    }
  }

  getLoadedCount() {
    return this.loadedChunks.size;
  }

  getTotalCount() {
    return this.chunks.size;
  }

  getVisibleMeshes() {
    let count = 0;
    this.chunks.forEach(chunk => {
      if (chunk.loaded) {
        count += chunk.meshes.length;
      }
    });
    return count;
  }

  yield() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  dispose() {
    this.chunks.forEach(chunk => {
      chunk.meshes = [];
    });
    this.chunks.clear();
    this.loadedChunks.clear();
    this.visibleChunks.clear();
    this.loadQueue = [];
  }
}

export default ChunkedLoader;
