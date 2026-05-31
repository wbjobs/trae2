import CoordinateTransform from '../coordinate/CoordinateTransform.js';

class LayerManager {
  constructor(renderer, apiClient) {
    this.renderer = renderer;
    this.apiClient = apiClient;
    this.layers = new Map();
    this.loadedTiles = new Map();
    this.coordinateTransform = new CoordinateTransform();
    this.loadingQueue = [];
    this.maxConcurrentLoads = 4;
    this.activeLoads = 0;
    this.viewUpdateInterval = null;
    this.lastViewBounds = null;
    this.lastLodLevel = -1;
    this._preloadRequested = new Set();
    this._preloadCooldown = 0;
    
    this._init();
  }

  _init() {
    this.viewUpdateInterval = setInterval(
      () => this._updateView(),
      500
    );

    this.renderer.onEvict((evictedLayerId) => {
      this.loadedTiles.delete(evictedLayerId);
      
      const parts = evictedLayerId.split('_');
      const layerId = parts.slice(0, parts.length - 4).join('_');
      const layer = this.layers.get(layerId);
      if (layer) {
        layer.tiles.delete(evictedLayerId);
      }
    });

    this.renderer.onBoxSelection((bounds) => {
      const selected = this.renderer.selectByBounds(bounds);
      console.log('Box selection result:', selected);
    });
  }

  async initialize() {
    try {
      const response = await this.apiClient.getLayers();
      if (response.success && response.data) {
        for (const layerConfig of response.data) {
          this.layers.set(layerConfig.id, {
            ...layerConfig,
            loaded: false,
            loading: false,
            tiles: new Set()
          });
        }
      }
      return this.layers;
    } catch (error) {
      console.error('Failed to initialize layers:', error);
      return this.layers;
    }
  }

  async addLayer(layerConfig) {
    const layer = {
      id: layerConfig.id,
      name: layerConfig.name || layerConfig.id,
      visible: layerConfig.visible !== undefined ? layerConfig.visible : true,
      opacity: layerConfig.opacity || 1.0,
      pointSize: layerConfig.pointSize || 1,
      color: layerConfig.color || null,
      bounds: layerConfig.bounds,
      loaded: false,
      loading: false,
      tiles: new Set()
    };

    this.layers.set(layer.id, layer);
    
    try {
      await this.apiClient.addLayer(layerConfig);
    } catch (e) {
      console.warn('Could not sync layer with server:', e);
    }
    
    return layer;
  }

  async removeLayer(layerId) {
    this.renderer.removePointCloud(layerId);
    this.layers.delete(layerId);
    
    for (const [tileKey, tile] of this.loadedTiles) {
      if (tile.layerId === layerId) {
        this.loadedTiles.delete(tileKey);
      }
    }
    
    try {
      await this.apiClient.removeLayer(layerId);
    } catch (e) {
      console.warn('Could not remove layer from server:', e);
    }
    
    return true;
  }

  getLayer(layerId) {
    return this.layers.get(layerId);
  }

  getAllLayers() {
    return Array.from(this.layers.values());
  }

  setLayerVisibility(layerId, visible) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
      this.renderer.setLayerVisibility(layerId, visible);
      
      this.apiClient.updateLayer(layerId, { visible }).catch(() => {});
      
      if (visible && !layer.loaded && !layer.loading) {
        this._loadLayerTiles(layerId);
      }
      
