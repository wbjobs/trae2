class EquipmentManager {
  constructor() {
    this.equipment = new Map();
    this.durabilityDecayRate = 0.01;
    this.agingRate = 0.001;
    this.updateCache = null;
    this.lastUpdateTime = 0;
  }

  initEquipment() {
    const equipmentList = [
      {
        id: 'weather_station_01',
        name: '气象站',
        type: 'weather_station',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        maxHealth: 100,
        durability: 100,
        maxDurability: 100,
        wearLevel: 0,
        status: 'normal',
        faults: [],
        totalOperatingHours: 0,
        repairCount: 0,
        specs: {
          temperatureResistance: [-30, 50],
          waterResistance: 0.7,
          windResistance: 25,
          expectedLifespan: 87600,
          mtbf: 5000
        }
      },
      {
        id: 'solar_panel_01',
        name: '太阳能板',
        type: 'solar_panel',
        position: { x: 5, y: 0, z: 3 },
        health: 100,
        maxHealth: 100,
        durability: 100,
        maxDurability: 100,
        wearLevel: 0,
        status: 'normal',
        faults: [],
        totalOperatingHours: 0,
        repairCount: 0,
        specs: {
          temperatureResistance: [-20, 60],
          waterResistance: 0.8,
          windResistance: 20,
          expectedLifespan: 175200,
          mtbf: 8000
        }
      },
      {
        id: 'data_logger_01',
        name: '数据采集器',
        type: 'data_logger',
        position: { x: -3, y: 0, z: 2 },
        health: 100,
        maxHealth: 100,
        durability: 100,
        maxDurability: 100,
        wearLevel: 0,
        status: 'normal',
        faults: [],
        totalOperatingHours: 0,
        repairCount: 0,
        specs: {
          temperatureResistance: [-10, 45],
          waterResistance: 0.5,
          windResistance: 15,
          expectedLifespan: 52560,
          mtbf: 3000
        }
      },
      {
        id: 'antenna_01',
        name: '通信天线',
        type: 'antenna',
        position: { x: 2, y: 0, z: -4 },
        health: 100,
        maxHealth: 100,
        durability: 100,
        maxDurability: 100,
        wearLevel: 0,
        status: 'normal',
        faults: [],
        totalOperatingHours: 0,
        repairCount: 0,
        specs: {
          temperatureResistance: [-40, 60],
          waterResistance: 0.9,
          windResistance: 35,
          expectedLifespan: 70080,
          mtbf: 6000
        }
      },
      {
        id: 'sensor_array_01',
        name: '传感器阵列',
        type: 'sensor_array',
        position: { x: -4, y: 0, z: -3 },
        health: 100,
        maxHealth: 100,
        durability: 100,
        maxDurability: 100,
        wearLevel: 0,
        status: 'normal',
        faults: [],
        totalOperatingHours: 0,
        repairCount: 0,
        specs: {
          temperatureResistance: [-5, 40],
          waterResistance: 0.4,
          windResistance: 10,
          expectedLifespan: 43800,
          mtbf: 2000
        }
      }
    ];

    equipmentList.forEach(eq => {
      this.equipment.set(eq.id, {
        ...eq,
        lastCheck: Date.now(),
        uptime: 0,
        lastMaintenance: Date.now(),
        stressHistory: []
      });
    });
  }

  getEquipmentList() {
    const now = Date.now();
    if (this.updateCache && now - this.lastUpdateTime < 100) {
      return this.updateCache;
    }

    this.updateCache = Array.from(this.equipment.values()).map(eq => ({
      id: eq.id,
      name: eq.name,
      type: eq.type,
      position: eq.position,
      health: Math.round(eq.health),
      maxHealth: eq.maxHealth,
      durability: Math.round(eq.durability),
      maxDurability: eq.maxDurability,
      wearLevel: Math.round(eq.wearLevel * 100) / 100,
      status: eq.status,
      faults: eq.faults,
      uptime: eq.uptime,
      totalOperatingHours: eq.totalOperatingHours,
      repairCount: eq.repairCount,
      efficiency: this.calculateEfficiency(eq)
    }));

    this.lastUpdateTime = now;
    return this.updateCache;
  }

  getEquipment(id) {
    return this.equipment.get(id);
  }

  updateAll(environment) {
    const equipmentArray = Array.from(this.equipment.values());
    
    for (let i = 0; i < equipmentArray.length; i++) {
      this.updateEquipment(equipmentArray[i], environment);
    }
  }

  updateEquipment(eq, environment) {
    const stress = this.calculateStress(eq, environment);
    
    this.updateDurability(eq, stress, environment);
    this.updateHealth(eq, stress);
    this.updateWearLevel(eq);
    
    if (eq.status === 'normal' || eq.status === 'warning') {
      eq.uptime++;
      eq.totalOperatingHours++;
    }

    eq.stressHistory.push({
      time: Date.now(),
      stress: stress
    });
    if (eq.stressHistory.length > 60) {
      eq.stressHistory.shift();
    }
  }

  updateDurability(eq, stress, environment) {
    let decay = this.durabilityDecayRate;
    
    decay += stress * 0.02;
    
    if (environment.weatherLevel >= 3) {
      decay *= 1.5;
    }
    
    const wearFactor = 1 + eq.wearLevel * 0.5;
    decay *= wearFactor;
    
    const lifespanProgress = eq.totalOperatingHours / eq.specs.expectedLifespan;
    if (lifespanProgress > 0.5) {
      decay *= (1 + (lifespanProgress - 0.5) * 2);
    }
    
    if (eq.faults.length > 0) {
      decay *= (1 + eq.faults.length * 0.3);
    }
    
    eq.durability = Math.max(0, eq.durability - decay);
    
    if (eq.durability < 20 && eq.health > 50) {
      eq.health -= 0.1;
    }
  }

  updateHealth(eq, stress) {
    const durabilityFactor = eq.durability / eq.maxDurability;
    const healthDecay = stress * 0.3 * (2 - durabilityFactor);
    
    eq.health -= healthDecay;
    
    if (eq.health <= 0) {
      eq.health = 0;
      eq.status = 'critical';
    } else if (eq.health < 30) {
      eq.status = 'danger';
    } else if (eq.health < 60) {
      eq.status = 'warning';
    } else {
      if (eq.durability < 30) {
        eq.status = 'warning';
      } else {
        eq.status = 'normal';
      }
    }
  }

  updateWearLevel(eq) {
    eq.wearLevel = 1 - (eq.durability / eq.maxDurability);
  }

  calculateEfficiency(eq) {
    const healthFactor = eq.health / eq.maxHealth;
    const durabilityFactor = eq.durability / eq.maxDurability;
    const faultPenalty = eq.faults.length * 0.1;
    
    let efficiency = (healthFactor * 0.6 + durabilityFactor * 0.4) - faultPenalty;
    return Math.max(0, Math.min(1, efficiency));
  }

  calculateStress(eq, environment) {
    let stress = 0;
    
    const temp = environment.temperature;
    if (temp < eq.specs.temperatureResistance[0]) {
      stress += (eq.specs.temperatureResistance[0] - temp) * 0.25;
    } else if (temp > eq.specs.temperatureResistance[1]) {
      stress += (temp - eq.specs.temperatureResistance[1]) * 0.25;
    }

    if (environment.rainIntensity > 0) {
      const waterFactor = 1 - eq.specs.waterResistance;
      stress += environment.rainIntensity * 0.04 * waterFactor;
    }

    if (environment.windSpeed > eq.specs.windResistance) {
      stress += (environment.windSpeed - eq.specs.windResistance) * 0.15;
    }

    if (environment.uvIndex > 7) {
      stress += (environment.uvIndex - 7) * 0.1;
    }

    return stress;
  }

  applyFault(equipmentId, faultType) {
    const eq = this.equipment.get(equipmentId);
    if (!eq) return false;
    
    if (!eq.faults.includes(faultType)) {
      eq.faults.push(faultType);
      eq.health = Math.max(0, eq.health - 8);
      eq.durability = Math.max(0, eq.durability - 2);
    }
    
    return true;
  }

  repairEquipment(equipmentId, faultType) {
    const eq = this.equipment.get(equipmentId);
    if (!eq) return false;
    
    const faultIndex = eq.faults.indexOf(faultType);
    if (faultIndex === -1) return false;
    
    eq.faults.splice(faultIndex, 1);
    eq.health = Math.min(eq.maxHealth, eq.health + 12);
    eq.repairCount++;
    eq.lastMaintenance = Date.now();
    
    if (eq.faults.length === 0 && eq.health > 40) {
      if (eq.durability > 40) {
        eq.status = eq.health > 70 ? 'normal' : 'warning';
      } else {
        eq.status = 'warning';
      }
    }
    
    return true;
  }

  performMaintenance(equipmentId) {
    const eq = this.equipment.get(equipmentId);
    if (!eq) return false;
    
    eq.durability = Math.min(eq.maxDurability, eq.durability + 15);
    eq.health = Math.min(eq.maxHealth, eq.health + 5);
    eq.lastMaintenance = Date.now();
    
    if (eq.status === 'warning' && eq.health > 60 && eq.durability > 40) {
      eq.status = 'normal';
    }
    
    return true;
  }

  replacePart(equipmentId) {
    const eq = this.equipment.get(equipmentId);
    if (!eq) return false;
    
    eq.durability = eq.maxDurability;
    eq.wearLevel = 0;
    eq.health = Math.min(eq.maxHealth, eq.health + 20);
    
    if (eq.health > 50 && eq.faults.length === 0) {
      eq.status = 'normal';
    }
    
    return true;
  }

  getAverageStress(equipmentId, windowSize = 30) {
    const eq = this.equipment.get(equipmentId);
    if (!eq || eq.stressHistory.length === 0) return 0;
    
    const recent = eq.stressHistory.slice(-windowSize);
    const sum = recent.reduce((acc, s) => acc + s.stress, 0);
    return sum / recent.length;
  }

  getEquipmentStats() {
    const stats = {
      totalEquipment: this.equipment.size,
      normalCount: 0,
      warningCount: 0,
      dangerCount: 0,
      criticalCount: 0,
      averageHealth: 0,
      averageDurability: 0,
      totalFaults: 0
    };

    let healthSum = 0;
    let durabilitySum = 0;

    this.equipment.forEach(eq => {
      switch (eq.status) {
        case 'normal': stats.normalCount++; break;
        case 'warning': stats.warningCount++; break;
        case 'danger': stats.dangerCount++; break;
        case 'critical': stats.criticalCount++; break;
      }
      
      healthSum += eq.health;
      durabilitySum += eq.durability;
      stats.totalFaults += eq.faults.length;
    });

    stats.averageHealth = Math.round(healthSum / this.equipment.size);
    stats.averageDurability = Math.round(durabilitySum / this.equipment.size);

    return stats;
  }
}

module.exports = EquipmentManager;
