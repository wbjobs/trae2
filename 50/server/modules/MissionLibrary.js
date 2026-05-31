class MissionLibrary {
  constructor() {
    this.missionTemplates = this.initMissionTemplates();
    this.dailyMissions = [];
    this.specialMissions = [];
    this.lastDailyRefresh = 0;
  }

  initMissionTemplates() {
    return {
      data_collection: [
        {
          id: 'collect_temperature_24h',
          name: '24小时温度数据采集',
          description: '确保气象站连续运行24小时，采集完整温度数据',
          category: 'data_collection',
          type: 'duration',
          duration: 300,
          targetEquipment: 'weather_station',
          requirements: { minUptime: 280, maxFaults: 1 },
          reward: { score: 200, experience: 50 },
          difficulty: 'easy'
        },
        {
          id: 'collect_humidity_data',
          name: '湿度趋势分析数据采集',
          description: '采集连续湿度数据用于趋势分析',
          category: 'data_collection',
          type: 'duration',
          duration: 180,
          targetEquipment: 'weather_station',
          requirements: { minUptime: 160, dataQuality: 0.8 },
          reward: { score: 150, experience: 30 },
          difficulty: 'easy'
        },
        {
          id: 'wind_data_survey',
          name: '风能资源普查',
          description: '采集风速和风向数据，评估风能潜力',
          category: 'data_collection',
          type: 'condition',
          condition: 'wind_stable',
          duration: 120,
          targetEquipment: 'weather_station',
          requirements: { minWindSpeed: 5, dataPoints: 100 },
          reward: { score: 180, experience: 40 },
          difficulty: 'medium'
        }
      ],
      
      equipment_maintenance: [
        {
          id: 'full_system_check',
          name: '系统全面检查',
          description: '对所有设备进行一次全面的状态检查和维护',
          category: 'equipment_maintenance',
          type: 'all_equipment',
          targetStatus: 'normal',
          requirements: { minHealth: 80, minDurability: 70 },
          reward: { score: 300, experience: 80 },
          difficulty: 'hard',
          timeLimit: 600
        },
        {
          id: 'solar_panel_cleaning',
          name: '太阳能板清洁维护',
          description: '清洁太阳能板表面，提高发电效率',
          category: 'equipment_maintenance',
          type: 'specific_equipment',
          targetEquipment: 'solar_panel',
          action: 'maintenance',
          requirements: { durabilityAfter: 85 },
          reward: { score: 100, experience: 20 },
          difficulty: 'easy'
        },
        {
          id: 'sensor_calibration',
          name: '传感器校准任务',
          description: '对传感器阵列进行精确校准',
          category: 'equipment_maintenance',
          type: 'specific_equipment',
          targetEquipment: 'sensor_array',
          action: 'calibration',
          requirements: { calibrationAccuracy: 0.95 },
          reward: { score: 180, experience: 50 },
          difficulty: 'medium'
        },
        {
          id: 'antenna_alignment',
          name: '天线定向校准',
          description: '调整通信天线方向，优化信号质量',
          category: 'equipment_maintenance',
          type: 'specific_equipment',
          targetEquipment: 'antenna',
          action: 'alignment',
          requirements: { signalQuality: 0.9 },
          reward: { score: 160, experience: 45 },
          difficulty: 'medium'
        }
      ],
      
      research_mission: [
        {
          id: 'storm_observation',
          name: '暴风雨现象观测',
          description: '在暴风雨期间记录所有气象参数变化',
          category: 'research_mission',
          type: 'event_triggered',
          triggerEvent: 'storm',
          duration: 60,
          targetEquipment: 'weather_station',
          requirements: { stormIntensity: 0.5, dataPoints: 50 },
          reward: { score: 350, experience: 100, medal: 'storm_observer' },
          difficulty: 'hard'
        },
        {
          id: 'extreme_temp_study',
          name: '极端温度研究',
          description: '研究极端温度条件下设备性能变化',
          category: 'research_mission',
          type: 'condition',
          condition: 'extreme_temperature',
          duration: 90,
          targetEquipment: 'all',
          requirements: { tempThreshold: 35, sampleRate: 1 },
          reward: { score: 400, experience: 120 },
          difficulty: 'hard'
        },
        {
          id: 'night_observation',
          name: '夜间环境观测',
          description: '在夜间时段进行环境参数连续观测',
          category: 'research_mission',
          type: 'time_window',
          timeWindow: 'night',
          duration: 120,
          targetEquipment: 'sensor_array',
          requirements: { dataCompleteness: 0.9 },
          reward: { score: 220, experience: 60 },
          difficulty: 'medium'
        }
      ],
      
      emergency_response: [
        {
          id: 'quick_repair_challenge',
          name: '紧急修复挑战',
          description: '在限时内修复3个设备故障',
          category: 'emergency_response',
          type: 'challenge',
          targetCount: 3,
          timeLimit: 120,
          requirements: { repairsWithinTime: 3 },
          reward: { score: 500, experience: 150, medal: 'quick_fixer' },
          difficulty: 'extreme'
        },
        {
          id: 'crisis_management',
          name: '危机管理',
          description: '在恶劣天气条件下保持至少3台设备正常运行',
          category: 'emergency_response',
          type: 'survival',
          duration: 180,
          weatherCondition: 'extreme',
          requirements: { minOperationalEquipment: 3 },
          reward: { score: 600, experience: 200, medal: 'crisis_manager' },
          difficulty: 'extreme'
        }
      ],
      
      achievement: [
        {
          id: 'flawless_operation',
          name: '零故障运行',
          description: '保持所有设备连续10分钟无故障运行',
          category: 'achievement',
          type: 'milestone',
          duration: 600,
          requirements: { zeroFaults: true },
          reward: { score: 800, experience: 250, medal: 'flawless_operator' },
          difficulty: 'extreme',
          isHidden: true
        },
        {
          id: 'efficiency_master',
          name: '效率大师',
          description: '所有设备运行效率达到90%以上',
          category: 'achievement',
          type: 'milestone',
          requirements: { allEfficiencyAbove: 0.9 },
          reward: { score: 450, experience: 100, medal: 'efficiency_master' },
          difficulty: 'hard',
          isHidden: true
        }
      ]
    };
  }

  generateDailyMissions(count = 3) {
    const now = Date.now();
    if (now - this.lastDailyRefresh < 86400000 && this.dailyMissions.length > 0) {
      return this.dailyMissions;
    }

    this.dailyMissions = [];
    const allMissions = [];
    
    Object.values(this.missionTemplates).forEach(category => {
      category.forEach(mission => {
        if (!mission.isHidden && mission.difficulty !== 'extreme') {
          allMissions.push(mission);
        }
      });
    });

    const shuffled = this.shuffleArray(allMissions);
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      this.dailyMissions.push({
        ...shuffled[i],
        instanceId: `daily_${now}_${i}`,
        progress: 0,
        accepted: false,
        completed: false
      });
    }

    this.lastDailyRefresh = now;
    return this.dailyMissions;
  }

  generateRandomMission(preferredCategory = null) {
    let categories = Object.keys(this.missionTemplates);
    if (preferredCategory && this.missionTemplates[preferredCategory]) {
      categories = [preferredCategory];
    }

    const category = categories[Math.floor(Math.random() * categories.length)];
    const missions = this.missionTemplates[category];
    const template = missions[Math.floor(Math.random() * missions.length)];

    return {
      ...template,
      instanceId: `random_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      progress: 0,
      accepted: false,
      completed: false,
      startTime: null
    };
  }

  generateSpecialMission(triggerType, context) {
    const specialTemplates = [];
    
    this.missionTemplates.research_mission?.forEach(mission => {
      if (mission.type === 'event_triggered' && mission.triggerEvent === triggerType) {
        specialTemplates.push(mission);
      }
    });

    this.missionTemplates.emergency_response?.forEach(mission => {
      if (context.isEmergency) {
        specialTemplates.push(mission);
      }
    });

    if (specialTemplates.length === 0) return null;

    const template = specialTemplates[Math.floor(Math.random() * specialTemplates.length)];
    return {
      ...template,
      instanceId: `special_${Date.now()}`,
      progress: 0,
      accepted: false,
      completed: false,
      startTime: Date.now(),
      isSpecial: true,
      triggerType
    };
  }

  checkMissionCompletion(mission, gameState) {
    if (!mission || mission.completed) return false;

    let progress = 0;
    let isComplete = false;

    switch (mission.type) {
      case 'duration':
        const elapsed = (Date.now() - (mission.startTime || Date.now())) / 1000;
        progress = Math.min(1, elapsed / mission.duration);
        isComplete = elapsed >= mission.duration;
        break;

      case 'all_equipment':
        const equipment = gameState.equipment || [];
        const meetRequirements = equipment.every(eq => 
          eq.health >= (mission.requirements?.minHealth || 70) &&
          eq.durability >= (mission.requirements?.minDurability || 60)
        );
        const normalCount = equipment.filter(eq => eq.status === 'normal').length;
        progress = normalCount / equipment.length;
        isComplete = meetRequirements && normalCount === equipment.length;
        break;

      case 'specific_equipment':
        const targetEq = (gameState.equipment || []).find(eq => 
          eq.type === mission.targetEquipment || eq.id.includes(mission.targetEquipment)
        );
        if (targetEq) {
          progress = targetEq.durability / 100;
          isComplete = targetEq.durability >= (mission.requirements?.durabilityAfter || 80);
        }
        break;

      case 'condition':
        if (this.checkCondition(mission.condition, gameState)) {
          if (!mission.conditionStartTime) {
            mission.conditionStartTime = Date.now();
          }
          const conditionElapsed = (Date.now() - mission.conditionStartTime) / 1000;
          progress = Math.min(1, conditionElapsed / mission.duration);
          isComplete = conditionElapsed >= mission.duration;
        } else {
          mission.conditionStartTime = null;
        }
        break;

      case 'challenge':
        const completedRepairs = gameState.completedRepairs || 0;
        progress = Math.min(1, completedRepairs / mission.targetCount);
        isComplete = completedRepairs >= mission.targetCount;
        break;

      case 'milestone':
        isComplete = this.checkMilestoneCondition(mission.requirements, gameState);
        progress = isComplete ? 1 : 0;
        break;
    }

    mission.progress = progress;
    return isComplete;
  }

  checkCondition(condition, gameState) {
    const env = gameState.environment || {};
    
    switch (condition) {
      case 'wind_stable':
        return env.windSpeed >= 5 && env.windSpeed <= 15;
      case 'extreme_temperature':
        return env.temperature > 35 || env.temperature < -10;
      case 'storm':
        return env.isStorm && env.stormIntensity > 0.5;
      default:
        return false;
    }
  }

  checkMilestoneCondition(requirements, gameState) {
    const equipment = gameState.equipment || [];

    if (requirements.zeroFaults) {
      return equipment.every(eq => eq.faults.length === 0 && eq.status === 'normal');
    }

    if (requirements.allEfficiencyAbove) {
      return equipment.every(eq => (eq.efficiency || 0) >= requirements.allEfficiencyAbove);
    }

    return false;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getMissionById(missionId) {
    for (const category of Object.values(this.missionTemplates)) {
      const mission = category.find(m => m.id === missionId);
      if (mission) return mission;
    }
    return null;
  }

  getAvailableMissions() {
    return {
      daily: this.generateDailyMissions(),
      random: [
        this.generateRandomMission(),
        this.generateRandomMission()
      ],
      special: this.specialMissions.filter(m => !m.completed)
    };
  }

  addSpecialMission(mission) {
    if (!this.specialMissions.find(m => m.instanceId === mission.instanceId)) {
      this.specialMissions.push(mission);
    }
  }

  cleanCompletedMissions() {
    this.specialMissions = this.specialMissions.filter(m => !m.completed);
  }
}

module.exports = MissionLibrary;
