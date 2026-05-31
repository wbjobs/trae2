class WeatherEffects {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.rain = null;
    this.snow = null;
    this.fog = null;
    
    this.init();
  }

  init() {
    this.createRain();
    
    this.scene.fog = new THREE.Fog(0x0a1628, 20, 60);
  }

  createRain() {
    const particleCount = this.config.particleCount || 500;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(particleCount * 3);
    const rainVelocities = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 60;
      rainPositions[i * 3 + 1] = Math.random() * 30;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      rainVelocities[i] = 0.3 + Math.random() * 0.3;
    }

    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    
    const rainMaterial = new THREE.PointsMaterial({
      color: 0xaaaaee,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true
    });

    this.rain = new THREE.Points(rainGeometry, rainMaterial);
    this.rain.visible = false;
    this.rain.userData.velocities = rainVelocities;
    this.scene.add(this.rain);
  }

  updateEnvironment(environment, delta) {
    this.updateRain(environment, delta);
    this.updateFog(environment);
    this.updateLighting(environment);
  }

  updateRain(environment, delta) {
    if (!this.rain) return;

    const shouldBeVisible = environment.rainIntensity > 10;
    
    if (shouldBeVisible !== this.rain.visible) {
      this.rain.visible = shouldBeVisible;
    }

    if (this.rain.visible) {
      this.rain.material.opacity = Math.min(0.8, environment.rainIntensity / 100);
      
      const positions = this.rain.geometry.attributes.position.array;
      const velocities = this.rain.userData.velocities;
      const speedMultiplier = 1 + environment.windSpeed * 0.05;
      
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] -= velocities[i] * delta * 60 * speedMultiplier;
        positions[i * 3] += environment.windSpeed * delta * 0.1;
        
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 30;
          positions[i * 3] = (Math.random() - 0.5) * 60;
        }
        
        if (positions[i * 3] > 30) positions[i * 3] = -30;
        if (positions[i * 3] < -30) positions[i * 3] = 30;
      }
      
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateFog(environment) {
    if (!this.scene.fog) return;

    let fogColor = 0x0a1628;
    let fogNear = 20;
    let fogFar = 60;

    if (environment.timeOfDay === 'night') {
      fogColor = 0x050a14;
      fogNear = 15;
      fogFar = 50;
    } else if (environment.timeOfDay === 'twilight') {
      fogColor = 0x0a1020;
    }

    if (environment.isStorm) {
      fogColor = 0x0a0a14;
      fogNear = 10;
      fogFar = 35;
    }

    if (environment.humidity > 85) {
      fogNear = Math.max(5, fogNear - 5);
      fogFar = Math.max(15, fogFar - 10);
    }

    if (this.config.fogEnabled) {
      this.scene.fog.color.setHex(fogColor);
      this.scene.fog.near = fogNear;
      this.scene.fog.far = fogFar;
    } else {
      this.scene.fog.far = 1000;
    }
  }

  updateLighting(environment) {
    if (!this.scene.userData.sunLight) return;

    const sunLight = this.scene.userData.sunLight;
    
    if (environment.timeOfDay === 'night') {
      sunLight.intensity = 0.2;
      sunLight.color.setHex(0xaaaaff);
    } else if (environment.timeOfDay === 'twilight') {
      sunLight.intensity = 0.5;
      sunLight.color.setHex(0xffccaa);
    } else {
      sunLight.intensity = 0.8;
      sunLight.color.setHex(0xffffff);
    }

    if (environment.isStorm) {
      sunLight.intensity *= 0.5;
    }
  }

  updateQuality(newConfig) {
    this.config = newConfig;
    
    if (this.rain) {
      this.rain.material.size = Math.max(0.05, 0.1 * (newConfig.particleCount / 500));
    }
  }

  dispose() {
    if (this.rain) {
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.scene.remove(this.rain);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherEffects;
}
