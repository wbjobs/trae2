class StorageManager {
  constructor() {
    this.localPrefix = 'steam_mech_';
    this.cloudPrefix = 'steam_mech_cloud_';
    this.settingsKey = this.localPrefix + 'settings';
    this.playerKey = this.localPrefix + 'player';
    this.customLevelsKey = this.localPrefix + 'custom_levels';
  }

  saveSettings(settings) {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error('保存设置失败:', error);
      return false;
    }
  }

  loadSettings() {
    try {
      const data = localStorage.getItem(this.settingsKey);
      return data ? JSON.parse(data) : this.getDefaultSettings();
    } catch (error) {
      console.error('加载设置失败:', error);
      return this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      playerName: '玩家' + Math.floor(Math.random() * 1000),
      volume: 0.7,
      graphicsQuality: 'high',
      showGrid: true,
      showSnapPoints: true,
      autoSave: true,
      serverUrl: ''
    };
  }

  savePlayerData(playerData) {
    try {
      localStorage.setItem(this.playerKey, JSON.stringify(playerData));
      return true;
    } catch (error) {
      console.error('保存玩家数据失败:', error);
      return false;
    }
  }

  loadPlayerData() {
    try {
      const data = localStorage.getItem(this.playerKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('加载玩家数据失败:', error);
      return null;
    }
  }

  saveLocalGameState(gameState) {
    try {
      const key = this.localPrefix + 'last_state';
      localStorage.setItem(key, JSON.stringify({
        ...gameState,
        savedAt: Date.now()
      }));
      return true;
    } catch (error) {
      console.error('保存游戏状态失败:', error);
      return false;
    }
  }

  loadLocalGameState() {
    try {
      const key = this.localPrefix + 'last_state';
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('加载游戏状态失败:', error);
      return null;
    }
  }

  clearLocalGameState() {
    try {
      const key = this.localPrefix + 'last_state';
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  saveRecentLevels(levelId) {
    try {
      const key = this.localPrefix + 'recent_levels';
      let recent = [];
      const data = localStorage.getItem(key);
      if (data) {
        recent = JSON.parse(data);
      }
      recent = recent.filter(id => id !== levelId);
      recent.unshift(levelId);
      if (recent.length > 10) {
        recent = recent.slice(0, 10);
      }
      localStorage.setItem(key, JSON.stringify(recent));
      return recent;
    } catch (error) {
      return [];
    }
  }

  loadRecentLevels() {
    try {
      const key = this.localPrefix + 'recent_levels';
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  saveCompletedLevel(levelId, stats) {
    try {
      const key = this.localPrefix + 'completed_levels';
      let completed = {};
      const data = localStorage.getItem(key);
      if (data) {
        completed = JSON.parse(data);
      }
      completed[levelId] = {
        ...stats,
        completedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(completed));
      return true;
    } catch (error) {
      return false;
    }
  }

  loadCompletedLevels() {
    try {
      const key = this.localPrefix + 'completed_levels';
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      return {};
    }
  }

  saveAchievement(achievementId) {
    try {
      const key = this.localPrefix + 'achievements';
      let achievements = [];
      const data = localStorage.getItem(key);
      if (data) {
        achievements = JSON.parse(data);
      }
      if (!achievements.includes(achievementId)) {
        achievements.push(achievementId);
        localStorage.setItem(key, JSON.stringify(achievements));
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  loadAchievements() {
    try {
      const key = this.localPrefix + 'achievements';
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  getStorageUsage() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.localPrefix)) {
        total += localStorage.getItem(key).length;
      }
    }
    return {
      used: total,
      usedKB: Math.round(total / 1024),
      quota: 5 * 1024 * 1024
    };
  }

  clearAllData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.localPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return keysToRemove.length;
  }

  saveCustomLevels(levels) {
    try {
      localStorage.setItem(this.customLevelsKey, JSON.stringify(levels));
      return true;
    } catch (error) {
      console.error('保存自定义关卡失败:', error);
      return false;
    }
  }

  getCustomLevels() {
    try {
      const data = localStorage.getItem(this.customLevelsKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('加载自定义关卡失败:', error);
      return [];
    }
  }

  deleteCustomLevel(levelId) {
    try {
      const levels = this.getCustomLevels();
      const filtered = levels.filter(l => l.id !== levelId);
      this.saveCustomLevels(filtered);
      return true;
    } catch (error) {
      return false;
    }
  }

  importCustomLevel(levelData) {
    try {
      const levels = this.getCustomLevels();
      levelData.id = levelData.id || `imported_${Date.now()}`;
      levels.push(levelData);
      this.saveCustomLevels(levels);
      return true;
    } catch (error) {
      return false;
    }
  }
}

window.StorageManager = StorageManager;
