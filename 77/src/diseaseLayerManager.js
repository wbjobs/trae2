import * as THREE from 'three';

export class DiseaseLayerManager {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.diseaseMarkers = [];
    this.diseaseData = [];

    this.coordinateOffset = new THREE.Vector3(0, 0, 0);
    this.coordinateScale = 1.0;
    this.isCalibrated = false;

    this.layers = {
      crack: { visible: true, color: 0xff0000, name: '裂缝' },
      deformation: { visible: true, color: 0xff8800, name: '变形' },
      spalling: { visible: true, color: 0xffff00, name: '剥落' },
      corrosion: { visible: true, color: 0x888888, name: '锈蚀' },
      missing: { visible: true, color: 0xff00ff, name: '缺失' }
    };

    this.severityFilters = {
      minor: true,
      moderate: true,
      severe: true
    };

    this.statusFilters = {
      pending: true,
      repairing: true,
      repaired: true
    };

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 500;
    this.mouse = new THREE.Vector2();
    this.hoveredMarker = null;
    this.selectedMarker = null;
    this.showLabels = true;

    this.onMarkerClick = null;
    this.onMarkerHover = null;
    this.onMarkerCreated = null;

    this.animationEnabled = true;
    this.useWorldCoordinates = true;
  }

  setCalibration(offset = null, scale = 1.0) {
    if (offset) {
      this.coordinateOffset.copy(offset);
    }
    this.coordinateScale = scale;
    this.isCalibrated = true;
    console.log('坐标校准已设置:', { offset: this.coordinateOffset, scale });
  }

  calibrateWithReference(referencePoint, worldPosition) {
    const ref = this.parsePosition(referencePoint);
    const world = this.parsePosition(worldPosition);

    this.coordinateOffset.subVectors(world, ref);
    this.isCalibrated = true;

    console.log('坐标校准完成:', {
      reference: ref,
      world: world,
      offset: this.coordinateOffset
    });

    this.updateAllMarkerPositions();
  }

  parsePosition(pos) {
    if (pos instanceof THREE.Vector3) {
      return pos.clone();
    }
    if (Array.isArray(pos) && pos.length >= 3) {
      return new THREE.Vector3(pos[0], pos[1], pos[2]);
    }
    if (typeof pos === 'object' && 'x' in pos) {
      return new THREE.Vector3(pos.x, pos.y || 0, pos.z || 0);
    }
    return new THREE.Vector3();
  }

  transformPosition(diseasePosition) {
    const pos = this.parsePosition(diseasePosition);

    pos.multiplyScalar(this.coordinateScale);
    pos.add(this.coordinateOffset);

    if (!this.validatePosition(pos)) {
      console.warn('病害位置超出合理范围，已修正:', pos);
      pos.x = THREE.MathUtils.clamp(pos.x, -20, 20);
      pos.y = THREE.MathUtils.clamp(pos.y, 0, 30);
      pos.z = THREE.MathUtils.clamp(pos.z, -60, 60);
    }

    return pos;
  }

  validatePosition(pos) {
    return (
      pos.x >= -100 && pos.x <= 100 &&
      pos.y >= -10 && pos.y <= 100 &&
      pos.z >= -200 && pos.z <= 200
    );
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

  getDiseaseColor(disease) {
    const severityColors = {
      minor: 0x66bb6a,
      moderate: 0xffa726,
      severe: 0xef5350
    };

    return severityColors[disease.severity] || this.layers[disease.type]?.color || 0xffffff;
  }

  getDiseaseIcon(disease) {
    const icons = {
      crack: '⚠',
      deformation: '↯',
      spalling: '◉',
      corrosion: '☢',
      missing: '✕'
    };
    return icons[disease.type] || '●';
  }

  createDiseaseMarker(disease) {
    const color = this.getDiseaseColor(disease);
    const icon = this.getDiseaseIcon(disease);

    const group = new THREE.Group();

    const size = disease.severity === 'severe' ? 0.8 :
                 disease.severity === 'moderate' ? 0.6 : 0.4;

    const coneGeometry = new THREE.ConeGeometry(size, size * 1.5, 6);
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.y = size * 0.75;
    cone.userData.isClickable = true;
    group.add(cone);

    const ringGeometry = new THREE.RingGeometry(size * 0.8, size * 1.1, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.userData.isClickable = true;
    group.add(ring);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, size * 2.5, 0)
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 128;
    iconCanvas.height = 128;
    const iconCtx = iconCanvas.getContext('2d');

    const statusColors = {
      pending: '#ef5350',
      repairing: '#ffa726',
      repaired: '#66bb6a'
    };

    const gradient = iconCtx.createRadialGradient(64, 64, 0, 64, 64, 55);
    gradient.addColorStop(0, statusColors[disease.status] || '#888888');
    gradient.addColorStop(1, this.hexToRgba(this.getDiseaseColor(disease), 0.8));
    iconCtx.fillStyle = gradient;
    iconCtx.beginPath();
    iconCtx.arc(64, 64, 55, 0, Math.PI * 2);
    iconCtx.fill();

    iconCtx.strokeStyle = '#ffffff';
    iconCtx.lineWidth = 3;
    iconCtx.stroke();

    iconCtx.fillStyle = '#ffffff';
    iconCtx.font = 'bold 52px Arial';
    iconCtx.textAlign = 'center';
    iconCtx.textBaseline = 'middle';
    iconCtx.shadowColor = 'rgba(0,0,0,0.5)';
    iconCtx.shadowBlur = 4;
    iconCtx.fillText(icon, 64, 64);
    iconCtx.shadowBlur = 0;

    const iconTexture = new THREE.CanvasTexture(iconCanvas);
    iconTexture.anisotropy = 16;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: iconTexture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.y = size * 2.5;
    sprite.scale.set(2.5, 2.5, 1);
    sprite.userData.isClickable = true;
    group.add(sprite);

    if (this.showLabels) {
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 350;
      labelCanvas.height = 100;
      const labelCtx = labelCanvas.getContext('2d');

      labelCtx.fillStyle = 'rgba(15, 15, 30, 0.9)';
      this.roundRect(labelCtx, 0, 0, 350, 100, 10);
      labelCtx.fill();

      labelCtx.strokeStyle = 'rgba(255,255,255,0.1)';
      labelCtx.lineWidth = 1;
      labelCtx.stroke();

      labelCtx.fillStyle = '#ffffff';
      labelCtx.font = 'bold 18px Microsoft YaHei, Arial';
      labelCtx.textAlign = 'left';
      labelCtx.fillText(`${this.layers[disease.type]?.name || disease.type}`, 15, 32);

      const severityText = { minor: '轻微', moderate: '中等', severe: '严重' };
      labelCtx.fillStyle = statusColors[disease.status];
      labelCtx.font = 'bold 15px Microsoft YaHei, Arial';
      labelCtx.fillText(`${severityText[disease.severity] || disease.severity}`, 15, 58);

      const statusText = { pending: '待处理', repairing: '维修中', repaired: '已修复' };
      labelCtx.fillStyle = '#999999';
      labelCtx.font = '13px Microsoft YaHei, Arial';
      labelCtx.fillText(statusText[disease.status] || disease.status, 15, 82);

      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.anisotropy = 16;
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false
      });
      const label = new THREE.Sprite(labelMaterial);
      label.position.y = size * 2.5 + 2.2;
      label.scale.set(5, 1.43, 1);
      label.userData.isLabel = true;
      label.userData.isClickable = true;
      group.add(label);
    }

    const worldPos = this.transformPosition(disease.position);
    group.position.copy(worldPos);

    group.userData = {
      type: 'disease_marker',
      disease: { ...disease },
      diseaseId: disease.id,
      diseaseType: disease.type,
      severity: disease.severity,
      status: disease.status,
      originalPosition: this.parsePosition(disease.position),
      transformedPosition: worldPos.clone(),
      baseY: worldPos.y,
      size: size,
      isClickable: true
    };

    if (this.onMarkerCreated) {
      this.onMarkerCreated(disease, group);
    }

    return group;
  }

  hexToRgba(hex, alpha = 1) {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  async loadDiseases(api, bridgeId) {
    const response = await api.getDiseases({ bridgeId });
    if (response.success) {
      this.diseaseData = response.data;
      this.createAllMarkers();
    }
    return response;
  }

  createAllMarkers() {
    this.clearMarkers();

    this.diseaseData.forEach(disease => {
      try {
        const marker = this.createDiseaseMarker(disease);
        this.diseaseMarkers.push(marker);
        this.scene.add(marker);
      } catch (error) {
        console.error('创建病害标记失败:', disease.id, error);
      }
    });

    this.applyFilters();
    console.log(`已创建 ${this.diseaseMarkers.length} 个病害标记`);
  }

  updateAllMarkerPositions() {
    this.diseaseMarkers.forEach(marker => {
      const newPos = this.transformPosition(marker.userData.originalPosition);
      marker.position.copy(newPos);
      marker.userData.transformedPosition = newPos.clone();
      marker.userData.baseY = newPos.y;
    });
  }

  clearMarkers() {
    this.diseaseMarkers.forEach(marker => {
      this.disposeMarker(marker);
      this.scene.remove(marker);
    });
    this.diseaseMarkers = [];
    this.hoveredMarker = null;
    this.selectedMarker = null;
  }

  disposeMarker(marker) {
    marker.traverse(child => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }

  addDisease(disease) {
    this.diseaseData.push(disease);
    try {
      const marker = this.createDiseaseMarker(disease);
      this.diseaseMarkers.push(marker);
      this.scene.add(marker);
      this.applyFilters();
      return marker;
    } catch (error) {
      console.error('添加病害标记失败:', error);
      return null;
    }
  }

  removeDisease(diseaseId) {
    const dataIndex = this.diseaseData.findIndex(d => d.id === diseaseId);
    if (dataIndex !== -1) {
      this.diseaseData.splice(dataIndex, 1);
    }

    const markerIndex = this.diseaseMarkers.findIndex(m => m.userData.diseaseId === diseaseId);
    if (markerIndex !== -1) {
      const marker = this.diseaseMarkers[markerIndex];
      this.disposeMarker(marker);
      this.scene.remove(marker);
      this.diseaseMarkers.splice(markerIndex, 1);
    }
  }

  updateDisease(diseaseId, updates) {
    const disease = this.diseaseData.find(d => d.id === diseaseId);
    if (disease) {
      Object.assign(disease, updates);

      const markerIndex = this.diseaseMarkers.findIndex(m => m.userData.diseaseId === diseaseId);
      if (markerIndex !== -1) {
        const oldMarker = this.diseaseMarkers[markerIndex];
        this.disposeMarker(oldMarker);
        this.scene.remove(oldMarker);

        try {
          const newMarker = this.createDiseaseMarker(disease);
          this.diseaseMarkers[markerIndex] = newMarker;
          this.scene.add(newMarker);
          this.applyFilters();
        } catch (error) {
          console.error('更新病害标记失败:', error);
        }
      }
    }
  }

  applyFilters() {
    this.diseaseMarkers.forEach(marker => {
      const { diseaseType, severity, status } = marker.userData;

      const typeVisible = this.layers[diseaseType]?.visible ?? true;
      const severityVisible = this.severityFilters[severity] ?? true;
      const statusVisible = this.statusFilters[status] ?? true;

      marker.visible = typeVisible && severityVisible && statusVisible;

      if (marker.visible) {
        marker.children.forEach(child => {
          if (child.userData?.isLabel) {
            child.visible = this.showLabels;
          }
        });
      }
    });
  }

  toggleLayer(type, visible) {
    if (this.layers[type]) {
      this.layers[type].visible = visible;
      this.applyFilters();
    }
  }

  toggleSeverity(severity, visible) {
    if (this.severityFilters.hasOwnProperty(severity)) {
      this.severityFilters[severity] = visible;
      this.applyFilters();
    }
  }

  toggleStatus(status, visible) {
    if (this.statusFilters.hasOwnProperty(status)) {
      this.statusFilters[status] = visible;
      this.applyFilters();
    }
  }

  toggleLabels(visible) {
    this.showLabels = visible;
    this.applyFilters();
  }

  setLayerColor(type, color) {
    if (this.layers[type]) {
      this.layers[type].color = color;
    }
  }

  getDiseaseById(diseaseId) {
    return this.diseaseData.find(d => d.id === diseaseId);
  }

  getMarkerById(diseaseId) {
    return this.diseaseMarkers.find(m => m.userData.diseaseId === diseaseId);
  }

  findMarkerFromObject(object) {
    let current = object;
    while (current && current.parent) {
      if (current.userData?.diseaseId) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  handleMouseMove(event) {
    if (!this.renderer || !this.renderer.domElement) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const visibleMarkers = this.diseaseMarkers.filter(m => m.visible);
    const clickableObjects = [];

    visibleMarkers.forEach(marker => {
      marker.traverse(child => {
        if (child.userData?.isClickable) {
          clickableObjects.push(child);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(clickableObjects, false);

    if (this.hoveredMarker && this.hoveredMarker !== this.selectedMarker) {
      this.resetMarkerScale(this.hoveredMarker);
    }

    if (intersects.length > 0) {
      const marker = this.findMarkerFromObject(intersects[0].object);

      if (marker && marker !== this.selectedMarker && marker !== this.hoveredMarker) {
        this.hoveredMarker = marker;
        this.highlightMarker(marker);
        this.renderer.domElement.style.cursor = 'pointer';

        if (this.onMarkerHover) {
          this.onMarkerHover(marker.userData.disease, marker);
        }
      }
    } else {
      this.hoveredMarker = null;
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  handleClick(event) {
    if (!this.renderer || !this.renderer.domElement) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const visibleMarkers = this.diseaseMarkers.filter(m => m.visible);
    const clickableObjects = [];

    visibleMarkers.forEach(marker => {
      marker.traverse(child => {
        if (child.userData?.isClickable) {
          clickableObjects.push(child);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(clickableObjects, false);

    if (this.selectedMarker) {
      this.resetMarkerScale(this.selectedMarker);
      this.selectedMarker = null;
    }

    if (intersects.length > 0) {
      const marker = this.findMarkerFromObject(intersects[0].object);

      if (marker && marker.userData.diseaseId) {
        this.selectedMarker = marker;
        this.selectMarker(marker);

        if (this.onMarkerClick) {
          this.onMarkerClick(marker.userData.disease, marker);
        }
      }
    }
  }

  highlightMarker(marker) {
    if (!marker) return;

    const targetScale = 1.15;
    const currentScale = marker.scale.x;

    if (Math.abs(currentScale - targetScale) > 0.01) {
      marker.scale.setScalar(targetScale);
    }
  }

  selectMarker(marker) {
    if (!marker) return;

    marker.scale.setScalar(1.3);

    const pulseGeometry = new THREE.RingGeometry(0.6, 0.9, 48);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.03;
    pulse.userData.isPulse = true;
    pulse.userData.isClickable = false;
    marker.add(pulse);
  }

  resetMarkerScale(marker) {
    if (!marker) return;

    marker.scale.set(1, 1, 1);

    const pulse = marker.children.find(c => c.userData?.isPulse);
    if (pulse) {
      marker.remove(pulse);
      pulse.geometry.dispose();
      pulse.material.dispose();
    }
  }

  update(delta) {
    if (!this.animationEnabled) return;

    const time = Date.now() * 0.001;

    this.diseaseMarkers.forEach(marker => {
      if (!marker.visible) return;

      const { baseY, size } = marker.userData;
      const hoverFactor = marker === this.hoveredMarker || marker === this.selectedMarker ? 1.3 : 1;

      marker.position.y = baseY + Math.sin(time * 2 + marker.userData.diseaseId.charCodeAt(0) * 0.1) * 0.08 * hoverFactor;

      const ring = marker.children.find(c => c.geometry?.type === 'RingGeometry' && !c.userData?.isPulse);
      if (ring) {
        ring.rotation.z = time * 0.5;
        const scale = 1 + Math.sin(time * 3) * 0.05;
        ring.scale.setScalar(scale);
      }
    });
  }

  getStatistics() {
    const stats = {
      total: this.diseaseData.length,
      byType: {},
      bySeverity: { minor: 0, moderate: 0, severe: 0 },
      byStatus: { pending: 0, repairing: 0, repaired: 0 }
    };

    this.diseaseData.forEach(d => {
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
      stats.bySeverity[d.severity] = (stats.bySeverity[d.severity] || 0) + 1;
      stats.byStatus[d.status] = (stats.byStatus[d.status] || 0) + 1;
    });

    return stats;
  }

  exportDiseases(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.diseaseData, null, 2);
    } else if (format === 'csv') {
      const headers = ['id', 'type', 'severity', 'status', 'description', 'position_x', 'position_y', 'position_z', 'discoveryDate', 'inspector'];
      const rows = this.diseaseData.map(d => {
        const pos = d.position || {};
        return headers.map(h => {
          if (h.startsWith('position_')) {
            const axis = h.split('_')[1];
            return `"${pos[axis] || 0}"`;
          }
          return `"${d[h] || ''}"`;
        }).join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    }
    return null;
  }

  showHeatmap(show) {
    this.diseaseMarkers.forEach(marker => {
      const cone = marker.children.find(c => c.geometry?.type === 'ConeGeometry');
      if (cone) {
        if (show) {
          cone.material.color.setHex(0xff0000);
          const intensity = marker.userData.severity === 'severe' ? 1 :
                            marker.userData.severity === 'moderate' ? 0.6 : 0.3;
          cone.material.opacity = intensity;
        } else {
          cone.material.color.setHex(this.getDiseaseColor(marker.userData.disease));
          cone.material.opacity = 0.9;
        }
      }
    });
  }

  focusOnDisease(diseaseId, distance = 15) {
    const marker = this.getMarkerById(diseaseId);
    if (marker) {
      const markerPos = marker.position.clone();
      const cameraDir = this.camera.position.clone().sub(markerPos).normalize();
      const targetPos = markerPos.clone().add(cameraDir.multiplyScalar(distance));

      return {
        targetPosition: targetPos,
        lookAtPosition: markerPos.clone()
      };
    }
    return null;
  }

  getVisibleDiseases() {
    return this.diseaseMarkers
      .filter(m => m.visible)
      .map(m => m.userData.disease);
  }

  getMarkerPosition(diseaseId) {
    const marker = this.getMarkerById(diseaseId);
    if (marker) {
      return {
        local: marker.position.clone(),
        world: this.getWorldPosition(marker),
        original: marker.userData.originalPosition.clone(),
        transformed: marker.userData.transformedPosition.clone()
      };
    }
    return null;
  }

  verifyMarkerPositions() {
    const issues = [];

    this.diseaseMarkers.forEach(marker => {
      const pos = marker.position;
      if (!this.validatePosition(pos)) {
        issues.push({
          diseaseId: marker.userData.diseaseId,
          position: pos.clone(),
          issue: '位置超出合理范围'
        });
      }
    });

    return {
      total: this.diseaseMarkers.length,
      valid: this.diseaseMarkers.length - issues.length,
      issues: issues
    };
  }

  createLegend() {
    const legendData = [];

    Object.entries(this.layers).forEach(([type, config]) => {
      legendData.push({
        type: 'layer',
        key: type,
        name: config.name,
        color: config.color,
        visible: config.visible
      });
    });

    const severityInfo = {
      minor: { name: '轻微', color: 0x66bb6a },
      moderate: { name: '中等', color: 0xffa726 },
      severe: { name: '严重', color: 0xef5350 }
    };

    Object.entries(severityInfo).forEach(([key, info]) => {
      legendData.push({
        type: 'severity',
        key: key,
        name: info.name,
        color: info.color,
        visible: this.severityFilters[key]
      });
    });

    const statusInfo = {
      pending: { name: '待处理', color: 0xef5350 },
      repairing: { name: '维修中', color: 0xffa726 },
      repaired: { name: '已修复', color: 0x66bb6a }
    };

    Object.entries(statusInfo).forEach(([key, info]) => {
      legendData.push({
        type: 'status',
        key: key,
        name: info.name,
        color: info.color,
        visible: this.statusFilters[key]
      });
    });

    return legendData;
  }

  dispose() {
    this.clearMarkers();
  }
}
