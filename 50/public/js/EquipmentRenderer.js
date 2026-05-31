class EquipmentRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.equipmentModels = new Map();
    
    this.initQuality();
    this.initComponents();
    this.startAnimation();
  }

  initQuality() {
    if (RenderConfig.autoDetect) {
      const detectedQuality = RenderConfig.detectPerformance();
      RenderConfig.setQuality(detectedQuality);
      console.log(`自动检测渲染质量: ${detectedQuality}`);
    }
    
    this.qualityConfig = RenderConfig.getCurrentConfig();
  }

  initComponents() {
    this.sceneController = new SceneController(this.canvas, this.qualityConfig);
    this.modelFactory = new EquipmentModelFactory(this.sceneController.scene);
    this.weatherEffects = new WeatherEffects(this.sceneController.scene, this.qualityConfig);
  }

  createEquipment(equipmentList) {
    equipmentList.forEach(eq => {
      const model = this.modelFactory.createModel(eq.type, eq.position, eq.id);
      this.equipmentModels.set(eq.id, model);
    });
  }

  updateEquipmentStatus(equipmentList) {
    equipmentList.forEach(eq => {
      const model = this.equipmentModels.get(eq.id);
      if (model) {
        this.modelFactory.updateModelStatus(model, eq.status, this.qualityConfig);
      }
    });
  }

  updateEnvironment(environment) {
    this.weatherEffects.updateEnvironment(environment, this.lastDelta || 0.016);
    
    const bgColor = this.getBackgroundColor(environment);
    this.sceneController.scene.background.setHex(bgColor);
  }

  getBackgroundColor(environment) {
    if (environment.timeOfDay === 'night') {
      return environment.isStorm ? 0x050510 : 0x050a14;
    } else if (environment.timeOfDay === 'twilight') {
      return environment.isStorm ? 0x0a0a18 : 0x0a1020;
    }
    return environment.isStorm ? 0x0a0a14 : 0x0a1628;
  }

  startAnimation() {
    this.sceneController.startAnimationLoop((delta) => {
      this.lastDelta = delta;
      this.updateAnimations(delta);
    });
  }

  updateAnimations(delta) {
    this.equipmentModels.forEach(model => {
      model.traverse(child => {
        if (child.userData && child.userData.animated) {
          child.rotation.y += delta * 2;
        }
      });
    });
  }

  setQualityLevel(level) {
    const config = RenderConfig.setQuality(level);
    this.qualityConfig = config;
    
    this.sceneController.updateQuality(config);
    this.weatherEffects.updateQuality(config);
    
    console.log(`渲染质量已设置为: ${level}`);
  }

  getQualityLevels() {
    return Object.keys(RenderConfig.qualityPresets);
  }

  getCurrentQuality() {
    return RenderConfig.currentQuality;
  }

  dispose() {
    this.sceneController.dispose();
    this.modelFactory.dispose();
    this.weatherEffects.dispose();
  }
}
