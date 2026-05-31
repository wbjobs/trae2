import * as THREE from 'three';

export class LazyModelLoader {
  constructor(scene, camera, modelLoader) {
    this.scene = scene;
    this.camera = camera;
    this.modelLoader = modelLoader;

    this.modelChunks = new Map();
    this.loadedChunks = new Set();
    this.loadingChunks = new Set();

    this.viewDistance = 100;
    this.unloadDistance = 150;
    this.checkInterval = 500;
    this.lastCheckTime = 0;

    this.maxLoadedChunks = 20;
    this.maxVisibleTriangles = 1000000;

    this.useFrustumCulling = true;
    this.useDistanceCulling = true;
    this.useLOD = true;

    this.onChunkLoad = null;
    this.onChunkUnload = null;
    this.onProgress = null;

    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.tempBox = new THREE.Box3();

    this.pendingLoadQueue = [];
    this.loadingConcurrency = 2;
  }

  addChunk(chunkId, config) {
    this.modelChunks.set(chunkId, {
      id: chunkId,
      ...config,
      loaded: false,
      loading: false,
      visible: false,
      priority: config.priority || 0,
      lastUsedTime: 0,
      triangleCount: config.triangleCount || 0
    });
  }

  addChunks(chunks) {
    chunks.forEach(chunk => {
      this.addChunk(chunk.id, chunk);
    });
  }

  removeChunk(chunkId) {
    this.unloadChunk(chunkId);
    this.modelChunks.delete(chunkId);
  }

  async loadChunk(chunkId) {
    const chunk = this.modelChunks.get(chunkId);
    if (!chunk || chunk.loaded || chunk.loading) return null;

    if (this.loadingChunks.size >= this.loadingConcurrency) {
      this.pendingLoadQueue.push(chunkId);
      return null;
    }

    chunk.loading = true;
    this.loadingChunks.add(chunkId);

    if (this.onProgress) {
      this.onProgress(chunkId, 'loading', this.loadingChunks.size, this.modelChunks.size);
    }

    try {
      let model;

      if (chunk.url) {
        model = await this.modelLoader.loadModelWithRetry(chunk.url);
      } else if (chunk.builder) {
        model = chunk.builder();
      } else {
        throw new Error(`Chunk ${chunkId} 没有加载方式`);
      }

      if (model) {
        if (model.scene) {
          model = model.scene;
        }

        if (chunk.position) {
          model.position.copy(chunk.position);
        }
        if (chunk.rotation) {
          model.rotation.copy(chunk.rotation);
        }
        if (chunk.scale) {
          model.scale.copy(chunk.scale);
        }

        model.userData.chunkId = chunkId;
        model.userData.isLazyLoaded = true;

        if (this.useLOD && chunk.lodLevels) {
          model = this.applyLODToModel(model, chunk.lodLevels);
        }

        this.scene.add(model);

        chunk.model = model;
        chunk.loaded = true;
        chunk.loading = false;
        chunk.lastUsedTime = Date.now();

        this.loadedChunks.add(chunkId);
        this.loadingChunks.delete(chunkId);

        if (this.onChunkLoad) {
          this.onChunkLoad(chunkId, model);
        }

        if (this.onProgress) {
          this.onProgress(chunkId, 'loaded', this.loadingChunks.size, this.modelChunks.size);
        }

        this.processPendingQueue();

        return model;
      }
    } catch (error) {
      console.error(`加载模型块失败 ${chunkId}:`, error);
      chunk.loading = false;
      this.loadingChunks.delete(chunkId);

      if (this.onProgress) {
        this.onProgress(chunkId, 'error', this.loadingChunks.size, this.modelChunks.size);
      }

      this.processPendingQueue();
    }

    return null;
  }

  processPendingQueue() {
    while (this.pendingLoadQueue.length > 0 && this.loadingChunks.size < this.loadingConcurrency) {
      const chunkId = this.pendingLoadQueue.shift();
      this.loadChunk(chunkId);
    }
  }

