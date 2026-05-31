<template>
  <div class="fossil-viewer" ref="containerRef">
    <div class="viewer-toolbar">
      <el-button-group>
        <el-button size="small" @click="resetCamera" title="重置视角">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button size="small" @click="toggleAutoRotate" :type="autoRotate ? 'primary' : ''" title="自动旋转">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <el-button size="small" @click="toggleWireframe" :type="wireframe ? 'primary' : ''" title="线框模式">
          <el-icon><Grid /></el-icon>
        </el-button>
      </el-button-group>
      <el-button-group>
        <el-button size="small" @click="zoomIn" title="放大">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button size="small" @click="zoomOut" title="缩小">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
      </el-button-group>
      <div class="viewer-info">
        <span v-if="loading" class="loading-text">
          <el-icon class="is-loading"><Loading /></el-icon>
          加载中...
        </span>
        <span v-else-if="modelLoaded">模型已加载</span>
      </div>
    </div>
    <div class="viewer-canvas" ref="canvasRef"></div>
    <div v-if="!modelUrl" class="viewer-empty">
      <el-icon size="64" color="#c0c4cc"><Picture /></el-icon>
      <p>暂无三维模型</p>
    </div>
    <div v-if="error" class="viewer-error">
      <el-icon size="48" color="#f56c6c"><Warning /></el-icon>
      <p>模型加载失败</p>
      <p class="error-detail">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const props = defineProps<{
  modelUrl?: string;
  modelType?: string;
  height?: string;
  autoRotate?: boolean;
}>();

const containerRef = ref<HTMLElement>();
const canvasRef = ref<HTMLElement>();
const loading = ref(false);
const modelLoaded = ref(false);
const error = ref('');

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let animationId: number | null = null;
let currentModel: THREE.Object3D | null = null;
let isAutoRotate = ref(false);
let isWireframe = ref(false);

const initScene = () => {
  if (!canvasRef.value) return;

  const width = canvasRef.value.clientWidth || 800;
  const height = canvasRef.value.clientHeight || 600;

  if (width === 0 || height === 0) {
    setTimeout(initScene, 100);
    return;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(5, 3, 5);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  canvasRef.value.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  scene.add(directionalLight);

  const pointLight1 = new THREE.PointLight(0xffffff, 0.6);
  pointLight1.position.set(-5, 5, -5);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xffffff, 0.4);
  pointLight2.position.set(5, 2, -5);
  scene.add(pointLight2);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(hemisphereLight);

  const gridHelper = new THREE.GridHelper(10, 20, 0xdddddd, 0xeeeeee);
  scene.add(gridHelper);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 100;
  controls.autoRotate = isAutoRotate.value;
  controls.autoRotateSpeed = 2;

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };
  animate();
};

const loadModel = async (url: string) => {
  if (!scene) {
    setTimeout(() => loadModel(url), 100);
    return;
  }

  loading.value = true;
  error.value = '';
  modelLoaded.value = false;

  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    currentModel = null;
  }

  try {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    loader.setCrossOrigin('anonymous');
    loader.setRequestHeader({
      'Cache-Control': 'max-age=3600'
    });

    const gltf = await loader.loadAsync(url, (progress) => {
      if (progress.total > 0) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        console.log(`模型加载进度: ${percent}%`);
      }
    });

    currentModel = gltf.scene;

    const box = new THREE.Box3().setFromObject(currentModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxDim;

    currentModel.scale.set(scale, scale, scale);
    currentModel.position.sub(center.multiplyScalar(scale));
    currentModel.position.y += size.y * scale / 2;

    currentModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            material.wireframe = isWireframe.value;
            material.needsUpdate = true;
            if (material.map) {
              material.map.needsUpdate = true;
            }
          });
        }
      }
    });

    scene.add(currentModel);
    modelLoaded.value = true;

    const fitScale = Math.max(size.x, size.y, size.z) * scale * 2;
    if (camera) {
      camera.position.set(fitScale, fitScale * 0.6, fitScale);
      camera.lookAt(0, 0, 0);
    }
    if (controls) {
      controls.target.set(0, size.y * scale / 2, 0);
      controls.update();
    }
  } catch (err) {
    console.error('加载模型失败:', err);
    error.value = (err as Error).message || '模型加载失败，请检查文件格式';
  } finally {
    loading.value = false;
  }
};

const resetCamera = () => {
  if (camera && controls) {
    camera.position.set(5, 3, 5);
    controls.target.set(0, 0, 0);
    controls.update();
  }
};

const toggleAutoRotate = () => {
  isAutoRotate.value = !isAutoRotate.value;
  if (controls) {
    controls.autoRotate = isAutoRotate.value;
  }
};

const toggleWireframe = () => {
  isWireframe.value = !isWireframe.value;
  if (currentModel) {
    currentModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.wireframe = isWireframe.value;
          });
        } else {
          child.material.wireframe = isWireframe.value;
        }
      }
    });
  }
};

const zoomIn = () => {
  if (camera && controls) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    camera.position.add(direction.multiplyScalar(0.5));
    controls.update();
  }
};

const zoomOut = () => {
  if (camera && controls) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    camera.position.add(direction.multiplyScalar(-0.5));
    controls.update();
  }
};

const handleResize = () => {
  if (!canvasRef.value || !camera || !renderer) return;
  const width = canvasRef.value.clientWidth || 800;
  const height = canvasRef.value.clientHeight || 600;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

watch(() => props.modelUrl, (newUrl) => {
  if (newUrl) {
    nextTick(() => loadModel(newUrl));
  }
}, { immediate: true });

watch(() => props.autoRotate, (val) => {
  isAutoRotate.value = val || false;
  if (controls) {
    controls.autoRotate = isAutoRotate.value;
  }
});

onMounted(() => {
  nextTick(() => {
    initScene();
    if (props.modelUrl) {
      loadModel(props.modelUrl);
    }
    window.addEventListener('resize', handleResize);
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  currentModel = null;
});
</script>

<style scoped lang="scss">
.fossil-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.viewer-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.viewer-info {
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}

.loading-text {
  display: flex;
  align-items: center;
  gap: 4px;
}

.viewer-canvas {
  width: 100%;
  height: 100%;
}

.viewer-empty,
.viewer-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #909399;

  p {
    margin: 8px 0 0;
  }

  .error-detail {
    font-size: 12px;
    color: #f56c6c;
  }
}
</style>
