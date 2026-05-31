import * as THREE from 'three';

export class StressCalculator {
  constructor(scene) {
    this.scene = scene;
    this.stressData = new Map();
    this.visualizationMeshes = [];
    this.labelTextures = new Map();

    this.colorScale = [
      { stress: 0, color: new THREE.Color(0x00ff00) },
      { stress: 25, color: new THREE.Color(0x88ff00) },
      { stress: 50, color: new THREE.Color(0xffff00) },
      { stress: 75, color: new THREE.Color(0xffaa00) },
      { stress: 100, color: new THREE.Color(0xff8800) },
      { stress: 125, color: new THREE.Color(0xff4400) },
      { stress: 150, color: new THREE.Color(0xff0000) },
      { stress: 200, color: new THREE.Color(0x8800ff) }
    ];

    this.stressLimits = {
      bearing: { min: 0, max: 200, warning: 80, danger: 120 },
      guardrail: { min: 0, max: 150, warning: 60, danger: 100 },
      deck: { min: 0, max: 100, warning: 50, danger: 75 }
    };

    this.units = {
      stress: 'MPa',
      load: 'kN',
      area: 'm²'
    };

    this.isVisible = false;
    this.isAnimating = false;
    this.animationFrame = null;
    this.updateInterval = 500;
    this.lastUpdate = 0;
  }

  validateStressValue(value, type = 'bearing') {
    const limits = this.stressLimits[type] || this.stressLimits.bearing;

    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      console.warn(`应力值无效: ${value}, 使用默认值`);
      return limits.min;
    }