  unloadChunk(chunkId) {
    const chunk = this.modelChunks.get(chunkId);
    if (!chunk || !chunk.loaded) return;

    if (chunk.model) {
      this.scene.remove(chunk.model);

      chunk.model.traverse(child => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    chunk.model = null;
    chunk.loaded = false;
    chunk.visible = false;

    this.loadedChunks.delete(chunkId);

    if (this.onChunkUnload) {
      this.onChunkUnload(chunkId);
    }
  }

  applyLODToModel(model, lodLevels) {
    const lod = new THREE.LOD();

    lodLevels.forEach((level, index) => {
      const distance = level.distance || (index * 50 + 20);
      let levelModel;

      if (level.simplifyRatio && index > 0) {
        levelModel = model.clone();
        this.simplifyModel(levelModel, level.simplifyRatio);
      } else {
        levelModel = model.clone();
      }

      lod.addLevel(levelModel, distance);
    });

    lod.position.copy(model.position);
    lod.rotation.copy(model.rotation);
    lod.scale.copy(model.scale);

    return lod;
  }

  simplifyModel(model, ratio) {
    model.traverse(child => {
      if (child.isMesh && child.geometry && child.geometry.index) {
        const indexCount = Math.floor(child.geometry.index.count * ratio);
        const newIndex = new THREE.BufferAttribute(
          new Uint32Array(child.geometry.index.array.slice(0, indexCount * 3)),
          3
        );
        child.geometry.setIndex(newIndex);
        child.geometry.computeBoundingSphere();
      }
    });
  }

  update() {
    const now = Date.now();
    if (now - this.lastCheckTime < this.checkInterval) return;
    this.lastCheckTime = now;

    if (this.useFrustumCulling) {
      this.updateFrustum();
    }

    const cameraPosition = this.camera.position;
    const chunksToLoad = [];
    const chunksToUnload = [];

    let totalVisibleTriangles = 0;

    for (const [chunkId, chunk] of this.modelChunks) {
      if (!chunk.bounds) {
        chunk.bounds = this.calculateChunkBounds(chunk);
      }

      const distance = cameraPosition.distanceTo(chunk.bounds.getCenter(new THREE.Vector3()));
      const inView = this.isChunkInView(chunk);

      const shouldLoad = inView && distance < this.viewDistance;
      const shouldUnload = distance > this.unloadDistance || !inView;

      if (shouldLoad && !chunk.loaded && !chunk.loading) {
        const priority = this.calculateLoadPriority(chunk, distance, inView);
        chunksToLoad.push({ chunkId, priority });
      }

      if (shouldUnload && chunk.loaded) {
        chunksToUnload.push(chunkId);
      }

      if (chunk.loaded) {
        chunk.visible = shouldLoad;
        if (chunk.model) {
          chunk.model.visible = shouldLoad;
        }

        if (shouldLoad) {
          totalVisibleTriangles += chunk.triangleCount;
        }
      }
    }

    if (totalVisibleTriangles > this.maxVisibleTriangles) {
      chunksToLoad.sort((a, b) => b.priority - a.priority);
      const excessCount = chunksToLoad.length - Math.floor(this.maxVisibleTriangles / 50000);
      if (excessCount > 0) {
        chunksToLoad.splice(-excessCount);
      }
    }

    chunksToLoad.sort((a, b) => b.priority - a.priority);
    chunksToLoad.forEach(({ chunkId }) => {
      this.loadChunk(chunkId);
    });

    if (this.loadedChunks.size > this.maxLoadedChunks) {
      const loadedChunksArray = Array.from(this.loadedChunks)
        .map(id => this.modelChunks.get(id))
        .filter(c => c && c.loaded)
        .sort((a, b) => a.lastUsedTime - b.lastUsedTime);

      const chunksToRemove = loadedChunksArray.slice(0, this.loadedChunks.size - this.maxLoadedChunks);
      chunksToRemove.forEach(chunk => {
        chunksToUnload.push(chunk.id);
      });
    }

    chunksToUnload.forEach(chunkId => {
      this.unloadChunk(chunkId);
    });
  }

  updateFrustum() {
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  isChunkInView(chunk) {
    if (!this.useFrustumCulling) return true;
    if (!chunk.bounds) return true;

    return this.frustum.intersectsBox(chunk.bounds);
  }

  calculateChunkBounds(chunk) {
    if (chunk.bounds) return chunk.bounds;

    if (chunk.model) {
      this.tempBox.setFromObject(chunk.model);
      return this.tempBox.clone();
    }

    if (chunk.position && chunk.size) {
      const halfSize = chunk.size.clone().multiplyScalar(0.5);
      return new THREE.Box3(
        chunk.position.clone().sub(halfSize),
        chunk.position.clone().add(halfSize)
      );
    }

    return new THREE.Box3(
      new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      new THREE.Vector3(Infinity, Infinity, Infinity)
    );
  }

  calculateLoadPriority(chunk, distance, inView) {
    let priority = chunk.priority || 0;

    if (inView) priority += 100;

    priority += Math.max(0, (this.viewDistance - distance) / this.viewDistance * 50);

    if (chunk.alwaysVisible) priority += 200;

    return priority;
  }

  preloadChunks(chunkIds) {
    return Promise.all(chunkIds.map(id => this.loadChunk(id)));
  }

  preloadNearbyChunks(centerPosition, radius = 150) {
    const nearbyChunks = [];

    for (const [chunkId, chunk] of this.modelChunks) {
      if (!chunk.bounds) continue;

      const chunkCenter = chunk.bounds.getCenter(new THREE.Vector3());
      const distance = centerPosition.distanceTo(chunkCenter);

      if (distance < radius) {
        nearbyChunks.push({ chunkId, distance });
      }
    }

    nearbyChunks.sort((a, b) => a.distance - b.distance);

    return Promise.all(
      nearbyChunks.map(({ chunkId }) => this.loadChunk(chunkId))
    );
  }

  unloadAllChunks() {
    for (const chunkId of this.loadedChunks) {
      this.unloadChunk(chunkId);
    }
    this.pendingLoadQueue = [];
    this.loadingChunks.clear();
  }

  getChunk(chunkId) {
    return this.modelChunks.get(chunkId);
  }

  getLoadedChunks() {
    return Array.from(this.loadedChunks).map(id => this.modelChunks.get(id));
  }

  getStatistics() {
    let totalTriangles = 0;
    let visibleTriangles = 0;
    let loadedCount = 0;
    let visibleCount = 0;

    for (const chunk of this.modelChunks.values()) {
      if (chunk.loaded) {
        loadedCount++;
        totalTriangles += chunk.triangleCount;
        if (chunk.visible) {
          visibleCount++;
          visibleTriangles += chunk.triangleCount;
        }
      }
    }

    return {
      totalChunks: this.modelChunks.size,
      loadedChunks: loadedCount,
      visibleChunks: visibleCount,
      loadingChunks: this.loadingChunks.size,
      pendingChunks: this.pendingLoadQueue.length,
      totalTriangles,
      visibleTriangles,
      memoryUsageMB: totalTriangles * 48 / (1024 * 1024)
    };
  }

  setViewDistance(distance) {
    this.viewDistance = distance;
    this.unloadDistance = distance * 1.5;
  }

  setMaxLoadedChunks(max) {
    this.maxLoadedChunks = max;
  }

  setMaxVisibleTriangles(max) {
    this.maxVisibleTriangles = max;
  }

  setCheckInterval(ms) {
    this.checkInterval = ms;
  }

  dispose() {
    this.unloadAllChunks();
    this.modelChunks.clear();
    this.pendingLoadQueue = [];
  }

  generateBridgeChunks(bridgeConfig = {}) {
    const chunks = [];
    const bridgeLength = bridgeConfig.length || 100;
    const segmentLength = bridgeConfig.segmentLength || 20;
    const segments = Math.ceil(bridgeLength / segmentLength);

    for (let i = 0; i < segments; i++) {
      const zPos = -bridgeLength / 2 + i * segmentLength + segmentLength / 2;

      chunks.push({
        id: `bridge_segment_${i}`,
        position: new THREE.Vector3(0, 5, zPos),
        size: new THREE.Vector3(14, 5, segmentLength),
        priority: 10,
        triangleCount: 50000,
        builder: () => this.createBridgeSegment(segmentLength)
      });

      chunks.push({
        id: `bearings_segment_${i}`,
        position: new THREE.Vector3(0, 5.4, zPos),
        size: new THREE.Vector3(4, 1, segmentLength),
        priority: 8,
        triangleCount: 10000,
        builder: () => this.createBearingSegment(zPos)
      });

      chunks.push({
        id: `guardrails_segment_${i}`,
        position: new THREE.Vector3(0, 5.6, zPos),
        size: new THREE.Vector3(12, 1.5, segmentLength),
        priority: 5,
        triangleCount: 8000,
        builder: () => this.createGuardrailSegment(segmentLength)
      });
    }

    for (let i = -3; i <= 3; i++) {
      chunks.push({
        id: `pier_${i + 3}`,
        position: new THREE.Vector3(0, 2.5, i * 15),
        size: new THREE.Vector3(3, 5, 3),
        priority: 10,
        triangleCount: 2000,
        alwaysVisible: true,
        builder: () => this.createPier()
      });
    }

    return chunks;
  }

  createBridgeSegment(length) {
    const group = new THREE.Group();

    const deckGeometry = new THREE.BoxGeometry(12, 0.8, length);
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.2
    });
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.userData.type = 'deck';
    group.add(deck);

    return group;
  }

  createBearingSegment(zCenter) {
    const group = new THREE.Group();

    const bearingGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const bearingMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.6,
      metalness: 0.4
    });

