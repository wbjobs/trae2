import SceneLoader from './modules/SceneLoader.js';
import CollisionDetector from './modules/CollisionDetector.js';
import CameraController from './modules/CameraController.js';
import ApiService from './modules/ApiService.js';
import LayerManager from './modules/LayerManager.js';
import ComponentFactory from './modules/ComponentFactory.js';
import UIManager from './modules/UIManager.js';
import ConstructionAnimation from './modules/ConstructionAnimation.js';
import SelectionManager from './modules/SelectionManager.js';
import ChunkedLoader from './modules/ChunkedLoader.js';
import PerformanceOptimizer from './modules/PerformanceOptimizer.js';
import InteractionManager from './modules/InteractionManager.js';
import * as THREE from 'three';

class MEPVisualizationApp {
  constructor() {
    this.sceneLoader = null;
    this.collisionDetector = null;
    this.cameraController = null;
    this.apiService = null;
    this.layerManager = null;
    this.componentFactory = null;
    this.uiManager = null;
    this.constructionAnimation = null;
    this.selectionManager = null;
    this.chunkedLoader = null;
    this.performanceOptimizer = null;
    this.interactionManager = null;
    
    this.components = [];
    this.collisionMarkers = [];
    this.currentCollisions = [];
    
    this.fps = 60;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.lastFrameTime = performance.now();
    
    this.sectionAxis = 'x';
    this.sectionPosition = 50;
    this.sectionThickness = 10;
    this.sectionEnabled = false;
    
    this.isBoxSelectMode = false;
    this.useChunkedLoading = true;
  }

  async init() {
    this.apiService = new ApiService();
    this.componentFactory = new ComponentFactory();
    this.collisionDetector = new CollisionDetector();
    
    const container = document.getElementById('three-viewport');
    this.sceneLoader = new SceneLoader(container);
    
    this.uiManager = new UIManager(this);
    
    await this.sceneLoader.init();
    
    this.cameraController = new CameraController(
      this.sceneLoader.camera,
      this.sceneLoader.controls
    );
    
    this.layerManager = new LayerManager(this.sceneLoader);
    
    this.interactionManager = new InteractionManager(this.sceneLoader, container);
    
    this.selectionManager = new SelectionManager(this.sceneLoader, container);
    
    this.constructionAnimation = new ConstructionAnimation(this.sceneLoader);
    
    this.chunkedLoader = new ChunkedLoader(this.sceneLoader, this.componentFactory, {
      chunkSize: 25,
      viewDistance: 200
    });
    
    this.performanceOptimizer = new PerformanceOptimizer(this.sceneLoader, {
      targetFPS: 60,
      minFPS: 30
    });
    
    this.setupEventListeners();
    
    this.uiManager.init();
    
    await this.loadData();
    
    this.performanceOptimizer.start();
    this.startFPSCounter();
    
    setTimeout(() => {
      this.uiManager.hideLoading();
    }, 500);
  }

