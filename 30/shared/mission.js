class MissionSystem {
  constructor(config, world) {
    this.config = config;
    this.world = world;
    this.missions = [];
    this.activeMissions = new Map();
    this.completedMissions = [];
    this.storyProgress = 0;
    this.availableMissions = this.generateMissionTemplates();
  }

  generateMissionTemplates() {
    return [
      {
        id: 'explore_shallow',
        name: '浅海探索',
        description: '探索水深100米以内的区域，收集3个海洋生物样本',
        type: 'exploration',
        targetDepth: 100,
        samplesRequired: 3,
        reward: 100,
        storyIndex: 0,
        prerequisites: []
      },
      {
        id: 'map_reef',
        name: '珊瑚礁测绘',
        description: '使用声呐绘制东部珊瑚礁的完整地图',
        type: 'mapping',
        targetArea: { x: 300, z: 200, radius: 150 },
        reward: 150,
        storyIndex: 1,
        prerequisites: ['explore_shallow']
      },
      {
        id: 'deep_dive',
        name: '深海下潜',
        description: '下潜至300米深度，收集深海岩石样本',
        type: 'exploration',
        targetDepth: 300,
        samplesRequired: 5,
        reward: 200,
        storyIndex: 2,
        prerequisites: ['map_reef']
      },
      {
        id: 'search_wreck',
        name: '沉船搜索',
        description: '在西南海域寻找失踪的科研船残骸',
        type: 'search',
        targetArea: { x: -400, z: -300, radius: 200 },
        reward: 250,
        storyIndex: 3,
        prerequisites: ['deep_dive']
      },
      {
        id: 'recover_data',
        name: '数据回收',
        description: '从沉船中回收黑匣子数据存储器',
        type: 'recovery',
        targetObject: 'black_box',
        reward: 300,
        storyIndex: 4,
        prerequisites: ['search_wreck']
      }
    ];
  }

  startMission(missionId, vehicleId) {
    const template = this.availableMissions.find(m => m.id === missionId);
    if (!template) return null;

    if (template.prerequisites.length > 0) {
      const prereqsMet = template.prerequisites.every(prereq => 
        this.completedMissions.some(m => m.missionId === prereq && m.vehicleId === vehicleId)
      );
      if (!prereqsMet) return null;
    }

    const mission = {
      ...template,
      vehicleId: vehicleId,
      startTime: Date.now(),
      progress: 0,
      status: 'active',
      collectedSamples: [],
      mappedAreas: [],
      data: {}
    };

    if (!this.activeMissions.has(vehicleId)) {
      this.activeMissions.set(vehicleId, []);
    }
    this.activeMissions.get(vehicleId).push(mission);

    this.generateMissionObjects(mission);

    return mission;
  }

  generateMissionObjects(mission) {
    switch (mission.type) {
      case 'exploration':
        this.generateSamples(mission);
        break;
      case 'mapping':
        this.generateMappingTargets(mission);
        break;
      case 'search':
        this.generateSearchTarget(mission);
        break;
      case 'recovery':
        this.generateRecoveryTarget(mission);
        break;
    }
  }

  generateSamples(mission) {
    const count = mission.samplesRequired || 3;
    const centerX = Utils.randomRange(-300, 300);
    const centerZ = Utils.randomRange(-300, 300);
    const minDepth = mission.targetDepth ? Math.min(-mission.targetDepth + 50, -50) : -50;
    const maxDepth = mission.targetDepth ? -mission.targetDepth : -200;

    for (let i = 0; i < count; i++) {
      const sample = {
        id: `sample_${mission.id}_${i}_${Date.now()}`,
        missionId: mission.id,
        position: {
          x: centerX + Utils.randomRange(-100, 100),
          y: Utils.randomRange(minDepth, maxDepth),
          z: centerZ + Utils.randomRange(-100, 100)
        },
        type: this.getRandomSampleType(),
        value: Utils.randomRange(50, 150),
        collected: false
      };
      this.world.samples.push(sample);
    }
  }

  generateMappingTargets(mission) {
    const area = mission.targetArea;
    const gridSize = 50;
    const targets = [];
    
    for (let x = -area.radius; x <= area.radius; x += gridSize) {
      for (let z = -area.radius; z <= area.radius; z += gridSize) {
        if (x * x + z * z <= area.radius * area.radius) {
          targets.push({
            x: area.x + x,
            z: area.z + z,
            mapped: false
          });
        }
      }
    }
    
    mission.data.mappingTargets = targets;
  }

  generateSearchTarget(mission) {
    const area = mission.targetArea;
    const wreck = {
      id: `wreck_${mission.id}`,
      position: {
        x: area.x + Utils.randomRange(-area.radius * 0.5, area.radius * 0.5),
        y: -250 + Utils.randomRange(-50, 50),
        z: area.z + Utils.randomRange(-area.radius * 0.5, area.radius * 0.5)
      },
      radius: 30,
      type: 'wreck',
      discovered: false
    };
    
    this.world.obstacles.push(wreck);
    mission.data.wreckId = wreck.id;
  }

  generateRecoveryTarget(mission) {
    const wreck = this.world.obstacles.find(o => o.id === 'wreck_search_wreck');
    if (wreck) {
      const blackBox = {
        id: 'black_box',
        position: {
          x: wreck.position.x + Utils.randomRange(-10, 10),
          y: wreck.position.y + Utils.randomRange(-5, 5),
          z: wreck.position.z + Utils.randomRange(-10, 10)
        },
        type: 'artifact',
        value: 500,
        collected: false
      };
      this.world.samples.push(blackBox);
      mission.data.targetId = 'black_box';
    }
  }

  getRandomSampleType() {
    const types = ['coral', 'rock', 'mineral', 'biological', 'artifact'];
    return types[Utils.randomInt(0, types.length - 1)];
  }

  update(vehicles, deltaTime) {
    for (const vehicle of vehicles) {
      const missions = this.activeMissions.get(vehicle.id) || [];
      
      for (const mission of missions) {
        if (mission.status !== 'active') continue;
        
        this.updateMissionProgress(mission, vehicle);
        this.checkMissionCompletion(mission, vehicle);
      }
    }

    return this.getMissionState();
  }

  updateMissionProgress(mission, vehicle) {
    switch (mission.type) {
      case 'exploration':
        this.updateExplorationMission(mission, vehicle);
        break;
      case 'mapping':
        this.updateMappingMission(mission, vehicle);
        break;
      case 'search':
        this.updateSearchMission(mission, vehicle);
        break;
      case 'recovery':
        this.updateRecoveryMission(mission, vehicle);
        break;
    }
  }

  updateExplorationMission(mission, vehicle) {
    const depth = Math.abs(vehicle.position.y);
    if (mission.targetDepth && depth >= mission.targetDepth) {
      mission.data.reachedTargetDepth = true;
    }

    const collectedCount = mission.collectedSamples.length;
    const required = mission.samplesRequired || 3;
    mission.progress = (collectedCount / required) * 100;
  }

  updateMappingMission(mission, vehicle) {
    if (!mission.data.mappingTargets) return;
    
    const sonarRange = this.config.SENSORS.SONAR_RANGE * 0.8;
    
    for (const target of mission.data.mappingTargets) {
      if (target.mapped) continue;
      
      const dist = Utils.distance2D(
        vehicle.position.x, vehicle.position.z,
        target.x, target.z
      );
      
      if (dist < sonarRange) {
        target.mapped = true;
        mission.mappedAreas.push({ x: target.x, z: target.z, time: Date.now() });
      }
    }
    
    const total = mission.data.mappingTargets.length;
    const mapped = mission.data.mappingTargets.filter(t => t.mapped).length;
    mission.progress = total > 0 ? (mapped / total) * 100 : 0;
  }

  updateSearchMission(mission, vehicle) {
    const wreck = this.world.obstacles.find(o => o.id === mission.data.wreckId);
    if (!wreck || wreck.discovered) return;
    
    const dist = Utils.distance(
      vehicle.position.x, vehicle.position.y, vehicle.position.z,
      wreck.position.x, wreck.position.y, wreck.position.z
    );
    
    if (dist < 80) {
      wreck.discovered = true;
      mission.data.wreckDiscovered = true;
      mission.progress = 100;
    } else {
      const area = mission.targetArea;
      const areaDist = Utils.distance2D(
        vehicle.position.x, vehicle.position.z,
        area.x, area.z
      );
      mission.progress = Math.max(0, 100 - (areaDist / area.radius) * 100) * 0.8;
    }
  }

  updateRecoveryMission(mission, vehicle) {
    const target = this.world.samples.find(s => s.id === mission.data.targetId);
    if (!target) return;
    
    const dist = Utils.distance(
      vehicle.position.x, vehicle.position.y, vehicle.position.z,
      target.position.x, target.position.y, target.position.z
    );
    
    if (dist < 10) {
      mission.data.targetLocated = true;
      mission.progress = 100;
    } else {
      mission.progress = Math.max(0, 100 - dist / 2);
    }
  }

  checkMissionCompletion(mission, vehicle) {
    let completed = false;
    
    switch (mission.type) {
      case 'exploration':
        completed = mission.collectedSamples.length >= (mission.samplesRequired || 3);
        break;
      case 'mapping':
        if (mission.data.mappingTargets) {
          const mappedCount = mission.data.mappingTargets.filter(t => t.mapped).length;
          completed = mappedCount >= mission.data.mappingTargets.length * 0.9;
        }
        break;
      case 'search':
        completed = mission.data.wreckDiscovered === true;
        break;
      case 'recovery':
        completed = mission.data.targetLocated === true;
        break;
    }
    
    if (completed && mission.status === 'active') {
      mission.status = 'completed';
      mission.endTime = Date.now();
      this.completedMissions.push({
        missionId: mission.id,
        vehicleId: vehicle.id,
        completionTime: mission.endTime - mission.startTime,
        reward: mission.reward
      });
      this.storyProgress = Math.max(this.storyProgress, mission.storyIndex + 1);
      
      if (!vehicle.missionRewards) vehicle.missionRewards = 0;
      vehicle.missionRewards += mission.reward;
    }
  }

  collectSample(vehicleId, sampleId) {
    const missions = this.activeMissions.get(vehicleId) || [];
    const sample = this.world.samples.find(s => s.id === sampleId);
    
    if (!sample || sample.collected) return false;
    
    sample.collected = true;
    
    for (const mission of missions) {
      if (mission.status !== 'active') continue;
      
      if (mission.type === 'exploration' || mission.type === 'recovery') {
        mission.collectedSamples.push(sampleId);
        
        if (!vehicle.collectedSamples) vehicle.collectedSamples = [];
        vehicle.collectedSamples.push(sample);
      }
    }
    
    return true;
  }

  getActiveMissions(vehicleId) {
    return this.activeMissions.get(vehicleId) || [];
  }

  getAvailableMissions(vehicleId) {
    return this.availableMissions.filter(mission => {
      const notCompleted = !this.completedMissions.some(
        m => m.missionId === mission.id && m.vehicleId === vehicleId
      );
      const notActive = !(this.activeMissions.get(vehicleId) || []).some(
        m => m.id === mission.id && m.status === 'active'
      );
      const prereqsMet = mission.prerequisites.every(prereq =>
        this.completedMissions.some(m => m.missionId === prereq && m.vehicleId === vehicleId)
      );
      return notCompleted && notActive && prereqsMet;
    });
  }

  getMissionState() {
    return {
      activeMissions: Array.from(this.activeMissions.entries()).map(([vehicleId, missions]) => ({
        vehicleId,
        missions: missions.filter(m => m.status === 'active')
      })),
      completedMissions: this.completedMissions,
      storyProgress: this.storyProgress,
      availableMissions: this.availableMissions
    };
  }

  getStoryDialogue() {
    const dialogues = [
      {
        index: 0,
        speaker: '指挥中心',
        text: '欢迎加入深海探测任务。先从浅海区域开始熟悉设备操作。',
        missionHint: '收集3个样本即可完成初次探索任务'
      },
      {
        index: 1,
        speaker: '指挥中心',
        text: '很好！东部发现了一片未被记录的珊瑚礁，前去测绘一下。',
        missionHint: '使用声呐覆盖整个珊瑚礁区域'
      },
      {
        index: 2,
        speaker: '指挥中心',
        text: '珊瑚礁的数据非常有价值。现在测试一下深潜能力，下潜到300米。',
        missionHint: '注意监控压力和氧气指标'
      },
      {
        index: 3,
        speaker: '指挥中心',
        text: '收到信号！三年前失踪的科研船可能在西南海域。去搜索一下。',
        missionHint: '残骸应该在250米左右的深度'
      },
      {
        index: 4,
        speaker: '指挥中心',
        text: '发现残骸！找到黑匣子，这对事故调查至关重要。',
        missionHint: '黑匣子会发出周期性脉冲信号'
      },
      {
        index: 5,
        speaker: '指挥中心',
        text: '太棒了！你成功回收了黑匣子数据。深海探测任务圆满完成！',
        missionHint: '所有主线任务已完成'
      }
    ];
    
    return dialogues[Math.min(this.storyProgress, dialogues.length - 1)];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  const Utils = require('./utils');
  module.exports = MissionSystem;
} else if (typeof window !== 'undefined') {
  window.MissionSystem = MissionSystem;
}
