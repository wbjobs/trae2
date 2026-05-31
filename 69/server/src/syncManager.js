const Protocol = require('../../shared/protocol');
const DataCompressor = require('../../shared/compressor');

class SyncManager {
  constructor() {
    this.gameState = {
      levelId: null,
      parts: [],
      players: {},
      completed: false,
      timestamp: Date.now(),
      version: 0
    };
    this.listeners = new Set();
    this.broadcastCallback = null;
    this.partUpdateQueue = new Map();
    this.updateThrottleInterval = 50;
    this.lastUpdateTime = Date.now();
    this.lastSentVersions = new Map();
    this.compressionEnabled = true;
  }

  setBroadcastCallback(callback) {
    this.broadcastCallback = callback;
  }

  getState() {
    return {
      ...this.gameState,
      timestamp: Date.now(),
      version: this.gameState.version
    };
  }

  setState(newState) {
    this.gameState = {
      ...newState,
      timestamp: Date.now(),
      version: (this.gameState.version || 0) + 1
    };
    this.notifyListeners();
  }

  initializeLevel(levelId, parts) {
    this.gameState = {
      levelId,
      parts: parts.map(p => ({
        ...p,
        lastModified: Date.now(),
        version: 0
      })),
      players: {},
      completed: false,
      timestamp: Date.now(),
      version: 0
    };
    this.partUpdateQueue.clear();
    this.notifyListeners();
    this.broadcastState();
  }

  addPlayer(playerId, playerData) {
    this.gameState.players[playerId] = {
      ...playerData,
      joinedAt: Date.now()
    };
    this.gameState.timestamp = Date.now();
    this.gameState.version++;
    this.notifyListeners();
    this.broadcastState();
  }

  removePlayer(playerId) {
    if (this.gameState.players[playerId]) {
      const player = this.gameState.players[playerId];
      if (player.grabbedPart) {
        const part = this.gameState.parts.find(p => p.id === player.grabbedPart);
        if (part) {
          part.grabbedBy = null;
          part.state = Protocol.PART_STATES.DISASSEMBLED;
          part.lastModified = Date.now();
          part.version++;
        }
      }
      delete this.gameState.players[playerId];
      this.gameState.timestamp = Date.now();
      this.gameState.version++;
      this.notifyListeners();
      this.broadcastState();
    }
  }

  updatePlayer(playerId, updates) {
    if (this.gameState.players[playerId]) {
      Object.assign(this.gameState.players[playerId], updates);
      this.gameState.players[playerId].lastUpdate = Date.now();
      this.gameState.timestamp = Date.now();
      this.notifyListeners();
    }
  }

