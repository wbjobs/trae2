const { PartFactory } = require('./partData');

class Level {
  constructor(id, name, description, difficulty = 1) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.difficulty = difficulty;
    this.parts = [];
    this.assemblyTarget = [];
    this.hints = [];
    this.timeLimit = null;
    this.backgroundImage = null;
    this.basePosition = { x: 0, y: 0, z: 0 };
  }

  addPart(part, startPosition) {
    part.position = startPosition;
    this.parts.push(part);
  }

  addAssemblyTarget(target) {
    this.assemblyTarget.push(target);
  }

  addHint(hint) {
    this.hints.push(hint);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      difficulty: this.difficulty,
      parts: this.parts.map(p => p.toJSON()),
      assemblyTarget: this.assemblyTarget,
      hints: this.hints,
      timeLimit: this.timeLimit,
      backgroundImage: this.backgroundImage,
      basePosition: this.basePosition
    };
  }
}

class LevelManager {
  constructor() {
    this.levels = new Map();
    this.initLevels();
  }

  initLevels() {
    this.levels.set('level1', this.createLevel1());
    this.levels.set('level2', this.createLevel2());
    this.levels.set('level3', this.createLevel3());
  }

  createLevel1() {
    const level = new Level('level1', '齿轮入门', '学习基础的齿轮与轴组装', 1);
    
    level.addPart(
      PartFactory.createPlate('plate1', 2, 2),
      { x: 0, y: -1, z: 0 }
    );
    
    level.addPart(
      PartFactory.createAxle('axle1', 1.5),
      { x: -3, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createGear('gear1', 8),
      { x: 3, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createGear('gear2', 8),
      { x: 4, y: 1, z: 0 }
    );
    
    level.addAssemblyTarget({
      partId: 'axle1',
      targetPosition: { x: 0, y: 0, z: 0 },
      snapTo: 'plate1'
    });
    
    level.addAssemblyTarget({
      partId: 'gear1',
      targetPosition: { x: 0, y: 0.5, z: 0 },
      snapTo: 'axle1'
    });
    
    level.addHint('首先将轴放置在底板中心');
    level.addHint('然后将齿轮安装到轴上');
    
    return level;
  }

  createLevel2() {
    const level = new Level('level2', '杠杆原理', '构建一个简单的杠杆机构', 2);
    
    level.addPart(
      PartFactory.createPlate('base1', 3, 3),
      { x: 0, y: -1.5, z: 0 }
    );
    
    level.addPart(
      PartFactory.createAxle('fulcrum1', 1),
      { x: -4, y: -0.5, z: 0 }
    );
    
    level.addPart(
      PartFactory.createLever('lever1', 3),
      { x: 4, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createSpring('spring1', 1),
      { x: 0, y: 2, z: 0 }
    );
    
    level.addAssemblyTarget({
      partId: 'fulcrum1',
      targetPosition: { x: 0, y: -0.5, z: 0 },
      snapTo: 'base1'
    });
    
    level.addAssemblyTarget({
      partId: 'lever1',
      targetPosition: { x: 0, y: 0, z: 0 },
      snapTo: 'fulcrum1'
    });
    
    level.addHint('先放置支点轴');
    level.addHint('将杠杆穿过支点');
    
    return level;
  }

  createLevel3() {
    const level = new Level('level3', '时钟机械', '组装一个简单的齿轮传动系统', 3);
    
    level.addPart(
      PartFactory.createPlate('base1', 4, 4),
      { x: 0, y: -2, z: 0 }
    );
    
    level.addPart(
      PartFactory.createAxle('axle1', 2),
      { x: -5, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createAxle('axle2', 2),
      { x: -4, y: 1, z: 0 }
    );
    
    level.addPart(
      PartFactory.createGear('gear1', 12),
      { x: 4, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createGear('gear2', 6),
      { x: 5, y: 1, z: 0 }
    );
    
    level.addPart(
      PartFactory.createGear('gear3', 10),
      { x: 6, y: 0, z: 0 }
    );
    
    level.addPart(
      PartFactory.createWheel('hour', 0.8),
      { x: 0, y: 3, z: 0 }
    );
    
    level.addPart(
      PartFactory.createWheel('minute', 0.6),
      { x: 1, y: 3, z: 0 }
    );
    
    level.addAssemblyTarget({
      partId: 'axle1',
      targetPosition: { x: -0.5, y: -0.5, z: 0 },
      snapTo: 'base1'
    });
    
    level.addAssemblyTarget({
      partId: 'axle2',
      targetPosition: { x: 0.5, y: -0.5, z: 0 },
      snapTo: 'base1'
    });
    
    level.addAssemblyTarget({
      partId: 'gear1',
      targetPosition: { x: -0.5, y: 0.3, z: 0 },
      snapTo: 'axle1'
    });
    
    level.addHint('搭建齿轮传动需要仔细对齐');
    level.addHint('大齿轮带动小齿轮可以加速');
    
    return level;
  }

  getLevel(levelId) {
    return this.levels.get(levelId);
  }

  getAllLevels() {
    return Array.from(this.levels.values());
  }

  getLevelIds() {
    return Array.from(this.levels.keys());
  }
}

module.exports = { Level, LevelManager };
