class AnimationSystem {
  constructor() {
    this.animations = new Map();
    this.groups = new Map();
    this.isRunning = false;
    this.speed = 1.0;
  }

  createGearAnimation(partId, config = {}) {
    const animation = {
      type: 'gear',
      partId: partId,
      speed: config.speed || 1.0,
      direction: config.direction || 1,
      axis: config.axis || 'y',
      phase: config.phase || 0,
      active: config.active !== undefined ? config.active : true
    };
    this.animations.set(partId, animation);
    return animation;
  }

  createRotationAnimation(partId, config = {}) {
    const animation = {
      type: 'rotation',
      partId: partId,
      speed: config.speed || 0.5,
      axis: config.axis || 'y',
      range: config.range || null,
      phase: config.phase || 0,
      active: config.active !== undefined ? config.active : true
    };
    this.animations.set(partId, animation);
    return animation;
  }

  createPendulumAnimation(partId, config = {}) {
    const animation = {
      type: 'pendulum',
      partId: partId,
      speed: config.speed || 2.0,
      axis: config.axis || 'x',
      range: config.range || Math.PI / 4,
      pivot: config.pivot || { x: 0, y: 0, z: 0 },
      phase: config.phase || 0,
      active: config.active !== undefined ? config.active : true
    };
    this.animations.set(partId, animation);
    return animation;
  }

  createPistonAnimation(partId, config = {}) {
    const animation = {
      type: 'piston',
      partId: partId,
      speed: config.speed || 1.5,
      axis: config.axis || 'y',
      range: config.range || 0.5,
      basePosition: config.basePosition || { x: 0, y: 0, z: 0 },
      phase: config.phase || 0,
      active: config.active !== undefined ? config.active : true
    };
    this.animations.set(partId, animation);
    return animation;
  }

  createGearGroup(groupId, masterGearId, config = {}) {
    const group = {
      id: groupId,
      masterGearId: masterGearId,
      slaveGears: [],
      speed: config.speed || 1.0,
      active: true
    };
    this.groups.set(groupId, group);
    return group;
  }

  addSlaveGear(groupId, gearId, ratio = 1.0, reverse = false) {
    const group = this.groups.get(groupId);
    if (group) {
      group.slaveGears.push({
        gearId: gearId,
        ratio: ratio,
        reverse: reverse
      });
      return true;
    }
    return false;
  }

  updateAnimation(partId, deltaTime, getPartState, setPartState) {
    const animation = this.animations.get(partId);
    if (!animation || !animation.active) return;

    const state = getPartState(partId);
    if (!state) return;

    const time = (Date.now() / 1000) * this.speed + animation.phase;

    switch (animation.type) {
      case 'gear':
      case 'rotation':
        this.applyRotationAnimation(animation, state, time, setPartState);
        break;
      case 'pendulum':
        this.applyPendulumAnimation(animation, state, time, setPartState);
        break;
      case 'piston':
        this.applyPistonAnimation(animation, state, time, setPartState);
        break;
    }
  }

  applyRotationAnimation(animation, state, time, setPartState) {
    const rotation = { ...state.rotation };
    const angle = time * animation.speed * animation.direction;
    
    switch (animation.axis) {
      case 'x':
        rotation.x = angle;
        break;
      case 'y':
        rotation.y = angle;
        break;
      case 'z':
        rotation.z = angle;
        break;
    }

    setPartState(animation.partId, { rotation });
  }

  applyPendulumAnimation(animation, state, time, setPartState) {
    const rotation = { ...state.rotation };
    const angle = Math.sin(time * animation.speed) * animation.range;
    
    switch (animation.axis) {
      case 'x':
        rotation.x = angle;
        break;
      case 'y':
        rotation.y = angle;
        break;
      case 'z':
        rotation.z = angle;
        break;
    }

    setPartState(animation.partId, { rotation });
  }

  applyPistonAnimation(animation, state, time, setPartState) {
    const position = { ...state.position };
    const offset = Math.sin(time * animation.speed) * animation.range;
    const base = animation.basePosition;
    
    switch (animation.axis) {
      case 'x':
        position.x = base.x + offset;
        break;
      case 'y':
        position.y = base.y + offset;
        break;
      case 'z':
        position.z = base.z + offset;
        break;
    }

    setPartState(animation.partId, { position });
  }

  updateGearGroups(deltaTime, getPartState, setPartState) {
    this.groups.forEach((group) => {
      if (!group.active) return;

      const masterAnim = this.animations.get(group.masterGearId);
      if (!masterAnim) return;

      const time = (Date.now() / 1000) * this.speed;

      group.slaveGears.forEach((slave) => {
        const slaveAnim = this.animations.get(slave.gearId);
        if (slaveAnim) {
          const direction = slave.reverse ? -1 : 1;
          slaveAnim.speed = masterAnim.speed * slave.ratio * direction;
        }
      });
    });
  }