  setupEventListeners() {
    this.interactionManager.onObjectClick = (userData, event, object) => {
      this.uiManager.showComponentInfo(userData);
      
      if (event.ctrlKey || event.metaKey) {
        this.selectionManager.toggleSelection(object);
        this.updateSelectionUI();
      } else if (!this.isBoxSelectMode) {
        this.selectionManager.clearSelection();
      }
    };
    
    this.interactionManager.onObjectHover = (userData, event) => {
      if (event && userData) {
        this.uiManager.showTooltip(event, `${userData.name}\n${userData.layerName || userData.layer}`);
      } else {
        this.uiManager.hideTooltip();
      }
    };
    
    this.interactionManager.onObjectDoubleClick = (userData, event, object) => {
      this.cameraController.focusOnObject(object);
    };
    
    this.interactionManager.onSceneClick = (event) => {
      if (!this.isBoxSelectMode) {
        this.uiManager.showComponentInfo(null);
        this.selectionManager.clearSelection();
        this.updateSelectionUI();
      }
    };
    
    const domElement = this.sceneLoader.renderer.domElement;
    
    domElement.addEventListener('mousedown', (e) => {
      if (this.isBoxSelectMode && e.button === 0) {
        this.selectionManager.startBoxSelection(e);
      }
    });
    
    domElement.addEventListener('mousemove', (e) => {
      if (this.isBoxSelectMode) {
        this.selectionManager.updateBoxSelection(e);
      }
    });
    
    domElement.addEventListener('mouseup', (e) => {
      if (this.isBoxSelectMode && e.button === 0) {
        this.selectionManager.endBoxSelection(e);
        this.updateSelectionUI();
      }
    });
    
    this.selectionManager.onSelectionChange = (objects) => {
      this.updateSelectionUI();
    };
    
    this.constructionAnimation.onTimeUpdate = (time) => {
      this.updateAnimationUI(time);
    };
    
    this.constructionAnimation.onPhaseChange = (phase) => {
      this.updatePhaseUI(phase);
    };
  }

  async loadData() {
    this.uiManager.showLoading('正在加载图层配置...', 10);
    
    const layersData = await this.apiService.getLayers();
    this.layerManager.init(layersData);
    
    this.uiManager.initLayerPanel();
    
    this.uiManager.updateLoadingProgress(30, '正在加载构件数据...');
    
    const componentsData = await this.apiService.getComponents();
    
    if (this.useChunkedLoading) {
      await this.loadWithChunks(componentsData);
    } else {
      await this.loadDirect(componentsData);
    }
    
    this.uiManager.updateLoadingProgress(85, '正在初始化施工动画...');
    this.constructionAnimation.init(this.sceneLoader.components);
    
    this.uiManager.updateLoadingProgress(90, '正在初始化选择系统...');
    this.initPhaseUI();
    
    this.sceneLoader.fitView();
    
    this.uiManager.updateComponentCount(this.layerManager.getTotalComponentCount());
    
    this.uiManager.updateLoadingProgress(100, '加载完成！');
  }

  async loadDirect(componentsData) {
    const total = componentsData.length;
    const batchSize = 30;
    let loadedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = componentsData.slice(i, i + batchSize);
      
      for (const data of batch) {
        try {
          if (!data || !data.componentId) {
            failedCount++;
            continue;
          }
          
          const mesh = this.componentFactory.createComponent(data);
          
          if (mesh) {
            this.sceneLoader.addComponent(mesh, data);
            this.layerManager.addComponentToLayer(mesh, data.layer);
            loadedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.warn(`Failed to load component ${data.componentId}:`, error);
          failedCount++;
        }
      }
      
      const progress = 30 + Math.floor(((i + batch.length) / total) * 50);
      this.uiManager.updateLoadingProgress(
        progress, 
        `正在生成3D模型... ${loadedCount}/${total}${failedCount > 0 ? ` (失败: ${failedCount})` : ''}`
      );
      
      await this.delay(16);
    }
  }

  async loadWithChunks(componentsData) {
    this.uiManager.updateLoadingProgress(35, '正在创建分块索引...');
    
    this.chunkedLoader.createChunks(componentsData);
    
    const totalChunks = this.chunkedLoader.getTotalCount();
    let loadedChunks = 0;
    
    await this.chunkedLoader.loadAllChunks((progress, chunk) => {
      loadedChunks++;
      const uiProgress = 35 + Math.floor(progress * 50);
      this.uiManager.updateLoadingProgress(
        uiProgress,
        `正在加载分块... ${loadedChunks}/${totalChunks}`
      );
    });
    
    this.chunkedLoader.chunks.forEach(chunk => {
      chunk.meshes.forEach(mesh => {
        this.layerManager.addComponentToLayer(mesh, mesh.userData.layer);
      });
    });
  }

