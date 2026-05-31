const fs = require('fs');
const path = require('path');

class SimpleDatabase {
  constructor() {
    this.dataPath = path.join(__dirname, '../data.json');
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(this.dataPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      } catch (e) {
        console.error('读取数据库文件失败:', e);
      }
    }
    return this.getDefaultData();
  }

  save() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  getDefaultData() {
    return {
      users: [],
      archives: [],
      materials: [],
      materialUsages: [],
      transfers: [],
      craftSteps: [],
      signatures: [],
      identityVerifications: [],
      operationLogs: []
    };
  }

  authenticate() {
    return Promise.resolve(true);
  }

  sync() {
    return Promise.resolve();
  }
}

const db = new SimpleDatabase();
module.exports = db;
