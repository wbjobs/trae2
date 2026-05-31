<template>
  <div ref="containerRef" class="fossil-viewer-pro">
    <div ref="canvasRef" class="viewer-canvas"></div>

    <div v-if="loading" class="viewer-loading">
      <el-loading-spinner class="loading-spinner" />
      <div class="loading-text">
        <p>模型加载中...</p>
        <p class="loading-progress">{{ loadProgress }}%</p>
      </div>
    </div>

    <div v-if="error" class="viewer-error">
      <el-empty description="模型加载失败">
        <p class="error-text">{{ error }}</p>
        <el-button type="primary" @click="reloadModel">重新加载</el-button>
      </el-empty>
    </div>

    <div class="viewer-toolbar" v-if="!loading && !error">
      <div class="toolbar-left">
        <el-button-group>
          <el-tooltip content="自动旋转">
            <el-button :type="isAutoRotate ? 'primary' : 'default'" :icon="Refresh" size="small" @click="toggleAutoRotate" />
          </el-tooltip>
          <el-tooltip content="线框模式">
            <el-button :type="isWireframe ? 'primary' : 'default'" :icon="Grid" size="small" @click="toggleWireframe" />
          </el-tooltip>
          <el-tooltip content="爆炸视图">
            <el-button :type="isExploded ? 'primary' : 'default'" :icon="ZoomOut" size="small" @click="toggleExplode" />
          </el-tooltip>
          <el-tooltip content="剖切模式">
            <el-button :type="isClipping ? 'primary' : 'default'" :icon="Scissor" size="small" @click="toggleClipping" />
          </el-tooltip>
        </el-button-group>
      </div>
      <div class="toolbar-right">
        <el-tooltip content="重置视图">
          <el-button :icon="RefreshLeft" size="small" @click="resetCamera" />
        </el-tooltip>
        <el-tooltip content="全屏">
          <el-button :icon="FullScreen" size="small" @click="toggleFullscreen" />
        </el-tooltip>
      </div>
    </div>

    <div class="viewer-stats" v-if="showStats">
      <div class="stat-item">
        <span class="label">FPS:</span>
        <span class="value">{{ fps }}</span>
      </div>
      <div class="stat-item">
        <span class="label">顶点:</span>
        <span class="value">{{ vertexCount }}</span>
      </div>
      <div class="stat-item">
        <span class="label">三角面:</span>
        <span class="value">{{ triangleCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier';
import { LOD } from 'three';
import { ElMessage } from 'element-plus';
import { Refresh, Grid, ZoomOut, Scissor, RefreshLeft, FullScreen } from '@element-plus/icons-vue';

const props = defineProps<{
  modelUrl?: string;
  autoRotate?: boolean;
  wireframe?: boolean;
  backgroundColor?: number;
  showStats?: boolean;
  enableLOD?: boolean;
}>();

const emit = defineEmits<{
  (e: 'load', model: any): void;
  (e: 'error', error: Error): void;
}>();

const containerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLDivElement>();
const loading = ref(false);
const error = ref('');
const loadProgress = ref(0);
const fps = ref(60);
const vertexCount = ref(0);
const triangleCount = ref(0);

const isAutoRotate = ref(props.autoRotate ?? false);
const isWireframe = ref(props.wireframe ?? false);
const isExploded = ref(false);
const isClipping = ref(false);
const showStats = ref(props.showStats ?? false);

const scene = shallowRef<THREE.Scene>();
const camera = shallowRef<THREE.PerspectiveCamera>();
const renderer = shallowRef<THREE.WebGLRenderer>();
const controls = shallowRef<OrbitControls>();
const currentModel = shallowRef<THREE.Object3D>();
const lodModel = shallowRef<LOD>();

const animationId = ref<number>();
const lastTime = ref(performance.now());
const frameCount = ref(0);
const explodeOriginal = ref<Map<string, THREE.Vector3>>(new Map());
const clippingPlane = ref(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));

const originalCameraPos = ref(new THREE.Vector3(5, 3, 5));
const originalTarget = ref(new THREE.Vector3(0, 0, 0));

const toggleAutoRotate = () => {
  isAutoRotate.value = !isAutoRotate.value;
  if (controls.value) {
    controls.value.autoRotate = isAutoRotate.value;
  }
};

const toggleWireframe = () => {
  isWireframe.value = !isWireframe.value;
  applyWireframe(currentModel.value, isWireframe.value);
};

const toggleExplode = () => {
  isExploded.value = !isExploded.value;
  applyExplodeView(isExploded.value);
};

const toggleClipping = () => {
  isClipping.value = !isClipping.value;
  if (renderer.value) {
    renderer.value.localClippingEnabled = isClipping.value;
  }
};

const resetCamera = () => {
  if (camera.value && controls.value) {
    camera.value.position.copy(originalCameraPos.value);
    controls.value.target.copy(originalTarget.value);
    controls.value.update();
  }
};

const toggleFullscreen = () => {
  if (!containerRef.value) return;
  if (!document.fullscreenElement) {
    containerRef.value.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

const reloadModel = () => {
  if (props.modelUrl) {
    loadModel(props.modelUrl);
  }
};

const applyWireframe = (obj: THREE.Object3D | undefined, wireframe: boolean) => {
  if (!obj) return;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.wireframe = wireframe;
        material.needsUpdate = true;
      });
    }
  });
};

