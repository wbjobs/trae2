class WaterErosion {
  constructor(terrain, config = {}) {
    this.terrain = terrain;
    this.changedCells = new Set();
    this.config = {
      rainRate: 0.3,
      evaporationRate: 0.02,
      erosionStrength: 0.3,
      depositionRate: 0.3,
      sedimentCapacity: 4.0,
      minSlope: 0.01,
      inertia: 0.05,
      gravity: 4.0,
      maxSteps: 64,
      erosionRadius: 3,
      ...config
    };
  }

  update(deltaTime) {
    const dt = Math.min(deltaTime, 0.1);
    this.changedCells.clear();
    this.addRain(dt);
    this.simulateWaterFlow(dt);
    this.evaporate(dt);
  }

  addRain(deltaTime) {
    const size = this.terrain.size;
    const rainAmount = this.config.rainRate * deltaTime;
    if (rainAmount <= 0) return;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.random() < 0.3) {
          const currentWater = this.terrain.getWater(x, y);
          const newWater = currentWater + rainAmount * Math.random();
          this.terrain.setWater(x, y, Number.isFinite(newWater) ? newWater : currentWater);
        }
      }
    }
  }

  simulateWaterFlow(deltaTime) {
    const size = this.terrain.size;
    if (size < 2) return;
    const numParticles = Math.floor(size * size * 0.02);
    
    for (let i = 0; i < numParticles; i++) {
      const posX = Math.floor(Math.random() * (size - 1));
      const posY = Math.floor(Math.random() * (size - 1));
      this.simulateDroplet(posX, posY, deltaTime);
    }
  }

  simulateDroplet(startX, startY, deltaTime) {
    let posX = startX;
    let posY = startY;
    let dirX = 0;
    let dirY = 0;
    let speed = 1.0;
    let water = 1.0;
    let sediment = 0.0;
    
    const size = this.terrain.size;
    
    for (let step = 0; step < this.config.maxSteps; step++) {
      const cellX = Math.floor(posX);
      const cellY = Math.floor(posY);
      
      if (cellX < 1 || cellX >= size - 1 || cellY < 1 || cellY >= size - 1) {
        break;
      }
      
      const gradient = this.terrain.getGradient(cellX, cellY);
      
      if (!Number.isFinite(gradient.x) || !Number.isFinite(gradient.y)) {
        break;
      }
      
      dirX = dirX * this.config.inertia - gradient.x * (1 - this.config.inertia);
      dirY = dirY * this.config.inertia - gradient.y * (1 - this.config.inertia);
      
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len > 0.0001) {
        dirX /= len;
        dirY /= len;
      } else {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }
      
      const newPosX = posX + dirX;
      const newPosY = posY + dirY;
      const newCellX = Math.floor(newPosX);
      const newCellY = Math.floor(newPosY);
      
      if (newCellX < 1 || newCellX >= size - 1 || newCellY < 1 || newCellY >= size - 1) {
        break;
      }
      
      const oldHeight = this.terrain.getHeight(cellX, cellY);
      const newHeight = this.terrain.getHeight(newCellX, newCellY);
      const heightDiff = newHeight - oldHeight;
      
      if (!Number.isFinite(oldHeight) || !Number.isFinite(newHeight)) {
        break;
      }
      
      const capacity = Math.max(-heightDiff, this.config.minSlope) * speed * water * this.config.sedimentCapacity;
      
      if (sediment > capacity || heightDiff > 0) {
        const depositAmount = heightDiff > 0 
          ? Math.min(Math.abs(heightDiff), sediment) 
          : (sediment - capacity) * this.config.depositionRate;
        
        if (Number.isFinite(depositAmount) && depositAmount > 0) {
          sediment -= depositAmount;
          this.depositSediment(cellX, cellY, depositAmount);
        }
      } else {
        const erodeAmount = Math.min((capacity - sediment) * this.config.erosionStrength, Math.abs(heightDiff));
        const hardness = this.terrain.getHardness(cellX, cellY);
        const actualErode = erodeAmount * (1 - hardness * 0.5);
        
        if (Number.isFinite(actualErode) && actualErode > 0.0001) {
          this.erodeTerrain(cellX, cellY, actualErode);
          sediment += actualErode;
        }
      }
      
      const newSpeedSquared = speed * speed + heightDiff * this.config.gravity;
      speed = Math.sqrt(Math.max(0, newSpeedSquared));
      water *= (1 - this.config.evaporationRate);
      
      if (water < 0.01) break;
      
      posX = newPosX;
      posY = newPosY;
    }
    
    if (posX >= 1 && posX < size - 1 && posY >= 1 && posY < size - 1) {
      const cellX = Math.floor(posX);
      const cellY = Math.floor(posY);
      if (Number.isFinite(sediment) && sediment > 0) {
        this.depositSediment(cellX, cellY, sediment);
      }
    }
  }

  erodeTerrain(x, y, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    
    const size = this.terrain.size;
    const radius = this.config.erosionRadius;
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(size - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(size - 1, y + radius);
    
    let totalWeight = 0;
    const weights = [];
    
    for (let dy = minY; dy <= maxY; dy++) {
      for (let dx = minX; dx <= maxX; dx++) {
        const dist = Math.sqrt((dx - x) * (dx - x) + (dy - y) * (dy - y));
        if (dist <= radius) {
          const weight = 1 - dist / radius;
          totalWeight += weight;
          weights.push({ dx, dy, weight });
        }
      }
    }
    
    if (totalWeight <= 0) return;
    
    for (const { dx, dy, weight } of weights) {
      const currentHeight = this.terrain.getHeight(dx, dy);
      if (!Number.isFinite(currentHeight)) continue;
      const erodeAmount = amount * weight / totalWeight;
      const newHeight = currentHeight - erodeAmount;
      if (Number.isFinite(newHeight) && newHeight >= 0) {
        this.terrain.setHeight(dx, dy, newHeight);
        this.changedCells.add(dx + ',' + dy);
      }
    }
  }

  depositSediment(x, y, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    
    const size = this.terrain.size;
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    
    const currentHeight = this.terrain.getHeight(x, y);
    if (!Number.isFinite(currentHeight)) return;
    
    const newHeight = currentHeight + amount * 0.5;
    if (Number.isFinite(newHeight)) {
      this.terrain.setHeight(x, y, newHeight);
      this.changedCells.add(x + ',' + y);
    }
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const h = this.terrain.getHeight(nx, ny);
        if (!Number.isFinite(h)) continue;
        const deposit = amount * 0.0625;
        const newH = h + deposit;
        if (Number.isFinite(newH)) {
          this.terrain.setHeight(nx, ny, newH);
          this.changedCells.add(nx + ',' + ny);
        }
      }
    }
  }

  evaporate(deltaTime) {
    const size = this.terrain.size;
    const evapAmount = this.config.evaporationRate * deltaTime * 10;
    if (evapAmount <= 0) return;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const currentWater = this.terrain.getWater(x, y);
        const newWater = Math.max(0, currentWater - evapAmount);
        if (Number.isFinite(newWater)) {
          this.terrain.setWater(x, y, newWater);
        }
      }
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = WaterErosion;
