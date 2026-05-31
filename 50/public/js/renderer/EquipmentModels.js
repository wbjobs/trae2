class EquipmentModelFactory {
  constructor(scene) {
    this.scene = scene;
    this.materials = {};
    this.cachedGeometries = {};
    this.initMaterials();
    this.initGeometries();
  }

  initMaterials() {
    this.materials = {
      metal: new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.7,
        metalness: 0.8
      }),
      plastic: new THREE.MeshStandardMaterial({
        color: 0x4488cc,
        roughness: 0.5,
        metalness: 0.1
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x1a3a5c,
        roughness: 0.1,
        metalness: 0.9
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
        metalness: 0
      }),
      solar: new THREE.MeshStandardMaterial({
        color: 0x1a3a5c,
        roughness: 0.2,
        metalness: 0.8
      }),
      led: new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5
      })
    };
  }

  initGeometries() {
    this.cachedGeometries = {
      cylinder: new THREE.CylinderGeometry(0.1, 0.15, 1, 8),
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(0.5, 8, 8),
      cone: new THREE.ConeGeometry(0.5, 1, 8),
      plane: new THREE.PlaneGeometry(1, 1),
      circle: new THREE.CircleGeometry(1, 32)
    };
  }

  createModel(type, position, id) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);
    group.userData = { equipmentId: id, equipmentType: type };

    switch (type) {
      case 'weather_station':
        this.createWeatherStation(group);
        break;
      case 'solar_panel':
        this.createSolarPanel(group);
        break;
      case 'data_logger':
        this.createDataLogger(group);
        break;
      case 'antenna':
        this.createAntenna(group);
        break;
      case 'sensor_array':
        this.createSensorArray(group);
        break;
      default:
        this.createDefaultModel(group);
    }

    this.scene.add(group);
    return group;
  }

  createWeatherStation(group) {
    const pole = this.createOptimizedMesh('cylinder', 'metal');
    pole.scale.set(1, 3, 1);
    pole.position.y = 1.5;
    pole.castShadow = true;
    group.add(pole);

    const body = this.createOptimizedMesh('box', 'plastic');
    body.scale.set(1, 0.6, 0.8);
    body.position.y = 3.2;
    body.castShadow = true;
    group.add(body);

    const anemometerBase = new THREE.Group();
    anemometerBase.position.y = 3.8;
    anemometerBase.userData.animated = true;
    group.add(anemometerBase);

    for (let i = 0; i < 3; i++) {
      const cup = this.createOptimizedMesh('sphere', 'plastic');
      cup.material = this.materials.plastic.clone();
      cup.material.color.setHex(0xcc4444);
      cup.scale.setScalar(0.15);
      const angle = (i / 3) * Math.PI * 2;
      cup.position.set(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4);
      cup.castShadow = true;
      anemometerBase.add(cup);
    }

    const windVane = this.createOptimizedMesh('cone', 'plastic');
    windVane.material = this.materials.plastic.clone();
    windVane.material.color.setHex(0x44cc44);
    windVane.scale.setScalar(0.3);
    windVane.position.set(0, 0, 0.4);
    windVane.rotation.x = Math.PI / 2;
    windVane.castShadow = true;
    group.add(windVane);
  }

  createSolarPanel(group) {
    const stand = this.createOptimizedMesh('box', 'metal');
    stand.scale.set(0.3, 2, 0.3);
    stand.position.y = 1;
    stand.castShadow = true;
    group.add(stand);

    const panel = this.createOptimizedMesh('box', 'solar');
    panel.scale.set(3, 0.1, 2);
    panel.position.y = 2.2;
    panel.rotation.x = -Math.PI / 6;
    panel.castShadow = true;
    group.add(panel);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(panel.geometry),
      new THREE.LineBasicMaterial({ color: 0x888888 })
    );
    frame.position.copy(panel.position);
    frame.rotation.copy(panel.rotation);
    frame.scale.copy(panel.scale);
    group.add(frame);
  }

  createDataLogger(group) {
    const box = this.createOptimizedMesh('box', 'plastic');
    box.scale.set(1.2, 0.8, 0.6);
    box.position.y = 0.4;
    box.castShadow = true;
    group.add(box);

    const screen = this.createOptimizedMesh('box', 'led');
    screen.material = this.materials.led.clone();
    screen.material.color.setHex(0x00ff88);
    screen.material.emissive.setHex(0x00ff88);
    screen.scale.set(0.6, 0.3, 0.02);
    screen.position.set(0, 0.4, 0.31);
    group.add(screen);

    const led = this.createOptimizedMesh('sphere', 'led');
    led.scale.setScalar(0.05);
    led.position.set(0.4, 0.55, 0.31);
    group.add(led);
  }

  createAntenna(group) {
    const pole = this.createOptimizedMesh('cylinder', 'metal');
    pole.scale.set(0.8, 5, 0.8);
    pole.position.y = 2.5;
    pole.castShadow = true;
    group.add(pole);

    const dish = new THREE.Mesh(
      this.cachedGeometries.circle.clone(),
      this.materials.metal.clone()
    );
    dish.material.side = THREE.DoubleSide;
    dish.scale.setScalar(1.2);
    dish.position.y = 5;
    dish.rotation.x = -Math.PI / 3;
    group.add(dish);

    const feed = this.createOptimizedMesh('sphere', 'metal');
    feed.scale.setScalar(0.1);
    feed.position.set(0, 5.8, 0.5);
    group.add(feed);
  }

  createSensorArray(group) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 0.3, 16),
      this.materials.metal
    );
    base.position.y = 0.15;
    base.castShadow = true;
    group.add(base);

    const sensorColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const sensor = this.createOptimizedMesh('cylinder', 'plastic');
      sensor.material = this.materials.plastic.clone();
      sensor.material.color.setHex(sensorColors[i]);
      sensor.scale.set(0.8, 0.6, 0.8);
      sensor.position.set(Math.cos(angle) * 0.25, 0.6, Math.sin(angle) * 0.25);
      sensor.castShadow = true;
      group.add(sensor);
    }

    const center = this.createOptimizedMesh('sphere', 'led');
    center.scale.setScalar(0.15);
    center.position.y = 0.9;
    group.add(center);
  }

  createDefaultModel(group) {
    const defaultBox = this.createOptimizedMesh('box', 'plastic');
    defaultBox.scale.set(1, 1, 1);
    defaultBox.position.y = 0.5;
    defaultBox.castShadow = true;
    group.add(defaultBox);
  }

  createOptimizedMesh(geometryType, materialType) {
    const geometry = this.cachedGeometries[geometryType] || this.cachedGeometries.box;
    const material = this.materials[materialType] || this.materials.plastic;
    
    return new THREE.Mesh(geometry, material);
  }

  setEmissive(mesh, color, intensity) {
    if (mesh.material) {
      mesh.material.emissive = new THREE.Color(color);
      mesh.material.emissiveIntensity = intensity;
    }
  }

  updateModelStatus(model, status, config) {
    if (!model) return;

    let emissiveColor = 0x000000;
    let emissiveIntensity = 0;

    switch (status) {
      case 'critical':
        emissiveColor = 0xff0000;
        emissiveIntensity = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
        break;
      case 'danger':
        emissiveColor = 0xff4400;
        emissiveIntensity = 0.2;
        break;
      case 'warning':
        emissiveColor = 0xffaa00;
        emissiveIntensity = 0.15;
        break;
      default:
        emissiveIntensity = 0;
    }

    model.traverse(child => {
      if (child.isMesh && child.material && child.material.emissive !== undefined) {
        if (!child.userData.isLED) {
          child.material.emissive.setHex(emissiveColor);
          child.material.emissiveIntensity = emissiveIntensity;
        }
      }
    });
  }

  dispose() {
    Object.values(this.materials).forEach(material => {
      material.dispose();
    });
    
    Object.values(this.cachedGeometries).forEach(geometry => {
      geometry.dispose();
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EquipmentModelFactory;
}