      return true;
    }
    return false;
  }

  setLayerOpacity(layerId, opacity) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.opacity = opacity;
      this.renderer.setLayerOpacity(layerId, opacity);
      this.apiClient.updateLayer(layerId, { opacity }).catch(() => {});
      return true;
    }
    return false;
  }

  setLayerPointSize(layerId, pointSize) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.pointSize = pointSize;
      this.renderer.setLayerPointSize(layerId, pointSize);
      this.apiClient.updateLayer(layerId, { pointSize }).catch(() => {});
      return true;
    }
    return false;
  }

  setLayerColor(layerId, color) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.color = color;
      this.renderer.setLayerColor(layerId, color);
      this.apiClient.updateLayer(layerId, { color }).catch(() => {});
      return true;
    }
    return false;
  }

  async _updateView() {
    if (this.renderer.isLoadingPaused()) {
      return;
    }
    
    const viewBounds = this.renderer.getViewBounds();
    const lodLevel = this.renderer.getCurrentLodLevel();
    
    const boundsChanged = this._boundsChanged(viewBounds, this.lastViewBounds);
    const lodChanged = lodLevel !== this.lastLodLevel;
    
    if (!boundsChanged && !lodChanged) {
      return;
    }
    
    this.lastViewBounds = viewBounds;
    this.lastLodLevel = lodLevel;
    
    const camPos = this.renderer.camera.position;
    const dist = this.renderer.controls.getDistance();
    if (this._lastCameraDist !== undefined) {
      const distDelta = Math.abs(dist - this._lastCameraDist);
      const posDelta = camPos.distanceTo(this._lastCameraPos || camPos);
      if (distDelta > 500 || posDelta > 500) {
        this._lastCameraPos = camPos.clone();
        this._lastCameraDist = dist;
        return;
      }
    }
    this._lastCameraPos = camPos.clone();
    this._lastCameraDist = dist;
    
    const expandedBounds = this.renderer.getViewBoundsExpanded(1.5);
    
    for (const [layerId, layer] of this.layers) {
      if (layer.visible) {
        this._loadVisibleTiles(layerId, expandedBounds, lodLevel);
      }
    }
    
    this._preloadCooldown++;
    if (this._preloadCooldown >= 3) {
      this._preloadCooldown = 0;
      this._requestPreload();
    }
    
    this._unloadOutOfViewTiles(viewBounds, lodLevel);
  }

  _requestPreload() {
    const preloadBounds = this.renderer.predictPreloadBounds();
    const lodLevel = this.renderer.getCurrentLodLevel();
    
    for (const [layerId, layer] of this.layers) {
      if (!layer.visible) continue;
      
      const key = `${layerId}_${lodLevel}_${preloadBounds.minX}_${preloadBounds.minY}`;
      if (this._preloadRequested.has(key)) continue;
      this._preloadRequested.add(key);
      
      setTimeout(() => {
        this._preloadTiles(layerId, preloadBounds, Math.max(0, lodLevel - 1));
      }, 200);
    }
    
    if (this._preloadRequested.size > 100) {
      const keys = Array.from(this._preloadRequested.keys());
      for (let i = 0; i < 50; i++) {
        this._preloadRequested.delete(keys[i]);
      }
    }
  }

  async _preloadTiles(layerId, bounds, lodLevel) {
    try {
      const queryResponse = await this.apiClient.queryViewTiles(
        layerId,
        bounds,
        lodLevel
      );
      
      if (queryResponse.success && queryResponse.data) {
        for (const tileInfo of queryResponse.data) {
          const tileKey = `${layerId}_${tileInfo.x}_${tileInfo.y}_${tileInfo.z}_${tileInfo.lod}`;
          
          if (!this.loadedTiles.has(tileKey) && !this.loadingQueue.some(t => t.tileKey === tileKey)) {
            this.loadingQueue.push({
              layerId,
              tileInfo,
              tileKey,
              priority: 1,
              preload: true
            });
          }
        }
        this._processQueue();
      }
    } catch (error) {
    }
  }

  _boundsChanged(b1, b2) {
    if (!b1 || !b2) return true;
    const threshold = 50;
    return (
      Math.abs(b1.minX - b2.minX) > threshold ||
      Math.abs(b1.minY - b2.minY) > threshold ||
      Math.abs(b1.minZ - b2.minZ) > threshold ||
      Math.abs(b1.maxX - b2.maxX) > threshold ||
      Math.abs(b1.maxY - b2.maxY) > threshold ||
      Math.abs(b1.maxZ - b2.maxZ) > threshold
    );
  }

  async _loadVisibleTiles(layerId, viewBounds, lodLevel) {
    try {
      const queryResponse = await this.apiClient.queryViewTiles(
        layerId,
        viewBounds,
        lodLevel
      );
      
      if (queryResponse.success && queryResponse.data) {
        for (const tileInfo of queryResponse.data) {
          const tileKey = `${layerId}_${tileInfo.x}_${tileInfo.y}_${tileInfo.z}_${tileInfo.lod}`;
          
          if (!this.loadedTiles.has(tileKey)) {
            this._queueTileLoad(layerId, tileInfo, 0);
          }
        }
      }
    } catch (error) {
      console.error('Failed to query view tiles:', error);
    }
  }

  _queueTileLoad(layerId, tileInfo, priority = 0) {
    const loadTask = {
      layerId,
      tileInfo,
      tileKey: `${layerId}_${tileInfo.x}_${tileInfo.y}_${tileInfo.z}_${tileInfo.lod}`,
      priority
    };
    
    const maxQueueSize = 80;
    if (this.loadingQueue.length >= maxQueueSize && priority === 0) {
      const filtered = this.loadingQueue.filter(t => t.preload);
      if (filtered.length < this.loadingQueue.length) {
        this.loadingQueue = filtered.concat(
          this.loadingQueue.filter(t => !t.preload).slice(0, maxQueueSize - filtered.length)
        );
      } else {
        return;
      }
    }
    
    if (!this.loadingQueue.some(t => t.tileKey === loadTask.tileKey)) {
      if (priority === 0) {
        this.loadingQueue.unshift(loadTask);
      } else {
        this.loadingQueue.push(loadTask);
      }
      this._processQueue();
    }
  }

  async _processQueue() {
    if (this.activeLoads >= this.maxConcurrentLoads || this.loadingQueue.length === 0) {
      return;
    }
    
    if (this.renderer.isLoadingPaused()) {
      setTimeout(() => this._processQueue(), 100);
      return;
    }
    
    let loadTask = null;
    for (let i = 0; i < this.loadingQueue.length; i++) {
      const task = this.loadingQueue[i];
      const layer = this.layers.get(task.layerId);
      if (!layer || !layer.visible) {
        this.loadingQueue.splice(i, 1);
        i--;
        continue;
      }
      
      const bounds = this.renderer.getViewBoundsExpanded(1.5);
      const tileBounds = this._getTileBounds(task.tileInfo);
      if (this._tileInView({ bounds: tileBounds }, bounds) || task.priority === 0) {
        loadTask = task;
        this.loadingQueue.splice(i, 1);
        break;
      }
    }
    
    if (!loadTask) {
      return;
    }
    
    this.activeLoads++;
    
    try {
      await this._loadTile(loadTask.layerId, loadTask.tileInfo, loadTask.tileKey);
    } catch (error) {
      console.error(`Failed to load tile ${loadTask.tileKey}:`, error);
    } finally {
      this.activeLoads--;
      await new Promise(resolve => setTimeout(resolve, 16));
      this._processQueue();
    }
  }

  _getTileBounds(tileInfo) {
    const baseSize = 100 * Math.pow(2, tileInfo.lod || 0);
    return {
      minX: tileInfo.x * baseSize,
      minY: tileInfo.y * baseSize,
      minZ: (tileInfo.z || 0) * baseSize,
      maxX: (tileInfo.x + 1) * baseSize,
      maxY: (tileInfo.y + 1) * baseSize,
      maxZ: ((tileInfo.z || 0) + 1) * baseSize
    };
  }

  async _loadTile(layerId, tileInfo, tileKey) {
    const response = await this.apiClient.getTile(
      layerId,
      tileInfo.x,
      tileInfo.y,
      tileInfo.z,
      tileInfo.lod
    );
    
    if (response.success && response.data && response.data.points && response.data.points.length > 0) {
      const tileData = response.data;
      const layer = this.layers.get(layerId);
      
      const result = this.renderer.addPointCloud(
        tileKey,
        {
          points: new Float32Array(tileData.points),
          colors: tileData.colors ? new Float32Array(tileData.colors) : null,
          normals: tileData.normals ? new Float32Array(tileData.normals) : null,
          intensities: tileData.intensities ? new Float32Array(tileData.intensities) : null,
          lod: tileInfo.lod
        },
        {
          visible: layer ? layer.visible : true,
          opacity: layer ? layer.opacity : 1.0,
          pointSize: layer ? layer.pointSize : 1,
          color: layer ? layer.color : null
        }
      );
      
      if (result) {
        this.loadedTiles.set(tileKey, {
          layerId,
          tileInfo,
          bounds: tileData.bounds || this._getTileBounds(tileInfo),
          loadedAt: Date.now()
        });
        
        if (layer) {
          layer.tiles.add(tileKey);
          layer.loaded = true;
        }
      }
    }
  }

  _unloadOutOfViewTiles(viewBounds, lodLevel) {
    const maxLoadedTiles = 60;
    const maxTotalPoints = 1500000;
    const renderStats = this.renderer.getStats();
    
    const tilesToUnload = [];
    
    for (const [tileKey, tile] of this.loadedTiles) {
      if (!this._tileInView(tile, viewBounds) || tile.tileInfo.lod < lodLevel - 2) {
        tilesToUnload.push(tileKey);
      }
    }
    
    tilesToUnload.sort((a, b) => {
      return this.loadedTiles.get(a).loadedAt - this.loadedTiles.get(b).loadedAt;
    });
    
    let tilesToUnloadCount = 0;
    
    if (this.loadedTiles.size > maxLoadedTiles) {
      tilesToUnloadCount = this.loadedTiles.size - maxLoadedTiles;
    }
    
    if (renderStats.totalPoints > maxTotalPoints) {
      const excessRatio = renderStats.totalPoints / maxTotalPoints;
      tilesToUnloadCount = Math.max(
        tilesToUnloadCount,
        Math.floor(tilesToUnload.length * Math.min(excessRatio - 1, 0.5))
      );
    }
    
    const actualToUnload = tilesToUnload.slice(0, Math.max(tilesToUnloadCount, 10));
    
    for (const tileKey of actualToUnload) {
      this._unloadTile(tileKey);
    }
  }

  _tileInView(tile, viewBounds) {
    const b = tile.bounds;
    if (!b) return true;
    return !(
      b.maxX < viewBounds.minX ||
      b.minX > viewBounds.maxX ||
      b.maxY < viewBounds.minY ||
      b.minY > viewBounds.maxY ||
      b.maxZ < viewBounds.minZ ||
      b.minZ > viewBounds.maxZ
    );
  }

  _unloadTile(tileKey) {
    this.renderer.removePointCloud(tileKey);
    
    const tile = this.loadedTiles.get(tileKey);
    if (tile) {
      const layer = this.layers.get(tile.layerId);
      if (layer) {
        layer.tiles.delete(tileKey);
      }
    }
    
    this.loadedTiles.delete(tileKey);
  }

  async _loadLayerTiles(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer || layer.loading) return;
    
    layer.loading = true;
    
    try {
      const viewBounds = this.renderer.getViewBoundsExpanded(1.5);
      const lodLevel = this.renderer.getCurrentLodLevel();
      await this._loadVisibleTiles(layerId, viewBounds, lodLevel);
    } finally {
      layer.loading = false;
    }
  }

  async reloadLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    
    for (const tileKey of layer.tiles) {
      this._unloadTile(tileKey);
    }
    
    layer.tiles.clear();
    layer.loaded = false;
    
    if (layer.visible) {
      await this._loadLayerTiles(layerId);
    }
  }

  async loadAllLayers() {
    for (const [layerId, layer] of this.layers) {
      if (layer.visible && !layer.loaded) {
        await this._loadLayerTiles(layerId);
      }
    }
  }

  async reloadAll() {
    for (const [layerId] of this.layers) {
      await this.reloadLayer(layerId);
    }
  }

  clearAll() {
    for (const [tileKey] of this.loadedTiles) {
      this.renderer.removePointCloud(tileKey);
    }
    this.loadedTiles.clear();
    
    for (const [, layer] of this.layers) {
      layer.tiles.clear();
      layer.loaded = false;
    }
    
    this.loadingQueue = [];
    this._preloadRequested.clear();
  }

  getStats() {
    return {
      layerCount: this.layers.size,
      loadedTiles: this.loadedTiles.size,
      loadingQueue: this.loadingQueue.length,
      activeLoads: this.activeLoads,
      preloadRequested: this._preloadRequested.size,
      layers: this.getAllLayers().map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        loaded: l.loaded,
        tileCount: l.tiles.size,
        opacity: l.opacity,
        pointSize: l.pointSize
      }))
    };
  }

  dispose() {
    if (this.viewUpdateInterval) {
      clearInterval(this.viewUpdateInterval);
    }
    this.clearAll();
    this.layers.clear();
  }
}

export default LayerManager;