const applyExplodeView = (explode: boolean) => {
  if (!currentModel.value) return;

  if (explode) {
    explodeOriginal.value.clear();
    const center = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(currentModel.value);
    box.getCenter(center);

    currentModel.value.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        explodeOriginal.value.set(child.uuid, child.position.clone());
        const direction = child.position.clone().sub(center).normalize();
        child.position.add(direction.multiplyScalar(0.5));
      }
    });
  } else {
    currentModel.value.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const original = explodeOriginal.value.get(child.uuid);
        if (original) {
          child.position.copy(original);
        }
      }
    });
  }
};

const createLOD = (mesh: THREE.Mesh): LOD => {
  const lod = new LOD();
  const geometry = mesh.geometry.clone();
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

  lod.addLevel(mesh, 0);

  const modifier = new SimplifyModifier();
  const simplified1 = modifier.modify(geometry as any, Math.floor(geometry.attributes.position.count * 0.5));
  const mesh1 = new THREE.Mesh(simplified1, material);
  lod.addLevel(mesh1, 10);

  const simplified2 = modifier.modify(geometry as any, Math.floor(geometry.attributes.position.count * 0.25));
  const mesh2 = new THREE.Mesh(simplified2, material);
  lod.addLevel(mesh2, 20);

  return lod;
};

const calculateStats = (obj: THREE.Object3D) => {
  let vertices = 0;
  let triangles = 0;

  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry;
      if (geometry.attributes.position) {
        vertices += geometry.attributes.position.count;
      }
      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }
    }
  });

  vertexCount.value = Math.floor(vertices);
  triangleCount.value = Math.floor(triangles);
};

const initScene = () => {
  if (!canvasRef.value) return;

  const width = canvasRef.value.clientWidth || 800;
  const height = canvasRef.value.clientHeight || 600;

  if (width === 0 || height === 0) {
    setTimeout(initScene, 100);
    return;
  }

  const sceneObj = new THREE.Scene();
  sceneObj.background = new THREE.Color(props.backgroundColor ?? 0xf5f7fa);
  scene.value = sceneObj;

  const cameraObj = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
  cameraObj.position.copy(originalCameraPos.value);
  camera.value = cameraObj;

  const rendererObj = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false
  });
  rendererObj.setSize(width, height);
  rendererObj.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererObj.shadowMap.enabled = true;
  rendererObj.shadowMap.type = THREE.PCFSoftShadowMap;
  rendererObj.outputColorSpace = THREE.SRGBColorSpace;
  rendererObj.toneMapping = THREE.ACESFilmicToneMapping;
  rendererObj.toneMappingExposure = 1.0;
  canvasRef.value.appendChild(rendererObj.domElement);
  renderer.value = rendererObj;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  sceneObj.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  sceneObj.add(directionalLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  sceneObj.add(hemisphereLight);

  const gridHelper = new THREE.GridHelper(10, 20, 0xdddddd, 0xeeeeee);
  sceneObj.add(gridHelper);

  const controlsObj = new OrbitControls(cameraObj, rendererObj.domElement);
  controlsObj.enableDamping = true;
  controlsObj.dampingFactor = 0.05;
  controlsObj.minDistance = 0.5;
  controlsObj.maxDistance = 100;
  controlsObj.autoRotate = isAutoRotate.value;
  controlsObj.autoRotateSpeed = 2;
  controls.value = controlsObj;

  const animate = () => {
    animationId.value = requestAnimationFrame(animate);

    frameCount.value++;
    const currentTime = performance.now();
    if (currentTime - lastTime.value >= 1000) {
      fps.value = frameCount.value;
      frameCount.value = 0;
      lastTime.value = currentTime;
    }

    if (lodModel.value && camera.value) {
      lodModel.value.update(camera.value);
    }

    controlsObj.update();
    rendererObj.render(sceneObj, cameraObj);
  };
  animate();
};