    for (let side = -1; side <= 1; side += 2) {
      const bearing = new THREE.Mesh(bearingGeometry, bearingMaterial);
      bearing.position.set(side * 1.5, 0.4, 0);
      bearing.rotation.x = Math.PI / 2;
      bearing.castShadow = true;
      bearing.userData.type = 'bearing';
      bearing.userData.id = `bearing_${zCenter}_${side}`;
      group.add(bearing);
    }

    return group;
  }

  createGuardrailSegment(length) {
    const group = new THREE.Group();

    const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
    const railGeometry = new THREE.BoxGeometry(0.1, 0.1, length);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      roughness: 0.4,
      metalness: 0.6
    });

    const postCount = Math.floor(length / 2) + 1;
    for (let side = -1; side <= 1; side += 2) {
      const rail1 = new THREE.Mesh(railGeometry, material);
      rail1.position.set(side * 5.5, 0.9, 0);
      rail1.castShadow = true;
      group.add(rail1);

      const rail2 = new THREE.Mesh(railGeometry, material);
      rail2.position.set(side * 5.5, 0.45, 0);
      rail2.castShadow = true;
      group.add(rail2);

      for (let i = 0; i < postCount; i++) {
        const post = new THREE.Mesh(postGeometry, material);
        post.position.set(side * 5.5, 0.6, -length / 2 + i * 2);
        post.castShadow = true;
        post.userData.type = 'guardrail_post';
        group.add(post);
      }
    }

    return group;
  }

  createPier() {
    const group = new THREE.Group();

    const pierGeometry = new THREE.BoxGeometry(2, 5, 2);
    const pierMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.9,
      metalness: 0.1
    });
    const pier = new THREE.Mesh(pierGeometry, pierMaterial);
    pier.position.y = 2.5;
    pier.castShadow = true;
    pier.receiveShadow = true;
    pier.userData.type = 'pier';
    group.add(pier);

    const capGeometry = new THREE.BoxGeometry(3, 0.5, 3);
    const cap = new THREE.Mesh(capGeometry, pierMaterial);
    cap.position.y = 5.25;
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);

    return group;
  }
}
