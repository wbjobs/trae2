import * as THREE from 'three';

export class PerformanceOptimizer {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.enabled = true;
    this.frustumCullingEnabled = true;
    this.distanceCullingEnabled = true;
    this.lodEnabled = true;
    this.instancingEnabled = true;

    this.cullingDistance = 200;
    this.lodDistances = [50, 100, 200];

    this.optimizedObjects = new Map();
    this.instancedMeshes = new Map();

    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();

    this.stats = {
      totalObjects: 0,
      visibleObjects: 0,
      culledObjects: 0,
      trianglesRendered: 0,
      drawCalls: 0
    };

    this.updateInterval = 100;
    this.lastUpdateTime = 0;

    this.debugMode = false;
    this.debugHelpers = [];
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.restoreAllObjects();
  }

  registerObject(object, config = {}) {
    if (!object) return;

    const objectData = {
      object,
      originalVisible: object.visible,
      cullingEnabled: config.cullingEnabled ?? true,
      lodEnabled: config.lodEnabled ?? this.lodEnabled,
      minDistance: config.minDistance ?? 0,
      maxDistance: config.maxDistance ?? this.cullingDistance,
      lodLevels: config.lodLevels ?? null,
      originalGeometry: object.geometry?.clone(),
      originalMaterial: object.material?.clone(),
      triangleCount: this.countTriangles(object)
    };

    this.optimizedObjects.set(object.uuid, objectData);

    if (config.instancingGroup && this.instancingEnabled) {
      this.addToInstancingGroup(object, config.instancingGroup);
    }

    return objectData;
  }

  registerObjects(objects, config = {}) {
    objects.forEach(obj => this.registerObject(obj, config));
  }

  unregisterObject(object) {
    const data = this.optimizedObjects.get(object.uuid);
    if (data) {
      object.visible = data.originalVisible;
      if (data.originalGeometry && object.geometry !== data.originalGeometry) {
        object.geometry.dispose();
        object.geometry = data.originalGeometry;
      }
      this.optimizedObjects.delete(object.uuid);
    }
  }

  countTriangles(object) {
    let count = 0;
    if (object.isMesh && object.geometry) {
      if (object.geometry.index) {
        count = object.geometry.index.count / 3;
      } else if (object.geometry.attributes.position) {
        count = object.geometry.attributes.position.count / 3;
      }
    }
    return Math.floor(count);
  }

  update() {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;

    if (this.frustumCullingEnabled) {
      this.updateFrustum();
    }

    this.stats.totalObjects = 0;
    this.stats.visibleObjects = 0;
    this.stats.culledObjects = 0;
    this.stats.trianglesRendered = 0;

    const cameraPosition = this.camera.position;

    for (const [uuid, data] of this.optimizedObjects) {
      const { object, cullingEnabled, minDistance, maxDistance, triangleCount } = data;

      if (!object.parent) continue;

      this.stats.totalObjects++;

      let shouldBeVisible = data.originalVisible;

      if (this.distanceCullingEnabled && cullingEnabled) {
        const distance = cameraPosition.distanceTo(object.getWorldPosition(new THREE.Vector3()));
        if (distance < minDistance || distance > maxDistance) {
          shouldBeVisible = false;
        }
      }

      if (this.frustumCullingEnabled && cullingEnabled && shouldBeVisible) {
        if (!this.isInFrustum(object)) {
          shouldBeVisible = false;
        }
      }

      if (this.lodEnabled && data.lodLevels && shouldBeVisible) {
        this.applyLOD(object, data);
      }

      if (object.visible !== shouldBeVisible) {
        object.visible = shouldBeVisible;
      }

      if (shouldBeVisible) {
        this.stats.visibleObjects++;
        this.stats.trianglesRendered += triangleCount;
      } else {
        this.stats.culledObjects++;
      }
    }

    this.updateInstancedMeshes();

    if (this.debugMode) {
      this.updateDebugHelpers();
    }
  }

  updateFrustum() {
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  isInFrustum(object) {
    if (!object.geometry) return true;

    if (!object.geometry.boundingSphere) {
      object.geometry.computeBoundingSphere();
    }

    const sphere = object.geometry.boundingSphere.clone();
    object.getWorldPosition(sphere.center);

    return this.frustum.intersectsSphere(sphere);
  }

  applyLOD(object, data) {
    if (!data.lodLevels || !object.geometry) return;

    const distance = this.camera.position.distanceTo(object.getWorldPosition(new THREE.Vector3()));

    let targetLevel = 0;
    for (let i = data.lodLevels.length - 1; i >= 0; i--) {
      if (distance >= data.lodLevels[i].distance) {
        targetLevel = i;
        break;
      }
    }

    if (data.currentLODLevel !== targetLevel) {
      data.currentLODLevel = targetLevel;
      const level = data.lodLevels[targetLevel];

      if (level.simplifyRatio && data.originalGeometry) {
        const simplified = data.originalGeometry.clone();
        this.simplifyGeometry(simplified, level.simplifyRatio);

        if (object.geometry !== data.originalGeometry) {
          object.geometry.dispose();
        }
        object.geometry = simplified;
      }
    }
  }

  simplifyGeometry(geometry, ratio) {
    if (!geometry.index) return geometry;

    const originalCount = geometry.index.count;
    const newCount = Math.floor(originalCount * ratio);

    if (newCount >= originalCount) return geometry;

    const newIndex = new Uint32Array(newCount * 3);
    const step = Math.floor(originalCount / newCount);

    for (let i = 0, j = 0; i < newCount && j < originalCount; i++, j += step) {
      newIndex[i * 3] = geometry.index.array[j * 3];
      newIndex[i * 3 + 1] = geometry.index.array[j * 3 + 1];
      newIndex[i * 3 + 2] = geometry.index.array[j * 3 + 2];
    }

    geometry.setIndex(new THREE.BufferAttribute(newIndex, 3));
    geometry.computeBoundingSphere();

    return geometry;
  }

  addToInstancingGroup(object, groupName) {
    if (!this.instancedMeshes.has(groupName)) {
      this.instancedMeshes.set(groupName, {
        objects: [],
        instancedMesh: null,
        geometry: object.geometry.clone(),
        material: object.material.clone(),
        maxCount: 1000
      });
    }

    const group = this.instancedMeshes.get(groupName);
    group.objects.push(object);
    object.userData.instancingGroup = groupName;
  }

  updateInstancedMeshes() {
    if (!this.instancingEnabled) return;

    for (const [groupName, group] of this.instancedMeshes) {
      if (group.objects.length < 2) continue;

      if (!group.instancedMesh) {
        group.instancedMesh = new THREE.InstancedMesh(
          group.geometry,
          group.material,
          Math.min(group.objects.length, group.maxCount)
        );
        group.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(group.instancedMesh);
      }

      const dummy = new THREE.Object3D();
      let visibleCount = 0;

      group.objects.forEach((obj, index) => {
        if (index >= group.maxCount) return;

        if (obj.visible) {
          obj.getWorldPosition(dummy.position);
          obj.getWorldQuaternion(dummy.quaternion);
          obj.getWorldScale(dummy.scale);
          dummy.updateMatrix();
          group.instancedMesh.setMatrixAt(visibleCount, dummy.matrix);
          visibleCount++;
        }
      });

      group.instancedMesh.count = visibleCount;
      group.instancedMesh.instanceMatrix.needsUpdate = true;

      group.objects.forEach(obj => {
        obj.visible = false;
      });
    }
  }

  optimizeAllMeshes() {
    const optimizedCount = { merged: 0, instanced: 0, simplified: 0 };

    const materialGroups = new Map();

    this.scene.traverse(obj => {
      if (obj.isMesh && obj.material && obj.geometry) {
        const materialKey = obj.material.uuid || 'default';
        if (!materialGroups.has(materialKey)) {
          materialGroups.set(materialKey, []);
        }
        materialGroups.get(materialKey).push(obj);
      }
    });

    for (const [materialKey, meshes] of materialGroups) {
      if (meshes.length > 5) {
        try {
          const merged = this.mergeGeometries(meshes);
          if (merged) {
            meshes.forEach(m => {
              this.scene.remove(m);
              m.geometry.dispose();
            });
            this.scene.add(merged);
            optimizedCount.merged++;
          }
        } catch (e) {
          console.warn('几何体合并失败:', e);
        }
      }
    }

    return optimizedCount;
  }

  mergeGeometries(meshes) {
    if (meshes.length === 0) return null;

    const geometries = [];
    const material = meshes[0].material;

    for (const mesh of meshes) {
      const clonedGeom = mesh.geometry.clone();
      clonedGeom.applyMatrix4(mesh.matrixWorld);
      geometries.push(clonedGeom);
    }

    const mergedGeometry = this.mergeBufferGeometries(geometries);
    if (!mergedGeometry) return null;

    const mergedMesh = new THREE.Mesh(mergedGeometry, material);
    mergedMesh.castShadow = true;
    mergedMesh.receiveShadow = true;
    mergedMesh.userData.mergedFrom = meshes.map(m => m.uuid);

    return mergedMesh;
  }

  mergeBufferGeometries(geometries) {
    if (geometries.length === 0) return null;

    const attributes = new Map();
    let indexCount = 0;
    let vertexCount = 0;

    for (const geometry of geometries) {
      if (geometry.index) {
        indexCount += geometry.index.count;
      } else if (geometry.attributes.position) {
        vertexCount += geometry.attributes.position.count;
      }

      for (const name in geometry.attributes) {
        if (!attributes.has(name)) {
          attributes.set(name, []);
        }
        attributes.get(name).push(geometry.attributes[name]);
      }
    }

    const totalVertexCount = vertexCount || indexCount;
    const mergedGeometry = new THREE.BufferGeometry();

    for (const [name, attribs] of attributes) {
      if (attribs.length === 0) continue;

      const itemSize = attribs[0].itemSize;
      const TypedArray = attribs[0].array.constructor;
      const mergedArray = new TypedArray(totalVertexCount * itemSize);

      let offset = 0;
      for (const attrib of attribs) {
        mergedArray.set(attrib.array, offset);
        offset += attrib.array.length;
      }

      mergedGeometry.setAttribute(name, new THREE.BufferAttribute(mergedArray, itemSize));
    }

    if (indexCount > 0) {
      const indices = new Uint32Array(indexCount);
      let offset = 0;
      let vertexOffset = 0;

      for (const geometry of geometries) {
        if (geometry.index) {
          const idxArray = geometry.index.array;
          for (let i = 0; i < idxArray.length; i++) {
            indices[offset + i] = idxArray[i] + vertexOffset;
          }
          offset += idxArray.length;
          vertexOffset += geometry.attributes.position.count;
        }
      }

      mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 3));
    }

    mergedGeometry.computeBoundingSphere();
    mergedGeometry.computeBoundingBox();

    return mergedGeometry;
  }

  createDebugHelpers() {
    this.clearDebugHelpers();

    const cameraHelper = new THREE.CameraHelper(this.camera);
    this.debugHelpers.push(cameraHelper);
    this.scene.add(cameraHelper);

    const frustumHelper = this.createFrustumHelper();
    if (frustumHelper) {
      this.debugHelpers.push(frustumHelper);
      this.scene.add(frustumHelper);
    }
  }

  createFrustumHelper() {
    const points = [];
    const near = this.camera.near;
    const far = this.camera.far;
    const fov = this.camera.fov * Math.PI / 180;
    const aspect = this.camera.aspect;

    const nearHeight = 2 * Math.tan(fov / 2) * near;
    const nearWidth = nearHeight * aspect;
    const farHeight = 2 * Math.tan(fov / 2) * far;
    const farWidth = farHeight * aspect;

    const corners = [
      new THREE.Vector3(-nearWidth / 2, -nearHeight / 2, -near),
      new THREE.Vector3(nearWidth / 2, -nearHeight / 2, -near),
      new THREE.Vector3(nearWidth / 2, nearHeight / 2, -near),
      new THREE.Vector3(-nearWidth / 2, nearHeight / 2, -near),
      new THREE.Vector3(-farWidth / 2, -farHeight / 2, -far),
      new THREE.Vector3(farWidth / 2, -farHeight / 2, -far),
      new THREE.Vector3(farWidth / 2, farHeight / 2, -far),
      new THREE.Vector3(-farWidth / 2, farHeight / 2, -far)
    ];

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    edges.forEach(([start, end]) => {
      vertices.push(
        corners[start].x, corners[start].y, corners[start].z,
        corners[end].x, corners[end].y, corners[end].z
      );
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5
    });

    const helper = new THREE.LineSegments(geometry, material);
    helper.userData.isDebugHelper = true;
    return helper;
  }

  updateDebugHelpers() {
    if (this.debugHelpers.length === 0) return;

    this.debugHelpers.forEach(helper => {
      if (helper.update) helper.update();
    });
  }

  clearDebugHelpers() {
    this.debugHelpers.forEach(helper => {
      this.scene.remove(helper);
      if (helper.geometry) helper.geometry.dispose();
      if (helper.material) helper.material.dispose();
    });
    this.debugHelpers = [];
  }

  showDebug(show) {
    this.debugMode = show;
    if (show) {
      this.createDebugHelpers();
    } else {
      this.clearDebugHelpers();
    }
  }

  getStatistics() {
    return {
      ...this.stats,
      optimizedCount: this.optimizedObjects.size,
      instancedGroups: this.instancedMeshes.size,
      drawCalls: this.estimateDrawCalls(),
      fps: this.estimateFPS()
    };
  }

  estimateDrawCalls() {
    let drawCalls = 0;
    this.scene.traverse(obj => {
      if (obj.isMesh || obj.isLine || obj.isPoints) {
        if (obj.visible) drawCalls++;
      }
    });
    return drawCalls;
  }

  estimateFPS() {
    if (!this._lastFrameTime) {
      this._lastFrameTime = performance.now();
      this._frameCount = 0;
      this._fps = 60;
      return 60;
    }

    this._frameCount++;
    const now = performance.now();
    const elapsed = now - this._lastFrameTime;

    if (elapsed >= 1000) {
      this._fps = Math.round((this._frameCount * 1000) / elapsed);
      this._frameCount = 0;
      this._lastFrameTime = now;
    }

    return this._fps;
  }

  restoreAllObjects() {
    for (const [uuid, data] of this.optimizedObjects) {
      data.object.visible = data.originalVisible;
      if (data.originalGeometry && data.object.geometry !== data.originalGeometry) {
        data.object.geometry.dispose();
        data.object.geometry = data.originalGeometry;
      }
    }

    for (const [groupName, group] of this.instancedMeshes) {
      if (group.instancedMesh) {
        this.scene.remove(group.instancedMesh);
        group.instancedMesh.geometry.dispose();
        group.instancedMesh.material.dispose();
        group.objects.forEach(obj => {
          obj.visible = true;
        });
      }
    }

    this.instancedMeshes.clear();
  }

  setCullingDistance(distance) {
    this.cullingDistance = distance;
  }

  setLODDistances(distances) {
    this.lodDistances = distances;
  }

  setUpdateInterval(ms) {
    this.updateInterval = ms;
  }

  dispose() {
    this.restoreAllObjects();
    this.clearDebugHelpers();
    this.optimizedObjects.clear();
    this.instancedMeshes.clear();
  }
}
