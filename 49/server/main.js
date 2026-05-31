const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { GameState, Player } = require('../shared/gameState');
const { Part } = require('../shared/partData');
const { LevelManager } = require('../shared/levels');
const { AssemblyManager, AssemblyValidator } = require('./assemblyLogic');
const { SaveSystem } = require('../shared/saveSystem');
const { AnimationSystem, NetworkCompressor } = require('../shared/animationSystem');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.static(path.join(__dirname, '../shared')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

const gameRooms = new Map();
const levelManager = new LevelManager();
const saveSystem = new SaveSystem();

class GameRoom {
  constructor(roomId, levelId) {
    this.id = roomId;
    this.levelId = levelId;
    this.gameState = new GameState();
    this.assemblyManager = new AssemblyManager();
    this.validator = new AssemblyValidator();
    this.level = levelManager.getLevel(levelId);
    this.animationSystem = new AnimationSystem();
    this.compressor = new NetworkCompressor();
    this.lastSentStates = new Map();
    this.createdAt = Date.now();
    
    this.initLevel();
    this.startAnimationLoop();
  }

  initLevel() {
    if (this.level) {
      this.gameState.levelId = this.levelId;
      this.level.parts.forEach(partData => {
        const part = Part.fromJSON(partData.toJSON ? partData.toJSON() : partData);
        this.gameState.addPart(part);
      });
      this.gameState.startTime = Date.now();
    }
  }

  addPlayer(playerId, playerName) {
    const colors = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c];
    const colorIndex = this.gameState.players.size % colors.length;
    const player = new Player(playerId, playerName, colors[colorIndex]);
    this.gameState.addPlayer(player);
    return player;
  }

  removePlayer(playerId) {
    this.gameState.removePlayer(playerId);
  }

  handlePartMove(playerId, partId, position) {
    const part = this.gameState.getPart(partId);
    if (!part || part.playerId && part.playerId !== playerId) {
      return { success: false, message: '无法移动该零件' };
    }

    part.playerId = playerId;
    part.position = position;
    return { success: true };
  }

  handlePartRotate(playerId, partId, rotation) {
    const part = this.gameState.getPart(partId);
    if (!part || part.playerId && part.playerId !== playerId) {
      return { success: false, message: '无法旋转该零件' };
    }

    part.playerId = playerId;
    part.rotation = rotation;
    return { success: true };
  }

  handlePartPlace(playerId, partId, position) {
    const part = this.gameState.getPart(partId);
    if (!part) {
      return { success: false, message: '零件不存在' };
    }

    const validation = this.validator.validatePartPlacement(part, position);
    if (!validation.valid) {
      return validation;
    }

    this.gameState.placePart(partId, position, playerId);
    
    const player = this.gameState.getPlayer(playerId);
    if (player) {
      player.score += 10;
    }

    return { success: true, message: '放置成功' };
  }

  handleAssemblyAttempt(playerId, partId, targetPartId) {
    const allParts = this.gameState.getAllParts();
    const result = this.assemblyManager.attemptAssembly(partId, targetPartId, allParts);

    if (result.success) {
      const player = this.gameState.getPlayer(playerId);
      if (player) {
        player.score += 50;
      }

      this.gameState.assembledParts.add(partId);
      
      const completion = this.validator.checkLevelCompletion(
        this.level, 
        this.gameState.getAllParts()
      );
      
      if (completion.completed) {
        this.gameState.isComplete = true;
        this.gameState.elapsedTime = Date.now() - this.gameState.startTime;
      }

      return {
        ...result,
        completion: completion,
        assemblyProgress: this.assemblyManager.getAssemblyProgress(allParts)
      };
    }

    return result;
  }

  handleDisassembly(playerId, partId) {
    const allParts = this.gameState.getAllParts();
    this.assemblyManager.disassemblePart(partId, allParts);
    this.gameState.assembledParts.delete(partId);
    this.gameState.isComplete = false;

    return { success: true };
  }

  getStateForPlayer() {
    return this.gameState.toJSON();
  }

  getAssemblyProgress() {
    return this.assemblyManager.getAssemblyProgress(this.gameState.getAllParts());
  }

  startAnimationLoop() {
    setInterval(() => {
      if (!this.animationSystem.isRunning) return;

      this.animationSystem.updateAll(
        1000 / 30,
        (partId) => {
          const part = this.gameState.getPart(partId);
          return part ? { position: part.position, rotation: part.rotation } : null;
        },
        (partId, state) => {
          const part = this.gameState.getPart(partId);
          if (part) {
            if (state.position) {
              part.position = {
                x: Math.round(state.position.x * 100) / 100,
                y: Math.round(state.position.y * 100) / 100,
                z: Math.round(state.position.z * 100) / 100
              };
            }
            if (state.rotation) {
              part.rotation = {
                x: Math.round(state.rotation.x * 100) / 100,
                y: Math.round(state.rotation.y * 100) / 100,
                z: Math.round(state.rotation.z * 100) / 100
              };
            }
          }
        }
      );
    }, 1000 / 30);
  }

  setAnimationForPart(partId, animationType, config) {
    switch (animationType) {
      case 'gear':
        return this.animationSystem.createGearAnimation(partId, config);
      case 'rotation':
        return this.animationSystem.createRotationAnimation(partId, config);
      case 'pendulum':
        return this.animationSystem.createPendulumAnimation(partId, config);
      case 'piston':
        return this.animationSystem.createPistonAnimation(partId, config);
      default:
        return null;
    }
  }

  startAnimations() {
    this.animationSystem.start();
  }

  stopAnimations() {
    this.animationSystem.stop();
  }

  setAnimationSpeed(speed) {
    this.animationSystem.setSpeed(speed);
  }

  getCompressedState() {
    const allParts = this.gameState.getAllParts();
    const allPlayers = this.gameState.getAllPlayers();

    const compressedParts = allParts.map(part => this.compressor.compressPartState(part));
    const compressedPlayers = allPlayers.map(player => this.compressor.compressPlayerState(player));

    return {
      t: Date.now(),
      p: compressedParts,
      pl: compressedPlayers,
      c: this.gameState.isComplete
    };
  }

  getDeltaState() {
    const allParts = this.gameState.getAllParts();
    const changes = [];

    allParts.forEach(currPart => {
      const prevPart = this.lastSentStates.get(currPart.id);
      
      if (!prevPart) {
        changes.push({
          id: currPart.id,
          type: 'add',
          state: this.compressor.compressPartState(currPart)
        });
      } else if (this.compressor.hasChanged(prevPart, currPart)) {
        changes.push({
          id: currPart.id,
          type: 'update',
          state: this.compressor.compressPartState(currPart)
        });
      }
      
      this.lastSentStates.set(currPart.id, {
        position: { ...currPart.position },
        rotation: { ...currPart.rotation },
        assembled: currPart.assembled,
        playerId: currPart.playerId
      });
    });

    return {
      t: Date.now(),
      c: changes,
      full: false
    };
  }
}

