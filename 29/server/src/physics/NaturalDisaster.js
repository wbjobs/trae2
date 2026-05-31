class NaturalDisaster {
  constructor(terrain, type, config = {}) {
    this.terrain = terrain;
    this.type = type;
    this.active = false;
    this.duration = 0;
    this.maxDuration = config.duration || 60;
    this.intensity = config.intensity || 0.5;
    this.changedCells = new Set();
  }

  start() {
    this.active = true;
    this.duration = 0;
    this.changedCells.clear();
  }

  stop() {
    this.active = false;
  }

  update(deltaTime) {
    if (!this.active) return;
    this.duration += deltaTime;
    if (this.duration >= this.maxDuration) {
      this.stop();
    }
  }

  markChanged(x, y, radius = 0) {
    const size = this.terrain.size;
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(size - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(size - 1, y + radius);
    
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        this.changedCells.add(cx + ',' + cy);
      }
    }
  }
}

class Earthquake extends NaturalDisaster {
  constructor(terrain, config = {}) {
    super(terrain, 'earthquake', { duration: 15, intensity: 0.7, ...config });
    this.epicenterX = 0;
    this.epicenterY = 0;
    this.shakeRadius = 0;
  }

  start() {
    super.start();
    const size = this.terrain.size;
    this.epicenterX = Math.floor(Math.random() * size);
    this.epicenterY = Math.floor(Math.random() * size);
    this.shakeRadius = Math.min(size * 0.4, 30 + this.intensity * 20);
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (!this.active) return;

    const size = this.terrain.size;
    const shakeAmount = this.intensity * 3 * Math.sin(this.duration * 10);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - this.epicenterX) ** 2 + (y - this.epicenterY) ** 2);
        if (dist < this.shakeRadius) {
          const falloff = 1 - dist / this.shakeRadius;
          const displacement = shakeAmount * falloff * (Math.random() - 0.5);
          
          if (Math.random() < 0.3 * falloff) {
            const currentHeight = this.terrain.getHeight(x, y);
            if (Number.isFinite(currentHeight)) {
              const newHeight = Math.max(0, currentHeight + displacement);
              if (Number.isFinite(newHeight)) {
                this.terrain.setHeight(x, y, newHeight);
                this.markChanged(x, y);
              }
            }
          }
        }
      }
    }

    this.createLandslides();
  }

  createLandslides() {
    const size = this.terrain.size;
    const slideChance = 0.01 * this.intensity;

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dist = Math.sqrt((x - this.epicenterX) ** 2 + (y - this.epicenterY) ** 2);
        if (dist < this.shakeRadius && Math.random() < slideChance) {
          const gradient = this.terrain.getGradient(x, y);
          const slope = Math.sqrt(gradient.x ** 2 + gradient.y ** 2);
          
          if (slope > 0.3) {
            const currentHeight = this.terrain.getHeight(x, y);
            if (!Number.isFinite(currentHeight)) continue;
            
            const slideAmount = Math.min(currentHeight * 0.3, 2);
            const newHeight = currentHeight - slideAmount;
            
            if (Number.isFinite(newHeight) && newHeight >= 0) {
              this.terrain.setHeight(x, y, newHeight);
              this.markChanged(x, y);
              
              const dx = Math.sign(gradient.x);
              const dy = Math.sign(gradient.y);
              const depositX = x + dx;
              const depositY = y + dy;
              
              if (depositX >= 0 && depositX < size && depositY >= 0 && depositY < size) {
                const depositHeight = this.terrain.getHeight(depositX, depositY);
                if (Number.isFinite(depositHeight)) {
                  this.terrain.setHeight(depositX, depositY, depositHeight + slideAmount * 0.7);
                  this.markChanged(depositX, depositY);
                }
              }
            }
          }
        }
      }
    }
  }
}

class Flood extends NaturalDisaster {
  constructor(terrain, config = {}) {
    super(terrain, 'flood', { duration: 45, intensity: 0.6, ...config });
    this.waterLevel = 0;
    this.targetWaterLevel = 0;
    this.sourceX = 0;
    this.sourceY = 0;
  }

