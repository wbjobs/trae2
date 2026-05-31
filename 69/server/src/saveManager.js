const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class SaveManager {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.savesDir = path.join(this.dataDir, 'saves');
    this.cloudSavesDir = path.join(this.dataDir, 'cloud-saves');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.savesDir)) {
      fs.mkdirSync(this.savesDir, { recursive: true });
    }
    if (!fs.existsSync(this.cloudSavesDir)) {
      fs.mkdirSync(this.cloudSavesDir, { recursive: true });
    }
  }

  createSave(name, levelId, sceneState, isCloud = false) {
    const saveData = {
      id: uuidv4(),
      name,
      levelId,
      sceneState,
      metadata: {
        partsAssembled: sceneState.parts.filter(p => p.state === 'assembled').length,
        totalParts: sceneState.parts.length,
        players: Object.keys(sceneState.players).length
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const savesDir = isCloud ? this.cloudSavesDir : this.savesDir;
    const filePath = path.join(savesDir, `${saveData.id}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
      return { success: true, save: saveData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  loadSave(saveId, isCloud = false) {
    const savesDir = isCloud ? this.cloudSavesDir : this.savesDir;
    const filePath = path.join(savesDir, `${saveId}.json`);

    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '存档不存在' };
      }
      const saveData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { success: true, save: saveData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  updateSave(saveId, sceneState, isCloud = false) {
    const result = this.loadSave(saveId, isCloud);
    if (!result.success) return result;

    const saveData = result.save;
    saveData.sceneState = sceneState;
    saveData.metadata.partsAssembled = sceneState.parts.filter(p => p.state === 'assembled').length;
    saveData.updatedAt = Date.now();

    const savesDir = isCloud ? this.cloudSavesDir : this.savesDir;
    const filePath = path.join(savesDir, `${saveId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
      return { success: true, save: saveData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  deleteSave(saveId, isCloud = false) {
    const savesDir = isCloud ? this.cloudSavesDir : this.savesDir;
    const filePath = path.join(savesDir, `${saveId}.json`);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      }
      return { success: false, error: '存档不存在' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  listSaves(isCloud = false) {
    const savesDir = isCloud ? this.cloudSavesDir : this.savesDir;

    try {
      if (!fs.existsSync(savesDir)) {
        return { success: true, saves: [] };
      }

      const files = fs.readdirSync(savesDir).filter(f => f.endsWith('.json'));
      const saves = files.map(file => {
        const filePath = path.join(savesDir, file);
        const saveData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
          id: saveData.id,
          name: saveData.name,
          levelId: saveData.levelId,
          metadata: saveData.metadata,
          createdAt: saveData.createdAt,
          updatedAt: saveData.updatedAt
        };
      }).sort((a, b) => b.updatedAt - a.updatedAt);

      return { success: true, saves };
    } catch (error) {
      return { success: false, error: error.message, saves: [] };
    }
  }

  syncToCloud(saveId) {
    const local = this.loadSave(saveId, false);
    if (!local.success) return local;

    const cloudPath = path.join(this.cloudSavesDir, `${saveId}.json`);
    try {
      fs.writeFileSync(cloudPath, JSON.stringify(local.save, null, 2));
      return { success: true, save: local.save };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  syncFromCloud(saveId) {
    const cloud = this.loadSave(saveId, true);
    if (!cloud.success) return cloud;

    const localPath = path.join(this.savesDir, `${saveId}.json`);
    try {
      fs.writeFileSync(localPath, JSON.stringify(cloud.save, null, 2));
      return { success: true, save: cloud.save };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = SaveManager;
