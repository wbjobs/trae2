const fs = require('fs-extra');
const path = require('path');

class SaveManager {
  constructor(localSaveDir = 'saves') {
    this.localSaveDir = path.join(process.cwd(), localSaveDir);
    this.cloudSaves = new Map();
    this.maxCloudSaves = 50;
    this.ensureSaveDirectory();
  }

  ensureSaveDirectory() {
    try {
      fs.ensureDirSync(this.localSaveDir);
    } catch (e) {
      console.error('Failed to create save directory:', e.message);
    }
  }

  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Float32Array || obj instanceof Float64Array) {
      return new Float32Array(obj);
    }
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }
    if (obj instanceof Map) {
      const cloned = new Map();
      for (const [k, v] of obj.entries()) {
        cloned.set(k, this.deepClone(v));
      }
      return cloned;
    }
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = this.deepClone(obj[key]);
    }
    return result;
  }

  validateTerrainData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.size || typeof data.size !== 'number') return false;
    if (!Array.isArray(data.heightMap)) return false;
    const totalCells = data.size * data.size;
    if (data.heightMap.length !== totalCells) return false;
    for (let i = 0; i < Math.min(totalCells, 100); i++) {
      if (typeof data.heightMap[i] !== 'number' || !Number.isFinite(data.heightMap[i])) {
        return false;
      }
    }
    return true;
  }

  generateSaveId() {
    return 'save_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  saveLocal(saveData, saveName = null) {
    if (!saveData) {
      throw new Error('Save data cannot be null or undefined');
    }
    
    const saveId = saveName || this.generateSaveId();
    const filePath = path.join(this.localSaveDir, `${saveId}.json`);
    
    const fullSaveData = {
      id: saveId,
      timestamp: Date.now(),
      version: '1.0.0',
      ...this.deepClone(saveData)
    };
    
    try {
      fs.writeJsonSync(filePath, fullSaveData, { spaces: 2 });
      return saveId;
    } catch (error) {
      throw new Error(`Failed to write save file: ${error.message}`);
    }
  }

  loadLocal(saveId) {
    const filePath = path.join(this.localSaveDir, `${saveId}.json`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Save file not found: ${saveId}`);
    }
    
    try {
      const data = fs.readJsonSync(filePath);
      
      if (data.terrain && !this.validateTerrainData(data.terrain)) {
        throw new Error(`Terrain data in save file is corrupted or invalid: ${saveId}`);
      }
      
      return this.deepClone(data);
    } catch (e) {
      if (e.message.includes('Terrain data')) throw e;
      throw new Error(`Failed to read save file: ${e.message}`);
    }
  }

  deleteLocal(saveId) {
    const filePath = path.join(this.localSaveDir, `${saveId}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        fs.removeSync(filePath);
        return true;
      } catch (e) {
        throw new Error(`Failed to delete save file: ${e.message}`);
      }
    }
    return false;
  }

  listLocalSaves() {
    if (!fs.existsSync(this.localSaveDir)) {
      return [];
    }
    
    try {
      const files = fs.readdirSync(this.localSaveDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      
      return files
        .map(saveId => {
          try {
            const data = this.loadLocal(saveId);
            return {
              id: saveId,
              timestamp: data.timestamp,
              time: new Date(data.timestamp).toLocaleString()
            };
          } catch {
            return { id: saveId, timestamp: 0, time: 'Corrupted' };
          }
        })
        .filter(s => s.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.error('Failed to list local saves:', e.message);
      return [];
    }
  }

  saveCloud(saveData, saveId = null) {
    if (!saveData) {
      throw new Error('Cloud save data cannot be null or undefined');
    }
    
    if (this.cloudSaves.size >= this.maxCloudSaves) {
      const oldestKey = this.cloudSaves.keys().next().value;
      if (oldestKey) this.cloudSaves.delete(oldestKey);
    }
    
    const id = saveId || this.generateSaveId();
    const fullSaveData = {
      id,
      timestamp: Date.now(),
      version: '1.0.0',
      synced: true,
      ...this.deepClone(saveData)
    };
    
    if (fullSaveData.terrain && !this.validateTerrainData(fullSaveData.terrain)) {
      throw new Error('Invalid terrain data for cloud save');
    }
    
    this.cloudSaves.set(id, this.deepClone(fullSaveData));
    return id;
  }

  loadCloud(saveId) {
    if (!this.cloudSaves.has(saveId)) {
      throw new Error(`Cloud save not found: ${saveId}`);
    }
    const data = this.cloudSaves.get(saveId);
    
    if (data.terrain && !this.validateTerrainData(data.terrain)) {
      this.cloudSaves.delete(saveId);
      throw new Error(`Cloud save data is corrupted: ${saveId}`);
    }
    
    return this.deepClone(data);
  }

  listCloudSaves() {
    return Array.from(this.cloudSaves.values())
      .map(save => ({
        id: save.id,
        timestamp: save.timestamp,
        time: new Date(save.timestamp).toLocaleString(),
        synced: save.synced
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  syncToCloud(saveId) {
    const localData = this.loadLocal(saveId);
    this.saveCloud(localData, saveId);
    return true;
  }

  syncFromCloud(saveId) {
    const cloudData = this.loadCloud(saveId);
    this.saveLocal(cloudData, saveId);
    return true;
  }

  autoSave(terrainData, config, interval = 300000) {
    if (!this.validateTerrainData(terrainData)) {
      console.warn('Auto-save skipped: invalid terrain data');
      return null;
    }
    
    const saveData = {
      terrain: terrainData,
      config: this.deepClone(config),
      autoSave: true
    };
    return this.saveLocal(saveData, 'autosave');
  }

  exportSave(saveId) {
    const data = this.loadLocal(saveId);
    return JSON.stringify(data);
  }

  importSave(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.terrain && !this.validateTerrainData(data.terrain)) {
        throw new Error('Imported terrain data is invalid');
      }
      
      const saveId = data.id || this.generateSaveId();
      this.saveLocal(data, saveId);
      return saveId;
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error('Invalid save data format: malformed JSON');
      }
      throw e;
    }
  }

  getSaveInfo(saveId) {
    try {
      const localData = this.loadLocal(saveId);
      const cloudData = this.cloudSaves.get(saveId);
      
      return {
        id: saveId,
        local: {
          exists: true,
          timestamp: localData.timestamp,
          time: new Date(localData.timestamp).toLocaleString()
        },
        cloud: cloudData ? {
          exists: true,
          timestamp: cloudData.timestamp,
          time: new Date(cloudData.timestamp).toLocaleString(),
          synced: cloudData.timestamp === localData.timestamp
        } : { exists: false }
      };
    } catch {
      return { 
        id: saveId, 
        local: { exists: false }, 
        cloud: { exists: false } 
      };
    }
  }

  clearCloudSaves() {
    this.cloudSaves.clear();
  }

  getStorageStats() {
    let totalLocalSize = 0;
    if (fs.existsSync(this.localSaveDir)) {
      const files = fs.readdirSync(this.localSaveDir);
      for (const file of files) {
        try {
          const stat = fs.statSync(path.join(this.localSaveDir, file));
          totalLocalSize += stat.size;
        } catch (e) {}
      }
    }
    
    return {
      localSaveCount: this.listLocalSaves().length,
      cloudSaveCount: this.cloudSaves.size,
      localStorageUsed: totalLocalSize,
      localStorageUsedMB: (totalLocalSize / 1024 / 1024).toFixed(2)
    };
  }
}

module.exports = SaveManager;
