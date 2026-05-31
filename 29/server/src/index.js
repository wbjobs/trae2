const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const TerrainGenerator = require('./terrain/TerrainGenerator');
const WaterErosion = require('./physics/WaterErosion');
const WindErosion = require('./physics/WindErosion');
const { DisasterManager } = require('./physics/NaturalDisaster');
const TerrainSync = require('./network/TerrainSync');
const ErosionConfig = require('./config/ErosionConfig');
const SaveManager = require('./save/SaveManager');
const { SnapshotManager } = require('./save/SnapshotManager');

class TerrainServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      maxHttpBufferSize: 1e7,
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    this.config = new ErosionConfig();
    this.saveManager = new SaveManager();
    this.snapshotManager = null;
    this.disasterManager = null;
    
    this.terrain = null;
    this.waterErosion = null;
    this.windErosion = null;
    this.terrainSync = null;
    
    this.simulationRunning = false;
    this.simulationInterval = null;
    this.lastTickTime = 0;
    this.tickCount = 0;
    
    this.init();
  }

  init() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        players: this.terrainSync ? this.terrainSync.getPlayerList().length : 0,
        simulationRunning: this.simulationRunning,
        tickCount: this.tickCount,
        activeDisaster: this.disasterManager ? this.disasterManager.getDisasterInfo() : null
      });
    });

    this.app.get('/api/saves', (req, res) => {
      const localSaves = this.saveManager.listLocalSaves();
      const cloudSaves = this.saveManager.listCloudSaves();
      res.json({ local: localSaves, cloud: cloudSaves });
    });

    this.app.get('/api/storage-stats', (req, res) => {
      res.json(this.saveManager.getStorageStats());
    });

    this.app.get('/api/sync-stats', (req, res) => {
      if (this.terrainSync) {
        res.json(this.terrainSync.getStats());
      } else {
        res.json({ error: 'Sync not initialized' });
      }
    });

    this.app.get('/api/snapshot-stats', (req, res) => {
      if (this.snapshotManager) {
        res.json(this.snapshotManager.getStats());
      } else {
        res.json({ error: 'Snapshot manager not initialized' });
      }
    });

    this.initializeTerrain();
    this.setupSocketHandlers();
    this.setupSimulation();
  }

  initializeTerrain() {
    try {
      const cfg = this.config.getConfig();
      this.terrain = new TerrainGenerator(cfg.terrain.size, cfg.terrain.seed);
      this.terrain.generate(cfg.terrain);
      
      this.waterErosion = new WaterErosion(this.terrain, cfg.waterErosion);
      this.windErosion = new WindErosion(this.terrain, cfg.windErosion);
      this.disasterManager = new DisasterManager(this.terrain);
      this.snapshotManager = new SnapshotManager(this.terrain, 20);
      
      const angle = (cfg.windErosion.windDirection * Math.PI) / 180;
      this.windErosion.updateConfig({
        windDirectionX: Math.cos(angle),
        windDirectionY: Math.sin(angle)
      });
      
      console.log(`Terrain initialized: size=${cfg.terrain.size}, seed=${cfg.terrain.seed}`);
    } catch (error) {
      console.error('Failed to initialize terrain:', error);
      throw error;
    }
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);
      
      if (!this.terrainSync) {
        this.terrainSync = new TerrainSync(this.io, this.terrain, this.config.getConfig().simulation.syncRate);
        this.terrainSync.start();
      }

      socket.on('ping', (data) => {
        socket.emit('pong', { t: data.t, st: Date.now() });
      });

      socket.on('join', (playerData) => {
        try {
          const player = this.terrainSync.addPlayer(socket, playerData);
          this.terrainSync.sendFullTerrain(socket);
          this.terrainSync.sendConfig(socket, this.config.getConfig());
          
          const disasterInfo = this.disasterManager.getDisasterInfo();
          if (disasterInfo) {
            socket.emit('disasterEvent', { type: 'active', disaster: disasterInfo });
          }
          
          console.log(`${player.name} joined the game`);
        } catch (error) {
          console.error('Error processing join:', error);
          socket.emit('joinError', { message: error.message });
        }
      });

      socket.on('requestTerrain', () => {
        try {
          this.terrainSync.sendFullTerrain(socket);
        } catch (error) {
          console.error('Error sending terrain:', error);
        }
      });

      socket.on('playerMove', (position) => {
        try {
          if (!position || typeof position.x !== 'number') return;
          this.terrainSync.updatePlayerPosition(socket.id, position);
        } catch (error) {
          console.error('Error updating player position:', error);
        }
      });

      socket.on('chatMessage', (message) => {
        try {
          if (typeof message === 'string' && message.trim().length > 0) {
            this.terrainSync.broadcastMessage(socket, message.trim());
          }
        } catch (error) {
          console.error('Error broadcasting message:', error);
        }
      });

      socket.on('updateConfig', (newConfig) => {
        try {
          const errors = this.config.validateConfig(newConfig);
          if (errors.length === 0) {
            this.config.updateConfig(newConfig);
            this.applyConfigChanges();
            this.terrainSync.broadcastConfig(this.config.getConfig());
            socket.emit('configUpdated', { success: true });
          } else {
            socket.emit('configError', { errors });
          }
        } catch (error) {
          console.error('Error updating config:', error);
          socket.emit('configError', { errors: [error.message] });
        }
      });

      socket.on('applyPreset', (presetName) => {
        try {
          if (this.config.applyPreset(presetName)) {
            this.applyConfigChanges();
            this.terrainSync.broadcastConfig(this.config.getConfig());
            socket.emit('presetApplied', { success: true, preset: presetName });
          } else {
            socket.emit('presetError', { message: 'Unknown preset' });
          }
        } catch (error) {
          console.error('Error applying preset:', error);
        }
      });

      socket.on('resetConfig', () => {
        try {
          this.config.resetToDefault();
          this.applyConfigChanges();
          this.terrainSync.broadcastConfig(this.config.getConfig());
        } catch (error) {
          console.error('Error resetting config:', error);
        }
      });

      socket.on('regenerateTerrain', (config) => {
        try {
          if (config) {
            this.config.updateConfig({ terrain: config });
          }
          this.initializeTerrain();
          this.terrainSync.terrain = this.terrain;
          this.terrainSync.markAllChanged();
          this.io.emit('terrainRegenerated');
          console.log('Terrain regenerated');
        } catch (error) {
          console.error('Error regenerating terrain:', error);
          socket.emit('regenerateError', { message: error.message });
        }
      });

      socket.on('saveGame', (saveName) => {
        try {
          const saveData = {
            terrain: this.terrain.getTerrainData(),
            config: this.config.getConfig(),
            players: this.terrainSync.getPlayerList()
          };
          const saveId = this.saveManager.saveLocal(saveData, saveName);
          socket.emit('saveComplete', { success: true, saveId });
          console.log(`Game saved: ${saveId}`);
        } catch (error) {
          console.error('Error saving game:', error);
          socket.emit('saveError', { message: error.message });
        }
      });

      socket.on('loadGame', (saveId) => {
        try {
          const saveData = this.saveManager.loadLocal(saveId);
          this.terrain.setTerrainData(saveData.terrain);
          this.config.updateConfig(saveData.config);
          this.applyConfigChanges();
          this.terrainSync.terrain = this.terrain;
          this.terrainSync.markAllChanged();
          this.io.emit('terrainRegenerated');
          socket.emit('loadComplete', { success: true, saveId });
          console.log(`Game loaded: ${saveId}`);
        } catch (error) {
          console.error('Error loading game:', error);
          socket.emit('loadError', { message: error.message });
        }
      });

      socket.on('listSaves', () => {
        try {
          socket.emit('saveList', {
            local: this.saveManager.listLocalSaves(),
            cloud: this.saveManager.listCloudSaves()
          });
        } catch (error) {
          console.error('Error listing saves:', error);
        }
      });

      socket.on('deleteSave', (saveId) => {
        try {
          const success = this.saveManager.deleteLocal(saveId);
          socket.emit('saveDeleted', { success, saveId });
        } catch (error) {
          console.error('Error deleting save:', error);
          socket.emit('saveDeleteError', { message: error.message });
        }
      });

      socket.on('syncToCloud', (saveId) => {
        try {
          this.saveManager.syncToCloud(saveId);
          socket.emit('syncComplete', { success: true, saveId });
          console.log(`Save synced to cloud: ${saveId}`);
        } catch (error) {
          console.error('Error syncing to cloud:', error);
          socket.emit('syncError', { message: error.message });
        }
      });

      socket.on('syncFromCloud', (saveId) => {
        try {
          this.saveManager.syncFromCloud(saveId);
          socket.emit('syncComplete', { success: true, saveId, direction: 'fromCloud' });
        } catch (error) {
          console.error('Error syncing from cloud:', error);
          socket.emit('syncError', { message: error.message });
        }
      });

      socket.on('createSnapshot', (data) => {
        try {
          const snapshot = this.snapshotManager.createSnapshot(data.name, data.description);
          if (snapshot) {
            this.io.emit('snapshotCreated', { 
              success: true, 
              snapshot: {
                id: snapshot.id,
                name: snapshot.name,
                timestamp: snapshot.timestamp,
                description: snapshot.description
              }
            });
            console.log(`Snapshot created: ${snapshot.name}`);
          } else {
            socket.emit('snapshotError', { message: 'Failed to create snapshot' });
          }
        } catch (error) {
          console.error('Error creating snapshot:', error);
          socket.emit('snapshotError', { message: error.message });
        }
      });

      socket.on('restoreSnapshot', (snapshotId) => {
        try {
          const result = this.snapshotManager.restoreSnapshot(snapshotId);
          if (result.success) {
            this.terrainSync.markAllChanged();
            this.io.emit('snapshotRestored', { success: true, snapshotId });
            this.io.emit('terrainRegenerated');
            console.log(`Snapshot restored: ${snapshotId}`);
          }
        } catch (error) {
          console.error('Error restoring snapshot:', error);
          socket.emit('snapshotError', { message: error.message });
        }
      });

      socket.on('deleteSnapshot', (snapshotId) => {
        try {
          const success = this.snapshotManager.deleteSnapshot(snapshotId);
          socket.emit('snapshotDeleted', { success, snapshotId });
        } catch (error) {
          console.error('Error deleting snapshot:', error);
          socket.emit('snapshotError', { message: error.message });
        }
      });

      socket.on('listSnapshots', () => {
        try {
          socket.emit('snapshotList', this.snapshotManager.listSnapshots());
        } catch (error) {
          console.error('Error listing snapshots:', error);
        }
      });

      socket.on('triggerDisaster', (data) => {
        try {
          const disaster = this.disasterManager.triggerDisaster(data.type, data.config);
          if (disaster) {
            this.io.emit('disasterEvent', { 
              type: 'start', 
              disaster: {
                type: disaster.type,
                intensity: disaster.intensity,
                duration: disaster.maxDuration
              }
            });
            console.log(`Disaster triggered: ${data.type}`);
          }
        } catch (error) {
          console.error('Error triggering disaster:', error);
          socket.emit('disasterError', { message: error.message });
        }
      });

      socket.on('stopDisaster', () => {
        try {
          this.disasterManager.stopDisaster();
          this.io.emit('disasterEvent', { type: 'stop' });
        } catch (error) {
          console.error('Error stopping disaster:', error);
        }
      });

      socket.on('toggleDisasters', (enabled) => {
        try {
          this.disasterManager.setEnabled(enabled);
          this.io.emit('disasterEvent', { type: 'toggled', enabled });
        } catch (error) {
          console.error('Error toggling disasters:', error);
        }
      });

      socket.on('toggleSimulation', (running) => {
        try {
          if (running) {
            this.startSimulation();
          } else {
            this.stopSimulation();
          }
        } catch (error) {
          console.error('Error toggling simulation:', error);
        }
      });

      socket.on('simulationSpeed', (speed) => {
        try {
          const cfg = this.config.getConfig();
          cfg.simulation.timeScale = Math.max(0.1, Math.min(5, speed));
          this.config.updateConfig(cfg);
        } catch (error) {
          console.error('Error setting simulation speed:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (this.terrainSync) {
          this.terrainSync.removePlayer(socket.id);
        }
      });

      socket.on('error', (error) => {
        console.error(`Socket error (${socket.id}):`, error);
      });
    });
  }

  applyConfigChanges() {
    try {
      const cfg = this.config.getConfig();
      
      if (this.waterErosion) {
        this.waterErosion.updateConfig(cfg.waterErosion);
      }
      
      if (this.windErosion) {
        const windCfg = { ...cfg.windErosion };
        const angle = (cfg.windErosion.windDirection * Math.PI) / 180;
        windCfg.windDirectionX = Math.cos(angle);
        windCfg.windDirectionY = Math.sin(angle);
        this.windErosion.updateConfig(windCfg);
      }

      if (this.terrainSync) {
        this.terrainSync.setSyncRate(cfg.simulation.syncRate);
      }
    } catch (error) {
      console.error('Error applying config changes:', error);
    }
  }

  setupSimulation() {
    this.startSimulation();
  }

  startSimulation() {
    if (this.simulationRunning) return;
    
    this.simulationRunning = true;
    this.lastTickTime = Date.now();
    
    const tickRate = this.config.getConfig().simulation.tickRate;
    const interval = 1000 / tickRate;
    
    this.simulationInterval = setInterval(() => this.simulationTick(), interval);
    
    console.log('Simulation started');
  }

  stopSimulation() {
    if (!this.simulationRunning) return;
    
    this.simulationRunning = false;
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    console.log('Simulation stopped');
  }

  simulationTick() {
    try {
      const now = Date.now();
      const deltaTime = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;
      
      if (deltaTime <= 0 || deltaTime > 5) return;
      
      const cfg = this.config.getConfig();
      const scaledDelta = Math.min(deltaTime * cfg.simulation.timeScale, 0.5);
      
      if (cfg.waterErosion.enabled && this.waterErosion) {
        this.waterErosion.update(scaledDelta);
      }
      
      if (cfg.windErosion.enabled && this.windErosion) {
        this.windErosion.update(scaledDelta);
      }

      if (this.disasterManager) {
        this.disasterManager.update(scaledDelta);
        
        const disasterInfo = this.disasterManager.getDisasterInfo();
        if (disasterInfo && !disasterInfo.active) {
          this.io.emit('disasterEvent', { type: 'end', disaster: disasterInfo });
        }
      }
      
      this.tickCount++;
      
      if (this.terrainSync) {
        let marked = 0;
        const maxMark = 8192;
        
        if (cfg.waterErosion.enabled && this.waterErosion) {
          for (const key of this.waterErosion.changedCells) {
            if (marked >= maxMark) break;
            const [x, y] = key.split(',').map(Number);
            this.terrainSync.markChanged(x, y, 0);
            marked++;
          }
        }
        
        if (cfg.windErosion.enabled && this.windErosion) {
          for (const key of this.windErosion.changedCells) {
            if (marked >= maxMark) break;
            const [x, y] = key.split(',').map(Number);
            this.terrainSync.markChanged(x, y, 0);
            marked++;
          }
        }

        if (this.disasterManager) {
          const disasterCells = this.disasterManager.getChangedCells();
          for (const key of disasterCells) {
            if (marked >= maxMark) break;
            const [x, y] = key.split(',').map(Number);
            this.terrainSync.markChanged(x, y, 0);
            marked++;
          }
        }
        
        if (marked === 0) {
          const size = this.terrain.size;
          this.terrainSync.markRegionChanged(0, 0, size - 1, size - 1);
        }
      }
    } catch (error) {
      console.error('Error in simulation tick:', error);
      this.lastTickTime = Date.now();
    }
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`Terrain Sandbox Server running on port ${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
    });
  }
}

const PORT = process.env.PORT || 3000;
const server = new TerrainServer(PORT);
server.start();
