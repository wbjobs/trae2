class SensorSimulator {
  constructor(config, world) {
    this.config = config;
    this.world = world;
    this.sensorData = {
      sonar: [],
      pressure: 0,
      temperature: 0,
      oxygen: 0,
      depth: 0,
      speed: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      energy: 0,
      obstacles: [],
      samples: []
    };
    this.lastUpdate = 0;
  }

  update(vehicle, deltaTime) {
    const now = Date.now();
    if (now - this.lastUpdate < this.config.SENSORS.UPDATE_INTERVAL) {
      return this.sensorData;
    }
    this.lastUpdate = now;

    this.updatePressure(vehicle);
    this.updateTemperature(vehicle);
    this.updateOxygen(vehicle);
    this.updateDepth(vehicle);
    this.updateSpeed(vehicle);
    this.updateOrientation(vehicle);
    this.updateEnergy(vehicle);
    this.updateSonar(vehicle);
    this.updateObstacles(vehicle);
    this.updateSamples(vehicle);

    return this.sensorData;
  }

  updatePressure(vehicle) {
    const basePressure = 101325;
    const pressurePerMeter = 9806.65;
    const truePressure = basePressure + Math.abs(vehicle.position.y) * pressurePerMeter;
    const noise = (Math.random() - 0.5) * 0.02 * truePressure;
    const accuracy = this.config.SENSORS.PRESSURE_SENSOR_ACCURACY;
    this.sensorData.pressure = truePressure * accuracy + noise * (1 - accuracy);
  }

  updateTemperature(vehicle) {
    const depth = Math.abs(vehicle.position.y);
    let baseTemp = 25;
    if (depth > 200) {
      baseTemp = 25 - (depth - 200) * 0.03;
    }
    baseTemp = Math.max(2, baseTemp);
    const noise = (Math.random() - 0.5) * 0.5;
    const accuracy = this.config.SENSORS.TEMPERATURE_SENSOR_ACCURACY;
    this.sensorData.temperature = baseTemp * accuracy + noise * (1 - accuracy);
  }

  updateOxygen(vehicle) {
    const depth = Math.abs(vehicle.position.y);
    let baseOxygen = 8;
    if (depth > 100) {
      baseOxygen = 8 - (depth - 100) * 0.01;
    }
    baseOxygen = Math.max(2, baseOxygen);
    const noise = (Math.random() - 0.5) * 0.3;
    const accuracy = this.config.SENSORS.OXYGEN_SENSOR_ACCURACY;
    this.sensorData.oxygen = baseOxygen * accuracy + noise * (1 - accuracy);
  }

  updateDepth(vehicle) {
    this.sensorData.depth = Math.abs(vehicle.position.y);
  }

  updateSpeed(vehicle) {
    this.sensorData.speed = Math.sqrt(
      vehicle.velocity.x ** 2 +
      vehicle.velocity.y ** 2 +
      vehicle.velocity.z ** 2
    );
  }

  updateOrientation(vehicle) {
    this.sensorData.heading = vehicle.rotation.y;
    this.sensorData.pitch = vehicle.rotation.x;
    this.sensorData.roll = vehicle.rotation.z;
  }

  updateEnergy(vehicle) {
    this.sensorData.energy = vehicle.energy;
  }

  updateSonar(vehicle) {
    const sonarRays = this.config.SENSORS.SONAR_RAYS;
    const sonarRange = this.config.SENSORS.SONAR_RANGE;
    const sonarAngle = this.config.SENSORS.SONAR_ANGLE;
    
    this.sensorData.sonar = [];
    
    for (let i = 0; i < sonarRays; i++) {
      const angle = (i / sonarRays - 0.5) * sonarAngle + vehicle.rotation.y;
      const ray = this.castRay(vehicle.position, angle, sonarRange);
      this.sensorData.sonar.push({
        angle: angle - vehicle.rotation.y,
        distance: ray.distance,
        hit: ray.hit,
        type: ray.type
      });
    }
  }

  castRay(origin, angle, maxDistance) {
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);
    
    let closestDist = maxDistance;
    let hit = false;
    let type = null;

    for (const obstacle of this.world.obstacles) {
      const dx = obstacle.position.x - origin.x;
      const dz = obstacle.position.z - origin.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);
      
      if (dist2D < maxDistance + obstacle.radius) {
        const angleToObs = Math.atan2(dx, dz);
        let angleDiff = Math.abs(angle - angleToObs);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);
        
        const halfAngle = Math.atan2(obstacle.radius, Math.max(1, dist2D));
        
        if (angleDiff < halfAngle + 0.1) {
          const dist = dist2D - obstacle.radius;
          if (dist < closestDist && dist > 0) {
            closestDist = dist;
            hit = true;
            type = obstacle.type;
          }
        }
      }
    }

    const boundary = this.config.WORLD.SIZE / 2;
    const distToBoundary = Math.min(
      Math.abs(boundary - origin.x) / Math.abs(dirX || 0.001),
      Math.abs(-boundary - origin.x) / Math.abs(dirX || 0.001),
      Math.abs(boundary - origin.z) / Math.abs(dirZ || 0.001),
      Math.abs(-boundary - origin.z) / Math.abs(dirZ || 0.001)
    );
    
    if (distToBoundary < closestDist) {
      closestDist = distToBoundary;
      hit = true;
      type = 'boundary';
    }

    return {
      distance: closestDist,
      hit: hit,
      type: type
    };
  }

  updateObstacles(vehicle) {
    const range = this.config.SENSORS.SONAR_RANGE * 1.5;
    this.sensorData.obstacles = [];

    for (const obstacle of this.world.obstacles) {
      const dist = Utils.distance(
        vehicle.position.x, vehicle.position.y, vehicle.position.z,
        obstacle.position.x, obstacle.position.y, obstacle.position.z
      );
      
      if (dist < range) {
        this.sensorData.obstacles.push({
          id: obstacle.id,
          position: { ...obstacle.position },
          radius: obstacle.radius,
          type: obstacle.type,
          distance: dist
        });
      }
    }

    this.sensorData.obstacles.sort((a, b) => a.distance - b.distance);
  }

  updateSamples(vehicle) {
    this.sensorData.samples = [];
    const range = 50;

    for (const sample of this.world.samples) {
      if (sample.collected) continue;
      
      const dist = Utils.distance(
        vehicle.position.x, vehicle.position.y, vehicle.position.z,
        sample.position.x, sample.position.y, sample.position.z
      );
      
      if (dist < range) {
        this.sensorData.samples.push({
          id: sample.id,
          position: { ...sample.position },
          type: sample.type,
          value: sample.value,
          distance: dist
        });
      }
    }
  }

  getData() {
    return this.sensorData;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  const Utils = require('./utils');
  module.exports = SensorSimulator;
} else if (typeof window !== 'undefined') {
  window.SensorSimulator = SensorSimulator;
}