  start() {
    super.start();
    const size = this.terrain.size;
    this.sourceX = Math.floor(Math.random() * size);
    this.sourceY = Math.floor(Math.random() * size);
    this.targetWaterLevel = 15 + this.intensity * 20;
    this.waterLevel = 0;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (!this.active) return;

    const riseSpeed = (this.duration < this.maxDuration * 0.4) ? 0.5 : 
                      (this.duration > this.maxDuration * 0.7) ? -0.3 : 0;
    
    this.waterLevel = Math.max(0, Math.min(this.targetWaterLevel, this.waterLevel + riseSpeed * deltaTime * 10));

    const size = this.terrain.size;
    const spreadRadius = Math.min(size, this.waterLevel * 2);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - this.sourceX) ** 2 + (y - this.sourceY) ** 2);
        if (dist < spreadRadius) {
          const currentHeight = this.terrain.getHeight(x, y);
          if (!Number.isFinite(currentHeight)) continue;

          if (currentHeight < this.waterLevel) {
            const erosion = 0.01 * this.intensity * deltaTime * 60;
            const newHeight = Math.max(0, currentHeight - erosion);
            
            if (Number.isFinite(newHeight)) {
              this.terrain.setHeight(x, y, newHeight);
              this.markChanged(x, y);
            }
          }
        }
      }
    }

    this.depositSediment(spreadRadius);
  }

  depositSediment(spreadRadius) {
    const size = this.terrain.size;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - this.sourceX) ** 2 + (y - this.sourceY) ** 2);
        if (dist > spreadRadius * 0.8 && dist < spreadRadius && Math.random() < 0.02) {
          const currentHeight = this.terrain.getHeight(x, y);
          if (!Number.isFinite(currentHeight)) continue;
          
          const deposit = 0.1 * this.intensity;
          const newHeight = currentHeight + deposit;
          
          if (Number.isFinite(newHeight)) {
            this.terrain.setHeight(x, y, newHeight);
            this.markChanged(x, y);
          }
        }
      }
    }
  }
}

class Volcano extends NaturalDisaster {
  constructor(terrain, config = {}) {
    super(terrain, 'volcano', { duration: 60, intensity: 0.8, ...config });
    this.craterX = 0;
    this.craterY = 0;
    this.craterRadius = 0;
    this.lavaFlows = [];
  }

  start() {
    super.start();
    const size = this.terrain.size;
    this.craterX = Math.floor(size / 4 + Math.random() * size / 2);
    this.craterY = Math.floor(size / 4 + Math.random() * size / 2);
    this.craterRadius = 5 + this.intensity * 5;
    this.lavaFlows = [];

    this.createCrater();
  }

  createCrater() {
    const size = this.terrain.size;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - this.craterX) ** 2 + (y - this.craterY) ** 2);
        
        if (dist < this.craterRadius * 1.5) {
          const currentHeight = this.terrain.getHeight(x, y);
          if (!Number.isFinite(currentHeight)) continue;

          let newHeight;
          if (dist < this.craterRadius * 0.5) {
            newHeight = Math.max(0, currentHeight - 10 * this.intensity);
          } else if (dist < this.craterRadius) {
            const rimHeight = 8 * this.intensity * (1 - (dist - this.craterRadius * 0.5) / (this.craterRadius * 0.5));
            newHeight = currentHeight + rimHeight;
          } else {
            const slope = 3 * (1 - (dist - this.craterRadius) / (this.craterRadius * 0.5));
            newHeight = currentHeight + slope;
          }

          if (Number.isFinite(newHeight) && newHeight >= 0) {
            this.terrain.setHeight(x, y, newHeight);
            this.markChanged(x, y);
          }
        }
      }
    }
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (!this.active) return;

    if (Math.random() < 0.1 * this.intensity * deltaTime * 60) {
      this.erupt();
    }

    this.updateLavaFlows(deltaTime);
  }

  erupt() {
    const size = this.terrain.size;
    const angle = Math.random() * Math.PI * 2;
    const distance = 5 + Math.random() * this.intensity * 15;
    
    const flow = {
      x: this.craterX + Math.cos(angle) * 5,
      y: this.craterY + Math.sin(angle) * 5,
      targetX: this.craterX + Math.cos(angle) * distance,
      targetY: this.craterY + Math.sin(angle) * distance,
      volume: 2 + Math.random() * 3 * this.intensity,
      speed: 0.5 + Math.random() * 0.5
    };
    
    this.lavaFlows.push(flow);
  }

  updateLavaFlows(deltaTime) {
    const size = this.terrain.size;

    for (let i = this.lavaFlows.length - 1; i >= 0; i--) {
      const flow = this.lavaFlows[i];
      
      const dx = flow.targetX - flow.x;
      const dy = flow.targetY - flow.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 1 || flow.volume <= 0) {
        this.lavaFlows.splice(i, 1);
        continue;
      }

      const moveSpeed = flow.speed * deltaTime * 30;
      flow.x += (dx / dist) * moveSpeed;
      flow.y += (dy / dist) * moveSpeed;

      const cellX = Math.floor(flow.x);
      const cellY = Math.floor(flow.y);
      
      if (cellX >= 0 && cellX < size && cellY >= 0 && cellY < size) {
        const currentHeight = this.terrain.getHeight(cellX, cellY);
        if (Number.isFinite(currentHeight)) {
          const deposit = Math.min(flow.volume, 0.5) * deltaTime * 10;
          const newHeight = currentHeight + deposit;
          
          if (Number.isFinite(newHeight)) {
            this.terrain.setHeight(cellX, cellY, newHeight);
            this.markChanged(cellX, cellY);
            flow.volume -= deposit * 0.1;
          }
        }
      }
    }
  }
}

