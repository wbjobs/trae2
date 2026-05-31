class TerrainSync {
  constructor(io, terrain, syncRate = 10) {
    this.io = io;
    this.terrain = terrain;
    this.syncRate = syncRate;
    this.syncInterval = null;
    this.changedCells = new Map();
    this.players = new Map();
    this.maxChangesPerSync = 2048;
    this.lastHeightMap = null;
    this.useDeltaEncoding = true;
    this.precision = 100;
    this.batchSize = 512;
    this.stats = {
      totalPackets: 0,
      totalBytes: 0,
      totalCells: 0
    };
  }

  start() {
    const interval = 1000 / this.syncRate;
    this.syncInterval = setInterval(() => this.syncTerrain(), interval);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  markChanged(x, y, radius = 0) {
    const size = this.terrain.size;
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(size - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(size - 1, y + radius);
    
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = `${cx},${cy}`;
        if (!this.changedCells.has(key)) {
          this.changedCells.set(key, { x: cx, y: cy });
        }
      }
    }
  }

  markRegionChanged(minX, minY, maxX, maxY) {
    const size = this.terrain.size;
    minX = Math.max(0, minX);
    maxX = Math.min(size - 1, maxX);
    minY = Math.max(0, minY);
    maxY = Math.min(size - 1, maxY);
    
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        if (!this.changedCells.has(key)) {
          this.changedCells.set(key, { x, y });
        }
      }
    }
  }

  markAllChanged() {
    const size = this.terrain.size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const key = `${x},${y}`;
        this.changedCells.set(key, { x, y });
      }
    }
  }

  quantizeHeight(height) {
    return Math.round(height * this.precision);
  }

  dequantizeHeight(quantized) {
    return quantized / this.precision;
  }

  encodeDelta(current, previous) {
    const delta = current - previous;
    if (delta >= -63 && delta <= 63) {
      return [delta & 0x7F];
    } else if (delta >= -8192 && delta <= 8191) {
      return [0x80 | ((delta >> 8) & 0x7F), delta & 0xFF];
    } else {
      return [0xC0, (current >> 16) & 0xFF, (current >> 8) & 0xFF, current & 0xFF];
    }
  }

  syncTerrain() {
    if (this.changedCells.size === 0) return;

    const size = this.terrain.size;
    const cellCount = this.changedCells.size;
    const usePartial = cellCount < this.maxChangesPerSync;
    
    if (usePartial) {
      const iterator = this.changedCells.keys();
      let batches = [];
      let currentBatch = [];
      
      for (const key of iterator) {
        if (currentBatch.length >= this.batchSize) {
          batches.push(currentBatch);
          currentBatch = [];
        }
        currentBatch.push(key);
      }
      
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const changes = [];
        
        for (const key of batch) {
          const [x, y] = key.split(',').map(Number);
          const height = this.terrain.getHeight(x, y);
          
          if (this.useDeltaEncoding && this.lastHeightMap) {
            const lastKey = y * size + x;
            const lastHeight = this.lastHeightMap[lastKey];
            if (lastHeight !== undefined) {
              const currentQ = this.quantizeHeight(height);
              const lastQ = this.quantizeHeight(lastHeight);
              if (currentQ === lastQ) {
                this.changedCells.delete(key);
                continue;
              }
            }
          }
          
          changes.push({
            x,
            y,
            h: this.quantizeHeight(height)
          });
          
          if (this.lastHeightMap) {
            this.lastHeightMap[y * size + x] = height;
          }
        }
        
        if (changes.length > 0) {
          const packet = {
            type: 'partial',
            b: i,
            t: batches.length,
            c: changes,
            ts: Date.now()
          };
          
          this.io.emit('terrainUpdate', packet);
          
          this.stats.totalPackets++;
          this.stats.totalCells += changes.length;
        }
      }
      
      this.changedCells.clear();
    } else {
      const fullData = this.getFullTerrainData();
      this.io.emit('terrainUpdate', fullData);
      this.changedCells.clear();
      
      this.stats.totalPackets++;
      this.stats.totalCells += size * size;
    }
  }

  getFullTerrainData() {
    const size = this.terrain.size;
    const heightMap = new Int16Array(size * size);
    
    this.lastHeightMap = new Float32Array(size * size);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        const h = this.terrain.getHeight(x, y);
        const safeHeight = Number.isFinite(h) ? h : 0;
        heightMap[index] = this.quantizeHeight(safeHeight);
        this.lastHeightMap[index] = safeHeight;
      }
    }
    
    const compressed = this.compressHeightMap(heightMap, size);
    
    return {
      type: 'full',
      size: size,
      hm: compressed,
      q: this.precision,
      c: true,
      ts: Date.now()
    };
  }

  compressHeightMap(heightMap, size) {
    const compressed = [];
    let i = 0;
    
    while (i < heightMap.length) {
      const value = heightMap[i];
      let runLength = 1;
      
      while (i + runLength < heightMap.length && 
             heightMap[i + runLength] === value && 
             runLength < 255) {
        runLength++;
      }
      
      if (runLength > 2) {
        compressed.push([runLength, value]);
        i += runLength;
      } else {
        compressed.push(value);
        i++;
      }
    }
    
    return compressed;
  }

  sendFullTerrain(socket) {
    socket.emit('terrainUpdate', this.getFullTerrainData());
  }

  addPlayer(socket, playerData) {
    const player = {
      id: socket.id,
      name: playerData.name || `Player_${socket.id.substr(0, 6)}`,
      position: playerData.position || { x: 0, y: 0, z: 0 },
      color: playerData.color || this.getRandomColor(),
      connectedAt: Date.now(),
      lastUpdate: Date.now(),
      interpolatePosition: { ...(playerData.position || { x: 0, y: 0, z: 0 }) }
    };
    
    this.players.set(socket.id, player);
    socket.emit('playerSelf', { id: socket.id, name: player.name, color: player.color });
    socket.broadcast.emit('playerJoined', {
      id: player.id,
      name: player.name,
      color: player.color,
      position: player.position
    });
    this.sendPlayerList(socket);
    
    return player;
  }

  removePlayer(socketId) {
    if (this.players.has(socketId)) {
      this.players.delete(socketId);
      this.io.emit('playerLeft', { id: socketId });
    }
  }

  updatePlayerPosition(socketId, position) {
    const player = this.players.get(socketId);
    if (player) {
      const clampedPos = {
        x: Math.max(-500, Math.min(500, position.x)),
        y: Math.max(-500, Math.min(500, position.y)),
        z: Math.max(-500, Math.min(500, position.z))
      };
      
      player.interpolatePosition = { ...player.position };
      player.position = clampedPos;
      player.lastUpdate = Date.now();
      
      socket.broadcast.emit('playerMove', {
        id: socketId,
        p: clampedPos,
        t: Date.now(),
        i: true
      });
    }
  }

  sendPlayerList(socket) {
    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      position: p.position
    }));
    socket.emit('playerList', players);
  }

  getPlayerList() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      position: p.position
    }));
  }

  getRandomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  broadcastMessage(socket, message) {
    if (typeof message !== 'string' || message.length > 500) {
      message = String(message).substring(0, 500);
    }
    const player = this.players.get(socket.id);
    this.io.emit('chatMessage', {
      playerId: socket.id,
      playerName: player ? player.name : 'Unknown',
      message: message,
      timestamp: Date.now()
    });
  }

  sendConfig(socket, config) {
    socket.emit('configUpdate', config);
  }

  broadcastConfig(config) {
    this.io.emit('configUpdate', config);
  }

  broadcastEvent(eventName, data) {
    this.io.emit(eventName, data);
  }

  setSyncRate(rate) {
    this.syncRate = Math.max(1, Math.min(60, rate));
    this.stop();
    this.start();
  }

  setPrecision(precision) {
    this.precision = Math.max(10, Math.min(1000, precision));
  }

  getStats() {
    return {
      ...this.stats,
      changedCells: this.changedCells.size,
      players: this.players.size,
      avgPacketSize: this.stats.totalPackets > 0 
        ? Math.round(this.stats.totalBytes / this.stats.totalPackets) 
        : 0,
      avgCellsPerPacket: this.stats.totalPackets > 0
        ? Math.round(this.stats.totalCells / this.stats.totalPackets)
        : 0
    };
  }

  resetStats() {
    this.stats = {
      totalPackets: 0,
      totalBytes: 0,
      totalCells: 0
    };
  }
}

module.exports = TerrainSync;
