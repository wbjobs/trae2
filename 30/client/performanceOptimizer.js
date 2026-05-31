class PerformanceOptimizer {
  constructor(config) {
    this.config = config;
    this.qualityLevel = 'medium';
    this.fpsHistory = [];
    this.lastFpsUpdate = 0;
    this.frameCount = 0;
    this.lastFpsCheck = Date.now();
    this.settings = {
      low: {
        shadowMapEnabled: false,
        shadowMapType: THREE.BasicShadowMap,
        antialias: false,
        pixelRatio: 1,
        fogDensity: 0.0015,
        maxLodLevel: 0,
        particlesEnabled: false,
        postProcessingEnabled: false
      },
      medium: {
        shadowMapEnabled: true,
        shadowMapType: THREE.PCFShadowMap,
        antialias: true,
        pixelRatio: 1.5,
        fogDensity: 0.002,
        maxLodLevel: 1,
        particlesEnabled: true,
        postProcessingEnabled: false
      },
      high: {
        shadowMapEnabled: true,
        shadowMapType: THREE.PCFSoftShadowMap,
        antialias: true,
        pixelRatio: 2,
        fogDensity: 0.0025,
        maxLodLevel: 2,
        particlesEnabled: true,
        postProcessingEnabled: true
      }
    };
  }

  init() {
    this.detectDeviceCapability();
    this.applySettings();
  }

  detectDeviceCapability() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;

    if (isMobile || memory <= 2 || cores <= 2) {
      this.qualityLevel = 'low';
    } else if (memory >= 8 && cores >= 8) {
      this.qualityLevel = 'high';
    } else {
      this.qualityLevel = 'medium';
    }
  }

  applySettings() {
    const settings = this.settings[this.qualityLevel];
    
    if (this.renderer) {
      this.renderer.shadowMap.enabled = settings.shadowMapEnabled;
      this.renderer.shadowMap.type = settings.shadowMapType;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    }

    return settings;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  updateFps() {
    this.frameCount++;
    const now = Date.now();
    
    if (now - this.lastFpsCheck >= 1000) {
      this.lastFpsUpdate = this.frameCount * 1000 / (now - this.lastFpsCheck);
      this.fpsHistory.push(this.lastFpsUpdate);
      
      if (this.fpsHistory.length > 10) {
        this.fpsHistory.shift();
      }
      
      this.frameCount = 0;
      this.lastFpsCheck = now;
      
      this.adjustQuality();
    }
  }

  adjustQuality() {
    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    
    if (this.fpsHistory.length < 5) return;

    if (avgFps < 30 && this.qualityLevel !== 'low') {
      this.qualityLevel = this.qualityLevel === 'high' ? 'medium' : 'low';
      this.applySettings();
    } else if (avgFps > 55 && this.qualityLevel !== 'high') {
      this.qualityLevel = this.qualityLevel === 'low' ? 'medium' : 'high';
      this.applySettings();
    }
  }

  getQuality() {
    return this.qualityLevel;
  }

  getSettings() {
    return this.settings[this.qualityLevel];
  }

  setQuality(level) {
    if (this.settings[level]) {
      this.qualityLevel = level;
      this.applySettings();
    }
  }

  shouldRenderObject(objectPosition, cameraPosition, distanceThreshold) {
    const distance = objectPosition.distanceTo(cameraPosition);
    return distance < distanceThreshold;
  }

  getLodLevel(distance, maxDistance) {
    const settings = this.settings[this.qualityLevel];
    const normalizedDist = Math.min(distance / maxDistance, 1);
    return Math.floor((1 - normalizedDist) * settings.maxLodLevel);
  }

  static isVisible(camera, object, frustum) {
    object.updateMatrixWorld();
    const sphere = new THREE.Sphere();
    object.geometry.boundingSphere.clone(sphere);
    sphere.applyMatrix4(object.matrixWorld);
    return frustum.intersectsSphere(sphere);
  }
}