  async refreshData() {
    this.uiManager.showLoading('正在刷新数据...', 0);
    
    this.sceneLoader.clearComponents();
    this.clearCollisionMarkers();
    this.currentCollisions = [];
    this.selectionManager.clearSelection();
    this.constructionAnimation.reset();
    
    await this.loadData();
    
    setTimeout(() => {
      this.uiManager.hideLoading();
    }, 500);
  }

  async detectCollisions() {
    const btn = document.getElementById('btn-detect-collision');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 检测中...';
    
    this.clearCollisionMarkers();
    
    const tolerance = parseFloat(document.getElementById('collision-tolerance').value) / 1000;
    const precision = document.getElementById('collision-precision').value;
    
    this.collisionDetector.setTolerance(tolerance);
    this.collisionDetector.setPrecision(precision);
    
    this.collisionDetector.onProgress = (progress) => {
      btn.innerHTML = `检测中... ${progress}%`;
    };
    
    const visibleComponents = this.layerManager.getVisibleComponents();
    const collisions = await this.collisionDetector.detectCollisions(visibleComponents);
    
    this.currentCollisions = collisions;
    
    collisions.forEach(collision => {
      const marker = this.componentFactory.createCollisionMarker(
        collision.position,
        collision.type
      );
      this.sceneLoader.scene.add(marker);
      this.collisionMarkers.push(marker);
    });
    
    const stats = this.collisionDetector.getCollisionStats();
    this.uiManager.updateCollisionStats(stats);
    this.uiManager.updateCollisionList(collisions.slice(0, 20));
    this.uiManager.updateCollisionCount(stats.total);
    
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> 重新检测';
  }

  clearCollisionMarkers() {
    this.collisionMarkers.forEach(marker => {
      this.sceneLoader.scene.remove(marker);
    });
    this.collisionMarkers = [];
  }

  focusOnCollision(collision) {
    this.cameraController.flyTo(
      new THREE.Vector3(
        collision.position.x + 5,
        collision.position.y + 5,
        collision.position.z + 5
      ),
      collision.position,
      800
    );
    
    this.uiManager.setActiveTab('info');
    
    if (collision.objectA) {
      this.interactionManager.selectObject(collision.objectA);
      this.uiManager.showComponentInfo(collision.objectA.userData);
    }
  }

  setNavigationMode(mode) {
    this.cameraController.setMode(mode);
  }

  fitView() {
    this.sceneLoader.fitView();
  }

  setView(view) {
    this.sceneLoader.setView(view);
  }

  toggleWireframe() {
    return this.sceneLoader.toggleWireframe();
  }

  toggleXray() {
    return this.sceneLoader.toggleXray();
  }

  setLayerVisibility(layerId, visible) {
    this.layerManager.setLayerVisibility(layerId, visible);
  }

  setSectionAxis(axis) {
    this.sectionAxis = axis;
    this.updateSection();
  }

  setSectionPosition(value) {
    this.sectionPosition = value;
    this.sectionEnabled = true;
    this.updateSection();
  }

  setSectionThickness(value) {
    this.sectionThickness = value;
    this.sectionEnabled = true;
    this.updateSection();
  }

