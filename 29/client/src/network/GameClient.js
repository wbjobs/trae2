import { io } from 'socket.io-client';

class GameClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.playerName = '';
    this.config = null;
    this.players = new Map();
    this.playerPositions = new Map();
    this.terrainData = null;
    this.precision = 100;
    
    this.latency = 0;
    this.lastPingTime = 0;
    this.pingInterval = null;
    
    this.bufferPackets = [];
    this.jitterBuffer = 100;
    this.useInterpolation = true;
    this.interpolationDelay = 100;
    
    this.stats = {
      packetsReceived: 0,
      bytesReceived: 0,
      cellsReceived: 0,
      packetsLost: 0,
      lastPacketTime: 0
    };
    
    this.listeners = new Map();
  }

  connect(serverUrl, playerName) {
    return new Promise((resolve, reject) => {
      this.playerName = playerName;
      
      try {
        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000
        });

        this.socket.on('connect', () => {
          this.connected = true;
          this.playerId = this.socket.id;
          console.log('Connected to server:', this.playerId);
          
          this.socket.emit('join', {
            name: playerName,
            position: { x: 0, y: 0, z: 20 }
          });
          
          this.startLatencyMeasurement();
          
          this.emit('connected', { playerId: this.playerId });
          resolve({ playerId: this.playerId });
        });

        this.socket.on('disconnect', () => {
          this.connected = false;
          this.stopLatencyMeasurement();
          console.log('Disconnected from server');
          this.emit('disconnected');
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });

        this.socket.on('terrainUpdate', (data) => {
          this.stats.packetsReceived++;
          this.stats.lastPacketTime = Date.now();
          
          if (data.type === 'full') {
            this.terrainData = this.decompressFullTerrain(data);
            this.emit('terrainFull', this.terrainData);
          } else {
            const decompressed = this.decompressPartialTerrain(data);
            this.emit('terrainUpdate', decompressed);
          }
        });

        this.socket.on('terrainRegenerated', () => {
          this.emit('terrainRegenerated');
        });

        this.socket.on('playerSelf', (player) => {
          this.playerId = player.id;
          this.playerName = player.name;
        });

        this.socket.on('playerJoined', (player) => {
          this.players.set(player.id, player);
          this.playerPositions.set(player.id, {
            position: { ...player.position },
            targetPosition: { ...player.position },
            lastUpdate: Date.now()
          });
          this.emit('playerJoined', player);
        });

        this.socket.on('playerLeft', (data) => {
          this.players.delete(data.id);
          this.playerPositions.delete(data.id);
          this.emit('playerLeft', data.id);
        });

        this.socket.on('playerList', (players) => {
          this.players.clear();
          this.playerPositions.clear();
          for (const player of players) {
            this.players.set(player.id, player);
            this.playerPositions.set(player.id, {
              position: { ...player.position },
              targetPosition: { ...player.position },
              lastUpdate: Date.now()
            });
          }
          this.emit('playerList', players);
        });

        this.socket.on('playerMove', (data) => {
          const playerData = this.playerPositions.get(data.id);
          if (playerData) {
            if (data.i && this.useInterpolation) {
              playerData.targetPosition = { ...data.p };
              playerData.lastUpdate = data.t || Date.now();
            } else {
              playerData.position = { ...data.p };
              playerData.targetPosition = { ...data.p };
            }
            this.emit('playerMove', { id: data.id, position: data.p });
          }
        });

        this.socket.on('configUpdate', (config) => {
          this.config = config;
          this.emit('configUpdate', config);
        });

        this.socket.on('chatMessage', (data) => {
          this.emit('chatMessage', data);
        });

        this.socket.on('saveList', (data) => {
          this.emit('saveList', data);
        });

        this.socket.on('saveComplete', (data) => {
          this.emit('saveComplete', data);
        });

        this.socket.on('loadComplete', (data) => {
          this.emit('loadComplete', data);
        });

        this.socket.on('saveDeleted', (data) => {
          this.emit('saveDeleted', data);
        });

        this.socket.on('syncComplete', (data) => {
          this.emit('syncComplete', data);
        });

        this.socket.on('configUpdated', (data) => {
          this.emit('configUpdated', data);
        });

        this.socket.on('presetApplied', (data) => {
          this.emit('presetApplied', data);
        });

        this.socket.on('snapshotList', (data) => {
          this.emit('snapshotList', data);
        });

        this.socket.on('snapshotCreated', (data) => {
          this.emit('snapshotCreated', data);
        });

        this.socket.on('snapshotRestored', (data) => {
          this.emit('snapshotRestored', data);
        });

        this.socket.on('snapshotDeleted', (data) => {
          this.emit('snapshotDeleted', data);
        });

        this.socket.on('disasterEvent', (data) => {
          this.emit('disasterEvent', data);
        });

        this.socket.on('pong', (data) => {
          const now = Date.now();
          this.latency = now - this.lastPingTime;
          this.emit('latencyUpdate', { latency: this.latency });
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  decompressFullTerrain(data) {
    const size = data.size;
    this.precision = data.q || 100;
    
    if (!data.c) {
      return {
        type: 'full',
        size: size,
        heightMap: data.heightMap
      };
    }
    
    const heightMap = new Float32Array(size * size);
    let idx = 0;
    
    for (const item of data.hm) {
      if (Array.isArray(item)) {
        const [runLength, value] = item;
        const height = value / this.precision;
        for (let i = 0; i < runLength && idx < heightMap.length; i++) {
          heightMap[idx + i] = height;
        }
        idx += runLength;
      } else {
        heightMap[idx] = item / this.precision;
        idx++;
      }
    }
    
    return {
      type: 'full',
      size: size,
      heightMap: Array.from(heightMap)
    };
  }

  decompressPartialTerrain(data) {
    const changes = data.c.map(change => ({
      x: change.x,
      y: change.y,
      h: change.h / this.precision
    }));
    
    return {
      type: 'partial',
      changes: changes,
      batch: data.b,
      totalBatches: data.t,
      timestamp: data.ts
    };
  }

  interpolatePlayerPositions() {
    if (!this.useInterpolation) return;
    
    const now = Date.now();
    
    for (const [playerId, data] of this.playerPositions.entries()) {
      const timeDiff = now - data.lastUpdate;
      const progress = Math.min(1, timeDiff / this.interpolationDelay);
      
      if (progress < 1) {
        data.position.x = data.position.x + (data.targetPosition.x - data.position.x) * progress;
        data.position.y = data.position.y + (data.targetPosition.y - data.position.y) * progress;
        data.position.z = data.position.z + (data.targetPosition.z - data.position.z) * progress;
      } else {
        data.position = { ...data.targetPosition };
      }
    }
  }

  getInterpolatedPosition(playerId) {
    const data = this.playerPositions.get(playerId);
    return data ? data.position : null;
  }

  startLatencyMeasurement() {
    this.pingInterval = setInterval(() => {
      if (this.connected) {
        this.lastPingTime = Date.now();
        this.socket.emit('ping', { t: this.lastPingTime });
      }
    }, 2000);
  }

  stopLatencyMeasurement() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.stopLatencyMeasurement();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback(data);
      }
    }
  }

  requestTerrain() {
    if (this.socket && this.connected) {
      this.socket.emit('requestTerrain');
    }
  }

  updatePosition(position) {
    if (this.socket && this.connected) {
      this.socket.emit('playerMove', position);
    }
  }

  sendChatMessage(message) {
    if (this.socket && this.connected) {
      this.socket.emit('chatMessage', message);
    }
  }

  updateConfig(config) {
    if (this.socket && this.connected) {
      this.socket.emit('updateConfig', config);
    }
  }

  applyPreset(presetName) {
    if (this.socket && this.connected) {
      this.socket.emit('applyPreset', presetName);
    }
  }

  resetConfig() {
    if (this.socket && this.connected) {
      this.socket.emit('resetConfig');
    }
  }

  regenerateTerrain(config = null) {
    if (this.socket && this.connected) {
      this.socket.emit('regenerateTerrain', config);
    }
  }

  saveGame(saveName) {
    if (this.socket && this.connected) {
      this.socket.emit('saveGame', saveName);
    }
  }

  loadGame(saveId) {
    if (this.socket && this.connected) {
      this.socket.emit('loadGame', saveId);
    }
  }

  listSaves() {
    if (this.socket && this.connected) {
      this.socket.emit('listSaves');
    }
  }

  deleteSave(saveId) {
    if (this.socket && this.connected) {
      this.socket.emit('deleteSave', saveId);
    }
  }

  syncToCloud(saveId) {
    if (this.socket && this.connected) {
      this.socket.emit('syncToCloud', saveId);
    }
  }

  toggleSimulation(running) {
    if (this.socket && this.connected) {
      this.socket.emit('toggleSimulation', running);
    }
  }

  setSimulationSpeed(speed) {
    if (this.socket && this.connected) {
      this.socket.emit('simulationSpeed', speed);
    }
  }

  createSnapshot(name, description) {
    if (this.socket && this.connected) {
      this.socket.emit('createSnapshot', { name, description });
    }
  }

  restoreSnapshot(snapshotId) {
    if (this.socket && this.connected) {
      this.socket.emit('restoreSnapshot', snapshotId);
    }
  }

  deleteSnapshot(snapshotId) {
    if (this.socket && this.connected) {
      this.socket.emit('deleteSnapshot', snapshotId);
    }
  }

  listSnapshots() {
    if (this.socket && this.connected) {
      this.socket.emit('listSnapshots');
    }
  }

  triggerDisaster(type, config) {
    if (this.socket && this.connected) {
      this.socket.emit('triggerDisaster', { type, config });
    }
  }

  stopDisaster() {
    if (this.socket && this.connected) {
      this.socket.emit('stopDisaster');
    }
  }

  toggleDisasters(enabled) {
    if (this.socket && this.connected) {
      this.socket.emit('toggleDisasters', enabled);
    }
  }

  getPlayers() {
    return Array.from(this.players.values());
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getStats() {
    return {
      ...this.stats,
      latency: this.latency,
      connected: this.connected,
      playerCount: this.players.size
    };
  }

  setInterpolation(enabled, delay = 100) {
    this.useInterpolation = enabled;
    this.interpolationDelay = Math.max(50, Math.min(500, delay));
  }
}

export default GameClient;
