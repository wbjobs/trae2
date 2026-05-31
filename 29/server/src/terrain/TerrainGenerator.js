const { Noise } = require('noisejs');

class TerrainGenerator {
  constructor(size = 256, seed = Math.random() * 10000) {
    this.size = size;
    this.noise = new Noise(seed);
    this.heightMap = [];
    this.waterMap = [];
    this.sedimentMap = [];
    this.hardnessMap = [];
  }

  generate(config = {}) {
    const {
      scale = 50,
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2.0,
      heightMultiplier = 50,
      baseHeight = 20
    } = config;

    for (let y = 0; y < this.size; y++) {
      this.heightMap[y] = [];
      this.waterMap[y] = [];
      this.sedimentMap[y] = [];
      this.hardnessMap[y] = [];
      
      for (let x = 0; x < this.size; x++) {
        let amplitude = 1;
        let frequency = 1;
        let noiseHeight = 0;

        for (let i = 0; i < octaves; i++) {
          const sampleX = (x / scale) * frequency;
          const sampleY = (y / scale) * frequency;
          
          const perlinValue = this.noise.perlin2(sampleX, sampleY);
          noiseHeight += perlinValue * amplitude;
          
          amplitude *= persistence;
          frequency *= lacunarity;
        }

        this.heightMap[y][x] = (noiseHeight + 1) / 2 * heightMultiplier + baseHeight;
        this.waterMap[y][x] = 0;
        this.sedimentMap[y][x] = 0;
        this.hardnessMap[y][x] = 0.5 + Math.random() * 0.3;
      }
    }

    return this.getTerrainData();
  }

  getHeight(x, y) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.heightMap[y][x];
  }

  setHeight(x, y, value) {
    if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
      this.heightMap[y][x] = Math.max(0, value);
    }
  }

  getWater(x, y) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.waterMap[y][x];
  }

  setWater(x, y, value) {
    if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
      this.waterMap[y][x] = Math.max(0, value);
    }
  }

  getSediment(x, y) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.sedimentMap[y][x];
  }

  setSediment(x, y, value) {
    if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
      this.sedimentMap[y][x] = Math.max(0, value);
    }
  }

  getHardness(x, y) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0.5;
    return this.hardnessMap[y][x];
  }

  getTerrainData() {
    return {
      size: this.size,
      heightMap: this.heightMap,
      waterMap: this.waterMap,
      sedimentMap: this.sedimentMap,
      hardnessMap: this.hardnessMap
    };
  }

  setTerrainData(data) {
    this.size = data.size;
    this.heightMap = data.heightMap;
    this.waterMap = data.waterMap;
    this.sedimentMap = data.sedimentMap;
    this.hardnessMap = data.hardnessMap;
  }

  getGradient(x, y) {
    const hL = this.getHeight(x - 1, y);
    const hR = this.getHeight(x + 1, y);
    const hD = this.getHeight(x, y - 1);
    const hU = this.getHeight(x, y + 1);
    return {
      x: (hR - hL) / 2,
      y: (hU - hD) / 2
    };
  }
}

module.exports = TerrainGenerator;
