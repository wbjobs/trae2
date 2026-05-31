import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LOD } from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class ModelLoader {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.loader = new GLTFLoader();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.loader.setDRACOLoader(this.dracoLoader);

    this.models = {
      bridge: null,
      guardrails: null,
      bearings: null,
      bearingList: [],
      guardrailList: []
    };

    this.loadingManager = new THREE.LoadingManager();
    this.onProgress = null;
    this.onError = null;
    this.onComplete = null;

    this.lodObjects = [];
    this.loadingErrors = [];
    this.retryCount = 3;

    this.useInstancing = true;
    this.useLOD = true;
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  setErrorCallback(callback) {
    this.onError = callback;
  }

  setCompleteCallback(callback) {
    this.onComplete = callback;
  }

  async loadModelWithRetry(url, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.loader.loadAsync(url, (xhr) => {
          if (this.onProgress && xhr.total > 0) {
            const progress = (xhr.loaded / xhr.total) * 100;
            this.onProgress(`加载模型 ${url}`, progress, attempt + 1);
          }
        });
      } catch (error) {
        lastError = error;
        console.warn(`模型加载失败 (尝试 ${attempt + 1}/${maxRetries}):`, url);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    this.loadingErrors.push({ url, error: lastError });
    if (this.onError) {
      this.onError(url, lastError);
    }
    throw lastError;
  }

  validateModel(model) {
    if (!model || !model.children) {
      return { valid: false, error: '模型为空' };
    }

    let meshCount = 0;
    let totalVertices = 0;

    model.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        if (child.geometry) {
          totalVertices += child.geometry.attributes.position?.count || 0;
        }
      }
    });

    if (meshCount === 0) {
      return { valid: false, error: '模型不包含任何网格' };
    }

    return {
      valid: true,
      meshCount,
      totalVertices,
      bounds: this.calculateBounds(model)
    };
  }

  calculateBounds(object) {
    const box = new THREE.Box3();
    box.setFromObject(object);
    return {
      min: box.min,
      max: box.max,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3())
    };
  }

  optimizeModel(model) {
    const meshes = [];
    const nonMeshes = [];

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        meshes.push(child);
      } else if (child.isObject3D) {
        nonMeshes.push(child);
      }
    });

    const materialGroups = new Map();
    meshes.forEach((mesh) => {
      const materialKey = mesh.material.uuid || mesh.material.name || 'default';
      if (!materialGroups.has(materialKey)) {
        materialGroups.set(materialKey, { material: mesh.material, geometries: [] });
      }
      materialGroups.get(materialKey).geometries.push(mesh.geometry);
    });

    const optimizedGroup = new THREE.Group();

    materialGroups.forEach(({ material, geometries }) => {
      if (geometries.length > 1) {
        try {
          const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
          const mergedMesh = new THREE.Mesh(mergedGeometry, material);
          mergedMesh.castShadow = true;
          mergedMesh.receiveShadow = true;
          optimizedGroup.add(mergedMesh);
        } catch (e) {
          console.warn('几何体合并失败，使用原始网格:', e);
          meshes.forEach(mesh => optimizedGroup.attach(mesh.clone()));
        }
      } else if (geometries.length === 1) {
        const mesh = new THREE.Mesh(geometries[0], material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        optimizedGroup.add(mesh);
      }
    });

    return optimizedGroup;
  }

  createLOD(geometry, material, positions, distances = [50, 100, 200]) {
    const lod = new LOD();

    distances.forEach((distance, index) => {
      const detailRatio = 1 - (index / distances.length) * 0.5;

      let simplifiedGeometry = geometry.clone();
      if (index > 0) {
        simplifiedGeometry = this.simplifyGeometry(geometry, detailRatio);
      }

      positions.forEach(pos => {
        const mesh = new THREE.Mesh(simplifiedGeometry, material);
        mesh.position.copy(pos);
        mesh.castShadow = index === 0;
        mesh.receiveShadow = index < 2;
        lod.addLevel(mesh, distance);
      });
    });

    return lod;
  }

  simplifyGeometry(geometry, ratio) {
    const simplified = geometry.clone();
    if (ratio < 1 && simplified.index) {
      const indexCount = Math.floor(simplified.index.count * ratio);
      const newIndex = new THREE.BufferAttribute(
        new Uint32Array(simplified.index.array.slice(0, indexCount * 3)),
        3
      );
      simplified.setIndex(newIndex);
    }
    return simplified;
  }

  async loadBridgeModel(url = '/models/bridge.glb', useOptimization = true) {
    try {
      const gltf = await this.loadModelWithRetry(url, this.retryCount);
      let bridgeModel = gltf.scene.clone();

      const validation = this.validateModel(bridgeModel);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      console.log('桥梁模型验证:', validation);

      bridgeModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0x888888,
              roughness: 0.7,
              metalness: 0.3
            });
          }

          if (Array.isArray(child.material)) {
            child.material = child.material[0] || new THREE.MeshStandardMaterial();
          }
        }
      });

      if (useOptimization && validation.meshCount > 10) {
        bridgeModel = this.optimizeModel(bridgeModel);
      }

      bridgeModel.userData.loaded = true;
      bridgeModel.userData.validation = validation;

      this.scene.add(bridgeModel);
      this.models.bridge = bridgeModel;

      if (this.onProgress) {
        this.onProgress('桥梁模型加载完成', 100);
      }

      return bridgeModel;
    } catch (error) {
      console.warn('外部桥梁模型加载失败，使用程序化生成:', error);
      return this.createProceduralBridge();
    }
  }

  createProceduralBridge() {
    const bridgeGroup = new THREE.Group();
    const bridgeLength = 100;
    const bridgeWidth = 12;
    const deckThickness = 0.8;

    const deckGeometry = new THREE.BoxGeometry(bridgeWidth, deckThickness, bridgeLength);
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.2
    });
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.position.y = 5;
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.userData.type = 'deck';
    bridgeGroup.add(deck);

    const pierGeometry = new THREE.BoxGeometry(2, 5, 2);
    const pierMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.9,
      metalness: 0.1
    });

    for (let i = -3; i <= 3; i++) {
      const pier = new THREE.Mesh(pierGeometry, pierMaterial);
      pier.position.set(0, 2.5, i * 15);
      pier.castShadow = true;
      pier.receiveShadow = true;
      pier.userData.type = 'pier';
      pier.userData.id = `pier_${i}`;
      bridgeGroup.add(pier);

      const capGeometry = new THREE.BoxGeometry(3, 0.5, 3);
      const cap = new THREE.Mesh(capGeometry, pierMaterial);
      cap.position.set(0, 5.25, i * 15);
      cap.castShadow = true;
      cap.receiveShadow = true;
      bridgeGroup.add(cap);
    }

    bridgeGroup.userData.loaded = true;
    bridgeGroup.userData.procedural = true;

    this.scene.add(bridgeGroup);
    this.models.bridge = bridgeGroup;

    return bridgeGroup;
  }

  createGuardrails(useInstancing = true) {
    const guardrailGroup = new THREE.Group();
    const bridgeLength = 100;
    const postHeight = 1.2;
    const postSpacing = 2;
    const postCount = Math.floor(bridgeLength / postSpacing) + 1;

    const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, postHeight, 8);
    const railGeometry = new THREE.BoxGeometry(0.1, 0.1, postSpacing);
    const guardrailMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      roughness: 0.4,
      metalness: 0.6
    });

    if (useInstancing && postCount > 10) {
      const postCountPerSide = postCount;
      const totalPosts = postCountPerSide * 2;

      const postInstanced = new THREE.InstancedMesh(postGeometry, guardrailMaterial, totalPosts);
      const railInstanced = new THREE.InstancedMesh(railGeometry, guardrailMaterial, (postCount - 1) * 4);
      const rail2Instanced = new THREE.InstancedMesh(railGeometry, guardrailMaterial, (postCount - 1) * 4);

      let instanceIndex = 0;
      let railIndex = 0;

      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < postCount; i++) {
          const matrix = new THREE.Matrix4();
          matrix.makeTranslation(
            side * 5.5,
            5 + postHeight / 2,
            -50 + i * postSpacing
          );
          postInstanced.setMatrixAt(instanceIndex, matrix);
          postInstanced.setColorAt(instanceIndex, new THREE.Color(0x4488ff));

          const dummy = new THREE.Object3D();
          dummy.position.set(side * 5.5, 5 + postHeight / 2, -50 + i * postSpacing);
          dummy.userData = {
            type: 'guardrail_post',
            id: `guardrail_post_${side}_${i}`,
            instanceIndex: instanceIndex
          };
          this.models.guardrailList.push(dummy);

          instanceIndex++;

          if (i < postCount - 1) {
            const railMatrix1 = new THREE.Matrix4();
            railMatrix1.makeTranslation(
              side * 5.5,
              5 + postHeight * 0.75,
              -50 + i * postSpacing + postSpacing / 2
            );
            railInstanced.setMatrixAt(railIndex, railMatrix1);

            const railMatrix2 = new THREE.Matrix4();
            railMatrix2.makeTranslation(
              side * 5.5,
              5 + postHeight * 0.3,
              -50 + i * postSpacing + postSpacing / 2
            );
            rail2Instanced.setMatrixAt(railIndex, railMatrix2);

            railIndex++;
          }
        }
      }

      postInstanced.castShadow = true;
      railInstanced.castShadow = true;
      rail2Instanced.castShadow = true;
      postInstanced.instanceColor.needsUpdate = true;

      guardrailGroup.add(postInstanced);
      guardrailGroup.add(railInstanced);
      guardrailGroup.add(rail2Instanced);
    } else {
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < postCount; i++) {
          const post = new THREE.Mesh(postGeometry, guardrailMaterial);
          post.position.set(side * 5.5, 5 + postHeight / 2, -50 + i * postSpacing);
          post.castShadow = true;
          post.userData.type = 'guardrail_post';
          post.userData.id = `guardrail_post_${side}_${i}`;
          guardrailGroup.add(post);
          this.models.guardrailList.push(post);

          if (i < postCount - 1) {
            const rail = new THREE.Mesh(railGeometry, guardrailMaterial);
            rail.position.set(side * 5.5, 5 + postHeight * 0.75, -50 + i * postSpacing + postSpacing / 2);
            rail.castShadow = true;
            guardrailGroup.add(rail);

            const rail2 = new THREE.Mesh(railGeometry, guardrailMaterial);
            rail2.position.set(side * 5.5, 5 + postHeight * 0.3, -50 + i * postSpacing + postSpacing / 2);
            rail2.castShadow = true;
            guardrailGroup.add(rail2);
          }
        }
      }
    }

    guardrailGroup.userData.loaded = true;
    this.scene.add(guardrailGroup);
    this.models.guardrails = guardrailGroup;

    return guardrailGroup;
  }

  createBearings(useLOD = true) {
    const bearingGroup = new THREE.Group();
    const positions = [];

    for (let i = -3; i <= 3; i++) {
      for (let side = -1; side <= 1; side += 2) {
        positions.push(new THREE.Vector3(side * 1.5, 5.4, i * 15));
      }
    }

    const bearingGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const bearingMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.6,
      metalness: 0.4
    });

    if (useLOD && this.camera) {
      const bearingLOD = this.createBearingLOD(positions);
      bearingGroup.add(bearingLOD);
      this.lodObjects.push(bearingLOD);
    } else {
      positions.forEach((pos, index) => {
        const bearing = new THREE.Mesh(bearingGeometry, bearingMaterial);
        bearing.position.copy(pos);
        bearing.rotation.x = Math.PI / 2;
        bearing.castShadow = true;
        bearing.receiveShadow = true;
        bearing.userData.type = 'bearing';
        bearing.userData.id = `bearing_${Math.floor(index / 2) - 3}_${index % 2 === 0 ? -1 : 1}`;
        bearingGroup.add(bearing);
        this.models.bearingList.push(bearing);
      });
    }

    bearingGroup.userData.loaded = true;
    this.scene.add(bearingGroup);
    this.models.bearings = bearingGroup;

    return bearingGroup;
  }

  createBearingLOD(positions) {
    const lodGroup = new THREE.Group();

    const highGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const medGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const lowGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 4);

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.6,
      metalness: 0.4
    });

    positions.forEach((pos, index) => {
      const lod = new LOD();

      const highMesh = new THREE.Mesh(highGeom, material);
      highMesh.rotation.x = Math.PI / 2;
      highMesh.castShadow = true;
      highMesh.receiveShadow = true;
      lod.addLevel(highMesh, 0);

      const medMesh = new THREE.Mesh(medGeom, material);
      medMesh.rotation.x = Math.PI / 2;
      medMesh.castShadow = true;
      lod.addLevel(medMesh, 30);

      const lowMesh = new THREE.Mesh(lowGeom, material);
      lowMesh.rotation.x = Math.PI / 2;
      lod.addLevel(lowMesh, 60);

      lod.position.copy(pos);
      lod.userData.type = 'bearing';
      lod.userData.id = `bearing_${Math.floor(index / 2) - 3}_${index % 2 === 0 ? -1 : 1}`;
      lodGroup.add(lod);
      this.models.bearingList.push(lod);
    });

    return lodGroup;
  }

  async loadAllModels(bridgeModelUrl = null) {
    const totalSteps = bridgeModelUrl ? 3 : 3;
    let currentStep = 0;

    const updateProgress = (step, message) => {
      currentStep = step;
      if (this.onProgress) {
        this.onProgress(message, (currentStep / totalSteps) * 100);
      }
    };

    try {
      if (bridgeModelUrl) {
        updateProgress(1, '正在加载桥梁模型...');
        await this.loadBridgeModel(bridgeModelUrl);
      } else {
        updateProgress(1, '正在生成桥梁模型...');
        this.createProceduralBridge();
      }

      updateProgress(2, '正在生成护栏...');
      this.createGuardrails(this.useInstancing);

      updateProgress(3, '正在生成支座...');
      this.createBearings(this.useLOD && this.camera);

      if (this.onComplete) {
        this.onComplete(this.models);
      }

      if (this.loadingErrors.length > 0) {
        console.warn('加载过程中存在错误:', this.loadingErrors);
      }

      return this.models;
    } catch (error) {
      console.error('模型加载失败:', error);
      if (this.onError) {
        this.onError('all', error);
      }
      throw error;
    }
  }

  getBearingById(id) {
    return this.models.bearingList.find(b => b.userData.id === id);
  }

  getGuardrailById(id) {
    return this.models.guardrailList.find(g => g.userData.id === id);
  }

  getModelByType(type) {
    return this.models[type] || null;
  }

  updateLOD(camera) {
    this.lodObjects.forEach(lod => {
      if (lod.update) {
        lod.update(camera);
      }
    });
  }

  dispose() {
    Object.values(this.models).forEach(model => {
      if (model && model.traverse) {
        model.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        this.scene.remove(model);
      }
    });

    this.dracoLoader.dispose();
    this.models = {
      bridge: null,
      guardrails: null,
      bearings: null,
      bearingList: [],
      guardrailList: []
    };
    this.lodObjects = [];
  }

  getLoadingErrors() {
    return this.loadingErrors;
  }

  setInstancing(enabled) {
    this.useInstancing = enabled;
  }

  setLOD(enabled) {
    this.useLOD = enabled;
  }

  static getBearingWorldPosition(bearing) {
    const worldPos = new THREE.Vector3();
    bearing.getWorldPosition(worldPos);
    return worldPos;
  }
}
