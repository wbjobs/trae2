import TileServiceClient from './TileServiceClient.js';
import SpatialIndexClient from './SpatialIndexClient.js';

class ServiceFactory {
  constructor(config = {}) {
    this.config = {
      tileServiceURL: config.tileServiceURL || '/tile-service/api',
      spatialIndexURL: config.spatialIndexURL || '/spatial-index/api',
      gatewayURL: config.gatewayURL || '/api',
      ...config
    };

    this._clients = new Map();
  }

  getTileService() {
    if (!this._clients.has('tile')) {
      this._clients.set('tile', new TileServiceClient({
        baseURL: this.config.tileServiceURL
      }));
    }
    return this._clients.get('tile');
  }

  getSpatialIndexService() {
    if (!this._clients.has('spatial')) {
      this._clients.set('spatial', new SpatialIndexClient({
        baseURL: this.config.spatialIndexURL
      }));
    }
    return this._clients.get('spatial');
  }

  getTile(layerId, x, y, z, lod) {
    return this.getTileService().getTile(layerId, x, y, z, lod);
  }

  getTilesByBounds(layerId, bounds, lod) {
    return this.getTileService().getTilesByBounds(layerId, bounds, lod);
  }

  getLayers() {
    return this.getTileService().getLayers();
  }

  queryViewTiles(layerId, viewBounds, lodLevel) {
    return this.getSpatialIndexService().queryViewTiles(layerId, viewBounds, lodLevel);
  }

  queryByBounds(layerId, bounds) {
    return this.getSpatialIndexService().queryByBounds(layerId, bounds);
  }

  queryByPoint(layerId, x, y, z, tolerance) {
    return this.getSpatialIndexService().queryByPoint(layerId, x, y, z, tolerance);
  }

  queryByRadius(layerId, centerX, centerY, centerZ, radius) {
    return this.getSpatialIndexService().queryByRadius(layerId, centerX, centerY, centerZ, radius);
  }

  queryMultipleLayers(layerIds, bounds) {
    return this.getSpatialIndexService().queryMultipleLayers(layerIds, bounds);
  }

  updateLayer(layerId, updates) {
    return this.getSpatialIndexService().updateLayer(layerId, updates);
  }

  addLayer(layerConfig) {
    return this.getSpatialIndexService().addLayer(layerConfig);
  }

  removeLayer(layerId) {
    return this.getSpatialIndexService().removeLayer(layerId);
  }

  async checkHealth() {
    const health = {};
    
    try {
      const tileHealth = await this.getTileService().getHealth();
      health.tileService = tileHealth;
    } catch (e) {
      health.tileService = { status: 'unhealthy', error: e.message };
    }
    
    try {
      const spatialHealth = await this.getSpatialIndexService().getHealth();
      health.spatialIndexService = spatialHealth;
    } catch (e) {
      health.spatialIndexService = { status: 'unhealthy', error: e.message };
    }
    
    return health;
  }

  dispose() {
    this._clients.clear();
  }
}

export default ServiceFactory;
