(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    const Utils = require('./utils');
    const CONFIG = require('./config');
    module.exports = factory(Utils, CONFIG);
  } else {
    root.EnvironmentSystem = factory(root.Utils, root.CONFIG);
  }
}(typeof self !== 'undefined' ? self : this, function(Utils, CONFIG) {

class EnvironmentSystem {
  constructor(config, world) {
    this.config = config;
    this.world = world;
    this.time = 0;
    
    this.waterCurrents = [];
    this.temperatureZones = [];
    this.pressureZones = [];
    this.thermalVents = [];
    this.movingCurrents = [];
    
    this.init();
  }

  init() {
    this.createWaterCurrents();
    this.createTemperatureZones();
    this.createPressureZones();
    this.createThermalVents();
    this.createMovingCurrents();
  }

  createWaterCurrents() {
    const currentCount = 8;
    for (let i = 0; i < currentCount; i++) {
      const angle = (i / currentCount) * Math.PI * 2;
      const radius = 200 + Math.random() * 400;
      
      this.waterCurrents.push({
        id: `current_${i}`,
        position: {
          x: Math.cos(angle) * radius,
          y: -50 - Math.random() * 300,
          z: Math.sin(angle) * radius
        },
        direction: {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 0.5,
          z: (Math.random() - 0.5) * 2
        },
        radius: 80 + Math.random() * 120,
        strength: 1 + Math.random() * 3,
        type: Math.random() > 0.7 ? 'vortex' : 'horizontal',
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  createTemperatureZones() {
    const zoneCount = 5;
    for (let i = 0; i < zoneCount; i++) {
      this.temperatureZones.push({
        id: `temp_zone_${i}`,
        position: {
          x: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.8,
          y: -100 - Math.random() * 300,
          z: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.8
        },
        radius: 100 + Math.random() * 150,
        baseTemperature: 4 + Math.random() * 8,
        temperatureVariation: 2 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        frequency: 0.1 + Math.random() * 0.2
      });
    }
  }

  createPressureZones() {
    const zoneCount = 4;
    for (let i = 0; i < zoneCount; i++) {
      this.pressureZones.push({
        id: `pressure_zone_${i}`,
        position: {
          x: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.6,
          y: -200 - Math.random() * 200,
          z: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.6
        },
        radius: 150 + Math.random() * 100,
        pressureFactor: 0.8 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        frequency: 0.05 + Math.random() * 0.1
      });
    }
  }

  createThermalVents() {
    const ventCount = 6;
    for (let i = 0; i < ventCount; i++) {
      this.thermalVents.push({
        id: `thermal_vent_${i}`,
        position: {
          x: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.7,
          y: -this.config.WORLD.DEPTH + 10,
          z: (Math.random() - 0.5) * this.config.WORLD.SIZE * 0.7
        },
        radius: 40 + Math.random() * 60,
        temperature: 40 + Math.random() * 30,
        strength: 2 + Math.random() * 3,
        intensity: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        frequency: 0.3 + Math.random() * 0.4
      });
    }
  }

  createMovingCurrents() {
    const currentCount = 10;
    for (let i = 0; i < currentCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.movingCurrents.push({
        id: `moving_current_${i}`,
        position: {
          x: Math.cos(angle) * 300,
          y: -100 - Math.random() * 200,
          z: Math.sin(angle) * 300
        },
        direction: {
          x: -Math.sin(angle),
          y: 0,
          z: Math.cos(angle)
        },
        radius: 50 + Math.random() * 80,
        strength: 1.5 + Math.random() * 2,
        speed: 0.5 + Math.random() * 1,
        orbitRadius: 200 + Math.random() * 200,
        orbitAngle: angle,
        orbitSpeed: 0.0005 + Math.random() * 0.001
      });
    }
  }

  update(deltaTime) {
    this.time += deltaTime;

    for (const current of this.movingCurrents) {
      current.orbitAngle += current.orbitSpeed;
      current.position.x = Math.cos(current.orbitAngle) * current.orbitRadius;
      current.position.z = Math.sin(current.orbitAngle) * current.orbitRadius;
    }
  }

  getEnvironmentEffects(position) {
    const effects = {
      waterForce: { x: 0, y: 0, z: 0 },
      temperature: 4,
      pressure: 1,
      visibility: 1,
      disturbance: 0
    };

    for (const current of this.waterCurrents) {
      const dist = Utils.distance(
        position.x, position.y, position.z,
        current.position.x, current.position.y, current.position.z
      );
      
      if (dist < current.radius) {
        const influence = 1 - (dist / current.radius);
        const strength = current.strength * influence * influence;
        
        if (current.type === 'vortex') {
          const toCenter = {
            x: current.position.x - position.x,
            y: current.position.y - position.y,
            z: current.position.z - position.z
          };
          const crossX = toCenter.y * current.direction.z - toCenter.z * current.direction.y;
          const crossY = toCenter.z * current.direction.x - toCenter.x * current.direction.z;
          const crossZ = toCenter.x * current.direction.y - toCenter.y * current.direction.x;
          
          effects.waterForce.x += (crossX + current.direction.x) * strength * 0.5;
          effects.waterForce.y += (crossY + current.direction.y) * strength * 0.5;
          effects.waterForce.z += (crossZ + current.direction.z) * strength * 0.5;
        } else {
          effects.waterForce.x += current.direction.x * strength;
          effects.waterForce.y += current.direction.y * strength;
          effects.waterForce.z += current.direction.z * strength;
        }
        
        effects.disturbance += influence * 0.3;
      }
    }

    for (const current of this.movingCurrents) {
      const dist = Utils.distance(
        position.x, position.y, position.z,
        current.position.x, current.position.y, current.position.z
      );
      
      if (dist < current.radius) {
        const influence = 1 - (dist / current.radius);
        const strength = current.strength * influence;
        
        effects.waterForce.x += current.direction.x * strength;
        effects.waterForce.y += current.direction.y * strength;
        effects.waterForce.z += current.direction.z * strength;
        
        effects.disturbance += influence * 0.2;
      }
    }

    for (const zone of this.temperatureZones) {
      const dist = Utils.distance(
        position.x, position.y, position.z,
        zone.position.x, zone.position.y, zone.position.z
      );
      
      if (dist < zone.radius) {
        const influence = 1 - (dist / zone.radius);
        const tempVariation = Math.sin(this.time * zone.frequency + zone.phase) * zone.temperatureVariation;
        effects.temperature += (zone.baseTemperature + tempVariation - effects.temperature) * influence * 0.5;
      }
    }

    for (const vent of this.thermalVents) {
      const dist = Utils.distance(
        position.x, position.y, position.z,
        vent.position.x, vent.position.y, vent.position.z
      );
      
      if (dist < vent.radius) {
        const influence = 1 - (dist / vent.radius);
        const pulse = 0.7 + Math.sin(this.time * vent.frequency + vent.phase) * 0.3;
        effects.temperature += vent.temperature * influence * pulse * vent.intensity;
        effects.waterForce.y += vent.strength * influence * pulse * 0.5;
        effects.disturbance += influence * 0.5;
      }
    }

    for (const zone of this.pressureZones) {
      const dist = Utils.distance(
        position.x, position.y, position.z,
        zone.position.x, zone.position.y, zone.position.z
      );
      
      if (dist < zone.radius) {
        const influence = 1 - (dist / zone.radius);
        const pulse = 0.9 + Math.sin(this.time * zone.frequency + zone.phase) * 0.1;
        effects.pressure += (zone.pressureFactor - 1) * influence * pulse;
      }
    }

    effects.visibility = Math.max(0.3, 1 - effects.disturbance * 0.5);

    return effects;
  }

  getEnvironmentState() {
    return {
      waterCurrents: this.waterCurrents.map(c => ({
        id: c.id,
        position: { ...c.position },
        radius: c.radius,
        strength: c.strength,
        type: c.type
      })),
      thermalVents: this.thermalVents.map(v => ({
        id: v.id,
        position: { ...v.position },
        radius: v.radius,
        temperature: v.temperature
      })),
      time: this.time
    };
  }
}

return EnvironmentSystem;
}));
