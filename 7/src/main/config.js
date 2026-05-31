const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  maxLogs: 10000,
  watchFiles: [],
  filters: {
    level: ['info', 'warn', 'error', 'debug'],
    modules: [],
    keyword: '',
    dateRange: null
  },
  ui: {
    theme: 'dark',
    autoRefresh: true,
    refreshInterval: 1500,
    chartType: 'bar'
  }
};

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = path.join(__dirname, '..', '..', 'user-config.json');
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const data = JSON.parse(raw);
        this.config = this._merge(DEFAULT_CONFIG, data);
      }
    } catch (err) {
      console.error('load config error:', err);
    }
    return this.config;
  }

  saveConfig(partial) {
    this.config = this._merge(this.config, partial);
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('save config error:', err);
      return false;
    }
    return true;
  }

  resetConfig() {
    this.config = { ...DEFAULT_CONFIG };
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
    } catch (err) {
      console.error('reset config error:', err);
    }
    return this.config;
  }

  getConfig() {
    return this.config;
  }

  _merge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      const val = override[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = this._merge(base[key] || {}, val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
}

module.exports = new ConfigManager();