class MeteorStrike extends NaturalDisaster {
  constructor(terrain, config = {}) {
    super(terrain, 'meteor', { duration: 10, intensity: 1.0, ...config });
    this.impactX = 0;
    this.impactY = 0;
    this.impactRadius = 0;
    this.hasImpacted = false;
  }

  start() {
    super.start();
    const size = this.terrain.size;
    this.impactX = Math.floor(Math.random() * size);
    this.impactY = Math.floor(Math.random() * size);
    this.impactRadius = 8 + this.intensity * 12;
    this.hasImpacted = false;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (!this.active || this.hasImpacted) return;

    if (this.duration >= this.maxDuration * 0.3) {
      this.impact();
      this.hasImpacted = true;
    }
  }

  impact() {
    const size = this.terrain.size;
    const depth = 15 + this.intensity * 20;
    const rimHeight = 5 + this.intensity * 8;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - this.impactX) ** 2 + (y - this.impactY) ** 2);
        
        if (dist < this.impactRadius * 2) {
          const currentHeight = this.terrain.getHeight(x, y);
          if (!Number.isFinite(currentHeight)) continue;

          let newHeight;
          if (dist < this.impactRadius) {
            const craterDepth = depth * (1 - dist / this.impactRadius);
            newHeight = Math.max(0, currentHeight - craterDepth);
          } else {
            const rimDist = (dist - this.impactRadius) / this.impactRadius;
            const rimAmount = rimHeight * (1 - rimDist);
            newHeight = currentHeight + rimAmount * 0.5;
          }

          if (Number.isFinite(newHeight) && newHeight >= 0) {
            this.terrain.setHeight(x, y, newHeight);
            this.markChanged(x, y);
          }
        }
      }
    }

    this.ejectDebris();
  }

  ejectDebris() {
    const size = this.terrain.size;
    const debrisCount = Math.floor(20 + this.intensity * 30);

    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = this.impactRadius + Math.random() * this.impactRadius * 2;
      
      const x = Math.floor(this.impactX + Math.cos(angle) * distance);
      const y = Math.floor(this.impactY + Math.sin(angle) * distance);

      if (x >= 0 && x < size && y >= 0 && y < size) {
        const currentHeight = this.terrain.getHeight(x, y);
        if (Number.isFinite(currentHeight)) {
          const debris = 0.5 + Math.random() * 2;
          const newHeight = currentHeight + debris;
          
          if (Number.isFinite(newHeight)) {
            this.terrain.setHeight(x, y, newHeight);
            this.markChanged(x, y);
          }
        }
      }
    }
  }
}

class DisasterManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.disasters = [];
    this.activeDisaster = null;
    this.nextDisasterTime = 0;
    this.cooldown = 60;
    this.enabled = true;
    this.disasterTypes = ['earthquake', 'flood', 'volcano', 'meteor'];
  }

  update(deltaTime) {
    if (!this.enabled) return;

    if (this.activeDisaster) {
      this.activeDisaster.update(deltaTime);
      
      if (!this.activeDisaster.active) {
        this.activeDisaster = null;
        this.nextDisasterTime = this.cooldown;
      }
    } else {
      this.nextDisasterTime -= deltaTime;
      
      if (this.nextDisasterTime <= 0 && Math.random() < 0.005) {
        this.triggerRandomDisaster();
      }
    }
  }

  triggerRandomDisaster() {
    const type = this.disasterTypes[Math.floor(Math.random() * this.disasterTypes.length)];
    return this.triggerDisaster(type);
  }

  triggerDisaster(type, config = {}) {
    if (this.activeDisaster) {
      this.activeDisaster.stop();
    }

    let disaster;
    switch (type) {
      case 'earthquake':
        disaster = new Earthquake(this.terrain, config);
        break;
      case 'flood':
        disaster = new Flood(this.terrain, config);
        break;
      case 'volcano':
        disaster = new Volcano(this.terrain, config);
        break;
      case 'meteor':
        disaster = new MeteorStrike(this.terrain, config);
        break;
      default:
        return null;
    }

    disaster.start();
    this.activeDisaster = disaster;
    this.disasters.push(disaster);

    if (this.disasters.length > 10) {
      this.disasters.shift();
    }

    return disaster;
  }

  stopDisaster() {
    if (this.activeDisaster) {
      this.activeDisaster.stop();
      this.activeDisaster = null;
    }
  }

  getChangedCells() {
    if (this.activeDisaster) {
      return this.activeDisaster.changedCells;
    }
    return new Set();
  }

  getDisasterInfo() {
    if (this.activeDisaster) {
      return {
        type: this.activeDisaster.type,
        duration: this.activeDisaster.duration,
        maxDuration: this.activeDisaster.maxDuration,
        intensity: this.activeDisaster.intensity,
        active: this.activeDisaster.active
      };
    }
    return null;
  }

  setCooldown(seconds) {
    this.cooldown = Math.max(10, seconds);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.activeDisaster) {
      this.stopDisaster();
    }
  }
}

module.exports = {
  DisasterManager,
  Earthquake,
  Flood,
  Volcano,
  MeteorStrike
};
