import PointCloudRenderer from './modules/renderer/PointCloudRenderer.js';
import CoordinateTransform from './modules/coordinate/CoordinateTransform.js';
import LayerManager from './modules/layer-control/LayerManager.js';
import ServiceFactory from './services/ServiceFactory.js';

class PointCloudApp {
  constructor(container) {
    this.container = container;
    this.serviceFactory = new ServiceFactory();
    this.renderer = null;
    this.coordinateTransform = null;
    this.layerManager = null;
    this.stats = null;
    this._statsInterval = null;
    this._filterAttribute = 'lodLevel';
    this._filterMin = 0;
    this._filterMax = 5;
    this._isolateMode = false;
  }

  async initialize() {
    this._initRenderer();
    this._initCoordinateTransform();
    this._initLayerManager();
    this._initUI();
    this._initEventListeners();
    
    await this._loadSampleData();
    await this.layerManager.initialize();
    this._startStatsUpdate();
    
    console.log('✅ Point Cloud Rendering System initialized');
    console.log('💡 提示: 按住 Shift + 鼠标左键拖拽可框选点云');
    return this;
  }

  _initRenderer() {
    this.renderer = new PointCloudRenderer(this.container, {
      backgroundColor: 0x0a0a1a,
      pointSize: 1.5,
      cameraPosition: { x: 0, y: -400, z: 200 }
    });
  }

  _initCoordinateTransform() {
    this.coordinateTransform = new CoordinateTransform({
      sourceCRS: 'EPSG:4326',
      targetCRS: 'EPSG:3857',
      offset: { x: 0, y: 0, z: 0 }
    });
  }

  _initLayerManager() {
    this.layerManager = new LayerManager(
      this.renderer,
      this.serviceFactory
    );
  }

  _initUI() {
    this._createControlPanel();
    this._createStatsPanel();
    this._createLayerPanel();
    this._createSelectionPanel();
  }

  _createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'control-panel';
    panel.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(20, 20, 40, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 100;
      min-width: 200px;
    `;
    
    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; color: #4fc3f7;">🎮 控制面板</h3>
      <div style="margin-bottom: 8px;">
        <button id="btn-reset" style="width:100%;padding:6px;background:#2196f3;border:none;color:white;border-radius:4px;cursor:pointer;">重置视图</button>
      </div>
      <div style="margin-bottom: 8px;">
        <button id="btn-reload" style="width:100%;padding:6px;background:#4caf50;border:none;color:white;border-radius:4px;cursor:pointer;">重新加载</button>
      </div>
      <div style="margin-bottom: 8px;">
        <label style="display:block;margin-bottom:4px;">点大小: <span id="point-size-value">1.5</span></label>
        <input type="range" id="point-size" min="0.1" max="5" step="0.1" value="1.5" style="width:100%;">
      </div>
      <div style="margin-bottom: 8px;">
        <label style="display:block;margin-bottom:4px;">背景色</label>
        <select id="bg-color" style="width:100%;padding:4px;">
          <option value="0x0a0a1a">深蓝</option>
          <option value="0x1a1a2e">深灰蓝</option>
          <option value="0xffffff">白色</option>
          <option value="0x000000">黑色</option>
        </select>
      </div>
    `;
    
    this.container.appendChild(panel);
  }