const loadModel = async (url: string) => {
  if (!scene.value) {
    setTimeout(() => loadModel(url), 100);
    return;
  }

  loading.value = true;
  error.value = '';
  loadProgress.value = 0;

  if (currentModel.value) {
    scene.value.remove(currentModel.value);
    disposeModel(currentModel.value);
    currentModel.value = undefined;
  }

  try {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    const gltf = await loader.loadAsync(url, (progress) => {
      if (progress.total > 0) {
        loadProgress.value = Math.round((progress.loaded / progress.total) * 100);
      }
    });

    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxDim;

    model.scale.set(scale, scale, scale);
    model.position.sub(center.multiplyScalar(scale));
    model.position.y += size.y * scale / 2;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.wireframe = isWireframe.value;
          material.needsUpdate = true;
          if (material.map) {
            material.map.needsUpdate = true;
          }
          if (isClipping.value) {
            material.clippingPlanes = [clippingPlane.value];
          }
        });
      }
    });

    if (props.enableLOD) {
      const lod = new LOD();
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          lod.add(createLOD(child));
        }
      });
      lodModel.value = lod;
      scene.value.add(lod);
    } else {
      scene.value.add(model);
    }

    currentModel.value = model;
    calculateStats(model);

    const fitScale = Math.max(size.x, size.y, size.z) * scale * 2;
    if (camera.value) {
      originalCameraPos.value.set(fitScale, fitScale * 0.6, fitScale);
      camera.value.position.copy(originalCameraPos.value);
      originalTarget.value.set(0, size.y * scale / 2, 0);
      camera.value.lookAt(originalTarget.value);
    }
    if (controls.value) {
      controls.value.target.copy(originalTarget.value);
      controls.value.update();
    }

    loading.value = false;
    emit('load', model);
  } catch (err) {
    console.error('加载模型失败:', err);
    error.value = (err as Error).message || '模型加载失败，请检查文件格式';
    loading.value = false;
    emit('error', err as Error);
  }
};

const disposeModel = (obj: THREE.Object3D) => {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.dispose();
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        if (material.metalnessMap) material.metalnessMap.dispose();
        if (material.aoMap) material.aoMap.dispose();
      });
    }
  });
};

const handleResize = () => {
  if (!canvasRef.value || !camera.value || !renderer.value) return;
  const width = canvasRef.value.clientWidth || 800;
  const height = canvasRef.value.clientHeight || 600;
  if (width === 0 || height === 0) return;
  camera.value.aspect = width / height;
  camera.value.updateProjectionMatrix();
  renderer.value.setSize(width, height);
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

watch(() => props.modelUrl, (newUrl) => {
  if (newUrl) {
    loadModel(newUrl);
  }
});

onMounted(() => {
  initScene();
  if (props.modelUrl) {
    loadModel(props.modelUrl);
  }
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value);
  }
  if (currentModel.value) {
    disposeModel(currentModel.value);
  }
  if (renderer.value) {
    renderer.value.dispose();
    if (renderer.value.domElement.parentNode) {
      renderer.value.domElement.parentNode.removeChild(renderer.value.domElement);
    }
  }
  window.removeEventListener('resize', handleResize);
});

defineExpose({
  resetCamera,
  reloadModel,
  getScene: () => scene.value,
  getCamera: () => camera.value,
  getRenderer: () => renderer.value,
  getModel: () => currentModel.value
});
</script>

<style scoped lang="scss">
.fossil-viewer-pro {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #f5f7fa;
  overflow: hidden;
  border-radius: 8px;

  .viewer-canvas {
    width: 100%;
    height: 100%;
    min-height: 400px;
  }

  .viewer-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(245, 247, 250, 0.9);
    z-index: 10;

    .loading-spinner {
      margin-bottom: 20px;
    }

    .loading-text {
      text-align: center;
      color: #606266;

      p {
        margin: 5px 0;
      }

      .loading-progress {
        font-size: 24px;
        font-weight: 600;
        color: #409eff;
      }
    }
  }

  .viewer-error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;

    .error-text {
      color: #f56c6c;
      margin-bottom: 16px;
    }
  }

  .viewer-toolbar {
    position: absolute;
    bottom: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 5;

    .toolbar-left,
    .toolbar-right {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    }
  }

  .viewer-stats {
    position: absolute;
    top: 16px;
    left: 16px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 12px 16px;
    z-index: 5;
    color: #fff;
    font-size: 12px;
    font-family: 'Courier New', monospace;

    .stat-item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin: 4px 0;

      .label {
        color: #909399;
      }

      .value {
        color: #67c23a;
        font-weight: 600;
      }
    }
  }
}
</style>
