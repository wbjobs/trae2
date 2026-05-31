import APIClient from './APIClient.js';

class SpatialIndexClient extends APIClient {
  constructor(options = {}) {
    super({
      baseURL: options.baseURL || '/spatial-index/api',
      ...options
    });
  }

  async indexTile(layerId, tile) {
    return this.post(`/index/tile/${layerId}`, tile);
  }

  async indexTiles(layerId, tiles) {
    return this.post(`/index/tiles/${layerId}`, tiles);
  }

  async queryByBounds(layerId, bounds) {
    return this.post(`/query/bounds/${layerId}`, bounds);
  }

  async queryByPoint(layerId, x, y, z, tolerance = 1) {
    return this.post(`/query/point/${layerId}`, {
      x, y, z, tolerance
    });
  }

  async queryByRadius(layerId, centerX, centerY, centerZ, radius) {
    return this.post(`/query/radius/${layerId}`, {
      centerX, centerY, centerZ, radius
    });
  }

  async queryViewTiles(layerId, viewBounds, lodLevel) {
    return this.post(`/query/view/${layerId}`, {
      viewBounds,
      lodLevel
    });
  }

  async queryMultipleLayers(layerIds, bounds) {
    return this.post('/query/multi', {
      layerIds,
      bounds
    });
  }

  async clearIndex(layerId) {
    return this.delete(`/index/${layerId}`);
  }

  async clearAllIndices() {
    return this.delete('/index');
  }

  async getIndexStats(layerId) {
    return this.get(`/stats/${layerId}`);
  }

  async getAllStats() {
    return this.get('/stats');
  }

  async getLayers() {
    return this.get('/layers');
  }

  async getLayer(layerId) {
    return this.get(`/layers/${layerId}`);
  }

  async updateLayer(layerId, updates) {
    return this.put(`/layers/${layerId}`, updates);
  }

  async addLayer(layerConfig) {
    return this.post('/layers', layerConfig);
  }

  async removeLayer(layerId) {
    return this.delete(`/layers/${layerId}`);
  }

  async synchronizeLayer(layerId) {
    return this.get(`/synchronize/${layerId}`);
  }

  async getHealth() {
    return this.get('/health');
  }
}

export default SpatialIndexClient;
