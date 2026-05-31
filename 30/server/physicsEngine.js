(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    const CONFIG = require('../shared/config');
    const Utils = require('../shared/utils');
    const SensorSimulator = require('../shared/sensors');
    const CollisionDetector = require('../shared/collision');
    const MissionSystem = require('../shared/mission');
    const EnvironmentSystem = require('../shared/environment');
    const ScoringSystem = require('../shared/scoring');
    module.exports = factory(CONFIG, Utils, SensorSimulator, CollisionDetector, MissionSystem, EnvironmentSystem, ScoringSystem);
  } else {
    root.PhysicsEngine = factory(root.CONFIG, root.Utils, root.SensorSimulator, root.CollisionDetector, root.MissionSystem, root.EnvironmentSystem, root.ScoringSystem);
  }
}(typeof self !== 'undefined' ? self : this, function(CONFIG, Utils, SensorSimulator, CollisionDetector, MissionSystem, EnvironmentSystem, ScoringSystem) {

class PhysicsEngine {
  constructor() {
    this.config = CONFIG;
    this.world = this.createWorld();
    this.vehicles = new Map();
    this.collisionDetector = new CollisionDetector(this.config, this.world);
    this.missionSystem = new MissionSystem(this.config, this.world);
    this.environmentSystem = new EnvironmentSystem(this.config, this.world);
    this.scoringSystem = new ScoringSystem(this.config);
    this.sensorSimulators = new Map();
    this.lastUpdateTime = Date.now();
    this.collisionEvents = [];
    this.fixedDeltaTime = 1 / 60;
    this.accumulatedTime = 0;
    
    this.vehicleLastPosition = new Map();
  }

  createWorld() {
    const world = {
      obstacles: [],
      samples: [],
      time: 0
    };

    const obstacleTypes = ['rock', 'coral', 'cave', 'thermal_vent', 'plant', 'ridge', 'wreck'];
    const numObstacles = 80;
    
    for (let i = 0; i < numObstacles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * (this.config.WORLD.SIZE / 2 - 100);
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      
      world.obstacles.push({
        id: `obstacle_${i}`,
        type: type,
        position: {
          x: Math.cos(angle) * radius,
          y: -30 - Math.random() * (this.config.WORLD.DEPTH - 60),
          z: Math.sin(angle) * radius
        },
        radius: 8 + Math.random() * 25,
        discovered: false
      });
    }

    const sampleTypes = [
      { type: 'water_sample', value: 1 },
      { type: 'mineral', value: 2 },
      { type: 'rare_species', value: 5 },
      { type: 'ancient_artifact', value: 10 },
      { type: 'thermal_data', value: 3 }
    ];
    
    const numSamples = 40;
    for (let i = 0; i < numSamples; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * (this.config.WORLD.SIZE / 2 - 60);
      const sampleInfo = sampleTypes[Math.floor(Math.random() * sampleTypes.length)];
      
      world.samples.push({
        id: `sample_${i}`,
        type: sampleInfo.type,
        position: {
          x: Math.cos(angle) * radius,
          y: -50 - Math.random() * (this.config.WORLD.DEPTH - 100),
          z: Math.sin(angle) * radius
        },
        value: sampleInfo.value,
        collected: false
      });
    }

    return world;
  }

  addVehicle(vehicleId, color = '#00ff88') {
    const vehicle = {
      id: vehicleId,
      position: { x: 0, y: -50, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      bionicState: {
        tailPhase: 0,
        leftFinPhase: 0,
        rightFinPhase: 0,
        bodyPitch: 0,
        bodyRoll: 0
      },
      input: {
        forward: 0,
        backward: 0,
        left: 0,
        right: 0,
        up: 0,
        down: 0,
        rollLeft: 0,
        rollRight: 0,
        boost: 0,
        brake: 0
      },
      health: 100,
      energy: this.config.VEHICLE.ENERGY_MAX,
      buoyancy: 50,
      alive: true,
      color: color,
      sensorData: null,
      collectedSamples: [],
      missionRewards: 0,
      environmentEffects: null
    };

    this.vehicles.set(vehicleId, vehicle);
    this.sensorSimulators.set(vehicleId, new SensorSimulator(this.config, this.world));
    this.scoringSystem.initVehicle(vehicleId);
    this.vehicleLastPosition.set(vehicleId, { ...vehicle.position });
    
    return vehicle;
  }

  removeVehicle(vehicleId) {
    this.vehicles.delete(vehicleId);
    this.sensorSimulators.delete(vehicleId);
    this.vehicleLastPosition.delete(vehicleId);
  }

  setInput(vehicleId, input) {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle) {
      vehicle.input = { ...vehicle.input, ...input };
    }
  }

  update() {
    const now = Date.now();
    const realDeltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    this.accumulatedTime += realDeltaTime;
    
    let updateCount = 0;
    while (this.accumulatedTime >= this.fixedDeltaTime && updateCount < 5) {
      this.environmentSystem.update(this.fixedDeltaTime);
      this.scoringSystem.update(this.fixedDeltaTime);
      
      for (const [vehicleId, vehicle] of this.vehicles) {
        if (!vehicle.alive) continue;
        
        this.updateBionicMotion(vehicle, this.fixedDeltaTime);
        this.updatePhysics(vehicle, this.fixedDeltaTime);
        
        const sensorSimulator = this.sensorSimulators.get(vehicleId);
        if (sensorSimulator) {
          sensorSimulator.update(vehicle);
          vehicle.sensorData = sensorSimulator.getSensorData();
        }
        
        this.checkSampleCollection(vehicle, vehicleId);
        this.missionSystem.update(vehicle, this.fixedDeltaTime);
        
        const lastPos = this.vehicleLastPosition.get(vehicleId);
        if (lastPos) {
          const distance = Utils.distance(
            lastPos.x, lastPos.y, lastPos.z,
            vehicle.position.x, vehicle.position.y, vehicle.position.z
          );
          this.scoringSystem.addDistanceScore(vehicleId, distance);
          this.scoringSystem.updateMaxDepth(vehicleId, Math.abs(vehicle.position.y));
        }
        this.vehicleLastPosition.set(vehicleId, { ...vehicle.position });
      }
      
      this.collisionEvents = this.collisionDetector.update(
        Array.from(this.vehicles.values()),
        this.fixedDeltaTime
      );
      
      for (const event of this.collisionEvents) {
        const vehicle = this.vehicles.get(event.vehicleId);
        if (vehicle) {
          vehicle.health -= event.severity * 20;
          if (vehicle.health <= 0) {
            vehicle.health = 0;
            vehicle.alive = false;
          }
          
          const avoided = event.severity < 0.3;
          this.scoringSystem.addCollisionScore(event.vehicleId, avoided, event.severity);
        }
      }
      
      for (const [vehicleId, vehicle] of this.vehicles) {
        if (vehicle.sensorData && vehicle.sensorData.obstacles) {
          for (const obs of vehicle.sensorData.obstacles) {
            const obstacle = this.world.obstacles.find(o => o.id === obs.id);
            if (obstacle && !obstacle.discovered) {
              obstacle.discovered = true;
              this.scoringSystem.addDiscoveryScore(vehicleId, obstacle.type);
            }
          }
        }
      }
      
      this.world.time += this.fixedDeltaTime;
      this.accumulatedTime -= this.fixedDeltaTime;
      updateCount++;
    }

    return this.getState();
  }

  updateBionicMotion(vehicle, deltaTime) {
    const input = vehicle.input;
    const bionic = vehicle.bionicState;
    
    const tailSpeed = input.forward > 0 ? 3 : input.backward > 0 ? -2 : 0.5;
    bionic.tailPhase += tailSpeed * deltaTime * this.config.BIONIC.TAIL_FREQUENCY;
    
    bionic.leftFinPhase += deltaTime * 2;
    bionic.rightFinPhase += deltaTime * 2;
    
    const turnAmount = input.right - input.left;
    const pitchAmount = input.up - input.down;
    const rollAmount = input.rollRight - input.rollLeft;
    
    bionic.bodyPitch = Utils.lerp(bionic.bodyPitch, pitchAmount * 0.3, deltaTime * 5);
    bionic.bodyRoll = Utils.lerp(bionic.bodyRoll, rollAmount * 0.4, deltaTime * 5);
    
    vehicle.rotation.x = Utils.lerp(vehicle.rotation.x, pitchAmount * 0.2, deltaTime * 3);
    vehicle.rotation.z = Utils.lerp(vehicle.rotation.z, -rollAmount * 0.3, deltaTime * 3);
    vehicle.rotation.y += turnAmount * this.config.VEHICLE.TURN_SPEED * (input.boost > 0 ? 1.5 : 1);
  }

  updatePhysics(vehicle, deltaTime) {
    const input = vehicle.input;
    
    vehicle.environmentEffects = this.environmentSystem.getEnvironmentEffects(vehicle.position);
    
    const sin = Math.sin;
    const cos = Math.cos;
    
    const yaw = vehicle.rotation.y;
    const pitch = vehicle.rotation.x;
    
    const sinYaw = sin(yaw);
    const cosYaw = cos(yaw);
    const sinPitch = sin(pitch);
    const cosPitch = cos(pitch);
    
    const thrust = (input.forward - input.backward) * this.config.VEHICLE.ACCELERATION;
    const boostMultiplier = input.boost > 0 ? 2 : 1;
    const brakeMultiplier = input.brake > 0 ? 0.3 : 1;
    
    const forwardX = -sinYaw * cosPitch;
    const forwardY = sinPitch;
    const forwardZ = -cosYaw * cosPitch;
    
    vehicle.velocity.x += forwardX * thrust * boostMultiplier * brakeMultiplier * deltaTime;
    vehicle.velocity.y += forwardY * thrust * boostMultiplier * brakeMultiplier * deltaTime;
    vehicle.velocity.z += forwardZ * thrust * boostMultiplier * brakeMultiplier * deltaTime;
    
    const env = vehicle.environmentEffects;
    if (env) {
      vehicle.velocity.x += env.waterForce.x * deltaTime;
      vehicle.velocity.y += env.waterForce.y * deltaTime;
      vehicle.velocity.z += env.waterForce.z * deltaTime;
    }
    
    const buoyancyForce = (vehicle.buoyancy - 50) * 0.01;
    vehicle.velocity.y += buoyancyForce * deltaTime * this.config.WORLD.BUOYANCY;
    vehicle.velocity.y -= this.config.WORLD.GRAVITY * deltaTime;
    
    const speedSq = vehicle.velocity.x * vehicle.velocity.x + 
                   vehicle.velocity.y * vehicle.velocity.y + 
                   vehicle.velocity.z * vehicle.velocity.z;
    const speed = Math.sqrt(speedSq);
    const maxSpeed = this.config.VEHICLE.MAX_SPEED * boostMultiplier;
    
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      vehicle.velocity.x *= scale;
      vehicle.velocity.y *= scale;
      vehicle.velocity.z *= scale;
    }
    
    const resistance = Math.pow(this.config.WORLD.WATER_RESISTANCE, deltaTime * 60);
    vehicle.velocity.x *= resistance;
    vehicle.velocity.y *= resistance;
    vehicle.velocity.z *= resistance;
    
    vehicle.position.x += vehicle.velocity.x * deltaTime * 10;
    vehicle.position.y += vehicle.velocity.y * deltaTime * 10;
    vehicle.position.z += vehicle.velocity.z * deltaTime * 10;
    
    const boundary = this.config.WORLD.SIZE / 2;
    vehicle.position.x = Math.max(-boundary, Math.min(boundary, vehicle.position.x));
    vehicle.position.z = Math.max(-boundary, Math.min(boundary, vehicle.position.z));
    vehicle.position.y = Math.max(-this.config.WORLD.DEPTH, Math.min(-10, vehicle.position.y));
    
    const energyConsumption = this.config.VEHICLE.ENERGY_CONSUMPTION * 
      (Math.abs(thrust) + Math.abs(input.up) + Math.abs(input.down)) * boostMultiplier;
    vehicle.energy = Math.max(0, vehicle.energy - energyConsumption * deltaTime);
  }

  checkSampleCollection(vehicle, vehicleId) {
    const collectRadius = 15;
    
    for (const sample of this.world.samples) {
      if (sample.collected) continue;
      
      const dist = Utils.distance(
        vehicle.position.x, vehicle.position.y, vehicle.position.z,
        sample.position.x, sample.position.y, sample.position.z
      );
      
      if (dist < collectRadius) {
        sample.collected = true;
        vehicle.collectedSamples.push(sample.id);
        this.scoringSystem.addSampleScore(vehicleId, sample.type, sample.value);
        
        const missionReward = this.missionSystem.onSampleCollected(vehicle, sample);
        if (missionReward > 0) {
          vehicle.missionRewards += missionReward;
          this.scoringSystem.addMissionScore(vehicleId, 'sample_mission', missionReward);
        }
      }
    }
  }

  getVehicleState(vehicleId) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return null;

    return {
      id: vehicle.id,
      position: { ...vehicle.position },
      velocity: { ...vehicle.velocity },
      rotation: { ...vehicle.rotation },
      bionicState: { ...vehicle.bionicState },
      health: vehicle.health,
      energy: vehicle.energy,
      buoyancy: vehicle.buoyancy,
      alive: vehicle.alive,
      sensorData: vehicle.sensorData || null,
      collectedSamples: vehicle.collectedSamples || [],
      missionRewards: vehicle.missionRewards || 0,
      environmentEffects: vehicle.environmentEffects ? {
        temperature: vehicle.environmentEffects.temperature,
        pressure: vehicle.environmentEffects.pressure,
        visibility: vehicle.environmentEffects.visibility,
        disturbance: vehicle.environmentEffects.disturbance
      } : null,
      score: this.scoringSystem.getScoreState(vehicleId)
    };
  }

  getState() {
    const vehicles = [];
    for (const [id, vehicle] of this.vehicles) {
      vehicles.push(this.getVehicleState(id));
    }

    return {
      vehicles: vehicles,
      world: {
        obstacles: this.world.obstacles.map(o => ({
          id: o.id,
          position: { ...o.position },
          radius: o.radius,
          type: o.type,
          discovered: o.discovered
        })),
        samples: this.world.samples.filter(s => !s.collected).map(s => ({
          id: s.id,
          position: { ...s.position },
          type: s.type,
          value: s.value
        })),
        time: this.world.time
      },
      environment: this.environmentSystem.getEnvironmentState(),
      leaderboard: this.scoringSystem.getLeaderboard(),
      collisionEvents: this.collisionEvents,
      missionState: this.missionSystem.getMissionState(),
      storyDialogue: this.missionSystem.getStoryDialogue()
    };
  }
}

return PhysicsEngine;
}));