  updateAll(deltaTime, getPartState, setPartState) {
    if (!this.isRunning) return;

    this.updateGearGroups(deltaTime, getPartState, setPartState);

    this.animations.forEach((animation) => {
      this.updateAnimation(animation.partId, deltaTime, getPartState, setPartState);
    });
  }

  start() {
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
  }

  setSpeed(speed) {
    this.speed = Math.max(0, Math.min(5, speed));
  }

  setAnimationActive(partId, active) {
    const animation = this.animations.get(partId);
    if (animation) {
      animation.active = active;
    }
  }

  setGroupActive(groupId, active) {
    const group = this.groups.get(groupId);
    if (group) {
      group.active = active;
    }
  }

  removeAnimation(partId) {
    this.animations.delete(partId);
  }

  removeGroup(groupId) {
    this.groups.delete(groupId);
  }

  clear() {
    this.animations.clear();
    this.groups.clear();
  }

  toJSON() {
    return {
      animations: Array.from(this.animations.entries()),
      groups: Array.from(this.groups.entries()),
      speed: this.speed,
      isRunning: this.isRunning
    };
  }

  static fromJSON(data) {
    const system = new AnimationSystem();
    system.speed = data.speed || 1.0;
    system.isRunning = data.isRunning || false;
    
    (data.animations || []).forEach(([id, anim]) => {
      system.animations.set(id, anim);
    });
    
    (data.groups || []).forEach(([id, group]) => {
      system.groups.set(id, group);
    });
    
    return system;
  }
}

class NetworkCompressor {
  constructor() {
    this.positionPrecision = 100;
    this.rotationPrecision = 100;
  }

  compressVector3(vec) {
    if (!vec) return null;
    return {
      x: Math.round(vec.x * this.positionPrecision) / this.positionPrecision,
      y: Math.round(vec.y * this.positionPrecision) / this.positionPrecision,
      z: Math.round(vec.z * this.positionPrecision) / this.positionPrecision
    };
  }

  compressRotation(rot) {
    if (!rot) return null;
    return {
      x: Math.round(rot.x * this.rotationPrecision) / this.rotationPrecision,
      y: Math.round(rot.y * this.rotationPrecision) / this.rotationPrecision,
      z: Math.round(rot.z * this.rotationPrecision) / this.rotationPrecision
    };
  }

  compressPartState(part) {
    if (!part) return null;
    return {
      id: part.id,
      p: this.compressVector3(part.position),
      r: this.compressRotation(part.rotation),
      a: part.assembled || false,
      pid: part.playerId
    };
  }

  compressPlayerState(player) {
    if (!player) return null;
    return {
      id: player.id,
      n: player.name,
      c: player.color,
      s: player.score || 0
    };
  }

  compressDeltaState(prevParts, currParts) {
    const changes = [];
    
    currParts.forEach((currPart) => {
      const prevPart = prevParts.get(currPart.id);
      
      if (!prevPart) {
        changes.push({
          id: currPart.id,
          type: 'add',
          state: this.compressPartState(currPart)
        });
      } else if (this.hasChanged(prevPart, currPart)) {
        changes.push({
          id: currPart.id,
          type: 'update',
          state: this.compressPartState(currPart)
        });
      }
    });

    prevParts.forEach((_, partId) => {
      if (!currParts.find(p => p.id === partId)) {
        changes.push({
          id: partId,
          type: 'remove'
        });
      }
    });

    return changes;
  }

  hasChanged(prev, curr) {
    const posEpsilon = 1 / this.positionPrecision;
    const rotEpsilon = 1 / this.rotationPrecision;

    const posDist = Math.sqrt(
      Math.pow((curr.position.x || 0) - (prev.position.x || 0), 2) +
      Math.pow((curr.position.y || 0) - (prev.position.y || 0), 2) +
      Math.pow((curr.position.z || 0) - (prev.position.z || 0), 2)
    );

    const rotDist = Math.sqrt(
      Math.pow((curr.rotation.x || 0) - (prev.rotation.x || 0), 2) +
      Math.pow((curr.rotation.y || 0) - (prev.rotation.y || 0), 2) +
      Math.pow((curr.rotation.z || 0) - (prev.rotation.z || 0), 2)
    );

    return posDist > posEpsilon || rotDist > rotEpsilon || 
           prev.assembled !== curr.assembled ||
           prev.playerId !== curr.playerId;
  }

  decompressPartState(compressed) {
    if (!compressed) return null;
    return {
      id: compressed.id,
      position: compressed.p,
      rotation: compressed.r,
      assembled: compressed.a,
      playerId: compressed.pid
    };
  }

  decompressPlayerState(compressed) {
    if (!compressed) return null;
    return {
      id: compressed.id,
      name: compressed.n,
      color: compressed.c,
      score: compressed.s
    };
  }

  encodeBase64(data) {
    return btoa(JSON.stringify(data));
  }

  decodeBase64(encoded) {
    return JSON.parse(atob(encoded));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnimationSystem, NetworkCompressor };
}
