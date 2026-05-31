class ErosionConfig {
  constructor() {
    this.defaultConfig = {
      terrain: {
        size: 128,
        scale: 50,
        octaves: 6,
        persistence: 0.5,
        lacunarity: 2.0,
        heightMultiplier: 50,
        baseHeight: 20,
        seed: Date.now()
      },
      waterErosion: {
        enabled: true,
        rainRate: 0.3,
        evaporationRate: 0.02,
        erosionStrength: 0.3,
        depositionRate: 0.3,
        sedimentCapacity: 4.0,
        minSlope: 0.01,
        inertia: 0.05,
        gravity: 4.0,
        maxSteps: 64,
        erosionRadius: 3
      },
      windErosion: {
        enabled: true,
        windStrength: 0.5,
        windDirection: 0,
        abrasionRate: 0.1,
        depositionRate: 0.2,
        suspensionRate: 0.05,
        particleCount: 1000,
        maxParticleLife: 100
      },
      simulation: {
        timeScale: 1.0,
        tickRate: 60,
        syncRate: 10,
        autoSaveInterval: 300000
      }
    };
    
    this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
  }

  getConfig() {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }

  updateConfig(newConfig) {
    this.mergeConfig(this.currentConfig, newConfig);
    return this.getConfig();
  }

  mergeConfig(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        if (Array.isArray(source[key])) {
          target[key] = source[key];
        } else {
          this.mergeConfig(target[key], source[key]);
        }
      } else {
        target[key] = source[key];
      }
    }
  }

  resetToDefault() {
    this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
    return this.getConfig();
  }

  validateConfig(config) {
    const errors = [];
    
    if (config.terrain) {
      if (config.terrain.size < 32 || config.terrain.size > 512) {
        errors.push('Terrain size must be between 32 and 512');
      }
      if (config.terrain.heightMultiplier < 0) {
        errors.push('Height multiplier must be positive');
      }
    }
    
    if (config.waterErosion) {
      if (config.waterErosion.erosionStrength < 0 || config.waterErosion.erosionStrength > 1) {
        errors.push('Erosion strength must be between 0 and 1');
      }
    }
    
    if (config.windErosion) {
      if (config.windErosion.windStrength < 0) {
        errors.push('Wind strength must be positive');
      }
    }
    
    return errors;
  }

  getPreset(presetName) {
    const presets = {
      default: this.defaultConfig,
      desert: {
        terrain: { heightMultiplier: 30, baseHeight: 10 },
        waterErosion: { enabled: false },
        windErosion: { enabled: true, windStrength: 1.0, abrasionRate: 0.2 }
      },
      riverDelta: {
        terrain: { heightMultiplier: 40, baseHeight: 15 },
        waterErosion: { enabled: true, rainRate: 0.8, erosionStrength: 0.5 },
        windErosion: { enabled: false }
      },
      mountain: {
        terrain: { heightMultiplier: 80, baseHeight: 30, scale: 80 },
        waterErosion: { enabled: true, rainRate: 0.5, erosionStrength: 0.4 },
        windErosion: { enabled: true, windStrength: 0.8 }
      },
      coastal: {
        terrain: { heightMultiplier: 35, baseHeight: 5 },
        waterErosion: { enabled: true, rainRate: 0.6 },
        windErosion: { enabled: true, windStrength: 0.6 }
      }
    };
    
    return presets[presetName] || null;
  }

  applyPreset(presetName) {
    const preset = this.getPreset(presetName);
    if (preset) {
      this.updateConfig(preset);
      return true;
    }
    return false;
  }

  getConfigSchema() {
    return {
      terrain: {
        size: { type: 'number', min: 32, max: 512, step: 32, label: '地形尺寸' },
        scale: { type: 'number', min: 10, max: 200, step: 5, label: '噪声缩放' },
        octaves: { type: 'number', min: 1, max: 10, step: 1, label: '噪声层数' },
        persistence: { type: 'number', min: 0.1, max: 0.9, step: 0.05, label: '持续度' },
        lacunarity: { type: 'number', min: 1.0, max: 4.0, step: 0.1, label: '间隙度' },
        heightMultiplier: { type: 'number', min: 10, max: 200, step: 5, label: '高度倍率' },
        baseHeight: { type: 'number', min: 0, max: 100, step: 5, label: '基础高度' },
        seed: { type: 'number', label: '随机种子' }
      },
      waterErosion: {
        enabled: { type: 'boolean', label: '启用水流侵蚀' },
        rainRate: { type: 'number', min: 0, max: 2, step: 0.1, label: '降雨速率' },
        evaporationRate: { type: 'number', min: 0, max: 0.1, step: 0.01, label: '蒸发速率' },
        erosionStrength: { type: 'number', min: 0, max: 1, step: 0.05, label: '侵蚀强度' },
        depositionRate: { type: 'number', min: 0, max: 1, step: 0.05, label: '沉积速率' },
        sedimentCapacity: { type: 'number', min: 1, max: 10, step: 0.5, label: '泥沙容量' },
        erosionRadius: { type: 'number', min: 1, max: 8, step: 1, label: '侵蚀半径' }
      },
      windErosion: {
        enabled: { type: 'boolean', label: '启用风力侵蚀' },
        windStrength: { type: 'number', min: 0, max: 3, step: 0.1, label: '风力强度' },
        windDirection: { type: 'number', min: 0, max: 360, step: 10, label: '风向角度' },
        abrasionRate: { type: 'number', min: 0, max: 0.5, step: 0.05, label: '磨蚀速率' },
        depositionRate: { type: 'number', min: 0, max: 1, step: 0.05, label: '沉积速率' },
        suspensionRate: { type: 'number', min: 0, max: 0.5, step: 0.05, label: '悬浮速率' },
        particleCount: { type: 'number', min: 100, max: 5000, step: 100, label: '粒子数量' }
      },
      simulation: {
        timeScale: { type: 'number', min: 0.1, max: 5, step: 0.1, label: '时间缩放' },
        tickRate: { type: 'number', min: 30, max: 120, step: 10, label: '模拟帧率' }
      }
    };
  }
}

module.exports = ErosionConfig;
