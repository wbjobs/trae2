import APIClient from './APIClient.js';

class TileServiceClient extends APIClient {
  constructor(options = {}) {
    super({
      baseURL: options.baseURL || '/tile-service/api',
      ...options
    });
  }

  async getTile(layerId, x, y, z, lod) {
    return this.get(`/tile/${layerId}/${lod}/${x}/${y}/${z}`);
  }

  async getTilesByBounds(layerId, bounds, lod) {
    return this.post('/tiles/bounds', {
      layerId,
      bounds,
      lod
    });
  }

  async getLayerInfo(layerId) {
    return this.get(`/layer/${layerId}`);
  }

  async getLayers() {
    return this.get('/layers');
  }

  async getHealth() {
    return this.get('/health');
  }

  async clearCache() {
    return this.get('/cache/clear');
  }

  async getCacheStats() {
    return this.get('/cache/stats');
  }
}

export default TileServiceClient;
