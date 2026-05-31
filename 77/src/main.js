import * as THREE from 'three';
import { ModelLoader } from './modelLoader.js';
import { StressCalculator } from './stressCalculator.js';
import { ViewController } from './viewController.js';
import { InspectionAPI } from './inspectionAPI.js';
import { DiseaseLayerManager } from './diseaseLayerManager.js';
import { MaintenanceAnimation } from './maintenanceAnimation.js';
import { DiseaseBatchManager } from './diseaseBatchManager.js';
import { LazyModelLoader } from './lazyModelLoader.js';
import { PerformanceOptimizer } from './performanceOptimizer.js';

class BridgeInspectionApp {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.models = null;

    this.modelLoader = null;
    this.stressCalculator = null;
    this.viewController = null;
    this.inspectionAPI = null;
    this.diseaseLayerManager = null;
    this.maintenanceAnimation = null;
    this.diseaseBatchManager = null;
    this.lazyModelLoader = null;
    this.performanceOptimizer = null;

    this.bridgeInfo = null;
    this.isLoading = true;
    this.showStress = false;
    this.useLazyLoading = true;
    this.usePerformanceOptimizer = true;

    this.init();
  }

  async init() {
    this.showLoading();
    await this.initThreeJS();
    this.initLighting();
    this.initGround();

    this.modelLoader = new ModelLoader(this.scene, this.camera);
    this.stressCalculator = new StressCalculator(this.scene);
    this.viewController = new ViewController(this.camera, this.renderer, this.scene);
    this.inspectionAPI = new InspectionAPI('/api');
    this.diseaseLayerManager = new DiseaseLayerManager(this.scene, this.camera, this.renderer);
    this.maintenanceAnimation = new MaintenanceAnimation(this.scene, this.camera, this.viewController.animationManager);
    this.diseaseBatchManager = new DiseaseBatchManager(this.scene, this.diseaseLayerManager);
    this.lazyModelLoader = new LazyModelLoader(this.scene, this.camera, this.modelLoader);
    this.performanceOptimizer = new PerformanceOptimizer(this.scene, this.camera, this.renderer);

    this.setupEventListeners();
    this.setupViewControllerCallbacks();
    this.setupDiseaseLayerCallbacks();
    this.setupModelLoaderCallbacks();
    this.setupMaintenanceCallbacks();
    this.setupDiseaseBatchCallbacks();
    this.setupLazyLoaderCallbacks();
    this.setupPerformanceCallbacks();

    await this.loadModels();
    await this.loadBridgeData();
    await this.loadDiseaseData();

    this.createUI();
    this.setupToolbar();
    this.setupLegendPanel();
    this.setupInfoPanel();
    this.setupDiseasePanel();
    this.setupMaintenancePanel();
    this.setupBatchFilterPanel();
    this.setupPerformancePanel();

    this.stressCalculator.createLegend();

    this.hideLoading();
    this.isLoading = false;

    this.animate();
  }

  async initThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(50, 30, 50);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(this.renderer.domElement);
  }

  initLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c5c, 0.3);
    this.scene.add(hemisphereLight);
  }

  initGround() {
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x7cb342,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(200, 100, 0x444444, 0x222222);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    const waterGeometry = new THREE.PlaneGeometry(200, 80);
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1565c0,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.3
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.1, 0);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  async loadModels() {
    if (this.useLazyLoading) {
      const bridgeConfig = {
        bridgeLength: 100,
        bridgeWidth: 20,
        pierCount: 4,
        bearingCount: 8,
        guardrailLength: 100
      };
      this.lazyModelLoader.generateBridgeChunks(bridgeConfig);
      this.lazyModelLoader.preloadNearby(this.camera.position, 50);
      this.models = await this.lazyModelLoader.getAllLoadedChunks();
    } else {
      this.models = await this.modelLoader.loadAllModels();
    }

    if (this.usePerformanceOptimizer && this.models) {
      this.registerModelsForPerformance();
    }

    this.addAutoNavigationWaypoints();
  }

  registerModelsForPerformance() {
    const registerObject = (obj) => {
      if (obj.isMesh) {
        const config = {
          cullingEnabled: true,
          minDistance: 0,
          maxDistance: 500
        };
        if (obj.userData.type === 'guardrail' || obj.userData.type === 'bearing') {
          config.instancingGroup = obj.userData.type;
        }
        this.performanceOptimizer.registerObject(obj, config);
      }
      if (obj.children) {
        obj.children.forEach(registerObject);
      }
    };

    if (this.models.mainBridge) {
      registerObject(this.models.mainBridge);
    }
    if (this.models.bearings) {
      this.models.bearings.forEach(b => registerObject(b));
    }
    if (this.models.guardrails) {
      this.models.guardrails.forEach(g => registerObject(g));
    }
    if (this.models.piers) {
      this.models.piers.forEach(p => registerObject(p));
    }
  }

  addAutoNavigationWaypoints() {
    const waypoints = [
      new THREE.Vector3(40, 15, 40),
      new THREE.Vector3(0, 20, 45),
      new THREE.Vector3(-40, 15, 40),
      new THREE.Vector3(-45, 10, 0),
      new THREE.Vector3(-40, 15, -40),
      new THREE.Vector3(0, 20, -45),
      new THREE.Vector3(40, 15, -40),
      new THREE.Vector3(45, 10, 0)
    ];
    this.viewController.setWaypoints(waypoints);
  }

  async loadBridgeData() {
    const response = await this.inspectionAPI.getBridge('bridge_001');
    if (response.success) {
      this.bridgeInfo = response.data;
      this.updateBridgeInfoPanel();
    }
  }

  async loadDiseaseData() {
    await this.diseaseLayerManager.loadDiseases(this.inspectionAPI, 'bridge_001');
    this.diseaseBatchManager.setDiseases(this.diseaseLayerManager.diseaseData);
    this.updateDiseasePanel();
    this.updateStatistics();
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.renderer.domElement.addEventListener('click', (event) => {
      if (event.button === 0) {
        this.diseaseLayerManager.handleClick(event);
      }
    });

    this.renderer.domElement.addEventListener('mousemove', (event) => {
      this.diseaseLayerManager.handleMouseMove(event);
    });
  }

  setupViewControllerCallbacks() {
    this.viewController.onObjectClick = (object, intersect) => {
      if (object.userData.type === 'bearing') {
        this.showBearingInfo(object);
      }
    };

    this.viewController.onObjectHover = (object, intersect) => {
      if (object.userData.type === 'bearing') {
        this.renderer.domElement.title = `支座: ${object.userData.id}`;
      }
    };

    this.viewController.onObjectSelected = (object) => {
      if (object.userData.type === 'bearing') {
        this.showBearingInfo(object);
      }
    };

    this.viewController.onModeChange = (mode) => {
      const modeLabels = {
        orbit: '轨道模式',
        firstPerson: '第一人称模式',
        topDown: '俯视模式'
      };
      this.showNotification(`已切换到${modeLabels[mode]}`);
    };
  }

  setupDiseaseLayerCallbacks() {
    this.diseaseLayerManager.onMarkerClick = (disease, marker) => {
      this.showDiseaseDetail(disease);
    };

    this.diseaseLayerManager.onMarkerHover = (disease, marker) => {
      this.updateHoverInfo(disease);
    };
  }

  setupModelLoaderCallbacks() {
    this.modelLoader.onProgress = (loaded, total, item) => {
      const loadingText = document.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = `正在加载 ${item}... ${Math.round((loaded / total) * 100)}%`;
      }
    };

    this.modelLoader.onError = (error, item) => {
      console.error(`加载 ${item} 失败:`, error);
      this.showNotification(`${item} 加载失败，正在重试...`);
    };

    this.modelLoader.onLoadComplete = (results) => {
      console.log('所有模型加载完成:', results);
      this.showNotification('三维模型加载完成');
    };

    this.modelLoader.onOptimize = (stats) => {
      console.log('模型优化完成:', stats);
    };
  }

  setupMaintenanceCallbacks() {
    this.maintenanceAnimation.onStepStart = (step, totalSteps) => {
      this.showNotification(`检修步骤 ${step}/${totalSteps} 开始`);
    };

    this.maintenanceAnimation.onComplete = (animationId, duration) => {
      this.showNotification(`检修动画完成，耗时 ${(duration / 1000).toFixed(1)} 秒`);
    };

    this.maintenanceAnimation.onCancel = (animationId) => {
      this.showNotification('检修动画已取消');
    };

    this.maintenanceAnimation.onError = (error, animationId) => {
      console.error(`检修动画 ${animationId} 错误:`, error);
      this.showNotification(`检修动画错误: ${error.message}`);
    };
  }

  setupDiseaseBatchCallbacks() {
    this.diseaseBatchManager.onFilterChange = (filteredCount, totalCount) => {
      this.showNotification(`筛选完成: ${filteredCount}/${totalCount} 条记录`);
    };

    this.diseaseBatchManager.onSelectionChange = (selectedCount) => {
      this.updateBatchSelectionUI(selectedCount);
    };

    this.diseaseBatchManager.onBatchUpdate = (updatedCount) => {
      this.showNotification(`已更新 ${updatedCount} 条病害记录`);
      this.updateDiseasePanel();
    };

    this.diseaseBatchManager.onBatchDelete = (deletedCount) => {
      this.showNotification(`已删除 ${deletedCount} 条病害记录`);
      this.updateDiseasePanel();
    };

    this.diseaseBatchManager.onExport = (format, count) => {
      this.showNotification(`已导出 ${count} 条记录 (${format.toUpperCase()})`);
    };

    this.diseaseBatchManager.onReportGenerate = (reportData) => {
      this.showNotification(`报告已生成: ${reportData.totalIssues} 项问题, 预估费用 ¥${reportData.estimatedCost.toLocaleString()}`);
    };
  }

  setupLazyLoaderCallbacks() {
    this.lazyModelLoader.onChunkLoad = (chunkId, loadTime) => {
      console.log(`模型块 ${chunkId} 加载完成，耗时 ${loadTime.toFixed(2)}ms`);
    };

    this.lazyModelLoader.onChunkUnload = (chunkId) => {
      console.log(`模型块 ${chunkId} 已卸载`);
    };

    this.lazyModelLoader.onProgress = (loaded, total) => {
      const percent = Math.round((loaded / total) * 100);
      this.showNotification(`模型加载进度: ${percent}% (${loaded}/${total})`, 500);
    };

    this.lazyModelLoader.onMemoryWarning = (currentCount, maxCount) => {
      console.warn(`内存警告: 已加载 ${currentCount} 个块，超过限制 ${maxCount}`);
      this.showNotification('内存使用过高，正在自动清理...', 3000);
    };

    this.lazyModelLoader.onError = (error, chunkId) => {
      console.error(`模型块 ${chunkId} 加载错误:`, error);
      this.showNotification(`模型块加载失败: ${chunkId}`);
    };
  }

  setupPerformanceCallbacks() {
    this.performanceOptimizer.onFpsDrop = (fps, threshold) => {
      console.warn(`FPS 过低: ${fps} < ${threshold}`);
      this.showNotification(`性能警告: FPS 已降至 ${fps}，正在优化...`, 3000);
    };

    this.performanceOptimizer.onAutoOptimize = (stats) => {
      console.log('自动优化完成:', stats);
    };
  }

  createUI() {
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    toolbar.className = 'toolbar';
    document.body.appendChild(toolbar);

    const infoPanel = document.createElement('div');
    infoPanel.id = 'infoPanel';
    infoPanel.className = 'panel info-panel';
    document.body.appendChild(infoPanel);

    const legendPanel = document.createElement('div');
    legendPanel.id = 'legendPanel';
    legendPanel.className = 'panel legend-panel';
    document.body.appendChild(legendPanel);

    const diseasePanel = document.createElement('div');
    diseasePanel.id = 'diseasePanel';
    diseasePanel.className = 'panel disease-panel';
    document.body.appendChild(diseasePanel);

    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">正在加载三维巡检平台...</div>
    `;
    document.body.appendChild(loadingOverlay);

    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = 'notification';
    document.body.appendChild(notification);

    const hoverInfo = document.createElement('div');
    hoverInfo.id = 'hoverInfo';
    hoverInfo.className = 'hover-info';
    hoverInfo.style.display = 'none';
    document.body.appendChild(hoverInfo);

    const debugPanel = document.createElement('div');
    debugPanel.id = 'debugPanel';
    debugPanel.className = 'panel debug-panel';
    debugPanel.style.display = 'none';
    document.body.appendChild(debugPanel);

    const maintenancePanel = document.createElement('div');
    maintenancePanel.id = 'maintenancePanel';
    maintenancePanel.className = 'panel maintenance-panel';
    maintenancePanel.style.display = 'none';
    document.body.appendChild(maintenancePanel);

    const batchFilterPanel = document.createElement('div');
    batchFilterPanel.id = 'batchFilterPanel';
    batchFilterPanel.className = 'panel batch-filter-panel';
    batchFilterPanel.style.display = 'none';
    document.body.appendChild(batchFilterPanel);

    const performancePanel = document.createElement('div');
    performancePanel.id = 'performancePanel';
    performancePanel.className = 'panel performance-panel';
    performancePanel.style.display = 'none';
    document.body.appendChild(performancePanel);
  }

  setupToolbar() {
    const toolbar = document.getElementById('toolbar');

    const tools = [
      { id: 'select', icon: '👆', title: '选择工具', active: true },
      { id: 'measure', icon: '📏', title: '测量工具' },
      { id: 'annotate', icon: '📝', title: '标注工具' }
    ];

    const viewModes = [
      { id: 'orbit', icon: '🔄', title: '轨道模式 (1)', mode: 'orbit' },
      { id: 'firstPerson', icon: '👁', title: '第一人称 (2)', mode: 'firstPerson' },
      { id: 'topDown', icon: '⬇', title: '俯视模式 (3)', mode: 'topDown' }
    ];

    const actions = [
      { id: 'stress', icon: '📊', title: '应力可视化', action: () => this.toggleStress() },
      { id: 'autoNav', icon: '🚗', title: '自动巡航', action: () => this.toggleAutoNavigation() },
      { id: 'screenshot', icon: '📷', title: '截图', action: () => this.takeScreenshot() },
      { id: 'reset', icon: '↺', title: '重置视图 (R)', action: () => this.viewController.resetView() },
      { id: 'maintenance', icon: '🔧', title: '检修模拟', action: () => this.toggleMaintenancePanel() },
      { id: 'batchFilter', icon: '🔍', title: '批量筛选', action: () => this.toggleBatchFilterPanel() },
      { id: 'performance', icon: '⚡', title: '性能优化', action: () => this.togglePerformancePanel() },
      { id: 'debug', icon: '🛠', title: '调试工具', action: () => this.toggleDebugPanel() }
    ];

    toolbar.innerHTML = `
      <div class="toolbar-section">
        <span class="toolbar-label">工具</span>
        ${tools.map(t => `<button class="toolbar-btn ${t.active ? 'active' : ''}" data-tool="${t.id}" title="${t.title}">${t.icon}</button>`).join('')}
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="toolbar-label">视图</span>
        ${viewModes.map(v => `<button class="toolbar-btn" data-view="${v.mode}" title="${v.title}">${v.icon}</button>`).join('')}
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="toolbar-label">操作</span>
        ${actions.map(a => `<button class="toolbar-btn" id="btn-${a.id}" title="${a.title}">${a.icon}</button>`).join('')}
      </div>
      <div class="toolbar-section" style="margin-left: auto;">
        <span class="toolbar-title">高速公路桥梁三维巡检平台</span>
      </div>
    `;

    toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
      });
    });

    toolbar.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewController.switchMode(btn.dataset.view);
      });
    });

    actions.forEach(a => {
      document.getElementById(`btn-${a.id}`).addEventListener('click', a.action);
    });
  }

  setupLegendPanel() {
    const panel = document.getElementById('legendPanel');
    const legend = this.diseaseLayerManager.createLegend();

    panel.innerHTML = `
      <div class="panel-header">
        <h3>图层控制</h3>
        <button class="panel-toggle">−</button>
      </div>
      <div class="panel-content">
        <div class="legend-section">
          <h4>病害类型</h4>
          ${legend.filter(l => l.type === 'layer').map(l => `
            <div class="legend-item">
              <label>
                <input type="checkbox" class="layer-toggle" data-layer="${l.key}" ${l.visible ? 'checked' : ''}>
                <span class="legend-color" style="background-color: #${l.color.toString(16).padStart(6, '0')}"></span>
                <span>${l.name}</span>
              </label>
            </div>
          `).join('')}
        </div>
        <div class="legend-section">
          <h4>严重程度</h4>
          ${legend.filter(l => l.type === 'severity').map(l => `
            <div class="legend-item">
              <label>
                <input type="checkbox" class="severity-toggle" data-severity="${l.key}" ${l.visible ? 'checked' : ''}>
                <span class="legend-color" style="background-color: #${l.color.toString(16).padStart(6, '0')}"></span>
                <span>${l.name}</span>
              </label>
            </div>
          `).join('')}
        </div>
        <div class="legend-section">
          <h4>处理状态</h4>
          ${legend.filter(l => l.type === 'status').map(l => `
            <div class="legend-item">
              <label>
                <input type="checkbox" class="status-toggle" data-status="${l.key}" ${l.visible ? 'checked' : ''}>
                <span class="legend-color" style="background-color: #${l.color.toString(16).padStart(6, '0')}"></span>
                <span>${l.name}</span>
              </label>
            </div>
          `).join('')}
        </div>
        <div class="legend-section">
          <label>
            <input type="checkbox" id="showLabels" checked>
            <span>显示标签</span>
          </label>
          <label>
            <input type="checkbox" id="showHeatmap">
            <span>热力图模式</span>
          </label>
        </div>
      </div>
    `;

    panel.querySelector('.panel-toggle').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });

    panel.querySelectorAll('.layer-toggle').forEach(cb => {
      cb.addEventListener('change', (e) => {
        this.diseaseLayerManager.toggleLayer(e.target.dataset.layer, e.target.checked);
      });
    });

    panel.querySelectorAll('.severity-toggle').forEach(cb => {
      cb.addEventListener('change', (e) => {
        this.diseaseLayerManager.toggleSeverity(e.target.dataset.severity, e.target.checked);
      });
    });

    panel.querySelectorAll('.status-toggle').forEach(cb => {
      cb.addEventListener('change', (e) => {
        this.diseaseLayerManager.toggleStatus(e.target.dataset.status, e.target.checked);
      });
    });

    document.getElementById('showLabels').addEventListener('change', (e) => {
      this.diseaseLayerManager.toggleLabels(e.target.checked);
    });

    document.getElementById('showHeatmap').addEventListener('change', (e) => {
      this.diseaseLayerManager.showHeatmap(e.target.checked);
    });
  }

  setupInfoPanel() {
    const panel = document.getElementById('infoPanel');

    panel.innerHTML = `
      <div class="panel-header">
        <h3>桥梁信息</h3>
        <button class="panel-toggle">−</button>
      </div>
      <div class="panel-content" id="bridgeInfoContent">
        <div class="info-loading">加载中...</div>
      </div>
    `;

    panel.querySelector('.panel-toggle').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }

  updateBridgeInfoPanel() {
    if (!this.bridgeInfo) return;

    const content = document.getElementById('bridgeInfoContent');
    const conditionColors = {
      good: '#4caf50',
      warning: '#ff9800',
      poor: '#f44336'
    };
    const conditionText = {
      good: '良好',
      warning: '警告',
      poor: '较差'
    };

    content.innerHTML = `
      <div class="info-item">
        <span class="info-label">桥梁名称</span>
        <span class="info-value">${this.bridgeInfo.name}</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥梁编号</span>
        <span class="info-value">${this.bridgeInfo.id}</span>
      </div>
      <div class="info-item">
        <span class="info-label">所在位置</span>
        <span class="info-value">${this.bridgeInfo.location}</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥梁类型</span>
        <span class="info-value">${this.bridgeInfo.type}</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥梁长度</span>
        <span class="info-value">${this.bridgeInfo.length} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥面宽度</span>
        <span class="info-value">${this.bridgeInfo.width} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">建成年份</span>
        <span class="info-value">${this.bridgeInfo.buildYear}</span>
      </div>
      <div class="info-item">
        <span class="info-label">上次巡检</span>
        <span class="info-value">${this.bridgeInfo.lastInspection}</span>
      </div>
      <div class="info-item">
        <span class="info-label">技术状况</span>
        <span class="info-value status-badge" style="background-color: ${conditionColors[this.bridgeInfo.condition]}">
          ${conditionText[this.bridgeInfo.condition]}
        </span>
      </div>
      <div class="info-description">${this.bridgeInfo.description}</div>
    `;
  }

  setupDiseasePanel() {
    const panel = document.getElementById('diseasePanel');

    panel.innerHTML = `
      <div class="panel-header">
        <h3>病害列表</h3>
        <button class="panel-toggle">−</button>
      </div>
      <div class="panel-content">
        <div class="statistics" id="diseaseStats"></div>
        <div class="disease-list" id="diseaseList"></div>
      </div>
    `;

    panel.querySelector('.panel-toggle').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }

  setupMaintenancePanel() {
    const panel = document.getElementById('maintenancePanel');

    panel.innerHTML = `
      <div class="panel-header">
        <h3>检修模拟动画</h3>
        <button class="panel-close" onclick="app.toggleMaintenancePanel()">×</button>
      </div>
      <div class="panel-content">
        <div class="maintenance-section">
          <h4>选择检修类型</h4>
          <div class="maintenance-types">
            <button class="maintenance-btn" data-type="bearing">
              <span class="maintenance-icon">🔩</span>
              <span>支座更换</span>
            </button>
            <button class="maintenance-btn" data-type="guardrail">
              <span class="maintenance-icon">🚧</span>
              <span>护栏维修</span>
            </button>
            <button class="maintenance-btn" data-type="deck">
              <span class="maintenance-icon">🛠</span>
              <span>桥面检测</span>
            </button>
          </div>
        </div>

        <div class="maintenance-section">
          <h4>动画控制</h4>
          <div class="animation-controls">
            <div class="control-item">
              <label>播放速度</label>
              <input type="range" id="animSpeed" min="0.5" max="3" step="0.1" value="1">
              <span id="animSpeedValue">1.0x</span>
            </div>
            <div class="control-item">
              <label>自动循环</label>
              <input type="checkbox" id="animLoop">
            </div>
            <div class="control-item">
              <label>显示工人</label>
              <input type="checkbox" id="animShowWorker" checked>
            </div>
            <div class="control-item">
              <label>显示工具</label>
              <input type="checkbox" id="animShowTools" checked>
            </div>
          </div>
        </div>

        <div class="maintenance-section">
          <h4>播放控制</h4>
          <div class="playback-controls">
            <button class="btn btn-primary" id="playAnimation">▶ 播放</button>
            <button class="btn btn-secondary" id="pauseAnimation">⏸ 暂停</button>
            <button class="btn btn-secondary" id="stopAnimation">⏹ 停止</button>
          </div>
        </div>

        <div class="maintenance-section">
          <h4>动画进度</h4>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" id="animProgressFill" style="width: 0%"></div>
            </div>
            <div class="progress-text" id="animProgressText">0 / 0 步</div>
          </div>
          <div class="step-description" id="animStepDesc">请选择检修类型开始动画</div>
        </div>
      </div>
    `;

    panel.querySelectorAll('.maintenance-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.maintenance-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMaintenanceType = btn.dataset.type;
      });
    });

    document.getElementById('animSpeed').addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      document.getElementById('animSpeedValue').textContent = speed.toFixed(1) + 'x';
      this.maintenanceAnimation.setSpeed(speed);
    });

    document.getElementById('animLoop').addEventListener('change', (e) => {
      this.maintenanceAnimation.setLoop(e.target.checked);
    });

    document.getElementById('animShowWorker').addEventListener('change', (e) => {
      this.maintenanceAnimation.showWorker(e.target.checked);
    });

    document.getElementById('animShowTools').addEventListener('change', (e) => {
      this.maintenanceAnimation.showTools(e.target.checked);
    });

    document.getElementById('playAnimation').addEventListener('click', () => {
      this.playSelectedMaintenance();
    });

    document.getElementById('pauseAnimation').addEventListener('click', () => {
      this.maintenanceAnimation.pause();
    });

    document.getElementById('stopAnimation').addEventListener('click', () => {
      this.maintenanceAnimation.stop();
      this.updateMaintenanceProgress(0, 0, '已停止');
    });
  }

  setupBatchFilterPanel() {
    const panel = document.getElementById('batchFilterPanel');
    const presets = this.diseaseBatchManager.getFilterPresets();

    panel.innerHTML = `
      <div class="panel-header">
        <h3>批量筛选与标注</h3>
        <button class="panel-close" onclick="app.toggleBatchFilterPanel()">×</button>
      </div>
      <div class="panel-content">
        <div class="filter-section">
          <h4>快速搜索</h4>
          <div class="search-box">
            <input type="text" id="batchSearchInput" placeholder="搜索病害编号、描述、位置..." style="flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff;">
            <button class="btn btn-primary" id="btnBatchSearch">搜索</button>
          </div>
        </div>

        <div class="filter-section">
          <h4>筛选预设</h4>
          <div class="preset-list">
            ${presets.map(p => `
              <button class="preset-btn" data-preset="${p.id}">
                <span class="preset-icon">${p.icon}</span>
                <span class="preset-name">${p.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="filter-section">
          <h4>高级筛选</h4>
          <div class="filter-grid">
            <div class="filter-item">
              <label>病害类型</label>
              <select id="filterType" multiple>
                <option value="crack">裂缝</option>
                <option value="deformation">变形</option>
                <option value="spalling">剥落</option>
                <option value="corrosion">锈蚀</option>
                <option value="missing">缺失</option>
              </select>
            </div>
            <div class="filter-item">
              <label>严重程度</label>
              <select id="filterSeverity" multiple>
                <option value="minor">轻微</option>
                <option value="moderate">中等</option>
                <option value="severe">严重</option>
              </select>
            </div>
            <div class="filter-item">
              <label>处理状态</label>
              <select id="filterStatus" multiple>
                <option value="pending">待处理</option>
                <option value="repairing">维修中</option>
                <option value="repaired">已修复</option>
              </select>
            </div>
            <div class="filter-item">
              <label>发现日期</label>
              <div class="date-range">
                <input type="date" id="filterDateStart">
                <span>至</span>
                <input type="date" id="filterDateEnd">
              </div>
            </div>
            <div class="filter-item">
              <label>尺寸范围 (cm)</label>
              <div class="range-input">
                <input type="number" id="filterSizeMin" placeholder="最小" style="width: 70px;">
                <span>-</span>
                <input type="number" id="filterSizeMax" placeholder="最大" style="width: 70px;">
              </div>
            </div>
          </div>
          <div class="filter-actions">
            <button class="btn btn-primary" id="btnApplyFilter">应用筛选</button>
            <button class="btn btn-secondary" id="btnResetFilter">重置</button>
          </div>
        </div>

        <div class="filter-section">
          <h4>排序方式</h4>
          <div class="sort-controls">
            <select id="sortField">
              <option value="discoveryDate">发现日期</option>
              <option value="severity">严重程度</option>
              <option value="type">病害类型</option>
              <option value="status">处理状态</option>
              <option value="position">位置</option>
            </select>
            <select id="sortOrder">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
        </div>

        <div class="filter-section">
          <h4>筛选结果 <span id="resultCount" class="result-count">0 / 0</span></h4>
          <div class="batch-actions">
            <button class="btn btn-primary" id="btnSelectAll">全选</button>
            <button class="btn btn-secondary" id="btnSelectInverse">反选</button>
            <button class="btn btn-secondary" id="btnSelectClear">清除</button>
            <span class="selected-count">已选: <span id="selectedCount">0</span></span>
          </div>
          <div class="batch-list" id="batchDiseaseList"></div>
        </div>

        <div class="filter-section">
          <h4>批量操作</h4>
          <div class="batch-operations">
            <select id="batchActionType">
              <option value="">选择操作...</option>
              <option value="updateStatus">更新状态</option>
              <option value="updateSeverity">更新严重程度</option>
              <option value="addTag">添加标签</option>
              <option value="export">导出数据</option>
              <option value="delete">删除</option>
              <option value="generateReport">生成维修报告</option>
            </select>
            <button class="btn btn-success" id="btnExecuteBatch">执行</button>
          </div>
        </div>

        <div class="filter-section">
          <h4>选中项统计</h4>
          <div class="selection-stats" id="selectionStats"></div>
        </div>
      </div>
    `;

    document.getElementById('btnBatchSearch').addEventListener('click', () => {
      const query = document.getElementById('batchSearchInput').value;
      this.diseaseBatchManager.search(query);
      this.updateBatchList();
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.diseaseBatchManager.applyPreset(btn.dataset.preset);
        this.updateBatchList();
      });
    });

    document.getElementById('btnApplyFilter').addEventListener('click', () => {
      const typeSelect = document.getElementById('filterType');
      const severitySelect = document.getElementById('filterSeverity');
      const statusSelect = document.getElementById('filterStatus');

      const filters = {
        type: Array.from(typeSelect.selectedOptions).map(o => o.value),
        severity: Array.from(severitySelect.selectedOptions).map(o => o.value),
        status: Array.from(statusSelect.selectedOptions).map(o => o.value),
        dateRange: {
          start: document.getElementById('filterDateStart').value,
          end: document.getElementById('filterDateEnd').value
        },
        sizeRange: {
          min: parseFloat(document.getElementById('filterSizeMin').value) || null,
          max: parseFloat(document.getElementById('filterSizeMax').value) || null
        }
      };
      this.diseaseBatchManager.setFilters(filters);
      this.updateBatchList();
    });

    document.getElementById('btnResetFilter').addEventListener('click', () => {
      document.getElementById('batchSearchInput').value = '';
      document.getElementById('filterType').selectedIndex = -1;
      document.getElementById('filterSeverity').selectedIndex = -1;
      document.getElementById('filterStatus').selectedIndex = -1;
      document.getElementById('filterDateStart').value = '';
      document.getElementById('filterDateEnd').value = '';
      document.getElementById('filterSizeMin').value = '';
      document.getElementById('filterSizeMax').value = '';
      panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      this.diseaseBatchManager.clearFilters();
      this.updateBatchList();
    });

    document.getElementById('sortField').addEventListener('change', () => this.applySort());
    document.getElementById('sortOrder').addEventListener('change', () => this.applySort());

    document.getElementById('btnSelectAll').addEventListener('click', () => {
      this.diseaseBatchManager.selectAll(true);
      this.updateBatchList();
    });

    document.getElementById('btnSelectInverse').addEventListener('click', () => {
      this.diseaseBatchManager.invertSelection();
      this.updateBatchList();
    });

    document.getElementById('btnSelectClear').addEventListener('click', () => {
      this.diseaseBatchManager.clearSelection();
      this.updateBatchList();
    });

    document.getElementById('btnExecuteBatch').addEventListener('click', () => {
      this.executeBatchAction();
    });
  }

  setupPerformancePanel() {
    const panel = document.getElementById('performancePanel');

    panel.innerHTML = `
      <div class="panel-header">
        <h3>性能优化设置</h3>
        <button class="panel-close" onclick="app.togglePerformancePanel()">×</button>
      </div>
      <div class="panel-content">
        <div class="perf-section">
          <h4>实时性能</h4>
          <div class="perf-stats">
            <div class="perf-stat-item">
              <span class="perf-label">FPS</span>
              <span class="perf-value" id="perfFps">60</span>
            </div>
            <div class="perf-stat-item">
              <span class="perf-label">Draw Call</span>
              <span class="perf-value" id="perfDrawCalls">0</span>
            </div>
            <div class="perf-stat-item">
              <span class="perf-label">可见物体</span>
              <span class="perf-value" id="perfVisible">0</span>
            </div>
            <div class="perf-stat-item">
              <span class="perf-label">剔除物体</span>
              <span class="perf-value" id="perfCulled">0</span>
            </div>
            <div class="perf-stat-item">
              <span class="perf-label">三角形数</span>
              <span class="perf-value" id="perfTriangles">0</span>
            </div>
          </div>
        </div>

        <div class="perf-section">
          <h4>优化选项</h4>
          <div class="opt-controls">
            <div class="opt-item">
              <label>
                <input type="checkbox" id="optFrustumCulling" checked>
                视锥体剔除
              </label>
            </div>
            <div class="opt-item">
              <label>
                <input type="checkbox" id="optDistanceCulling" checked>
                距离裁剪
              </label>
            </div>
            <div class="opt-item">
              <label>
                <input type="checkbox" id="optLOD" checked>
                LOD细节层次
              </label>
            </div>
            <div class="opt-item">
              <label>
                <input type="checkbox" id="optInstancing" checked>
                实例化渲染
              </label>
            </div>
            <div class="opt-item">
              <label>
                <input type="checkbox" id="optLazyLoading" checked>
                模型分块懒加载
              </label>
            </div>
          </div>
        </div>

        <div class="perf-section">
          <h4>参数设置</h4>
          <div class="param-controls">
            <div class="param-item">
              <label>裁剪距离 (m)</label>
              <input type="range" id="paramCullDistance" min="50" max="500" step="10" value="200">
              <span id="paramCullDistanceValue">200</span>
            </div>
            <div class="param-item">
              <label>最大加载块数</label>
              <input type="range" id="paramMaxChunks" min="5" max="50" step="1" value="20">
              <span id="paramMaxChunksValue">20</span>
            </div>
            <div class="param-item">
              <label>预加载距离 (m)</label>
              <input type="range" id="paramPreloadDist" min="10" max="100" step="5" value="30">
              <span id="paramPreloadDistValue">30</span>
            </div>
          </div>
        </div>

        <div class="perf-section">
          <h4>内存使用</h4>
          <div class="memory-stats">
            <div class="memory-bar">
              <div class="memory-fill" id="memoryFill" style="width: 0%"></div>
            </div>
            <div class="memory-text" id="memoryText">0 / 0 MB</div>
          </div>
        </div>

        <div class="perf-section">
          <h4>调试显示</h4>
          <div class="debug-controls">
            <div class="debug-item">
              <label>
                <input type="checkbox" id="debugShowFrustum">
                显示视锥体
              </label>
            </div>
            <div class="debug-item">
              <label>
                <input type="checkbox" id="debugShowBounds">
                显示边界框
              </label>
            </div>
          </div>
        </div>

        <div class="perf-section">
          <h4>一键优化</h4>
          <div class="one-click-opt">
            <button class="btn btn-primary" id="btnOptimizeAll">自动优化场景</button>
            <button class="btn btn-secondary" id="btnOptimizeMeshes">合并网格</button>
            <button class="btn btn-secondary" id="btnClearMemory">清理内存</button>
            <button class="btn btn-secondary" id="btnResetOpt">重置设置</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('optFrustumCulling').addEventListener('change', (e) => {
      this.performanceOptimizer.frustumCullingEnabled = e.target.checked;
    });

    document.getElementById('optDistanceCulling').addEventListener('change', (e) => {
      this.performanceOptimizer.distanceCullingEnabled = e.target.checked;
    });

    document.getElementById('optLOD').addEventListener('change', (e) => {
      this.performanceOptimizer.lodEnabled = e.target.checked;
    });

    document.getElementById('optInstancing').addEventListener('change', (e) => {
      this.performanceOptimizer.instancingEnabled = e.target.checked;
    });

    document.getElementById('optLazyLoading').addEventListener('change', (e) => {
      this.useLazyLoading = e.target.checked;
      if (!e.target.checked) {
        this.lazyModelLoader.disable();
      } else {
        this.lazyModelLoader.enable();
      }
    });

    document.getElementById('paramCullDistance').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('paramCullDistanceValue').textContent = val;
      this.performanceOptimizer.setCullingDistance(val);
    });

    document.getElementById('paramMaxChunks').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('paramMaxChunksValue').textContent = val;
      this.lazyModelLoader.setMaxLoadedChunks(val);
    });

    document.getElementById('paramPreloadDist').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('paramPreloadDistValue').textContent = val;
      this.lazyModelLoader.setPreloadDistance(val);
    });

    document.getElementById('debugShowFrustum').addEventListener('change', (e) => {
      this.performanceOptimizer.showDebug(e.target.checked);
    });

    document.getElementById('btnOptimizeAll').addEventListener('click', () => {
      const results = this.performanceOptimizer.optimizeAllMeshes();
      this.showNotification(`优化完成: 合并 ${results.merged} 组网格`);
    });

    document.getElementById('btnOptimizeMeshes').addEventListener('click', () => {
      const results = this.performanceOptimizer.optimizeAllMeshes();
      this.showNotification(`网格合并完成: ${results.merged} 组`);
    });

    document.getElementById('btnClearMemory').addEventListener('click', () => {
      this.lazyModelLoader.unloadAllChunks();
      this.showNotification('已清理未使用的内存');
    });

    document.getElementById('btnResetOpt').addEventListener('click', () => {
      this.performanceOptimizer.setCullingDistance(200);
      this.lazyModelLoader.setMaxLoadedChunks(20);
      this.lazyModelLoader.setPreloadDistance(30);
      document.getElementById('paramCullDistance').value = 200;
      document.getElementById('paramCullDistanceValue').textContent = 200;
      document.getElementById('paramMaxChunks').value = 20;
      document.getElementById('paramMaxChunksValue').textContent = 20;
      document.getElementById('paramPreloadDist').value = 30;
      document.getElementById('paramPreloadDistValue').textContent = 30;
      this.showNotification('设置已重置');
    });
  }

  updateDiseasePanel() {
    const stats = this.diseaseLayerManager.getStatistics();
    const diseases = this.diseaseLayerManager.diseaseData;

    const statsDiv = document.getElementById('diseaseStats');
    statsDiv.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${stats.total}</span>
        <span class="stat-label">总数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value severe">${stats.bySeverity.severe}</span>
        <span class="stat-label">严重</span>
      </div>
      <div class="stat-item">
        <span class="stat-value moderate">${stats.bySeverity.moderate}</span>
        <span class="stat-label">中等</span>
      </div>
      <div class="stat-item">
        <span class="stat-value minor">${stats.bySeverity.minor}</span>
        <span class="stat-label">轻微</span>
      </div>
    `;

    const listDiv = document.getElementById('diseaseList');
    listDiv.innerHTML = diseases.map(d => `
      <div class="disease-item severity-${d.severity}" data-id="${d.id}">
        <div class="disease-header">
          <span class="disease-type">${this.getDiseaseTypeName(d.type)}</span>
          <span class="disease-severity">${this.getSeverityText(d.severity)}</span>
        </div>
        <div class="disease-desc">${d.description}</div>
        <div class="disease-footer">
          <span class="disease-status status-${d.status}">${this.getStatusText(d.status)}</span>
          <span class="disease-date">${d.discoveryDate}</span>
        </div>
      </div>
    `).join('');

    listDiv.querySelectorAll('.disease-item').forEach(item => {
      item.addEventListener('click', () => {
        const diseaseId = item.dataset.id;
        const focusData = this.diseaseLayerManager.focusOnDisease(diseaseId);
        if (focusData) {
          this.viewController.flyTo(focusData.targetPosition, 1500).then(() => {
            this.camera.lookAt(focusData.lookAtPosition);
          });
        }
      });
    });
  }

  updateStatistics() {
    const stats = this.diseaseLayerManager.getStatistics();
    console.log('病害统计:', stats);
  }

  getDiseaseTypeName(type) {
    const names = {
      crack: '裂缝',
      deformation: '变形',
      spalling: '剥落',
      corrosion: '锈蚀',
      missing: '缺失'
    };
    return names[type] || type;
  }

  getSeverityText(severity) {
    const texts = { minor: '轻微', moderate: '中等', severe: '严重' };
    return texts[severity] || severity;
  }

  getStatusText(status) {
    const texts = { pending: '待处理', repairing: '维修中', repaired: '已修复' };
    return texts[status] || status;
  }

  showBearingInfo(bearing) {
    const bearingId = bearing.userData.id;
    this.inspectionAPI.getBearing(bearingId).then(response => {
      if (response.success) {
        const data = response.data;
        this.showNotification(`支座 ${bearingId}: ${data.type} - ${data.model}`);
      }
    });
  }

  showDiseaseDetail(disease) {
    const detailDiv = document.getElementById('diseaseDetail') || this.createDiseaseDetailPanel();
    detailDiv.style.display = 'block';

    document.getElementById('detailId').textContent = disease.id;
    document.getElementById('detailType').textContent = this.getDiseaseTypeName(disease.type);
    document.getElementById('detailSeverity').textContent = this.getSeverityText(disease.severity);
    document.getElementById('detailStatus').textContent = this.getStatusText(disease.status);
    document.getElementById('detailDescription').textContent = disease.description;
    document.getElementById('detailInspector').textContent = disease.inspector;
    document.getElementById('detailDate').textContent = disease.discoveryDate;
    document.getElementById('detailSuggestion').textContent = disease.repairSuggestion;
    document.getElementById('detailPosition').textContent =
      `X: ${disease.position.x.toFixed(2)}, Y: ${disease.position.y.toFixed(2)}, Z: ${disease.position.z.toFixed(2)}`;

    if (disease.length) {
      document.getElementById('detailDimensions').innerHTML = `
        <div class="detail-row"><span>长度:</span> ${disease.length} cm</div>
        <div class="detail-row"><span>宽度:</span> ${disease.width} cm</div>
        <div class="detail-row"><span>深度:</span> ${disease.depth} cm</div>
      `;
    } else if (disease.area) {
      document.getElementById('detailDimensions').innerHTML = `
        <div class="detail-row"><span>面积:</span> ${disease.area} m²</div>
      `;
    } else {
      document.getElementById('detailDimensions').innerHTML = '';
    }
  }

  createDiseaseDetailPanel() {
    const detailDiv = document.createElement('div');
    detailDiv.id = 'diseaseDetail';
    detailDiv.className = 'panel disease-detail-panel';
    detailDiv.innerHTML = `
      <div class="panel-header">
        <h3>病害详情</h3>
        <button class="panel-close" id="closeDetail">×</button>
      </div>
      <div class="panel-content">
        <div class="detail-grid">
          <div class="detail-row"><span>病害编号:</span> <span id="detailId"></span></div>
          <div class="detail-row"><span>病害类型:</span> <span id="detailType"></span></div>
          <div class="detail-row"><span>严重程度:</span> <span id="detailSeverity"></span></div>
          <div class="detail-row"><span>处理状态:</span> <span id="detailStatus"></span></div>
          <div class="detail-row"><span>发现人员:</span> <span id="detailInspector"></span></div>
          <div class="detail-row"><span>发现日期:</span> <span id="detailDate"></span></div>
          <div class="detail-row"><span>位置坐标:</span> <span id="detailPosition"></span></div>
        </div>
        <div id="detailDimensions"></div>
        <div class="detail-section">
          <h4>病害描述</h4>
          <p id="detailDescription"></p>
        </div>
        <div class="detail-section">
          <h4>维修建议</h4>
          <p id="detailSuggestion"></p>
        </div>
        <div class="detail-actions">
          <button class="btn btn-primary" id="btnEditDisease">编辑</button>
          <button class="btn btn-success" id="btnMarkRepaired">标记已修复</button>
          <button class="btn btn-secondary" id="btnExportReport">导出报告</button>
        </div>
      </div>
    `;
    document.body.appendChild(detailDiv);

    document.getElementById('closeDetail').addEventListener('click', () => {
      detailDiv.style.display = 'none';
    });

    document.getElementById('btnMarkRepaired').addEventListener('click', () => {
      const diseaseId = document.getElementById('detailId').textContent;
      this.inspectionAPI.updateDisease(diseaseId, { status: 'repaired' }).then(response => {
        if (response.success) {
          this.diseaseLayerManager.updateDisease(diseaseId, { status: 'repaired' });
          this.updateDiseasePanel();
          detailDiv.style.display = 'none';
          this.showNotification('病害已标记为已修复');
        }
      });
    });

    return detailDiv;
  }

  updateHoverInfo(disease) {
    const hoverInfo = document.getElementById('hoverInfo');
    hoverInfo.innerHTML = `
      <strong>${this.getDiseaseTypeName(disease.type)}</strong><br>
      严重程度: ${this.getSeverityText(disease.severity)}<br>
      状态: ${this.getStatusText(disease.status)}
    `;
    hoverInfo.style.display = 'block';

    document.addEventListener('mousemove', (e) => {
      hoverInfo.style.left = (e.clientX + 15) + 'px';
      hoverInfo.style.top = (e.clientY + 15) + 'px';
    }, { once: true });

    setTimeout(() => {
      if (!this.diseaseLayerManager.hoveredMarker) {
        hoverInfo.style.display = 'none';
      }
    }, 100);
  }

  showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  showNotification(message, duration = 3000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
      notification.classList.remove('show');
    }, duration);
  }

  toggleStress() {
    this.showStress = !this.showStress;
    const btn = document.getElementById('btn-stress');

    if (this.showStress) {
      this.stressCalculator.toggleVisibility(this.models);
      btn.classList.add('active');
      this.showNotification('应力可视化已开启');
    } else {
      this.stressCalculator.clearVisualization();
      btn.classList.remove('active');
      this.showNotification('应力可视化已关闭');
    }
  }

  toggleAutoNavigation() {
    const btn = document.getElementById('btn-autoNav');

    if (this.viewController.isAutoNavigating) {
      this.viewController.stopAutoNavigation();
      btn.classList.remove('active');
      this.showNotification('自动巡航已停止');
    } else {
      this.viewController.startAutoNavigation();
      btn.classList.add('active');
      this.showNotification('自动巡航已开始');
    }
  }

  takeScreenshot() {
    const link = document.createElement('a');
    link.download = `bridge_inspection_${Date.now()}.png`;
    link.href = this.renderer.domElement.toDataURL('image/png');
    link.click();
    this.showNotification('截图已保存');
  }

  toggleDebugPanel() {
    const debugPanel = document.getElementById('debugPanel');
    const btn = document.getElementById('btn-debug');
    
    if (debugPanel.style.display === 'none') {
      this.setupDebugPanel();
      debugPanel.style.display = 'block';
      btn.classList.add('active');
      this.showNotification('调试工具已开启');
    } else {
      debugPanel.style.display = 'none';
      btn.classList.remove('active');
      this.showNotification('调试工具已关闭');
    }
  }

  toggleMaintenancePanel() {
    const panel = document.getElementById('maintenancePanel');
    const btn = document.getElementById('btn-maintenance');

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      btn.classList.add('active');
      this.showNotification('检修动画面板已打开');
    } else {
      panel.style.display = 'none';
      btn.classList.remove('active');
      this.maintenanceAnimation.stop();
    }
  }

  toggleBatchFilterPanel() {
    const panel = document.getElementById('batchFilterPanel');
    const btn = document.getElementById('btn-batchFilter');

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      btn.classList.add('active');
      this.updateBatchList();
      this.showNotification('批量筛选面板已打开');
    } else {
      panel.style.display = 'none';
      btn.classList.remove('active');
    }
  }

  togglePerformancePanel() {
    const panel = document.getElementById('performancePanel');
    const btn = document.getElementById('btn-performance');

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      btn.classList.add('active');
      this.showNotification('性能优化面板已打开');
      this.startPerformanceUpdate();
    } else {
      panel.style.display = 'none';
      btn.classList.remove('active');
      this.stopPerformanceUpdate();
    }
  }

  startPerformanceUpdate() {
    if (this._perfUpdateInterval) return;
    this._perfUpdateInterval = setInterval(() => {
      this.updatePerformanceStats();
    }, 500);
  }

  stopPerformanceUpdate() {
    if (this._perfUpdateInterval) {
      clearInterval(this._perfUpdateInterval);
      this._perfUpdateInterval = null;
    }
  }

  updatePerformanceStats() {
    const stats = this.performanceOptimizer.getStatistics();
    const lazyStats = this.lazyModelLoader.getStatistics();

    const fpsEl = document.getElementById('perfFps');
    if (fpsEl) fpsEl.textContent = stats.fps;

    const drawCallsEl = document.getElementById('perfDrawCalls');
    if (drawCallsEl) drawCallsEl.textContent = stats.drawCalls;

    const visibleEl = document.getElementById('perfVisible');
    if (visibleEl) visibleEl.textContent = stats.visibleObjects.toLocaleString();

    const culledEl = document.getElementById('perfCulled');
    if (culledEl) culledEl.textContent = stats.culledObjects.toLocaleString();

    const trianglesEl = document.getElementById('perfTriangles');
    if (trianglesEl) trianglesEl.textContent = stats.trianglesRendered.toLocaleString();

    const memoryFill = document.getElementById('memoryFill');
    const memoryText = document.getElementById('memoryText');
    if (memoryFill && memoryText) {
      const usedMB = lazyStats.loadedChunks * 5;
      const maxMB = lazyStats.maxLoadedChunks * 5;
      const percent = (usedMB / maxMB) * 100;
      memoryFill.style.width = percent + '%';
      memoryText.textContent = `${usedMB} / ${maxMB} MB`;
    }
  }

  playSelectedMaintenance() {
    if (!this.selectedMaintenanceType) {
      this.showNotification('请先选择检修类型');
      return;
    }

    let targetObject = null;

    if (this.models && this.models.bearings && this.models.bearings.length > 0) {
      targetObject = this.models.bearings[0];
    } else if (this.models && this.models.guardrails && this.models.guardrails.length > 0) {
      targetObject = this.models.guardrails[0];
    } else if (this.models && this.models.mainBridge) {
      targetObject = this.models.mainBridge;
    }

    if (!targetObject) {
      this.showNotification('未找到可操作的模型');
      return;
    }

    let animationPromise;
    switch (this.selectedMaintenanceType) {
      case 'bearing':
        animationPromise = this.maintenanceAnimation.playBearingReplacement(targetObject, {
          onStep: (step, total, desc) => this.updateMaintenanceProgress(step, total, desc)
        });
        break;
      case 'guardrail':
        animationPromise = this.maintenanceAnimation.playGuardrailRepair(targetObject, {
          onStep: (step, total, desc) => this.updateMaintenanceProgress(step, total, desc)
        });
        break;
      case 'deck':
        animationPromise = this.maintenanceAnimation.playDeckInspection(targetObject, {
          onStep: (step, total, desc) => this.updateMaintenanceProgress(step, total, desc)
        });
        break;
    }

    if (animationPromise) {
      animationPromise.catch(err => {
        console.error('动画播放失败:', err);
        this.showNotification('动画播放失败: ' + err.message);
      });
    }
  }

  updateMaintenanceProgress(step, totalSteps, description) {
    const progressFill = document.getElementById('animProgressFill');
    const progressText = document.getElementById('animProgressText');
    const stepDesc = document.getElementById('animStepDesc');

    if (progressFill && totalSteps > 0) {
      const percent = (step / totalSteps) * 100;
      progressFill.style.width = percent + '%';
    }

    if (progressText) {
      progressText.textContent = `${step} / ${totalSteps} 步`;
    }

    if (stepDesc && description) {
      stepDesc.textContent = description;
    }
  }

  updateBatchList() {
    const filtered = this.diseaseBatchManager.getFilteredDiseases();
    const total = this.diseaseBatchManager.diseases.length;
    const selected = this.diseaseBatchManager.selectedIds.size;

    const resultCount = document.getElementById('resultCount');
    if (resultCount) {
      resultCount.textContent = `${filtered.length} / ${total}`;
    }

    const selectedCount = document.getElementById('selectedCount');
    if (selectedCount) {
      selectedCount.textContent = selected;
    }

    const listEl = document.getElementById('batchDiseaseList');
    if (listEl) {
      listEl.innerHTML = filtered.map(d => `
        <div class="batch-disease-item severity-${d.severity} ${this.diseaseBatchManager.selectedIds.has(d.id) ? 'selected' : ''}" data-id="${d.id}">
          <input type="checkbox" class="batch-select" data-id="${d.id}" ${this.diseaseBatchManager.selectedIds.has(d.id) ? 'checked' : ''}>
          <div class="batch-disease-content">
            <div class="batch-disease-header">
              <span class="disease-type">${this.getDiseaseTypeName(d.type)}</span>
              <span class="disease-severity">${this.getSeverityText(d.severity)}</span>
            </div>
            <div class="batch-disease-desc">${d.description}</div>
            <div class="batch-disease-footer">
              <span class="disease-status status-${d.status}">${this.getStatusText(d.status)}</span>
              <span class="disease-date">${d.discoveryDate}</span>
            </div>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.batch-select').forEach(cb => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          const id = e.target.dataset.id;
          if (e.target.checked) {
            this.diseaseBatchManager.select(id);
          } else {
            this.diseaseBatchManager.deselect(id);
          }
          this.updateBatchList();
        });
      });

      listEl.querySelectorAll('.batch-disease-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            const id = item.dataset.id;
            const cb = item.querySelector('.batch-select');
            cb.checked = !cb.checked;
            if (cb.checked) {
              this.diseaseBatchManager.select(id);
            } else {
              this.diseaseBatchManager.deselect(id);
            }
            this.updateBatchList();
          }
        });
      });
    }

    this.updateSelectionStats();
  }

  updateBatchSelectionUI(count) {
    const selectedCount = document.getElementById('selectedCount');
    if (selectedCount) {
      selectedCount.textContent = count;
    }
  }

  updateSelectionStats() {
    const statsEl = document.getElementById('selectionStats');
    if (!statsEl) return;

    const stats = this.diseaseBatchManager.getSelectionStatistics();

    statsEl.innerHTML = `
      <div class="stat-row">
        <span>选中数量:</span>
        <span>${stats.totalSelected}</span>
      </div>
      <div class="stat-row">
        <span>按严重程度:</span>
        <span>严重 ${stats.bySeverity.severe || 0}, 中等 ${stats.bySeverity.moderate || 0}, 轻微 ${stats.bySeverity.minor || 0}</span>
      </div>
      <div class="stat-row">
        <span>按类型:</span>
        <span>${Object.entries(stats.byType).map(([k, v]) => `${this.getDiseaseTypeName(k)} ${v}`).join(', ')}</span>
      </div>
      <div class="stat-row">
        <span>预估维修费用:</span>
        <span class="cost">¥${stats.estimatedCost.toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span>预估工时:</span>
        <span>${stats.estimatedHours.toFixed(1)} 小时</span>
      </div>
    `;
  }

  applySort() {
    const field = document.getElementById('sortField').value;
    const order = document.getElementById('sortOrder').value;
    this.diseaseBatchManager.setSort(field, order);
    this.updateBatchList();
  }

  async executeBatchAction() {
    const actionType = document.getElementById('batchActionType').value;
    const selectedCount = this.diseaseBatchManager.selectedIds.size;

    if (selectedCount === 0) {
      this.showNotification('请先选择要操作的病害');
      return;
    }

    if (!actionType) {
      this.showNotification('请选择操作类型');
      return;
    }

    switch (actionType) {
      case 'updateStatus': {
        const newStatus = prompt('请输入新状态 (pending/repairing/repaired):', 'repaired');
        if (newStatus) {
          await this.diseaseBatchManager.batchUpdate({ status: newStatus });
          this.diseaseBatchManager.selectedIds.forEach(id => {
            this.diseaseLayerManager.updateDisease(id, { status: newStatus });
          });
        }
        break;
      }
      case 'updateSeverity': {
        const newSeverity = prompt('请输入新严重程度 (minor/moderate/severe):', 'moderate');
        if (newSeverity) {
          await this.diseaseBatchManager.batchUpdate({ severity: newSeverity });
        }
        break;
      }
      case 'addTag': {
        const tag = prompt('请输入要添加的标签:');
        if (tag) {
          await this.diseaseBatchManager.batchAddTag(tag);
        }
        break;
      }
      case 'export': {
        const format = prompt('请输入导出格式 (json/csv):', 'json');
        if (format) {
          await this.diseaseBatchManager.batchExport(format);
        }
        break;
      }
      case 'delete': {
        if (confirm(`确定要删除选中的 ${selectedCount} 条病害记录吗？`)) {
          const deleted = await this.diseaseBatchManager.batchDelete();
          deleted.forEach(id => {
            this.diseaseLayerManager.removeDisease(id);
          });
        }
        break;
      }
      case 'generateReport': {
        const report = this.diseaseBatchManager.generateRepairReport();
        console.log('维修报告:', report);
        alert(`维修报告已生成：\n\n总问题数: ${report.totalIssues}\n严重问题: ${report.bySeverity.severe}\n中等问题: ${report.bySeverity.moderate}\n轻微问题: ${report.bySeverity.minor}\n预估费用: ¥${report.estimatedCost.toLocaleString()}\n预估工时: ${report.estimatedHours.toFixed(1)} 小时`);
        break;
      }
    }

    this.updateBatchList();
    this.updateDiseasePanel();
    document.getElementById('batchActionType').value = '';
  }

  setupDebugPanel() {
    const panel = document.getElementById('debugPanel');
    const modelStats = this.modelLoader.getModelStats();
    const stressReport = this.stressCalculator.generateStressReport(this.models);
    const markerStats = this.diseaseLayerManager.verifyMarkerPositions();

    panel.innerHTML = `
      <div class="panel-header">
        <h3>调试工具</h3>
        <button class="panel-close" onclick="document.getElementById('debugPanel').style.display='none'">×</button>
      </div>
      <div class="panel-content">
        <div class="debug-section">
          <h4>模型加载状态</h4>
          <div class="debug-item"><span>主梁:</span> <span class="${this.models?.mainBridge ? 'status-ok' : 'status-error'}">${this.models?.mainBridge ? '已加载' : '未加载'}</span></div>
          <div class="debug-item"><span>支座:</span> <span>${this.models?.bearings?.length || 0} 个</span></div>
          <div class="debug-item"><span>护栏:</span> <span>${this.models?.guardrails?.length || 0} 个</span></div>
          <div class="debug-item"><span>总网格数:</span> <span>${modelStats.totalMeshes || 0}</span></div>
          <div class="debug-item"><span>总顶点数:</span> <span>${modelStats.totalVertices?.toLocaleString() || 0}</span></div>
          <div class="debug-item"><span>优化率:</span> <span>${modelStats.optimizationRate || 0}%</span></div>
        </div>
        <div class="debug-section">
          <h4>应力计算状态</h4>
          <div class="debug-item"><span>支座平均应力:</span> <span>${stressReport.bearingStats?.avg?.toFixed(2) || 0} MPa</span></div>
          <div class="debug-item"><span>护栏平均应力:</span> <span>${stressReport.guardrailStats?.avg?.toFixed(2) || 0} MPa</span></div>
          <div class="debug-item"><span>异常值数量:</span> <span class="${stressReport.anomalies > 0 ? 'status-warning' : 'status-ok'}">${stressReport.anomalies || 0}</span></div>
        </div>
        <div class="debug-section">
          <h4>病害标注状态</h4>
          <div class="debug-item"><span>标记总数:</span> <span>${markerStats.total || 0}</span></div>
          <div class="debug-item"><span>有效标记:</span> <span class="status-ok">${markerStats.valid || 0}</span></div>
          <div class="debug-item"><span>错位标记:</span> <span class="${markerStats.misplaced > 0 ? 'status-error' : 'status-ok'}">${markerStats.misplaced || 0}</span></div>
          <div class="debug-item"><span>越界标记:</span> <span class="${markerStats.outOfBounds > 0 ? 'status-warning' : 'status-ok'}">${markerStats.outOfBounds || 0}</span></div>
        </div>
        <div class="debug-section">
          <h4>坐标校准</h4>
          <div class="debug-item">
            <label>X偏移: <input type="number" id="calibOffsetX" step="0.1" value="0" style="width:60px"></label>
          </div>
          <div class="debug-item">
            <label>Y偏移: <input type="number" id="calibOffsetY" step="0.1" value="0" style="width:60px"></label>
          </div>
          <div class="debug-item">
            <label>Z偏移: <input type="number" id="calibOffsetZ" step="0.1" value="0" style="width:60px"></label>
          </div>
          <div class="debug-item">
            <label>缩放: <input type="number" id="calibScale" step="0.01" value="1" style="width:60px"></label>
          </div>
          <button class="btn btn-primary" id="applyCalibration">应用校准</button>
          <button class="btn btn-secondary" id="resetCalibration">重置</button>
        </div>
        <div class="debug-section">
          <h4>快速操作</h4>
          <button class="btn btn-primary" id="reloadModels">重新加载模型</button>
          <button class="btn btn-secondary" id="recalcStress">重新计算应力</button>
          <button class="btn btn-secondary" id="verifyMarkers">验证标记位置</button>
        </div>
      </div>
    `;

    document.getElementById('applyCalibration').addEventListener('click', () => {
      const offset = {
        x: parseFloat(document.getElementById('calibOffsetX').value) || 0,
        y: parseFloat(document.getElementById('calibOffsetY').value) || 0,
        z: parseFloat(document.getElementById('calibOffsetZ').value) || 0
      };
      const scale = parseFloat(document.getElementById('calibScale').value) || 1;
      this.diseaseLayerManager.setCalibration(offset, scale);
      this.showNotification('坐标校准已应用');
      this.setupDebugPanel();
    });

    document.getElementById('resetCalibration').addEventListener('click', () => {
      this.diseaseLayerManager.setCalibration(null, 1);
      this.showNotification('坐标校准已重置');
      this.setupDebugPanel();
    });

    document.getElementById('reloadModels').addEventListener('click', async () => {
      this.showLoading();
      this.modelLoader.clearAllModels();
      await this.loadModels();
      this.hideLoading();
      this.showNotification('模型已重新加载');
      this.setupDebugPanel();
    });

    document.getElementById('recalcStress').addEventListener('click', () => {
      this.stressCalculator.clearVisualization();
      this.stressCalculator.toggleVisibility(this.models);
      this.showNotification('应力已重新计算');
      this.setupDebugPanel();
    });

    document.getElementById('verifyMarkers').addEventListener('click', () => {
      const stats = this.diseaseLayerManager.verifyMarkerPositions();
      this.showNotification(`验证完成: ${stats.valid} 有效, ${stats.misplaced} 错位`);
      this.setupDebugPanel();
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();

    this.viewController.update(delta);
    this.diseaseLayerManager.update(delta);
    this.maintenanceAnimation.update(delta);

    if (this.useLazyLoading) {
      this.lazyModelLoader.update();
    }

    if (this.usePerformanceOptimizer) {
      this.performanceOptimizer.update();
    }

    if (this.showStress && this.models) {
      this.stressCalculator.updateStressVisualization(this.models);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new BridgeInspectionApp();
});