  updatePart(partId, updates, sourcePlayerId = null) {
    const partIndex = this.gameState.parts.findIndex(p => p.id === partId);
    if (partIndex !== -1) {
      const part = this.gameState.parts[partIndex];

      if (part.grabbedBy && sourcePlayerId && part.grabbedBy !== sourcePlayerId) {
        return;
      }

      Object.assign(part, updates);
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      this.gameState.timestamp = Date.now();
      this.gameState.version++;

      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  queuePartUpdate(partId, part) {
    this.partUpdateQueue.set(partId, { ...part, queuedAt: Date.now() });
    this.flushPartUpdates();
  }

  flushPartUpdates() {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThrottleInterval) {
      return;
    }

    if (this.partUpdateQueue.size > 0) {
      const updates = Array.from(this.partUpdateQueue.values());

      let data;
      if (this.compressionEnabled) {
        data = {
          parts: updates.map(p => ({
            id: p.id,
            position: p.position,
            rotation: p.rotation,
            state: p.state,
            grabbedBy: p.grabbedBy
          })),
          timestamp: now,
          batch: true,
          compressed: true
        };
      } else {
        data = {
          parts: updates,
          timestamp: now,
          batch: true
        };
      }

      if (this.broadcastCallback) {
        this.broadcastCallback(Protocol.MSG_TYPES.PART_STATE, data);
      }
      this.partUpdateQueue.clear();
    }

    this.lastUpdateTime = now;
  }

  grabPart(playerId, partId) {
    const part = this.gameState.parts.find(p => p.id === partId);
    const player = this.gameState.players[playerId];

    if (part && player) {
      part.grabbedBy = playerId;
      part.state = Protocol.PART_STATES.GRABBED;
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      player.grabbedPart = partId;
      player.lastUpdate = Date.now();

      this.gameState.timestamp = Date.now();
      this.gameState.version++;

      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  releasePart(playerId, partId) {
    const part = this.gameState.parts.find(p => p.id === partId);
    const player = this.gameState.players[playerId];

    if (part && player) {
      part.grabbedBy = null;
      part.state = Protocol.PART_STATES.DISASSEMBLED;
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      player.grabbedPart = null;
      player.lastUpdate = Date.now();

      this.gameState.timestamp = Date.now();
      this.gameState.version++;

      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  assemblePart(playerId, partId, suggestedPosition = null, suggestedRotation = null) {
    const part = this.gameState.parts.find(p => p.id === partId);
    const player = this.gameState.players[playerId];

    if (part && player) {
      const targetPosition = suggestedPosition || part.targetPosition;
      const targetRotation = suggestedRotation || part.targetRotation;

      if (targetPosition) {
        part.position = { ...targetPosition };
      }
      if (targetRotation) {
        part.rotation = { ...targetRotation };
      }

      part.state = Protocol.PART_STATES.ASSEMBLED;
      part.grabbedBy = null;
      part.assembledTo = part.connections[0] || null;
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      player.grabbedPart = null;
      player.lastUpdate = Date.now();

      this.gameState.timestamp = Date.now();
      this.gameState.version++;

      this.notifyListeners();
      this.queuePartUpdate(partId, part);

      this.checkCompletion();
    }
  }

  disassemblePart(playerId, partId) {
    const part = this.gameState.parts.find(p => p.id === partId);
    const player = this.gameState.players[playerId];

    if (part && player && part.state === Protocol.PART_STATES.ASSEMBLED) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 2 + Math.random();
      const offset = {
        x: Math.cos(angle) * distance,
        y: 0.5,
        z: Math.sin(angle) * distance
      };

      part.position = {
        x: part.position.x + offset.x,
        y: part.position.y + offset.y,
        z: part.position.z + offset.z
      };
      part.state = Protocol.PART_STATES.DISASSEMBLED;
      part.grabbedBy = playerId;
      part.assembledTo = null;
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      player.grabbedPart = partId;
      player.lastUpdate = Date.now();

      this.gameState.timestamp = Date.now();
      this.gameState.version++;

      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  movePart(partId, position, playerId = null) {
    const part = this.gameState.parts.find(p => p.id === partId);
    if (part) {
      if (part.grabbedBy && playerId && part.grabbedBy !== playerId) {
        return;
      }

      part.position = { ...position };
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      this.gameState.timestamp = Date.now();
      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  rotatePart(partId, rotation, playerId = null) {
    const part = this.gameState.parts.find(p => p.id === partId);
    if (part) {
      if (part.grabbedBy && playerId && part.grabbedBy !== playerId) {
        return;
      }

      part.rotation = { ...rotation };
      part.lastModified = Date.now();
      part.version = (part.version || 0) + 1;

      this.gameState.timestamp = Date.now();
      this.notifyListeners();
      this.queuePartUpdate(partId, part);
    }
  }

  checkCompletion() {
    const allAssembled = this.gameState.parts.every(p => p.state === Protocol.PART_STATES.ASSEMBLED);
    if (allAssembled && !this.gameState.completed) {
      this.gameState.completed = true;
      this.gameState.completedAt = Date.now();
      this.gameState.timestamp = Date.now();
      this.gameState.version++;
      this.notifyListeners();
      this.broadcastCompletion();
    }
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  broadcastState() {
    if (this.broadcastCallback) {
      this.broadcastCallback(Protocol.MSG_TYPES.SCENE_STATE, {
        state: this.getState()
      });
    }
  }

  broadcastPartUpdate(partId, part) {
    if (this.broadcastCallback) {
      this.broadcastCallback(Protocol.MSG_TYPES.PART_STATE, {
        partId,
        part,
        timestamp: Date.now()
      });
    }
  }

  broadcastCompletion() {
    if (this.broadcastCallback) {
      this.broadcastCallback(Protocol.MSG_TYPES.LEVEL_COMPLETE, {
        levelId: this.gameState.levelId,
        completed: true,
        completedAt: this.gameState.completedAt,
        stats: {
          totalParts: this.gameState.parts.length,
          timeToComplete: this.gameState.completedAt - this.gameState.timestamp
        }
      });
    }
  }

  getPart(partId) {
    return this.gameState.parts.find(p => p.id === partId);
  }

  getPlayer(playerId) {
    return this.gameState.players[playerId];
  }

  getPlayerCount() {
    return Object.keys(this.gameState.players).length;
  }

  getPartsByState(state) {
    return this.gameState.parts.filter(p => p.state === state);
  }

  validatePartVersion(partId, version) {
    const part = this.getPart(partId);
    if (!part) return { valid: false, reason: '零件不存在' };

    const currentVersion = part.version || 0;
    if (version < currentVersion) {
      return {
        valid: false,
        reason: '版本过期，服务器已有更新状态',
        currentVersion,
        clientVersion: version
      };
    }

    return { valid: true, currentVersion };
  }
}

module.exports = SyncManager;