    return Math.max(limits.min, Math.min(limits.max, value));
  }

  calculateBearingStress(bearing, load = 1000) {
    if (!bearing || !bearing.userData || !bearing.userData.id) {
      console.warn('支座对象无效，跳过应力计算');
      return null;
    }

    const validatedLoad = Math.max(0, Math.min(5000, load));

    const radius = 0.4;
    const area = Math.PI * radius * radius;

    const position = this.getWorldPosition(bearing);
    const positionFactor = Math.abs(position.z) / 50;
    const sideFactor = Math.abs(position.x) / 5;

    const time = Date.now() / 1000;
    const dynamicFactor = 1 + Math.sin(time * 0.5) * 0.1 + Math.sin(time * 2) * 0.05;

    const baseStress = (validatedLoad / area) / 1000;
    const stress = baseStress * (1 + positionFactor * 0.3) * (1 + sideFactor * 0.2) * dynamicFactor;

    const finalStress = this.validateStressValue(stress, 'bearing');

    this.stressData.set(bearing.userData.id, {
      stress: finalStress,
      rawStress: stress,
      timestamp: Date.now(),
      position: position.clone(),
      load: validatedLoad,
      area: area,
      baseStress: baseStress,
      status: this.getStressStatus(finalStress, 'bearing'),
      type: 'bearing'
    });

    return finalStress;
  }

  calculateGuardrailStress(guardrail, impactForce = 0) {
    if (!guardrail) {
      console.warn('护栏对象无效，跳过应力计算');
      return null;
    }

    const id = guardrail.userData?.id || guardrail.id || `guardrail_${Math.random()}`;
    const validatedImpact = Math.max(0, Math.min(200, impactForce));

    const sectionModulus = 0.001;
    const bendingStress = validatedImpact * 1.2 / sectionModulus / 1000000;
    const windSpeed = 20 + Math.sin(Date.now() / 3000) * 10;
    const windLoad = 0.5 * 1.225 * windSpeed * windSpeed * 0.01;

    const position = this.getWorldPosition(guardrail);
    const heightFactor = Math.max(0, position.y - 5) / 2;

    const totalStress = bendingStress + windLoad + heightFactor * 5;
    const finalStress = this.validateStressValue(totalStress, 'guardrail');

    this.stressData.set(id, {
      stress: finalStress,
      rawStress: totalStress,
      timestamp: Date.now(),
      position: position.clone(),
      impactForce: validatedImpact,
      windLoad: windLoad,
      bendingStress: bendingStress,
      status: this.getStressStatus(finalStress, 'guardrail'),
      type: 'guardrail'
    });

    return finalStress;
  }

  calculateBridgeDeckStress(bridgeModel, vehicleLoads = []) {
    if (!bridgeModel) {
      console.warn('桥梁模型无效，跳过桥面板应力计算');
      return null;
    }

    const deckStressData = [];
    const segments = 20;
    const bridgeLength = 100;
    const segmentLength = bridgeLength / segments;

    const supportPositions = [-45, -30, -15, 0, 15, 30, 45];

    for (let i = 0; i < segments; i++) {
      const zPos = -50 + (i + 0.5) * segmentLength;

      let minDistance = Infinity;
      supportPositions.forEach(supportZ => {
        minDistance = Math.min(minDistance, Math.abs(zPos - supportZ));
      });

      const momentFactor = Math.max(0, 1 - minDistance / 15);
      const baseStress = 20 + momentFactor * 35;

      let vehicleEffect = 0;
      vehicleLoads.forEach(vehicle => {
        const dist = Math.abs(vehicle.z - zPos);
        if (dist < 10) {
          vehicleEffect += (10 - dist) * (vehicle.weight || 20) * 0.15;
        }
      });

      const thermalEffect = Math.sin(Date.now() / 5000) * 3;

      const totalStress = baseStress + vehicleEffect + thermalEffect;
      const finalStress = this.validateStressValue(totalStress, 'deck');

      deckStressData.push({
        segment: i,
        position: new THREE.Vector3(0, 5, zPos),
        stress: finalStress,
        rawStress: totalStress,
        baseStress: baseStress,
        vehicleEffect: vehicleEffect,
        thermalEffect: thermalEffect,
        status: this.getStressStatus(finalStress, 'deck'),
        minDistance: minDistance
      });
    }

    this.stressData.set('deck', deckStressData);
    return deckStressData;
  }

  getWorldPosition(object) {
    const worldPos = new THREE.Vector3();

    if (object.getWorldPosition) {
      object.getWorldPosition(worldPos);
    } else if (object.position) {
      worldPos.copy(object.position);
    }

    return worldPos;
  }

  getStressStatus(stress, type = 'bearing') {
    const limits = this.stressLimits[type] || this.stressLimits.bearing;

    if (stress >= limits.danger) {
      return 'danger';
    } else if (stress >= limits.warning) {
      return 'warning';
    }
    return 'normal';
  }

  getStressColor(stressValue) {
    const validatedStress = this.validateStressValue(stressValue);

    for (let i = 0; i < this.colorScale.length - 1; i++) {
      const lower = this.colorScale[i];
      const upper = this.colorScale[i + 1];

      if (validatedStress >= lower.stress && validatedStress <= upper.stress) {
        const t = (validatedStress - lower.stress) / (upper.stress - lower.stress);
        return lower.color.clone().lerp(upper.color, t);
      }
    }

    return validatedStress > this.colorScale[this.colorScale.length - 1].stress
      ? this.colorScale[this.colorScale.length - 1].color.clone()
      : this.colorScale[0].color.clone();
  }

  createStressLabel(stressValue, position) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.roundRect(ctx, 0, 0, 256, 96, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${stressValue.toFixed(1)}`, 128, 40);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '24px Arial';
    ctx.fillText('MPa', 128, 72);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });

    const label = new THREE.Sprite(material);
    label.position.copy(position);
    label.position.y += 1.8;
    label.scale.set(3, 1.125, 1);
    label.userData.type = 'stress_label';
    label.userData.texture = texture;

    return label;
  }

  updateStressLabel(label, stressValue) {
    if (!label || !label.userData.texture) return;

    const texture = label.userData.texture;
    const canvas = texture.image;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.roundRect(ctx, 0, 0, 256, 96, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${stressValue.toFixed(1)}`, 128, 40);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '24px Arial';
    ctx.fillText('MPa', 128, 72);

    texture.needsUpdate = true;
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  createStressVisualization(models) {
    this.clearVisualization();

    if (!models || !models.bearingList) {
      console.warn('模型数据无效，无法创建应力可视化');
      return;
    }

    models.bearingList.forEach(bearing => {
      if (!bearing || !bearing.userData || !bearing.userData.id) return;

      const stressData = this.stressData.get(bearing.userData.id);
      if (!stressData) return;

      const color = this.getStressColor(stressData.stress);
      const position = stressData.position.clone();

      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        wireframe: false
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(position);
      sphere.userData.type = 'stress_visual';
      sphere.userData.stress = stressData.stress;
      sphere.userData.targetId = bearing.userData.id;
      sphere.userData.baseScale = 1;
      this.scene.add(sphere);
      this.visualizationMeshes.push(sphere);

      const ringGeometry = new THREE.RingGeometry(0.55, 0.75, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(position);
      ring.position.y += 0.01;
      ring.rotation.x = -Math.PI / 2;
      ring.userData.type = 'stress_ring';
      ring.userData.targetId = bearing.userData.id;
      this.scene.add(ring);
      this.visualizationMeshes.push(ring);

      const label = this.createStressLabel(stressData.stress, position);
      label.userData.targetId = bearing.userData.id;
      this.scene.add(label);
      this.visualizationMeshes.push(label);
    });

    const deckData = this.stressData.get('deck');
    if (deckData) {
      deckData.forEach(segment => {
        const color = this.getStressColor(segment.stress);
        const geometry = new THREE.BoxGeometry(10, 0.05, 4.5);
        const material = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const box = new THREE.Mesh(geometry, material);
        box.position.copy(segment.position);
        box.position.y += 0.45;
        box.userData.type = 'deck_stress';
        box.userData.stress = segment.stress;
        box.userData.segment = segment.segment;
        this.scene.add(box);
        this.visualizationMeshes.push(box);
      });
    }

    this.isVisible = true;
    this.isAnimating = true;
  }

  updateStressVisualization(models) {
    if (!this.isVisible) return;

    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;

    this.calculateAllStresses(models);

    this.visualizationMeshes.forEach(mesh => {
      const targetId = mesh.userData.targetId;
      if (!targetId) return;

      const stressData = this.stressData.get(targetId);
      if (!stressData) return;

      if (mesh.userData.type === 'stress_visual') {
        const newColor = this.getStressColor(stressData.stress);
        mesh.material.color.copy(newColor);
        mesh.userData.stress = stressData.stress;

        const pulseScale = 1 + Math.sin(Date.now() / 300) * 0.1;
        const stressScale = 1 + (stressData.stress / 200) * 0.3;
        mesh.scale.setScalar(pulseScale * stressScale);
      }

      if (mesh.userData.type === 'stress_ring') {
        const newColor = this.getStressColor(stressData.stress);
        mesh.material.color.copy(newColor);
        mesh.rotation.z += 0.02;
      }

      if (mesh.userData.type === 'stress_label') {
        this.updateStressLabel(mesh, stressData.stress);
      }
    });

    const deckMeshes = this.visualizationMeshes.filter(m => m.userData.type === 'deck_stress');
    const deckData = this.stressData.get('deck');
    if (deckData && deckMeshes.length === deckData.length) {
      deckMeshes.forEach((mesh, index) => {
        if (deckData[index]) {
          mesh.material.color.copy(this.getStressColor(deckData[index].stress));
          mesh.userData.stress = deckData[index].stress;
        }
      });
    }
  }

  calculateAllStresses(models) {
    if (!models || !models.bearingList) return;

    models.bearingList.forEach(bearing => {
      this.calculateBearingStress(bearing, 1000 + Math.random() * 500);
    });

    if (models.guardrailList) {
      models.guardrailList.forEach((guardrail, index) => {
        if (index % 20 === 0) {
          this.calculateGuardrailStress(guardrail, Math.random() * 30);
        }
      });
    }

    const vehicleLoads = [
      { z: -30 + Math.sin(Date.now() / 1000) * 10, weight: 30 },
      { z: 10 + Math.cos(Date.now() / 1500) * 15, weight: 25 },
      { z: Math.sin(Date.now() / 800) * 40, weight: 35 }
    ];

    this.calculateBridgeDeckStress(models.bridge, vehicleLoads);
  }

  clearVisualization() {
    this.visualizationMeshes.forEach(mesh => {
      this.scene.remove(mesh);

      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
      }
    });

    this.visualizationMeshes = [];
    this.labelTextures.clear();
    this.isVisible = false;
    this.isAnimating = false;
  }

  toggleVisibility(models) {
    if (this.isVisible) {
      this.clearVisualization();
    } else {
      this.calculateAllStresses(models);
      this.createStressVisualization(models);
    }
    return this.isVisible;
  }

  getStressReport() {
    const report = {
      timestamp: Date.now(),
      units: this.units,
      bearings: [],
      deck: null,
      summary: {
        totalCount: 0,
        normalCount: 0,
        warningCount: 0,
        dangerCount: 0,
        maxStress: 0,
        minStress: Infinity,
        averageStress: 0
      }
    };

    let totalStress = 0;
    let count = 0;

    this.stressData.forEach((data, key) => {
      if (key.startsWith('bearing_') && data.type === 'bearing') {
        report.bearings.push({
          id: key,
          stress: data.stress,
          rawStress: data.rawStress,
          position: data.position,
          status: data.status,
          load: data.load
        });

        totalStress += data.stress;
        count++;
        report.summary.maxStress = Math.max(report.summary.maxStress, data.stress);
        report.summary.minStress = Math.min(report.summary.minStress, data.stress);

        if (data.status === 'normal') report.summary.normalCount++;
        else if (data.status === 'warning') report.summary.warningCount++;
        else if (data.status === 'danger') report.summary.dangerCount++;
      } else if (key === 'deck') {
        report.deck = data;
        data.forEach(seg => {
          totalStress += seg.stress;
          count++;
          report.summary.maxStress = Math.max(report.summary.maxStress, seg.stress);
          report.summary.minStress = Math.min(report.summary.minStress, seg.stress);
        });
      }
    });

    report.summary.totalCount = count;
    report.summary.averageStress = count > 0 ? totalStress / count : 0;
    if (report.summary.minStress === Infinity) report.summary.minStress = 0;

    return report;
  }

  createLegend() {
    const legendGroup = new THREE.Group();

    this.colorScale.forEach((item, index) => {
      const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.15);
      const material = new THREE.MeshBasicMaterial({ color: item.color });
      const box = new THREE.Mesh(geometry, material);
      box.position.set(8, 5 - index * 0.7, 45);

      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.stress} MPa`, 0, 24);

      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
      });
      const label = new THREE.Sprite(labelMaterial);
      label.position.set(9.5, 5 - index * 0.7, 45);
      label.scale.set(3, 0.72, 1);

      legendGroup.add(box);
      legendGroup.add(label);
    });

    legendGroup.userData.type = 'stress_legend';
    this.scene.add(legendGroup);
    return legendGroup;
  }

  setUpdateInterval(ms) {
    this.updateInterval = Math.max(100, ms);
  }

  getStressData(id) {
    return this.stressData.get(id) || null;
  }

  getAllStressData() {
    return Object.fromEntries(this.stressData);
  }

  dispose() {
    this.clearVisualization();
    this.stressData.clear();
  }
}
