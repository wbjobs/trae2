(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    const Utils = require('./utils');
    const CONFIG = require('./config');
    module.exports = factory(Utils, CONFIG);
  } else {
    root.ScoringSystem = factory(root.Utils, root.CONFIG);
  }
}(typeof self !== 'undefined' ? self : this, function(Utils, CONFIG) {

class ScoringSystem {
  constructor(config) {
    this.config = config;
    this.scores = new Map();
    this.scoreHistory = [];
    this.achievements = new Map();
    this.combos = new Map();
    this.multipliers = new Map();
  }

  initVehicle(vehicleId) {
    this.scores.set(vehicleId, {
      totalScore: 0,
      currentScore: 0,
      highScore: this.loadHighScore(vehicleId),
      level: 1,
      experience: 0,
      experienceToNextLevel: 1000,
      stats: {
        samplesCollected: 0,
        obstaclesDiscovered: 0,
        distanceTraveled: 0,
        timeUnderwater: 0,
        missionsCompleted: 0,
        perfectMissions: 0,
        collisionsAvoided: 0,
        collisionsOccurred: 0,
        maxDepthReached: 0,
        uniqueSamples: new Set()
      },
      recentScores: [],
      achievements: []
    });

    this.combos.set(vehicleId, {
      currentCombo: 0,
      maxCombo: 0,
      comboTimer: 0,
      lastActionTime: 0
    });

    this.multipliers.set(vehicleId, {
      combo: 1,
      mission: 1,
      achievement: 1
    });

    this.initAchievements(vehicleId);
  }

  initAchievements(vehicleId) {
    const achievementDefs = [
      { id: 'first_sample', name: '初次采集', description: '采集第一个样本', condition: () => this.getStats(vehicleId).samplesCollected >= 1 },
      { id: 'collector_10', name: '收藏家', description: '采集10个样本', condition: () => this.getStats(vehicleId).samplesCollected >= 10 },
      { id: 'collector_50', name: '博物学家', description: '采集50个样本', condition: () => this.getStats(vehicleId).samplesCollected >= 50 },
      { id: 'deep_diver', name: '深海潜水员', description: '到达200米深度', condition: () => this.getStats(vehicleId).maxDepthReached >= 200 },
      { id: 'abyss_explorer', name: '深渊探险家', description: '到达400米深度', condition: () => this.getStats(vehicleId).maxDepthReached >= 400 },
      { id: 'speed_demon', name: '速度恶魔', description: '达到最大速度', condition: () => false },
      { id: 'mission_master', name: '任务大师', description: '完成5个任务', condition: () => this.getStats(vehicleId).missionsCompleted >= 5 },
      { id: 'survivor', name: '生存专家', description: '存活超过5分钟', condition: () => this.getStats(vehicleId).timeUnderwater >= 300 },
      { id: 'combo_king', name: '连击之王', description: '达到5连击', condition: () => this.combos.get(vehicleId)?.maxCombo >= 5 },
      { id: 'explorer', name: '探索者', description: '发现20个障碍物', condition: () => this.getStats(vehicleId).obstaclesDiscovered >= 20 }
    ];

    this.achievements.set(vehicleId, achievementDefs);
  }

  loadHighScore(vehicleId) {
    try {
      if (typeof localStorage !== 'undefined') {
        return parseInt(localStorage.getItem(`deepsea_highscore_${vehicleId}`) || '0');
      }
    } catch (e) {}
    return 0;
  }

  saveHighScore(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    try {
      if (typeof localStorage !== 'undefined' && scoreData.totalScore > scoreData.highScore) {
        scoreData.highScore = scoreData.totalScore;
        localStorage.setItem(`deepsea_highscore_${vehicleId}`, scoreData.highScore.toString());
      }
    } catch (e) {}
  }

  addScore(vehicleId, points, reason = 'general', metadata = {}) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    const multiplier = this.getMultiplier(vehicleId);
    const finalPoints = Math.floor(points * multiplier);

    scoreData.totalScore += finalPoints;
    scoreData.currentScore += finalPoints;
    scoreData.experience += finalPoints;

    scoreData.recentScores.push({
      points: finalPoints,
      reason,
      timestamp: Date.now(),
      metadata
    });

    if (scoreData.recentScores.length > 50) {
      scoreData.recentScores.shift();
    }

    this.checkLevelUp(vehicleId);
    this.checkAchievements(vehicleId);
    this.saveHighScore(vehicleId);
    this.triggerCombo(vehicleId);
  }

  addSampleScore(vehicleId, sampleType, sampleValue) {
    const basePoints = 50 + sampleValue * 10;
    const typeMultiplier = {
      rare: 3,
      unique: 5,
      common: 1
    }[sampleType] || 1;

    this.addScore(vehicleId, basePoints * typeMultiplier, 'sample_collection', { sampleType, sampleValue });
    
    const scoreData = this.scores.get(vehicleId);
    if (scoreData) {
      scoreData.stats.samplesCollected++;
      scoreData.stats.uniqueSamples.add(sampleType);
    }
  }

  addDistanceScore(vehicleId, distance) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    scoreData.stats.distanceTraveled += distance;
    
    if (Math.floor(scoreData.stats.distanceTraveled / 100) > Math.floor((scoreData.stats.distanceTraveled - distance) / 100)) {
      this.addScore(vehicleId, 10, 'distance_traveled', { distance: 100 });
    }
  }

  addMissionScore(vehicleId, missionId, reward, perfect = false) {
    this.addScore(vehicleId, reward, 'mission_complete', { missionId, perfect });
    
    const scoreData = this.scores.get(vehicleId);
    if (scoreData) {
      scoreData.stats.missionsCompleted++;
      if (perfect) {
        scoreData.stats.perfectMissions++;
      }
    }
  }

  addDiscoveryScore(vehicleId, obstacleType) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    scoreData.stats.obstaclesDiscovered++;
    this.addScore(vehicleId, 25, 'discovery', { obstacleType });
  }

  addCollisionScore(vehicleId, avoided, severity = 1) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    if (avoided) {
      scoreData.stats.collisionsAvoided++;
      this.addScore(vehicleId, 30 * severity, 'collision_avoided', { severity });
    } else {
      scoreData.stats.collisionsOccurred++;
      this.resetCombo(vehicleId);
    }
  }

  addTimeScore(vehicleId, deltaTime) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    scoreData.stats.timeUnderwater += deltaTime;
  }

  updateMaxDepth(vehicleId, depth) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    if (depth > scoreData.stats.maxDepthReached) {
      scoreData.stats.maxDepthReached = depth;
      this.checkAchievements(vehicleId);
    }
  }

  getMultiplier(vehicleId) {
    const mult = this.multipliers.get(vehicleId);
    if (!mult) return 1;
    return mult.combo * mult.mission * mult.achievement;
  }

  triggerCombo(vehicleId) {
    const combo = this.combos.get(vehicleId);
    if (!combo) return;

    combo.currentCombo++;
    combo.comboTimer = 3;
    combo.lastActionTime = Date.now();

    if (combo.currentCombo > combo.maxCombo) {
      combo.maxCombo = combo.currentCombo;
    }

    const mult = this.multipliers.get(vehicleId);
    if (mult) {
      mult.combo = Math.min(1 + combo.currentCombo * 0.2, 3);
    }
  }

  resetCombo(vehicleId) {
    const combo = this.combos.get(vehicleId);
    if (combo) {
      combo.currentCombo = 0;
      combo.comboTimer = 0;
    }

    const mult = this.multipliers.get(vehicleId);
    if (mult) {
      mult.combo = 1;
    }
  }

  checkLevelUp(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) return;

    while (scoreData.experience >= scoreData.experienceToNextLevel) {
      scoreData.experience -= scoreData.experienceToNextLevel;
      scoreData.level++;
      scoreData.experienceToNextLevel = Math.floor(scoreData.experienceToNextLevel * 1.5);
      this.triggerLevelUp(vehicleId, scoreData.level);
    }
  }

  checkAchievements(vehicleId) {
    const achievementDefs = this.achievements.get(vehicleId);
    const vehicleAchievements = this.scores.get(vehicleId)?.achievements;
    if (!achievementDefs || !vehicleAchievements) return;

    for (const achievement of achievementDefs) {
      if (!vehicleAchievements.find(a => a.id === achievement.id) && achievement.condition()) {
        vehicleAchievements.push({
          ...achievement,
          unlockedAt: Date.now()
        });
        this.addScore(vehicleId, 200, 'achievement_unlocked', { achievementId: achievement.id });
      }
    }
  }

  triggerLevelUp(vehicleId, level) {
    this.addScore(vehicleId, level * 100, 'level_up', { level });
  }

  updateCombos(deltaTime) {
    for (const [vehicleId, comboData] of this.combos) {
      if (comboData.comboTimer > 0) {
        comboData.comboTimer -= deltaTime;
        if (comboData.comboTimer <= 0 && comboData.currentCombo > 0) {
          comboData.currentCombo = 0;
          const mult = this.multipliers.get(vehicleId);
          if (mult) {
            mult.combo = 1;
          }
        }
      }
    }
  }

  update(deltaTime) {
    this.updateCombos(deltaTime);
    
    for (const [vehicleId, scoreData] of this.scores) {
      this.addTimeScore(vehicleId, deltaTime);
    }
  }

  getScore(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    return scoreData ? scoreData.totalScore : 0;
  }

  getLevel(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    return scoreData ? scoreData.level : 1;
  }

  getStats(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    return scoreData ? scoreData.stats : {};
  }

  getScoreState(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    if (!scoreData) {
      return {
        score: 0,
        level: 1,
        experience: 0,
        experienceToNextLevel: 1000,
        expPercent: 0,
        combo: 0,
        maxCombo: 0,
        highScore: 0,
        achievements: []
      };
    }

    const achievements = this.achievements.get(vehicleId) || [];
    const unlockedIds = new Set((scoreData.achievements || []).map(a => a.id));

    return {
      score: scoreData.totalScore,
      level: scoreData.level,
      experience: scoreData.experience,
      experienceToNextLevel: scoreData.experienceToNextLevel,
      expPercent: (scoreData.experience / scoreData.experienceToNextLevel) * 100,
      combo: this.combos.get(vehicleId)?.currentCombo || 0,
      maxCombo: this.combos.get(vehicleId)?.maxCombo || 0,
      highScore: scoreData.highScore,
      achievements: achievements.map(a => ({
        ...a,
        unlocked: unlockedIds.has(a.id)
      })),
      recentScores: scoreData.recentScores.slice(-10),
      stats: { ...scoreData.stats }
    };
  }

  getLeaderboard() {
    const leaderboard = [];
    for (const [vehicleId, scoreData] of this.scores) {
      leaderboard.push({
        vehicleId,
        score: scoreData.totalScore,
        level: scoreData.level,
        highScore: scoreData.highScore
      });
    }
    return leaderboard.sort((a, b) => b.score - a.score);
  }

  resetScore(vehicleId) {
    const scoreData = this.scores.get(vehicleId);
    if (scoreData) {
      scoreData.currentScore = 0;
      scoreData.recentScores = [];
    }
  }
}

return ScoringSystem;
}));
