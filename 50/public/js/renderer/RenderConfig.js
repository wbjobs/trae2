const RenderConfig = {
  qualityPresets: {
    low: {
      shadowQuality: 0,
      shadowResolution: 512,
      particleCount: 200,
      antialias: false,
      pixelRatio: 0.75,
      fogEnabled: true,
      postProcessing: false,
      animationQuality: 0.5
    },
    medium: {
      shadowQuality: 1,
      shadowResolution: 1024,
      particleCount: 500,
      antialias: true,
      pixelRatio: 1,
      fogEnabled: true,
      postProcessing: false,
      animationQuality: 1
    },
    high: {
      shadowQuality: 2,
      shadowResolution: 2048,
      particleCount: 1000,
      antialias: true,
      pixelRatio: 1.5,
      fogEnabled: true,
      postProcessing: true,
      animationQuality: 1
    },
    ultra: {
      shadowQuality: 3,
      shadowResolution: 4096,
      particleCount: 2000,
      antialias: true,
      pixelRatio: 2,
      fogEnabled: true,
      postProcessing: true,
      animationQuality: 1.5
    }
  },

  currentQuality: 'medium',
  autoDetect: true,

  detectPerformance() {
    let score = 0;
    
    if (window.devicePixelRatio >= 2) {
      score += 2;
    } else if (window.devicePixelRatio >= 1.5) {
      score += 1;
    }

    const cores = navigator.hardwareConcurrency || 4;
    if (cores >= 8) {
      score += 2;
    } else if (cores >= 4) {
      score += 1;
    }

    const memory = navigator.deviceMemory || 4;
    if (memory >= 8) {
      score += 2;
    } else if (memory >= 4) {
      score += 1;
    }

    if (score >= 5) return 'ultra';
    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  },

  setQuality(preset) {
    if (this.qualityPresets[preset]) {
      this.currentQuality = preset;
      return this.qualityPresets[preset];
    }
    return this.qualityPresets.medium;
  },

  getCurrentConfig() {
    return this.qualityPresets[this.currentQuality];
  },

  applyConfigToRenderer(renderer, config) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * config.pixelRatio, config.pixelRatio * 2));
    
    if (config.shadowQuality > 0) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = config.shadowQuality >= 2 
        ? THREE.PCFSoftShadowMap 
        : THREE.PCFShadowMap;
    } else {
      renderer.shadowMap.enabled = false;
    }
  },

  getShadowResolution(config) {
    return config.shadowResolution;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderConfig;
}
