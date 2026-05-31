const fs = require('fs');
const path = require('path');
const { GameState } = require('./gameState');

class SaveSystem {
  constructor(saveDir = './saves') {
    this.saveDir = saveDir;
    this.ensureSaveDirectory();
  }

  ensureSaveDirectory() {
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
  }

  getSavePath(slotId) {
    return path.join(this.saveDir, `save_${slotId}.json`);
  }

  saveGame(slotId, gameState, playerData = {}) {
    const saveData = {
      version: '1.0.0',
      timestamp: Date.now(),
      slotId: slotId,
      gameState: gameState.toJSON(),
      playerData: playerData
    };

    try {
      fs.writeFileSync(
        this.getSavePath(slotId),
        JSON.stringify(saveData, null, 2)
      );
      return { success: true, message: '保存成功' };
    } catch (error) {
      return { success: false, message: '保存失败: ' + error.message };
    }
  }

  loadGame(slotId) {
    const savePath = this.getSavePath(slotId);
    
    if (!fs.existsSync(savePath)) {
      return { success: false, message: '存档不存在' };
    }

    try {
      const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      const gameState = GameState.fromJSON(data.gameState);
      
      return {
        success: true,
        gameState: gameState,
        playerData: data.playerData,
        timestamp: data.timestamp,
        version: data.version
      };
    } catch (error) {
      return { success: false, message: '读取存档失败: ' + error.message };
    }
  }

  deleteSave(slotId) {
    const savePath = this.getSavePath(slotId);
    
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
      return { success: true, message: '存档已删除' };
    }
    return { success: false, message: '存档不存在' };
  }

  listSaves() {
    const saves = [];
    
    if (fs.existsSync(this.saveDir)) {
      const files = fs.readdirSync(this.saveDir).filter(f => f.startsWith('save_') && f.endsWith('.json'));
      
      files.forEach(file => {
        try {
          const slotId = file.replace('save_', '').replace('.json', '');
          const data = JSON.parse(fs.readFileSync(path.join(this.saveDir, file), 'utf8'));
          saves.push({
            slotId: slotId,
            timestamp: data.timestamp,
            levelId: data.gameState?.levelId,
            playerName: data.playerData?.name || '未知玩家'
          });
        } catch (e) {
          console.error('Error reading save file:', file, e);
        }
      });
    }
    
    return saves.sort((a, b) => b.timestamp - a.timestamp);
  }

  getSaveInfo(slotId) {
    const savePath = this.getSavePath(slotId);
    
    if (!fs.existsSync(savePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      return {
        slotId: slotId,
        timestamp: data.timestamp,
        levelId: data.gameState?.levelId,
        playerName: data.playerData?.name || '未知玩家',
        version: data.version
      };
    } catch (error) {
      return null;
    }
  }

  autoSave(gameState, playerData) {
    return this.saveGame('auto', gameState, playerData);
  }

  loadAutoSave() {
    return this.loadGame('auto');
  }

  exportSave(slotId, exportPath) {
    const savePath = this.getSavePath(slotId);
    
    if (fs.existsSync(savePath)) {
      fs.copyFileSync(savePath, exportPath);
      return { success: true, message: '导出成功' };
    }
    return { success: false, message: '存档不存在' };
  }

  importSave(slotId, importPath) {
    if (fs.existsSync(importPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(importPath, 'utf8'));
        if (data.gameState && data.version) {
          fs.copyFileSync(importPath, this.getSavePath(slotId));
          return { success: true, message: '导入成功' };
        }
        return { success: false, message: '无效的存档文件' };
      } catch (error) {
        return { success: false, message: '导入失败: ' + error.message };
      }
    }
    return { success: false, message: '导入文件不存在' };
  }
}

class LocalStorageSaveSystem {
  constructor(prefix = 'mech_assembly_') {
    this.prefix = prefix;
  }

  getKey(slotId) {
    return this.prefix + slotId;
  }

  saveGame(slotId, gameState, playerData = {}) {
    try {
      const saveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        slotId: slotId,
        gameState: typeof gameState.toJSON === 'function' ? gameState.toJSON() : gameState,
        playerData: playerData
      };
      
      localStorage.setItem(this.getKey(slotId), JSON.stringify(saveData));
      return { success: true, message: '保存成功' };
    } catch (error) {
      return { success: false, message: '保存失败: ' + error.message };
    }
  }

  loadGame(slotId) {
    try {
      const data = localStorage.getItem(this.getKey(slotId));
      
      if (!data) {
        return { success: false, message: '存档不存在' };
      }

      const saveData = JSON.parse(data);
      return {
        success: true,
        gameState: saveData.gameState,
        playerData: saveData.playerData,
        timestamp: saveData.timestamp,
        version: saveData.version
      };
    } catch (error) {
      return { success: false, message: '读取存档失败: ' + error.message };
    }
  }

  deleteSave(slotId) {
    localStorage.removeItem(this.getKey(slotId));
    return { success: true, message: '存档已删除' };
  }

  listSaves() {
    const saves = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.prefix)) {
        try {
          const slotId = key.replace(this.prefix, '');
          const data = JSON.parse(localStorage.getItem(key));
          saves.push({
            slotId: slotId,
            timestamp: data.timestamp,
            levelId: data.gameState?.levelId,
            playerName: data.playerData?.name || '未知玩家'
          });
        } catch (e) {
          console.error('Error reading save:', key, e);
        }
      }
    }
    
    return saves.sort((a, b) => b.timestamp - a.timestamp);
  }

  autoSave(gameState, playerData) {
    return this.saveGame('auto', gameState, playerData);
  }

  loadAutoSave() {
    return this.loadGame('auto');
  }
}

module.exports = { SaveSystem, LocalStorageSaveSystem };
