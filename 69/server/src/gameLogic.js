const AssemblyValidator = require('./assemblyValidator');
const LevelManager = require('./levelManager');
const SaveManager = require('./saveManager');
const SyncManager = require('./syncManager');
const Protocol = require('../../shared/protocol');
const { v4: uuidv4 } = require('uuid');

class GameLogic {
  constructor() {
    this.validator = new AssemblyValidator();
    this.levelManager = new LevelManager();
    this.saveManager = new SaveManager();
    this.syncManager = new SyncManager();
    this.players = new Map();
    this.currentLevel = null;
  }

  setBroadcastCallback(callback) {
    this.syncManager.setBroadcastCallback(callback);
  }

  handlePlayerJoin(ws, playerName) {
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: playerName,
      ws,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      selectedPart: null,
      grabbedPart: null,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      joinedAt: Date.now()
    };

    this.players.set(playerId, player);

    this.syncManager.addPlayer(playerId, {
      id: playerId,
      name: playerName,
      position: player.position,
      rotation: player.rotation,
      selectedPart: null,
      grabbedPart: null,
      color: player.color,
      joinedAt: player.joinedAt
    });

    return {
      playerId,
      player: this.syncManager.getPlayer(playerId),
      state: this.syncManager.getState()
    };
  }

  handlePlayerLeave(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      if (player.grabbedPart) {
        this.syncManager.releasePart(playerId, player.grabbedPart);
      }
      this.players.delete(playerId);
      this.syncManager.removePlayer(playerId);
    }
  }

  handlePlayerMove(playerId, position) {
    this.syncManager.updatePlayer(playerId, { position });
  }

  handlePlayerAction(playerId, action, data) {
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    switch (action) {
      case Protocol.ACTIONS.GRAB:
        return this.handleGrab(playerId, data.partId);
      case Protocol.ACTIONS.RELEASE:
        return this.handleRelease(playerId, data.partId);
      case Protocol.ACTIONS.MOVE:
        return this.handleMove(playerId, data.partId, data.position);
      case Protocol.ACTIONS.ROTATE:
        return this.handleRotate(playerId, data.partId, data.rotation);
      case Protocol.ACTIONS.ASSEMBLE:
        return this.handleAssemble(playerId, data.partId);
      case Protocol.ACTIONS.DISASSEMBLE:
        return this.handleDisassemble(playerId, data.partId);
      default:
        return { success: false, error: '未知操作' };
    }
  }

  handleGrab(playerId, partId) {
    const player = this.players.get(playerId);
    const part = this.syncManager.getPart(partId);

    const validation = this.validator.validatePartAction(player, part, 'grab', this.syncManager.gameState.parts);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    this.syncManager.grabPart(playerId, partId);
    return { success: true };
  }

  handleRelease(playerId, partId) {
    const player = this.players.get(playerId);
    const part = this.syncManager.getPart(partId);

    const validation = this.validator.validatePartAction(player, part, 'release', this.syncManager.gameState.parts);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    this.syncManager.releasePart(playerId, partId);
    return { success: true };
  }

  handleMove(playerId, partId, position) {
    const part = this.syncManager.getPart(partId);
    if (!part) {
      return { success: false, error: '零件不存在' };
    }

    if (part.grabbedBy !== playerId) {
      return { success: false, error: '你未抓取此零件' };
    }

    this.syncManager.movePart(partId, position);
    return { success: true };
  }

  handleRotate(playerId, partId, rotation) {
    const part = this.syncManager.getPart(partId);
    if (!part) {
      return { success: false, error: '零件不存在' };
    }

    if (part.grabbedBy !== playerId) {
      return { success: false, error: '你未抓取此零件' };
    }

    this.syncManager.rotatePart(partId, rotation);
    return { success: true };
  }

  handleAssemble(playerId, partId) {
    const player = this.players.get(playerId);
    const part = this.syncManager.getPart(partId);

    const validation = this.validator.validatePartAction(player, part, 'assemble', this.syncManager.gameState.parts);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const candidates = this.validator.findSnapCandidates(part, this.syncManager.gameState.parts);

    if (candidates.length === 0) {
      return {
        success: false,
        error: '未找到有效的装配连接点，请将零件移动到正确位置'
      };
    }

    const bestCandidate = candidates[0];
    const snapInfo = {
      targetPartId: bestCandidate.targetPart.id,
      snapPoint: bestCandidate.snapPoint,
      targetSnapPoint: bestCandidate.targetSnapPoint,
      distance: bestCandidate.distance
    };

    this.syncManager.assemblePart(
      playerId,
      partId,
      bestCandidate.suggestedPosition,
      part.targetRotation
    );

    return { success: true, snapInfo };
  }

  handleDisassemble(playerId, partId) {
    const player = this.players.get(playerId);
    const part = this.syncManager.getPart(partId);

    const validation = this.validator.validatePartAction(player, part, 'disassemble', this.syncManager.gameState.parts);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    this.syncManager.disassemblePart(playerId, partId);
    return { success: true };
  }

  loadLevel(levelId) {
    const result = this.levelManager.loadLevel(levelId);
    if (!result.success) {
      return result;
    }

    this.currentLevel = levelId;
    this.syncManager.initializeLevel(levelId, result.parts);
    return {
      success: true,
      level: result.level,
      state: this.syncManager.getState()
    };
  }

  getLevelList() {
    return this.levelManager.getLevelList();
  }

  createSave(name, isCloud = false) {
    return this.saveManager.createSave(
      name,
      this.syncManager.gameState.levelId,
      this.syncManager.getState(),
      isCloud
    );
  }

  loadSave(saveId, isCloud = false) {
    const result = this.saveManager.loadSave(saveId, isCloud);
    if (result.success) {
      const saveState = result.save.sceneState;
      this.syncManager.setState(saveState);
      this.currentLevel = saveState.levelId;
    }
    return result;
  }

  deleteSave(saveId, isCloud = false) {
    return this.saveManager.deleteSave(saveId, isCloud);
  }

  listSaves(isCloud = false) {
    return this.saveManager.listSaves(isCloud);
  }

  syncToCloud(saveId) {
    return this.saveManager.syncToCloud(saveId);
  }

  syncFromCloud(saveId) {
    return this.saveManager.syncFromCloud(saveId);
  }

  getState() {
    return this.syncManager.getState();
  }

  checkCompletion() {
    return this.validator.checkCompletion(this.syncManager.gameState.parts);
  }
}

module.exports = GameLogic;