function getOrCreateRoom(roomId, levelId = 'level1') {
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, new GameRoom(roomId, levelId));
  }
  return gameRooms.get(roomId);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName, levelId }) => {
    const actualRoomId = roomId || 'default_room';
    const actualLevelId = levelId || 'level1';
    
    const room = getOrCreateRoom(actualRoomId, actualLevelId);
    const player = room.addPlayer(socket.id, playerName || '匿名玩家');

    socket.join(actualRoomId);
    socket.currentRoomId = actualRoomId;

    socket.emit('player-joined', {
      playerId: socket.id,
      player: player.toJSON()
    });

    io.to(actualRoomId).emit('game-state-update', room.getStateForPlayer());
    io.to(actualRoomId).emit('assembly-progress', room.getAssemblyProgress());

    console.log(`Player ${playerName} joined room ${actualRoomId}`);
  });

  socket.on('part-move', ({ partId, position }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const result = room.handlePartMove(socket.id, partId, position);
    if (result.success) {
      socket.to(socket.currentRoomId).emit('part-moved', {
        partId,
        position,
        playerId: socket.id
      });
    }
  });

  socket.on('part-rotate', ({ partId, rotation }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const result = room.handlePartRotate(socket.id, partId, rotation);
    if (result.success) {
      socket.to(socket.currentRoomId).emit('part-rotated', {
        partId,
        rotation,
        playerId: socket.id
      });
    }
  });

  socket.on('part-place', ({ partId, position }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const result = room.handlePartPlace(socket.id, partId, position);
    if (result.success) {
      io.to(socket.currentRoomId).emit('part-placed', {
        partId,
        position,
        playerId: socket.id
      });
      io.to(socket.currentRoomId).emit('game-state-update', room.getStateForPlayer());
    }
    socket.emit('place-result', result);
  });

  socket.on('attempt-assembly', ({ partId, targetPartId }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const result = room.handleAssemblyAttempt(socket.id, partId, targetPartId);
    
    if (result.success) {
      io.to(socket.currentRoomId).emit('assembly-success', {
        partId,
        targetPartId,
        snappedPosition: result.snappedPosition,
        playerId: socket.id,
        completion: result.completion
      });
      io.to(socket.currentRoomId).emit('game-state-update', room.getStateForPlayer());
      io.to(socket.currentRoomId).emit('assembly-progress', result.assemblyProgress);

      if (result.completion?.completed) {
        io.to(socket.currentRoomId).emit('level-complete', {
          message: '恭喜！关卡完成！',
          time: room.gameState.elapsedTime,
          scores: room.gameState.getAllPlayers().map(p => ({ name: p.name, score: p.score }))
        });
      }
    }
    
    socket.emit('assembly-result', result);
  });

  socket.on('disassembly', ({ partId }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.handleDisassembly(socket.id, partId);
    io.to(socket.currentRoomId).emit('part-disassembled', { partId });
    io.to(socket.currentRoomId).emit('game-state-update', room.getStateForPlayer());
    io.to(socket.currentRoomId).emit('assembly-progress', room.getAssemblyProgress());
  });

  socket.on('request-state', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (room) {
      socket.emit('game-state-update', room.getStateForPlayer());
      socket.emit('assembly-progress', room.getAssemblyProgress());
    }
  });

  socket.on('chat-message', ({ message }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const player = room.gameState.getPlayer(socket.id);
    io.to(socket.currentRoomId).emit('chat-message', {
      playerId: socket.id,
      playerName: player?.name || '未知',
      message: message,
      timestamp: Date.now()
    });
  });

  socket.on('save-game', ({ slotId }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const player = room.gameState.getPlayer(socket.id);
    const result = saveSystem.saveGame(slotId, room.gameState, {
      name: player?.name || '未知',
      playerId: socket.id
    });
    socket.emit('save-result', result);
  });

  socket.on('load-game', ({ slotId }) => {
    const result = saveSystem.loadGame(slotId);
    if (result.success) {
      socket.emit('load-result', result);
    } else {
      socket.emit('load-result', { success: false, message: result.message });
    }
  });

  socket.on('set-animation', ({ partId, type, config }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.setAnimationForPart(partId, type, config);
    io.to(socket.currentRoomId).emit('animation-updated', {
      partId,
      type,
      config
    });
  });

  socket.on('start-animations', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.startAnimations();
    io.to(socket.currentRoomId).emit('animations-started');
  });

  socket.on('stop-animations', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.stopAnimations();
    io.to(socket.currentRoomId).emit('animations-stopped');
  });

  socket.on('set-animation-speed', ({ speed }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.setAnimationSpeed(speed);
    io.to(socket.currentRoomId).emit('animation-speed-changed', { speed });
  });

  socket.on('request-compressed-state', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (room) {
      socket.emit('compressed-state-update', room.getCompressedState());
    }
  });

  socket.on('request-delta-state', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (room) {
      socket.emit('delta-state-update', room.getDeltaState());
    }
  });

  socket.on('editor-add-part', ({ partType, position }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const partId = uuidv4();
    const part = Part.fromJSON({
      id: partId,
      type: partType,
      position: position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      connections: [],
      connectedTo: [],
      playerId: socket.id
    });
    
    room.gameState.addPart(part);
    io.to(socket.currentRoomId).emit('part-added', {
      part: part.toJSON()
    });
  });

  socket.on('editor-remove-part', ({ partId }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    room.gameState.removePart(partId);
    io.to(socket.currentRoomId).emit('part-removed', { partId });
  });

  socket.on('editor-save-level', ({ levelName, description }) => {
    const room = gameRooms.get(socket.currentRoomId);
    if (!room) return;

    const levelData = {
      id: 'custom_' + Date.now(),
      name: levelName || '自定义关卡',
      description: description || '',
      difficulty: 'custom',
      parts: room.gameState.getAllParts().map(p => p.toJSON())
    };

    const levelDir = path.join(__dirname, '../custom-levels');
    if (!fs.existsSync(levelDir)) {
      fs.mkdirSync(levelDir, { recursive: true });
    }

    const levelPath = path.join(levelDir, `${levelData.id}.json`);
    fs.writeFileSync(levelPath, JSON.stringify(levelData, null, 2));

    socket.emit('level-saved', { levelId: levelData.id, success: true });
  });

  socket.on('disconnect', () => {
    const room = gameRooms.get(socket.currentRoomId);
    if (room) {
      room.removePlayer(socket.id);
      
      room.getAllParts().forEach(part => {
        if (part.playerId === socket.id) {
          part.playerId = null;
        }
      });

      io.to(socket.currentRoomId).emit('player-left', { playerId: socket.id });
      io.to(socket.currentRoomId).emit('game-state-update', room.getStateForPlayer());

      if (room.gameState.players.size === 0) {
        setTimeout(() => {
          if (room.gameState.players.size === 0) {
            gameRooms.delete(socket.currentRoomId);
            console.log(`Room ${socket.currentRoomId} deleted (empty)`);
          }
        }, 60000);
      }
    }
    console.log('Player disconnected:', socket.id);
  });
});

app.get('/api/levels', (req, res) => {
  const levels = levelManager.getAllLevels().map(level => ({
    id: level.id,
    name: level.name,
    description: level.description,
    difficulty: level.difficulty
  }));
  res.json(levels);
});

app.get('/api/saves', (req, res) => {
  res.json(saveSystem.listSaves());
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`网页端: http://localhost:${PORT}`);
});

module.exports = { gameRooms, GameRoom };
