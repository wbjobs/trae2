const fs = require('fs');
const path = require('path');

class TileLoader {
  constructor(dataDir = '../../../data') {
    this.dataDir = path.resolve(__dirname, dataDir);
    this.tileCache = new Map();
    this.cacheSize = 100;
  }

  getTileKey(layerId, x, y, z, lod) {
    return `${layerId}_${x}_${y}_${z}_${lod}`;
  }

  async loadTile(layerId, x, y, z, lod) {
    const key = this.getTileKey(layerId, x, y, z, lod);
    
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key);
    }

    const tilePath = this.getTilePath(layerId, x, y, z, lod);
    
    try {
      const tileData = await this.readTileFile(tilePath);
      this.cacheTile(key, tileData);
      return tileData;
    } catch (error) {
      return this.generateEmptyTile(x, y, z, lod);
    }
  }

  getTilePath(layerId, x, y, z, lod) {
    return path.join(
      this.dataDir,
      layerId,
      `lod_${lod}`,
      `tile_${x}_${y}_${z}.json`
    );
  }

  async readTileFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) reject(err);
        else resolve(JSON.parse(data));
      });
    });
  }

  async loadTilesByBounds(layerId, bounds, lod) {
    const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
    const tileSize = this.getTileSizeForLod(lod);
    
    const startX = Math.floor(minX / tileSize);
    const startY = Math.floor(minY / tileSize);
    const startZ = Math.floor(minZ / tileSize);
    const endX = Math.ceil(maxX / tileSize);
    const endY = Math.ceil(maxY / tileSize);
    const endZ = Math.ceil(maxZ / tileSize);

    const tiles = [];
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        for (let z = startZ; z < endZ; z++) {
          try {
            const tile = await this.loadTile(layerId, x, y, z, lod);
            if (tile && tile.points && tile.points.length > 0) {
              tiles.push(tile);
            }
          } catch (e) {
            console.warn(`Tile not found: ${layerId}/${x}/${y}/${z}/${lod}`);
          }
        }
      }
    }
    return tiles;
  }

  getTileSizeForLod(lod) {
    const baseSize = 100;
    return baseSize * Math.pow(2, lod);
  }

  generateEmptyTile(x, y, z, lod) {
    return {
      x, y, z, lod,
      points: [],
      colors: [],
      normals: [],
      bounds: this.calculateTileBounds(x, y, z, lod),
      pointCount: 0
    };
  }

  calculateTileBounds(x, y, z, lod) {
    const size = this.getTileSizeForLod(lod);
    return {
      minX: x * size,
      minY: y * size,
      minZ: z * size,
      maxX: (x + 1) * size,
      maxY: (y + 1) * size,
      maxZ: (z + 1) * size
    };
  }

  cacheTile(key, tileData) {
    if (this.tileCache.size >= this.cacheSize) {
      const firstKey = this.tileCache.keys().next().value;
      this.tileCache.delete(firstKey);
    }
    this.tileCache.set(key, tileData);
  }

  async getLayerInfo(layerId) {
    const infoPath = path.join(this.dataDir, layerId, 'layer.json');
    try {
      return await this.readTileFile(infoPath);
    } catch (e) {
      return {
        id: layerId,
        name: layerId,
        bounds: { minX: -1000, minY: -1000, minZ: -100, maxX: 1000, maxY: 1000, maxZ: 200 },
        pointCount: 0,
        maxLod: 5,
        attributes: ['position', 'color', 'intensity']
      };
    }
  }

  clearCache() {
    this.tileCache.clear();
  }
}

module.exports = TileLoader;
