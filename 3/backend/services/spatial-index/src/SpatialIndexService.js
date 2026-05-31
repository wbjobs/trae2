const RTreeIndex = require('./RTreeIndex');

class SpatialIndexService {
  constructor() {
    this.indices = new Map();
    this.layers = new Map();
    this._initializeDefaultLayers();
  }

  _initializeDefaultLayers() {
    this.layers.set('terrain', {
      id: 'terrain',
      name: '地形点云',
      visible: true,
      opacity: 1.0,
      pointSize: 1,
      color: null,
      bounds: { minX: -1000, minY: -1000, minZ: -100, maxX: 1000, maxY: 1000, maxZ: 50 }
    });

    this.layers.set('buildings', {
      id: 'buildings',
      name: '建筑点云',
      visible: true,
      opacity: 1.0,
      pointSize: 1.5,
      color: null,
      bounds: { minX: -500, minY: -500, minZ: 0, maxX: 500, maxY: 500, maxZ: 200 }
    });

    this.layers.set('vegetation', {
      id: 'vegetation',
      name: '植被点云',
      visible: true,
      opacity: 0.8,
      pointSize: 1,
      color: [0, 200, 0],
      bounds: { minX: -800, minY: -800, minZ: 0, maxX: 800, maxY: 800, maxZ: 50 }
    });
  }

  getOrCreateIndex(layerId) {
    if (!this.indices.has(layerId)) {
      this.indices.set(layerId, new RTreeIndex(16));
    }
    return this.indices.get(layerId);
  }

  async indexTile(layerId, tile) {
    const index = this.getOrCreateIndex(layerId);
    const bounds = tile.bounds || this._calculateTileBounds(tile);
    
    return index.insert({
      bounds,
      data: {
        tileId: `${tile.x}_${tile.y}_${tile.z}_${tile.lod}`,
        x: tile.x,
        y: tile.y,
        z: tile.z,
        lod: tile.lod,
        pointCount: tile.pointCount || 0,
        layerId
      }
    });
  }

  async indexTilesBulk(layerId, tiles) {
    const index = this.getOrCreateIndex(layerId);
    const items = tiles.map(tile => ({
      bounds: tile.bounds || this._calculateTileBounds(tile),
      data: {
        tileId: `${tile.x}_${tile.y}_${tile.z}_${tile.lod}`,
        x: tile.x,
        y: tile.y,
        z: tile.z,
        lod: tile.lod,
        pointCount: tile.pointCount || 0,
        layerId
      }
    }));
    
    return index.insertBulk(items);
  }

  _calculateTileBounds(tile) {
    const baseSize = 100;
    const size = baseSize * Math.pow(2, tile.lod || 0);
    return {
      minX: tile.x * size,
      minY: tile.y * size,
      minZ: (tile.z || 0) * size,
      maxX: (tile.x + 1) * size,
      maxY: (tile.y + 1) * size,
      maxZ: (tile.z || 0 + 1) * size
    };
  }

  queryByBounds(layerId, bounds) {
    const index = this.indices.get(layerId);
    if (!index) return [];
    
    const results = index.search(bounds);
    return results.map(r => ({
      ...r.data,
      bounds: {
        minX: r.minX,
        minY: r.minY,
        minZ: r.minZ,
        maxX: r.maxX,
        maxY: r.maxY,
        maxZ: r.maxZ
      }
    }));
  }

  queryByPoint(layerId, x, y, z, tolerance = 1) {
    const index = this.indices.get(layerId);
    if (!index) return [];
    
    const results = index.searchByPoint(x, y, z, tolerance);
    return results.map(r => r.data);
  }

  queryByRadius(layerId, centerX, centerY, centerZ, radius) {
    const index = this.indices.get(layerId);
    if (!index) return [];
    
    const results = index.searchByRadius(centerX, centerY, centerZ, radius);
    return results.map(r => r.data);
  }

  queryForView(layerId, viewBounds, lodLevel) {
    const tiles = this.queryByBounds(layerId, viewBounds);
    return tiles.filter(tile => tile.lod <= lodLevel);
  }

  queryMultipleLayers(layerIds, bounds) {
    const results = {};
    for (const layerId of layerIds) {
      results[layerId] = this.queryByBounds(layerId, bounds);
    }
    return results;
  }

  clearIndex(layerId) {
    const index = this.indices.get(layerId);
    if (index) {
      index.clear();
      return true;
    }
    return false;
  }

  clearAllIndices() {
    this.indices.forEach(index => index.clear());
    this.indices.clear();
  }

  getIndexStats(layerId) {
    const index = this.indices.get(layerId);
    return {
      exists: !!index,
      size: index ? index.size : 0,
      bounds: index ? index.getBounds() : null
    };
  }

  getAllStats() {
    const stats = {};
    this.indices.forEach((index, layerId) => {
      stats[layerId] = {
        size: index.size,
        bounds: index.getBounds()
      };
    });
    return stats;
  }

  getLayers() {
    return Array.from(this.layers.values());
  }

  getLayer(layerId) {
    return this.layers.get(layerId);
  }

  updateLayer(layerId, updates) {
    const layer = this.layers.get(layerId);
    if (layer) {
      Object.assign(layer, updates);
      return layer;
    }
    return null;
  }

  addLayer(layerConfig) {
    if (!layerConfig.id) {
      throw new Error('Layer id is required');
    }
    const layer = {
      id: layerConfig.id,
      name: layerConfig.name || layerConfig.id,
      visible: layerConfig.visible !== undefined ? layerConfig.visible : true,
      opacity: layerConfig.opacity || 1.0,
      pointSize: layerConfig.pointSize || 1,
      color: layerConfig.color || null,
      bounds: layerConfig.bounds || { minX: -1000, minY: -1000, minZ: -100, maxX: 1000, maxY: 1000, maxZ: 200 }
    };
    this.layers.set(layer.id, layer);
    return layer;
  }

  removeLayer(layerId) {
    this.clearIndex(layerId);
    return this.layers.delete(layerId);
  }
}

module.exports = SpatialIndexService;
