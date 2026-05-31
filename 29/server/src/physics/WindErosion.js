class WindErosion {
  constructor(terrain, config = {}) {
    this.terrain = terrain;
    this.changedCells = new Set();
    this.config = {
      windStrength: 0.5,
      windDirectionX: 1,
      windDirectionY: 0,
      abrasionRate: 0.1,
      depositionRate: 0.2,
      suspensionRate: 0.05,
      particleCount: 1000,
      maxParticleLife: 100,
      saltationHeight: 2,
      ...config
    };
    this.particles = [];
  }

  update(deltaTime) {
    const dt = Math.min(deltaTime, 0.1);
    this.changedCells.clear();
    this.generateParticles();
    this.updateParticles(dt);
    this.removeDeadParticles();
    this.applySurfaceAbrasion(dt);
  }

  generateParticles() {
    const size = this.terrain.size;
    const targetCount = Math.min(this.config.particleCount, 2000);
    
    while (this.particles.length < targetCount) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const groundH = this.terrain.getHeight(Math.floor(x), Math.floor(y));
      const safeHeight = Number.isFinite(groundH) ? groundH : 20;
      
      this.particles.push({
        x,
        y,
        z: safeHeight + 1 + Math.random() * 5,
        vx: 0,
        vy: 0,
        vz: 0,
        sediment: 0,
        life: this.config.maxParticleLife,
        isSuspended: false
      });
    }
  }

  updateParticles(deltaTime) {
    const size = this.terrain.size;
    const windX = this.config.windDirectionX;
    const windY = this.config.windDirectionY;
    const windForce = this.config.windStrength * deltaTime * 10;
    
    for (const particle of this.particles) {
      const cellX = Math.floor(particle.x);
      const cellY = Math.floor(particle.y);
      
      if (cellX < 0 || cellX >= size || cellY < 0 || cellY >= size) {
        particle.life = 0;
        continue;
      }
      
      const groundHeight = this.terrain.getHeight(cellX, cellY);
      if (!Number.isFinite(groundHeight)) {
        particle.life = 0;
        continue;
      }
      
      const hardness = this.terrain.getHardness(cellX, cellY);
      
      particle.vx += windX * windForce;
      particle.vy += windY * windForce;
      particle.vz -= 9.8 * deltaTime;
      
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      particle.vx = Math.max(-50, Math.min(50, particle.vx));
      particle.vy = Math.max(-50, Math.min(50, particle.vy));
      particle.vz = Math.max(-20, Math.min(20, particle.vz));
      
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.z += particle.vz * deltaTime;
      
      if (particle.z <= groundHeight) {
        particle.z = groundHeight;
        particle.vz *= -0.3;
        
        const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
        const liftThreshold = this.config.windStrength * 2;
        
        if (speed > liftThreshold && !particle.isSuspended) {
          const liftChance = Math.min((speed - liftThreshold) / 5, 1);
          if (Math.random() < liftChance * this.config.suspensionRate * (1 - hardness)) {
            particle.isSuspended = true;
            particle.vz = 2 + Math.random() * 3;
            
            const erodeAmount = this.config.abrasionRate * 0.05;
            const newHeight = groundHeight - erodeAmount;
            if (Number.isFinite(newHeight) && newHeight >= 0) {
              this.terrain.setHeight(cellX, cellY, newHeight);
              this.changedCells.add(cellX + ',' + cellY);
            }
            particle.sediment += erodeAmount;
          }
        }
        
        if (particle.sediment > 0 && speed < liftThreshold * 0.5) {
          const depositAmount = particle.sediment * this.config.depositionRate;
          if (Number.isFinite(depositAmount) && depositAmount > 0) {
            particle.sediment -= depositAmount;
            const newHeight = groundHeight + depositAmount;
            if (Number.isFinite(newHeight)) {
              this.terrain.setHeight(cellX, cellY, newHeight);
              this.changedCells.add(cellX + ',' + cellY);
            }
          }
        }
        
        particle.isSuspended = false;
      }
      
      if (particle.isSuspended && particle.sediment > 0) {
        if (Math.random() < 0.005) {
          const depositAmount = particle.sediment * 0.1;
          if (Number.isFinite(depositAmount) && depositAmount > 0) {
            particle.sediment -= depositAmount;
            const newHeight = groundHeight + depositAmount;
            if (Number.isFinite(newHeight)) {
              this.terrain.setHeight(cellX, cellY, newHeight);
              this.changedCells.add(cellX + ',' + cellY);
            }
          }
        }
      }
      
      particle.life -= deltaTime * 60;
    }
  }

  removeDeadParticles() {
    const toRemove = [];
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].life <= 0) {
        toRemove.push(i);
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.particles.splice(toRemove[i], 1);
    }
  }

  applySurfaceAbrasion(deltaTime) {
    const size = this.terrain.size;
    const windX = this.config.windDirectionX;
    const windY = this.config.windDirectionY;
    
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const gradient = this.terrain.getGradient(x, y);
        if (!Number.isFinite(gradient.x) || !Number.isFinite(gradient.y)) continue;
        
        const windAlignment = -(gradient.x * windX + gradient.y * windY);
        
        if (windAlignment > 0.1) {
          const hardness = this.terrain.getHardness(x, y);
          const abrasion = windAlignment * this.config.abrasionRate * this.config.windStrength * deltaTime * (1 - hardness);
          if (Number.isFinite(abrasion) && abrasion > 0) {
            const currentHeight = this.terrain.getHeight(x, y);
            if (!Number.isFinite(currentHeight)) continue;
            const newHeight = currentHeight - abrasion;
            if (Number.isFinite(newHeight) && newHeight >= 0) {
              this.terrain.setHeight(x, y, newHeight);
              this.changedCells.add(x + ',' + y);
            }
            
            const dx = Math.floor(windX * 2);
            const dy = Math.floor(windY * 2);
            const depositX = x + dx;
            const depositY = y + dy;
            
            if (depositX >= 0 && depositX < size && depositY >= 0 && depositY < size) {
              const depositHeight = this.terrain.getHeight(depositX, depositY);
              if (Number.isFinite(depositHeight)) {
                const newDepositHeight = depositHeight + abrasion * 0.5;
                if (Number.isFinite(newDepositHeight)) {
                  this.terrain.setHeight(depositX, depositY, newDepositHeight);
                  this.changedCells.add(depositX + ',' + depositY);
                }
              }
            }
          }
        }
      }
    }
  }

  setWindDirection(angle) {
    this.config.windDirectionX = Math.cos(angle);
    this.config.windDirectionY = Math.sin(angle);
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  getParticleData() {
    return this.particles
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
      .map(p => ({
        x: p.x,
        y: p.y,
        z: p.z,
        sediment: p.sediment || 0
      }));
  }
}

module.exports = WindErosion;
