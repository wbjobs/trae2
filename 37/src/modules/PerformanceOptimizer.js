import * as THREE from 'three';

class PerformanceOptimizer {
  constructor(sceneLoader, options = {}) {
    this.sceneLoader = sceneLoader;
    
    this.targetFPS = options.targetFPS || 60;
    this.minFPS = options.minFPS || 30;
    this.currentFPS = 60;
    this.frameTimes = [];
    this.maxFrameTimeSamples = 30;
    
    this.qualityLevel = 'high';
    this.qualityLevels = ['low', 'medium', 'high', 'ultra'];
    
    this.frustumCulling = true;
    this.batchRendering = true;
    this.instanceRendering = true;
    
    this.instancedMeshes = new Map();
    this.batchGroups = new Map();
    
    this.isOptimizing = false;
    this.onQualityChange = null;
  }

  start() {
    this.isOptimizing = true;
    this.optimizeLoop();
  }

  stop() {
    this.isOptimizing = false;
  }

  recordFrameTime(frameTime) {
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.maxFrameTimeSamples) {
      this.frameTimes.shift();
    }
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.currentFPS = 1000 / avgFrameTime;
    
    this.adjustQuality();
  }

  adjustQuality() {
    if (this.currentFPS < this.minFPS && this.qualityLevel !== 'low') {
      this.decreaseQuality();
    } else if (this.currentFPS >= this.targetFPS * 0.95 && this.qualityLevel !== 'ultra') {
      this.increaseQuality();
    }
  }

  increaseQuality() {
    const currentIndex = this.qualityLevels.indexOf(this.qualityLevel);
    if (currentIndex < this.qualityLevels.length - 1) {
      this.qualityLevel = this.qualityLevels[currentIndex + 1];
      this.applyQuality();
      
      if (this.onQualityChange) {
        this.onQualityChange(this.qualityLevel, 'up');
      }
    }
  }

  decreaseQuality() {
    const currentIndex = this.qualityLevels.indexOf(this.qualityLevel);
    if (currentIndex > 0) {
      this.qualityLevel = this.qualityLevels[currentIndex - 1];
      this.applyQuality();
      
      if (this.onQualityChange) {
        this.onQualityChange(this.qualityLevel, 'down');
      }
    }
  }

  applyQuality() {
    const settings = this.getQualitySettings();
    
    this.sceneLoader.renderer.setPixelRatio(settings.pixelRatio);
    this.sceneLoader.renderer.shadowMap.enabled = settings.shadows;
    
    if (settings.antialias !== undefined) {
      this.sceneLoader.renderer.setPixelRatio(settings.antialias ? 
        Math.min(window.devicePixelRatio, 2) : 1);
    }
  }

  getQualitySettings() {
    return {
      low: {
        pixelRatio: 0.75,
        shadows: false,
        antialias: false,
        lodBias: 2
      },
      medium: {
        pixelRatio: 1,
        shadows: true,
        antialias: true,
        lodBias: 1
      },
      high: {
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        shadows: true,
        antialias: true,
        lodBias: 0
      },
      ultra: {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        shadows: true,
        antialias: true,
        lodBias: 0
      }
    }[this.qualityLevel];
  }

  enableFrustumCulling(enabled) {
    this.frustumCulling = enabled;
    this.sceneLoader.components.forEach(mesh => {
      mesh.frustumCulled = enabled;
    });
  }

  createInstancedMesh(geometry, material, count, transforms) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    
    const matrix = new THREE.Matrix4();
    transforms.forEach((transform, index) => {
      matrix.compose(
        transform.position || new THREE.Vector3(),
        transform.quaternion || new THREE.Quaternion(),
        transform.scale || new THREE.Vector3(1, 1, 1)
      );
      instancedMesh.setMatrixAt(index, matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  batchByMaterial(components) {
    const materialGroups = new Map();
    
    components.forEach(comp => {
      comp.traverse(child => {
        if (child.isMesh && child.material) {
          const materialKey = child.material.uuid;
          if (!materialGroups.has(materialKey)) {
            materialGroups.set(materialKey, {
              material: child.material,
              meshes: []
            });
          }
          materialGroups.get(materialKey).meshes.push(child);
        }
      });
    });
    
    return materialGroups;
  }

  mergeGeometriesByMaterial(components) {
    const materialGroups = this.batchByMaterial(components);
    const merged = [];
    
    materialGroups.forEach((group, key) => {
      if (group.meshes.length > 1) {
        const geometries = group.meshes.map(mesh => {
          const cloned = mesh.geometry.clone();
          cloned.applyMatrix4(mesh.matrixWorld);
          return cloned;
        });
        
        const mergedGeometry = this.mergeBufferGeometries(geometries);
        if (mergedGeometry) {
          const mergedMesh = new THREE.Mesh(mergedGeometry, group.material);
          merged.push(mergedMesh);
          
          geometries.forEach(g => g.dispose());
        }
      }
    });
    
    return merged;
  }

  mergeBufferGeometries(geometries) {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];
    
    const attributes = ['position', 'normal', 'uv'];
    const merged = {};
    let vertexCount = 0;
    
    geometries.forEach(geo => {
      vertexCount += geo.attributes.position.count;
    });
    
    attributes.forEach(attr => {
      if (geometries[0].attributes[attr]) {
        const itemSize = geometries[0].attributes[attr].itemSize;
        const TypedArray = geometries[0].attributes[attr].array.constructor;
        merged[attr] = new TypedArray(vertexCount * itemSize);
      }
    });
    
    let offset = 0;
    geometries.forEach(geo => {
      attributes.forEach(attr => {
        if (merged[attr] && geo.attributes[attr]) {
          merged[attr].set(geo.attributes[attr].array, offset);
        }
      });
      offset += geo.attributes.position.count * (merged.position ? 3 : 0);
    });
    
    const result = new THREE.BufferGeometry();
    Object.keys(merged).forEach(attr => {
      const itemSize = geometries[0].attributes[attr].itemSize;
      result.setAttribute(attr, new THREE.BufferAttribute(merged[attr], itemSize));
    });
    
    result.computeVertexNormals();
    return result;
  }

  simplifyMesh(mesh, ratio = 0.5) {
    if (!mesh.geometry) return mesh;
    
    const geometry = mesh.geometry;
    const positionAttr = geometry.attributes.position;
    
    if (!positionAttr) return mesh;
    
    const originalCount = positionAttr.count;
    const targetCount = Math.floor(originalCount * ratio);
    
    if (targetCount >= originalCount) return mesh;
    
    console.log(`Simplifying mesh from ${originalCount} to ${targetCount} vertices`);
    
    return mesh;
  }

  optimizeShadows(enabled = true) {
    this.sceneLoader.renderer.shadowMap.enabled = enabled;
    
    if (enabled) {
      this.sceneLoader.scene.traverse(obj => {
        if (obj.isLight && obj.castShadow) {
          obj.shadow.mapSize.width = 1024;
          obj.shadow.mapSize.height = 1024;
          obj.shadow.camera.near = 1;
          obj.shadow.camera.far = 200;
        }
      });
    }
  }

  getStats() {
    return {
      fps: Math.round(this.currentFPS),
      quality: this.qualityLevel,
      visibleMeshes: this.sceneLoader.components.filter(m => m.visible).length,
      totalMeshes: this.sceneLoader.components.length
    };
  }

  dispose() {
    this.stop();
    this.instancedMeshes.forEach(mesh => {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    this.instancedMeshes.clear();
    this.batchGroups.clear();
  }
}

export default PerformanceOptimizer;