  _createStatsPanel() {
    const panel = document.createElement('div');
    panel.id = 'stats-panel';
    panel.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(20, 20, 40, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 11px;
      z-index: 100;
      min-width: 200px;
    `;
    
    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; color: #4fc3f7;">📊 性能统计</h3>
      <div id="stats-content"></div>
    `;
    
    this.container.appendChild(panel);
  }

  _createLayerPanel() {
    const panel = document.createElement('div');
    panel.id = 'layer-panel';
    panel.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(20, 20, 40, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 100;
      min-width: 250px;
    `;
    
    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; color: #4fc3f7;">📚 图层控制</h3>
      <div id="layer-list"></div>
    `;
    
    this.container.appendChild(panel);
  }

  _createSelectionPanel() {
    const panel = document.createElement('div');
    panel.id = 'selection-panel';
    panel.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(20, 20, 40, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 100;
      min-width: 250px;
      max-height: 400px;
      overflow-y: auto;
    `;
    
    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; color: #ff9800;">🎯 筛选与高亮</h3>
      
      <div style="margin-bottom: 12px; padding: 8px; background: rgba(255,152,0,0.1); border-radius: 4px;">
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">💡 框选: Shift+左键拖拽</div>
      </div>
      
      <div style="margin-bottom: 10px;">
        <label style="display:block;margin-bottom:4px;color:#ff9800;">高亮颜色</label>
        <input type="color" id="highlight-color" value="#ffff00" style="width:100%;height:24px;border:none;background:transparent;cursor:pointer;">
      </div>
      
      <div style="margin-bottom: 10px;">
        <label style="display:block;margin-bottom:4px;color:#00bcd4;">选中颜色</label>
        <input type="color" id="selected-color" value="#00ffff" style="width:100%;height:24px;border:none;background:transparent;cursor:pointer;">
      </div>
      
      <div style="margin-bottom: 10px; padding-top: 10px; border-top: 1px solid #333;">
        <div style="font-weight:bold; margin-bottom: 6px;">🔍 属性筛选</div>
        <label style="display:block;margin-bottom:4px;">属性:</label>
        <select id="filter-attr" style="width:100%;padding:4px;margin-bottom:6px;">
          <option value="lodLevel">LOD 级别</option>
          <option value="intensity">强度</option>
          <option value="position">Z 高度</option>
        </select>
        <div style="display:flex;gap:4px;margin-bottom:6px;">
          <input type="number" id="filter-min" placeholder="最小" style="width:50%;padding:4px;background:#333;border:1px solid #555;color:white;border-radius:2px;">
          <input type="number" id="filter-max" placeholder="最大" style="width:50%;padding:4px;background:#333;border:1px solid #555;color:white;border-radius:2px;">
        </div>
        <div style="display:flex;gap:4px;">
          <button id="btn-filter-highlight" style="flex:1;padding:4px;background:#ff9800;border:none;color:white;border-radius:2px;cursor:pointer;font-size:11px;">筛选高亮</button>
          <button id="btn-filter-select" style="flex:1;padding:4px;background:#00bcd4;border:none;color:white;border-radius:2px;cursor:pointer;font-size:11px;">筛选选中</button>
        </div>
      </div>
      
      <div style="margin-bottom: 10px; padding-top: 10px; border-top: 1px solid #333;">
        <div style="display:flex;gap:4px;">
          <button id="btn-clear-highlight" style="flex:1;padding:4px;background:#f44336;border:none;color:white;border-radius:2px;cursor:pointer;font-size:11px;">清除高亮</button>
          <button id="btn-clear-select" style="flex:1;padding:4px;background:#9c27b0;border:none;color:white;border-radius:2px;cursor:pointer;font-size:11px;">清除选中</button>
        </div>
      </div>
      
      <div style="margin-bottom: 10px; padding-top: 10px; border-top: 1px solid #333;">
        <button id="btn-isolate" style="width:100%;padding:6px;background:#795548;border:none;color:white;border-radius:4px;cursor:pointer;">
          🔍 隔离显示选中
        </button>
        <button id="btn-restore-visibility" style="width:100%;padding:6px;background:#607d8b;border:none;color:white;border-radius:4px;cursor:pointer;margin-top:4px;">
          👁️ 恢复全部显示
        </button>
      </div>
      
      <div id="selection-summary" style="padding-top: 10px; border-top: 1px solid #333; font-size: 11px;">
        <div style="margin-bottom:4px;">已选中: <span id="selected-count" style="color:#00bcd4;font-weight:bold;">0</span> 个点</div>
        <div style="margin-bottom:4px;">已高亮: <span id="highlighted-count" style="color:#ffff00;font-weight:bold;">0</span> 个点</div>
      </div>
      
      <div id="selection-details" style="margin-top: 8px; font-size: 10px; color: #aaa; max-height: 100px; overflow-y: auto;"></div>
    `;
    
    this.container.appendChild(panel);
  }

  _initEventListeners() {
    document.getElementById('btn-reset').addEventListener('click', () => {
      this.renderer.resetView();
    });

    document.getElementById('btn-reload').addEventListener('click', () => {
      this.layerManager.reloadAll();
    });

    document.getElementById('point-size').addEventListener('input', (e) => {
      const size = parseFloat(e.target.value);
      document.getElementById('point-size-value').textContent = size;
      this.layerManager.getAllLayers().forEach(layer => {
        this.layerManager.setLayerPointSize(layer.id, size);
      });
    });

    document.getElementById('bg-color').addEventListener('change', (e) => {
      this.renderer.scene.background = new THREE.Color(parseInt(e.target.value));
    });

    document.getElementById('highlight-color').addEventListener('input', (e) => {
      this.renderer.setHighlightColor(e.target.value);
    });

    document.getElementById('selected-color').addEventListener('input', (e) => {
      this.renderer.setSelectedColor(e.target.value);
    });

    document.getElementById('btn-filter-highlight').addEventListener('click', () => {
      this._applyFilter('highlight');
    });

    document.getElementById('btn-filter-select').addEventListener('click', () => {
      this._applyFilter('select');
    });

    document.getElementById('btn-clear-highlight').addEventListener('click', () => {
      this.renderer.clearHighlights();
      this._updateSelectionSummary();
    });

    document.getElementById('btn-clear-select').addEventListener('click', () => {
      this.renderer.clearSelection();
      this._updateSelectionSummary();
    });

    document.getElementById('btn-isolate').addEventListener('click', () => {
      this._isolateMode = true;
      this.renderer.isolateSelection();
    });

    document.getElementById('btn-restore-visibility').addEventListener('click', () => {
      this._isolateMode = false;
      this.renderer.restoreVisibility();
    });

    this.renderer.renderer.domElement.addEventListener('click', (e) => {
      if (!e.shiftKey) {
        this._handleClick(e);
      }
    });

    this.renderer.onBoxSelection((bounds) => {
      console.log('📦 Box selection bounds:', bounds);
      this._updateSelectionSummary();
    });
  }

  _applyFilter(mode) {
    const attr = document.getElementById('filter-attr').value;
    const min = parseFloat(document.getElementById('filter-min').value) || 0;
    const max = parseFloat(document.getElementById('filter-max').value) || 5;
    
    this._filterAttribute = attr;
    this._filterMin = min;
    this._filterMax = max;
    
    const layers = this.layerManager.getAllLayers();
    
    if (attr === 'position') {
      this._filterByHeight(min, max, mode);
    } else {
      for (const layer of layers) {
        if (layer.visible) {
          if (mode === 'highlight') {
            const indices = this.renderer.highlightByAttribute(layer.id, attr, min, max);
            console.log(`🎯 高亮 ${layer.id}: ${indices.length} 个点 (${attr} ${min}-${max})`);
          } else {
            const indices = this.renderer.filterByAttribute(layer.id, attr, min, max);
            this.renderer.selectPoints(layer.id, indices);
            console.log(`✅ 选中 ${layer.id}: ${indices.length} 个点 (${attr} ${min}-${max})`);
          }
        }
      }
    }
    
    this._updateSelectionSummary();
  }

  _filterByHeight(minZ, maxZ, mode) {
    const layers = this.layerManager.getAllLayers();
    
    for (const layer of layers) {
      if (!layer.visible) continue;
      
      const tiles = this.layerManager.loadedTiles;
      const indices = [];
      
      for (const [tileKey, tile] of tiles) {
        if (tile.layerId !== layer.id) continue;
        
        const pointCloud = this.renderer.pointClouds.get(tileKey);
        if (!pointCloud) continue;
        
        const posAttr = pointCloud.geometry.attributes.position;
        if (!posAttr) continue;
        
        const posArr = posAttr.array;
        const baseIdx = (tileKey in this._tileIndexOffsets) ? this._tileIndexOffsets[tileKey] : 0;
        
        for (let i = 0; i < posArr.length; i += 3) {
          const z = posArr[i + 2];
          if (z >= minZ && z <= maxZ) {
            indices.push(i / 3);
          }
        }
      }
      
      if (indices.length > 0) {
        if (mode === 'highlight') {
          this.renderer.highlightPoints(layer.id, indices);
        } else {
          this.renderer.selectPoints(layer.id, indices);
        }
        console.log(`${mode === 'highlight' ? '🎯 高亮' : '✅ 选中'} ${layer.id}: ${indices.length} 个点 (Z ${minZ}-${maxZ})`);
      }
    }
  }

  _handleClick(event) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const hits = this.renderer.raycast(event.clientX, event.clientY);
    
    if (hits.length > 0) {
      const hit = hits[0];
      const worldCoord = {
        x: hit.point.x.toFixed(2),
        y: hit.point.y.toFixed(2),
        z: hit.point.z.toFixed(2)
      };
      
      const lonLat = this.coordinateTransform.inverseTransformPoint(hit.point);
      
      console.log('📍 Point clicked:', {
        world: worldCoord,
        lonLat: lonLat,
        layer: hit.layerId,
        index: hit.index
      });
      
      if (event.ctrlKey) {
        const layerId = hit.layerId.split('_')[0];
        this.renderer.selectPoints(layerId, [hit.index]);
        this._updateSelectionSummary();
      }
    }
  }

  async _loadSampleData() {
    const layers = this.layerManager.getAllLayers();
    
    for (const layer of layers) {
      const sampleData = this._generateSamplePointCloud(layer.id);
      if (sampleData) {
        this.renderer.addPointCloud(
          `sample_${layer.id}`,
          sampleData,
          {
            visible: layer.visible,
            opacity: layer.opacity,
            pointSize: layer.pointSize,
            color: layer.color
          }
        );
      }
    }
  }

  _generateSamplePointCloud(layerId) {
    const pointCount = 50000;
    const points = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    const intensities = new Float32Array(pointCount);
    
    for (let i = 0; i < pointCount; i++) {
      let x, y, z, r, g, b, intensity;
      
      switch (layerId) {
        case 'terrain':
          x = (Math.random() - 0.5) * 800;
          y = (Math.random() - 0.5) * 800;
          z = Math.sin(x * 0.01) * Math.cos(y * 0.01) * 30 + Math.random() * 5;
          const height = (z + 30) / 60;
          r = 0.3 + height * 0.3;
          g = 0.2 + height * 0.4;
          b = 0.1 + height * 0.2;
          intensity = 0.5 + height * 0.5;
          break;
          
        case 'buildings':
          const gridX = Math.floor(Math.random() * 20) - 10;
          const gridY = Math.floor(Math.random() * 20) - 10;
          x = gridX * 40 + (Math.random() - 0.5) * 20;
          y = gridY * 40 + (Math.random() - 0.5) * 20;
          z = Math.random() * 100;
          r = 0.6 + Math.random() * 0.3;
          g = 0.6 + Math.random() * 0.3;
          b = 0.6 + Math.random() * 0.3;
          intensity = 0.7 + Math.random() * 0.3;
          break;
          
        case 'vegetation':
          x = (Math.random() - 0.5) * 600;
          y = (Math.random() - 0.5) * 600;
          z = Math.random() * 20;
          r = 0.1 + Math.random() * 0.2;
          g = 0.5 + Math.random() * 0.3;
          b = 0.1 + Math.random() * 0.2;
          intensity = 0.3 + Math.random() * 0.4;
          break;
          
        default:
          x = (Math.random() - 0.5) * 500;
          y = (Math.random() - 0.5) * 500;
          z = Math.random() * 100;
          r = Math.random();
          g = Math.random();
          b = Math.random();
          intensity = Math.random();
      }
      
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
      
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      
      intensities[i] = intensity;
    }
    
    return { points, colors, intensities };
  }

  _startStatsUpdate() {
    this._statsInterval = setInterval(() => {
      this._updateStats();
      this._updateLayerList();
      this._updateSelectionSummary();
    }, 500);
  }

  _updateStats() {
    const renderStats = this.renderer.getStats();
    const layerStats = this.layerManager.getStats();
    
    const memPercent = (renderStats.gpuMemoryMB / renderStats.maxGPUMemoryMB * 100).toFixed(0);
    const memColor = memPercent > 80 ? '#f44336' : memPercent > 60 ? '#ff9800' : '#4caf50';
    
    const loadingStatus = renderStats.loadingPaused ? '<span style="color:#f44336;">⏸️ 已暂停</span>' : '<span style="color:#4caf50;">▶️ 加载中</span>';
    
    const content = document.getElementById('stats-content');
    if (content) {
      content.innerHTML = `
        <div style="margin-bottom:4px;">FPS: <span style="color:#4caf50">${renderStats.fps || '-'}</span> ${loadingStatus}</div>
        <div style="margin-bottom:4px;">总点数: <span style="color:#ff9800">${renderStats.totalPoints.toLocaleString()}</span></div>
        <div style="margin-bottom:4px;">GPU内存: <span style="color:${memColor}">${renderStats.gpuMemoryMB.toFixed(1)}MB</span> / ${renderStats.maxGPUMemoryMB}MB (${memPercent}%)</div>
        <div style="margin-bottom:4px;">已驱逐: <span style="color:#ff5722">${renderStats.evictedCount.toLocaleString()}</span> pts</div>
        <div style="margin-bottom:4px;">图层数: <span style="color:#2196f3">${layerStats.layerCount}</span></div>
        <div style="margin-bottom:4px;">已加载瓦片: <span style="color:#9c27b0">${layerStats.loadedTiles}</span></div>
        <div style="margin-bottom:4px;">加载队列: <span style="color:#ff5722">${layerStats.loadingQueue}</span></div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
          <div style="margin-bottom:4px;">相机位置:</div>
          <div style="font-size:10px;color:#aaa;">
            X: ${this.renderer.camera.position.x.toFixed(1)}<br>
            Y: ${this.renderer.camera.position.y.toFixed(1)}<br>
            Z: ${this.renderer.camera.position.z.toFixed(1)}
          </div>
        </div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
          <div style="margin-bottom:4px;">LOD级别: <span style="color:#e91e63">${this.renderer.getCurrentLodLevel()}</span></div>
        </div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
          <div style="margin-bottom:4px;color:#00bcd4;">选中: ${renderStats.selectedCount.toLocaleString()} 点</div>
          <div style="margin-bottom:4px;color:#ffeb3b;">高亮: ${renderStats.highlightedCount.toLocaleString()} 点</div>
        </div>
      `;
    }
  }

  _updateLayerList() {
    const layers = this.layerManager.getAllLayers();
    const layerList = document.getElementById('layer-list');
    
    if (layerList) {
      layerList.innerHTML = layers.map(layer => `
        <div style="margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.05);border-radius:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" ${layer.visible ? 'checked' : ''} 
                onchange="window.pointCloudApp.setLayerVisibility('${layer.id}', this.checked)">
              <span>${layer.name}</span>
            </label>
            <span style="font-size:10px;color:#888;">${layer.tileCount} 瓦片</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#888;width:30px;">不透明度</span>
            <input type="range" min="0" max="1" step="0.1" value="${layer.opacity}" 
              onchange="window.pointCloudApp.setLayerOpacity('${layer.id}', parseFloat(this.value))"
              style="flex:1;height:4px;">
          </div>
        </div>
      `).join('');
    }
  }

  _updateSelectionSummary() {
    const renderStats = this.renderer.getStats();
    const selected = this.renderer.getSelectedPoints();
    
    const selCountEl = document.getElementById('selected-count');
    const hiCountEl = document.getElementById('highlighted-count');
    const detailsEl = document.getElementById('selection-details');
    
    if (selCountEl) selCountEl.textContent = renderStats.selectedCount.toLocaleString();
    if (hiCountEl) hiCountEl.textContent = renderStats.highlightedCount.toLocaleString();
    
    if (detailsEl) {
      const details = [];
      for (const [layerId, indices] of Object.entries(selected)) {
        const shortId = layerId.split('_').slice(-2).join('_');
        details.push(`<div style="margin-bottom:2px;">${shortId}: ${indices.length} 点</div>`);
      }
      detailsEl.innerHTML = details.join('');
    }
  }

  setLayerVisibility(layerId, visible) {
    this.layerManager.setLayerVisibility(layerId, visible);
  }

  setLayerOpacity(layerId, opacity) {
    this.layerManager.setLayerOpacity(layerId, opacity);
  }

  async dispose() {
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
    }
    
    this.layerManager.dispose();
    this.renderer.dispose();
    this.serviceFactory.dispose();
    
    console.log('👋 Point Cloud App disposed');
  }
}

import * as THREE from 'three';
window.THREE = THREE;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('point-cloud-container');
  if (container) {
    window.pointCloudApp = new PointCloudApp(container);
    await window.pointCloudApp.initialize();
  }
});

export default PointCloudApp;
