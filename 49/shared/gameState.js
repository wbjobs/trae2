const { Part } = require('./partData');

class GameState {
  constructor() {
    this.parts = new Map();
    this.players = new Map();
    this.levelId = null;
    this.assembledParts = new Set();
    this.isComplete = false;
    this.startTime = null;
    this.elapsedTime = 0;
  }

  addPart(part) {
    this.parts.set(part.id, part);
  }

  removePart(partId) {
    this.parts.delete(partId);
  }

  getPart(partId) {
    return this.parts.get(partId);
  }

  getAllParts() {
    return Array.from(this.parts.values());
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getAllPlayers() {
    return Array.from(this.players.values());
  }

  updatePartPosition(partId, position, playerId) {
    const part = this.parts.get(partId);
    if (part) {
      part.position = position;
      part.playerId = playerId;
      return true;
    }
    return false;
  }

  updatePartRotation(partId, rotation, playerId) {
    const part = this.parts.get(partId);
    if (part) {
      part.rotation = rotation;
      part.playerId = playerId;
      return true;
    }
    return false;
  }

  placePart(partId, position, playerId) {
    const part = this.parts.get(partId);
    if (part) {
      part.position = position;
      part.placed = true;
      part.playerId = playerId;
      return true;
    }
    return false;
  }

  assemblePart(partId, targetPartId, connectionType) {
    const part = this.parts.get(partId);
    const targetPart = this.parts.get(targetPartId);
    
    if (part && targetPart) {
      part.connectTo(targetPartId, connectionType);
      targetPart.connectTo(partId, connectionType);
      part.assembled = true;
      this.assembledParts.add(partId);
      return true;
    }
    return false;
  }

  checkCompletion() {
    const totalParts = this.parts.size;
    const assembledCount = this.assembledParts.size;
    return totalParts > 0 && assembledCount >= totalParts * 0.9;
  }

  toJSON() {
    return {
      parts: this.getAllParts().map(p => p.toJSON()),
      players: this.getAllPlayers(),
      levelId: this.levelId,
      assembledParts: Array.from(this.assembledParts),
      isComplete: this.isComplete,
      startTime: this.startTime,
      elapsedTime: this.elapsedTime
    };
  }

  static fromJSON(data) {
    const state = new GameState();
    state.levelId = data.levelId;
    state.assembledParts = new Set(data.assembledParts || []);
    state.isComplete = data.isComplete || false;
    state.startTime = data.startTime;
    state.elapsedTime = data.elapsedTime || 0;
    
    (data.parts || []).forEach(partData => {
      state.addPart(Part.fromJSON(partData));
    });
    
    (data.players || []).forEach(player => {
      state.addPlayer(player);
    });
    
    return state;
  }
}

class Player {
  constructor(id, name, color = 0x3498db) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.position = { x: 0, y: 0, z: 0 };
    this.selectedPartId = null;
    this.connected = true;
    this.score = 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      position: this.position,
      selectedPartId: this.selectedPartId,
      connected: this.connected,
      score: this.score
    };
  }
}

module.exports = { GameState, Player };
