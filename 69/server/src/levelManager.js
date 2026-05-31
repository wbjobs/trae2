const Levels = require('./config/levels');

class LevelManager {
  constructor() {
    this.levels = Levels;
  }

  getLevelList() {
    return Object.values(this.levels).map(level => ({
      id: level.id,
      name: level.name,
      description: level.description,
      difficulty: level.difficulty,
      partsCount: level.parts.length
    }));
  }

  getLevel(levelId) {
    return this.levels[levelId];
  }

  getLevelParts(levelId) {
    const level = this.levels[levelId];
    if (!level) return [];

    return level.parts.map(partConfig => ({
      id: partConfig.id,
      name: partConfig.name,
      type: partConfig.type,
      model: partConfig.model,
      position: { ...partConfig.position },
      rotation: { ...partConfig.rotation },
      targetPosition: partConfig.targetPosition ? { ...partConfig.targetPosition } : null,
      targetRotation: partConfig.targetRotation ? { ...partConfig.targetRotation } : null,
      snapPoints: partConfig.snapPoints || [],
      connections: partConfig.connections || [],
      state: partConfig.initialState || 'disassembled',
      assembledTo: null,
      grabbedBy: null,
      isKey: partConfig.isKey || false,
      properties: { ...partConfig.properties }
    }));
  }

  loadLevel(levelId) {
    const level = this.levels[levelId];
    if (!level) {
      return { success: false, error: '关卡不存在' };
    }

    return {
      success: true,
      level: {
        id: level.id,
        name: level.name,
        description: level.description,
        difficulty: level.difficulty
      },
      parts: this.getLevelParts(levelId)
    };
  }

  validateLevel(levelId) {
    return !!this.levels[levelId];
  }

  getRandomLevel() {
    const levelIds = Object.keys(this.levels);
    const randomId = levelIds[Math.floor(Math.random() * levelIds.length)];
    return this.loadLevel(randomId);
  }

  getLevelByDifficulty(maxDifficulty) {
    const suitableLevels = Object.values(this.levels).filter(
      level => level.difficulty <= maxDifficulty
    );
    if (suitableLevels.length === 0) return null;
    return suitableLevels[Math.floor(Math.random() * suitableLevels.length)];
  }
}

module.exports = LevelManager;