  resetSection() {
    this.sectionEnabled = false;
    this.sceneLoader.components.forEach(mesh => {
      mesh.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.clippingPlanes = [];
          child.material.clipIntersection = false;
        }
      });
    });
  }

  updateSection() {
    if (!this.sectionEnabled) return;

    const box = this.sceneLoader.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const position = this.sectionPosition / 100;
    const thickness = this.sectionThickness / 100;

    let plane1, plane2;

    switch (this.sectionAxis) {
      case 'x':
        plane1 = new THREE.Plane(new THREE.Vector3(-1, 0, 0), center.x - size.x * (position - thickness / 2));
        plane2 = new THREE.Plane(new THREE.Vector3(1, 0, 0), center.x + size.x * (1 - position - thickness / 2));
        break;
      case 'y':
        plane1 = new THREE.Plane(new THREE.Vector3(0, -1, 0), center.y - size.y * (position - thickness / 2));
        plane2 = new THREE.Plane(new THREE.Vector3(0, 1, 0), center.y + size.y * (1 - position - thickness / 2));
        break;
      case 'z':
        plane1 = new THREE.Plane(new THREE.Vector3(0, 0, -1), center.z - size.z * (position - thickness / 2));
        plane2 = new THREE.Plane(new THREE.Vector3(0, 0, 1), center.z + size.z * (1 - position - thickness / 2));
        break;
    }

    this.sceneLoader.components.forEach(mesh => {
      mesh.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.clippingPlanes = [plane1, plane2];
          child.material.clipIntersection = true;
        }
      });
    });

    this.sceneLoader.renderer.localClippingEnabled = true;
  }

  toggleBoxSelection() {
    this.isBoxSelectMode = !this.isBoxSelectMode;
    document.getElementById('btn-select-box').classList.toggle('active', this.isBoxSelectMode);
    
    if (this.isBoxSelectMode) {
      this.cameraController.setMode('pan');
      this.sceneLoader.controls.enableRotate = false;
    } else {
      this.cameraController.setMode('orbit');
      this.sceneLoader.controls.enableRotate = true;
    }
  }

  selectAll() {
    this.sceneLoader.components.forEach(obj => {
      if (obj.visible) {
        this.selectionManager.addToSelection(obj);
      }
    });
    this.updateSelectionUI();
  }

  clearSelection() {
    this.selectionManager.clearSelection();
    this.updateSelectionUI();
  }

  isolateSelection() {
    this.selectionManager.isolateSelection();
  }

  hideSelection() {
    this.selectionManager.hideSelection();
  }

  exportSelection() {
    const data = this.selectionManager.exportSelection();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selection.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  addAnnotation() {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.length === 0) {
      alert('请先选择一个构件');
      return;
    }
    
    const text = document.getElementById('annotation-text').value.trim();
    if (!text) {
      alert('请输入标注内容');
      return;
    }
    
    const color = document.getElementById('annotation-color').value;
    
    const annotation = this.selectionManager.addAnnotation(selected[0], text, { color });
    this.updateAnnotationList();
    
    document.getElementById('annotation-text').value = '';
  }

  updateSelectionUI() {
    const count = this.selectionManager.getSelectedCount();
    document.getElementById('selection-count').textContent = count;
  }

  updateAnnotationList() {
    const annotations = this.selectionManager.getAnnotations();
    const container = document.getElementById('annotation-list');
    
    if (annotations.length === 0) {
      container.innerHTML = '<div class="annotation-empty">暂无标注</div>';
      return;
    }
    
    container.innerHTML = annotations.map(anno => `
      <div class="annotation-item" style="border-left-color: ${anno.color}">
        <div class="annotation-item-text">${anno.text}</div>
        <div class="annotation-item-meta">
          <span>${new Date(anno.createdAt).toLocaleString()}</span>
          <span class="annotation-item-delete" data-id="${anno.id}">删除</span>
        </div>
      </div>
    `).join('');
    
    container.querySelectorAll('.annotation-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectionManager.removeAnnotation(btn.dataset.id);
        this.updateAnnotationList();
      });
    });
  }

  initPhaseUI() {
    const phases = this.constructionAnimation.getPhases();
    const container = document.getElementById('phase-list');
    
    container.innerHTML = phases.map(phase => `
      <div class="phase-item" data-phase="${phase.id}">
        <div class="phase-color" style="background: ${phase.color}"></div>
        <span class="phase-name">${phase.name}</span>
        <span class="phase-progress">0%</span>
      </div>
    `).join('');
    
    container.querySelectorAll('.phase-item').forEach(item => {
      item.addEventListener('click', () => {
        this.constructionAnimation.jumpToPhase(item.dataset.phase);
      });
    });
  }

  updateAnimationUI(time) {
    const progress = this.constructionAnimation.getProgress();
    const timeline = document.getElementById('anim-timeline');
    timeline.value = time;
    timeline.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${progress * 100}%, var(--bg-tertiary) ${progress * 100}%, var(--bg-tertiary) 100%)`;
    
    document.getElementById('anim-progress').textContent = `${Math.round(progress * 100)}%`;
    
    const phases = this.constructionAnimation.getPhases();
    document.querySelectorAll('.phase-item').forEach((item, index) => {
      const phaseProgress = this.constructionAnimation.getPhaseProgress(phases[index].id);
      item.querySelector('.phase-progress').textContent = `${Math.round(phaseProgress * 100)}%`;
      item.classList.toggle('active', phaseProgress > 0);
    });
    
    const completedCount = Math.floor(this.sceneLoader.components.length * progress);
    document.getElementById('completed-count').textContent = completedCount;
    document.getElementById('in-progress-count').textContent = 
      Math.floor(this.sceneLoader.components.length * 0.1);
  }

  updatePhaseUI(phase) {
    document.getElementById('current-phase').textContent = phase.name;
  }

  playAnimation() {
    const btn = document.getElementById('btn-anim-play');
    if (this.constructionAnimation.isPlaying) {
      this.constructionAnimation.pause();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    } else {
      this.constructionAnimation.play();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }
  }

  stopAnimation() {
    this.constructionAnimation.stop();
    document.getElementById('btn-anim-play').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }

  prevPhase() {
    const currentTime = this.constructionAnimation.currentTime;
    const newTime = Math.max(0, currentTime - 10);
    this.constructionAnimation.setTime(newTime);
  }

  nextPhase() {
    const currentTime = this.constructionAnimation.currentTime;
    const newTime = Math.min(100, currentTime + 10);
    this.constructionAnimation.setTime(newTime);
  }

  setAnimationSpeed(speed) {
    this.constructionAnimation.setSpeed(parseFloat(speed));
    document.getElementById('anim-speed-value').textContent = `${speed}x`;
  }

  setAnimationTime(time) {
    this.constructionAnimation.setTime(parseFloat(time));
  }

  async exportReport() {
    const btn = document.getElementById('btn-export');
    const originalText = btn.textContent;
    btn.textContent = '导出中...';
    btn.disabled = true;

    try {
      const result = await this.apiService.exportReport({
        collisions: this.currentCollisions,
        stats: this.collisionDetector.getCollisionStats(),
        selections: this.selectionManager.exportSelection(),
        annotations: this.selectionManager.getAnnotations()
      });
      
      alert(`报告导出成功！\n文件名: ${result.filename}`);
    } catch (error) {
      alert('导出失败，请重试');
    }

    btn.textContent = originalText;
    btn.disabled = false;
  }

  startFPSCounter() {
    const updateFPS = () => {
      const now = performance.now();
      const frameTime = now - this.lastFrameTime;
      this.lastFrameTime = now;
      
      this.frameCount++;
      
      if (now - this.lastTime >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastTime = now;
        this.uiManager.updateFPS(this.fps);
        
        this.performanceOptimizer.recordFrameTime(frameTime);
      }
      
      const position = this.sceneLoader.getCameraPosition();
      this.uiManager.updateViewPosition(position);
      
      if (this.useChunkedLoading && this.chunkedLoader) {
        this.chunkedLoader.updateVisibility(this.sceneLoader.camera);
      }
      
      requestAnimationFrame(updateFPS);
    };
    
    updateFPS();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispose() {
    this.sceneLoader.dispose();
    this.componentFactory.dispose();
    this.selectionManager.dispose();
    this.constructionAnimation.dispose();
    this.chunkedLoader.dispose();
    this.performanceOptimizer.dispose();
    this.interactionManager.dispose();
  }
}

const app = new MEPVisualizationApp();
window.MEPApp = app;

window.addEventListener('DOMContentLoaded', () => {
  app.init();
});

export default MEPVisualizationApp;
