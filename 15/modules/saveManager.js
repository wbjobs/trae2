const fs = require('fs');
const path = require('path');

class SaveManager {
  constructor(saveDir) {
    this.saveDir = saveDir || path.join(__dirname, '..', 'data', 'saves');
    this.cloudDir = path.join(this.saveDir, 'cloud');
    this.cloudSaves = new Map();
    this._ensureDir();
    this._loadCloudFromDisk();
  }

  _ensureDir() {
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
    if (!fs.existsSync(this.cloudDir)) {
      fs.mkdirSync(this.cloudDir, { recursive: true });
    }
  }

  _loadCloudFromDisk() {
    try {
      if (!fs.existsSync(this.cloudDir)) return;
      const files = fs.readdirSync(this.cloudDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.cloudDir, file), 'utf-8');
          const data = JSON.parse(raw);
          if (data.slotId && data.gameState) {
            this.cloudSaves.set(data.slotId, data);
          }
        } catch (e) {
          console.warn(`[存档] 跳过损坏的云端存档文件: ${file}`);
        }
      }
      if (files.length > 0) {
        console.log(`[存档] 已加载 ${this.cloudSaves.size} 个云端存档`);
      }
    } catch (e) {
      console.warn('[存档] 云端存档目录加载失败:', e.message);
    }
  }

  _getSaveFilePath(slotId) {
    return path.join(this.saveDir, `save_${slotId}.json`);
  }

  _getCloudFilePath(slotId) {
    return path.join(this.cloudDir, `cloud_${slotId}.json`);
  }

  _validateGameState(gameState) {
    if (!gameState || typeof gameState !== 'object') return false;
    if (!gameState.global && !gameState.inventory && !gameState.currentScene) return false;
    return true;
  }

  saveToLocal(slotId, gameState) {
    try {
      if (!this._validateGameState(gameState)) {
        return { success: false, error: '无效的游戏状态数据' };
      }
      const saveData = {
        slotId,
        gameState,
        savedAt: new Date().toISOString(),
        version: 2
      };
      const filePath = this._getSaveFilePath(slotId);
      fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf-8');
      return { success: true, path: filePath, timestamp: saveData.savedAt };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  loadFromLocal(slotId) {
    try {
      const filePath = this._getSaveFilePath(slotId);
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '本地存档不存在' };
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saveData = JSON.parse(raw);
      if (!this._validateGameState(saveData.gameState)) {
        return { success: false, error: '存档数据格式无效（可能是旧版存档）' };
      }
      return { success: true, data: saveData.gameState, metadata: saveData };
    } catch (err) {
      return { success: false, error: `本地存档读取失败: ${err.message}` };
    }
  }

  deleteLocalSave(slotId) {
    try {
      const filePath = this._getSaveFilePath(slotId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      }
      return { success: false, error: '本地存档不存在' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  listLocalSaves() {
    try {
      this._ensureDir();
      const files = fs.readdirSync(this.saveDir).filter(f => f.startsWith('save_') && f.endsWith('.json'));
      const saves = files.map(file => {
        const match = file.match(/save_(\w+)\.json/);
        if (!match) return null;
        const slotId = match[1];
        try {
          const raw = fs.readFileSync(path.join(this.saveDir, file), 'utf-8');
          const data = JSON.parse(raw);
          const scene = data.gameState?.global?.currentScene
            || data.gameState?.currentScene
            || '未知';
          const invCount = data.gameState?.global?.inventory?.length
            || data.gameState?.inventory?.length
            || 0;
          return {
            slotId,
            savedAt: data.savedAt,
            scene,
            inventoryCount: invCount
          };
        } catch {
          return { slotId, error: '存档损坏' };
        }
      }).filter(Boolean);
      return { success: true, saves };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  saveToCloud(slotId, gameState) {
    try {
      if (!this._validateGameState(gameState)) {
        return { success: false, error: '无效的游戏状态数据' };
      }
      const saveData = {
        slotId,
        gameState,
        savedAt: new Date().toISOString(),
        version: 2
      };
      this.cloudSaves.set(slotId, saveData);

      try {
        const cloudPath = this._getCloudFilePath(slotId);
        fs.writeFileSync(cloudPath, JSON.stringify(saveData, null, 2), 'utf-8');
      } catch (e) {
        console.warn(`[存档] 云端存档持久化失败: ${e.message}`);
      }

      return { success: true, cloudId: `cloud_${slotId}`, timestamp: saveData.savedAt };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  loadFromCloud(slotId) {
    const saveData = this.cloudSaves.get(slotId);
    if (!saveData) {
      return { success: false, error: '云端存档不存在' };
    }
    if (!this._validateGameState(saveData.gameState)) {
      return { success: false, error: '云端存档数据格式无效' };
    }
    return { success: true, data: saveData.gameState, metadata: saveData };
  }

  deleteCloudSave(slotId) {
    if (this.cloudSaves.has(slotId)) {
      this.cloudSaves.delete(slotId);
      try {
        const cloudPath = this._getCloudFilePath(slotId);
        if (fs.existsSync(cloudPath)) {
          fs.unlinkSync(cloudPath);
        }
      } catch (e) {
        console.warn(`[存档] 删除云端存档文件失败: ${e.message}`);
      }
      return { success: true };
    }
    return { success: false, error: '云端存档不存在' };
  }

  listCloudSaves() {
    const saves = Array.from(this.cloudSaves.entries()).map(([slotId, data]) => {
      const scene = data.gameState?.global?.currentScene
        || data.gameState?.currentScene
        || '未知';
      const invCount = data.gameState?.global?.inventory?.length
        || data.gameState?.inventory?.length
        || 0;
      return {
        slotId,
        savedAt: data.savedAt,
        scene,
        inventoryCount: invCount
      };
    });
    return { success: true, saves };
  }

  save(slotId, gameState, options = {}) {
    const mode = options.mode || 'both';
    const results = {};

    if (mode === 'local' || mode === 'both') {
      results.local = this.saveToLocal(slotId, gameState);
    }
    if (mode === 'cloud' || mode === 'both') {
      results.cloud = this.saveToCloud(slotId, gameState);
    }

    const anySuccess = Object.values(results).some(r => r && r.success);
    return {
      success: anySuccess,
      results,
      message: anySuccess
        ? (mode === 'both'
          ? (results.local?.success && results.cloud?.success
            ? '本地+云端均保存成功'
            : results.local?.success ? '仅本地保存成功' : '仅云端保存成功')
          : '保存成功')
        : '保存失败'
    };
  }

  load(slotId, options = {}) {
    const prefer = options.prefer || 'local';

    if (prefer === 'cloud') {
      const cloudResult = this.loadFromCloud(slotId);
      if (cloudResult.success) return cloudResult;
      const localResult = this.loadFromLocal(slotId);
      if (localResult.success) {
        localResult.fallback = true;
        return localResult;
      }
      return { success: false, error: `云端和本地均无存档: ${slotId}` };
    }

    const localResult = this.loadFromLocal(slotId);
    if (localResult.success) return localResult;

    const cloudResult = this.loadFromCloud(slotId);
    if (cloudResult.success) {
      cloudResult.fallback = true;
      return cloudResult;
    }
    return { success: false, error: `本地和云端均无存档: ${slotId}` };
  }

  syncLocalToCloud(slotId) {
    const local = this.loadFromLocal(slotId);
    if (!local.success) return { success: false, error: '本地存档读取失败' };
    return this.saveToCloud(slotId, local.data);
  }

  syncCloudToLocal(slotId) {
    const cloud = this.loadFromCloud(slotId);
    if (!cloud.success) return { success: false, error: '云端存档读取失败' };
    return this.saveToLocal(slotId, cloud.data);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SaveManager;
}