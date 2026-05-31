import * as THREE from 'three';

export class MeasurementTool {
  constructor(scene, interactionManager) {
    this.scene = scene;
    this.interactionManager = interactionManager;

    this.measurementPoints = [];
    this.measurementLine = null;
    this.measurementLabels = [];

    this.enabled = false;
    this.unit = 'm';
    this.precision = 2;

    this.onMeasurementComplete = null;
    this.onPointAdded = null;
  }

  enable() {
    this.enabled = true;
    this.clearMeasurements();
  }

  disable() {
    this.enabled = false;
    this.clearMeasurements();
  }

  createMeasurementPoints() {
    this.clearMeasurements();
    this.measurementPoints = [];
    this.measurementLine = null;
    this.measurementLabels = [];
  }

  addMeasurementPoint(position) {
    if (!this.enabled) return null;

    if (!this.measurementPoints) {
      this.createMeasurementPoints();
    }

    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const point = new THREE.Mesh(geometry, material);
    point.position.copy(position);
    point.userData.isNotPickable = true;
    point.userData.isMeasurement = true;
    this.scene.add(point);
    this.interactionManager.excludeFromPick(point);

    const label = this.createLabel(`P${this.measurementPoints.length + 1}`, position.clone().add(new THREE.Vector3(0, 0.8, 0)));
    this.measurementLabels.push(label);

    this.measurementPoints.push({
      mesh: point,
      position: position.clone(),
      label: label
    });

    if (this.onPointAdded) {
      this.onPointAdded(position, this.measurementPoints.length);
    }

    if (this.measurementPoints.length === 2) {
      this.updateMeasurementLine();
      const distance = this.measurementPoints[0].position.distanceTo(
        this.measurementPoints[1].position
      );

      const midPoint = this.measurementPoints[0].position.clone()
        .add(this.measurementPoints[1].position)
        .multiplyScalar(0.5);

      const distanceLabel = this.createLabel(
        `${distance.toFixed(this.precision)} ${this.unit}`,
        midPoint.add(new THREE.Vector3(0, 0.5, 0)),
        0x00ff00
      );
      this.measurementLabels.push(distanceLabel);

      if (this.onMeasurementComplete) {
        this.onMeasurementComplete(distance, this.measurementPoints);
      }

      return distance;
    }

    return null;
  }

  createLabel(text, position, color = 0xffff00) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 128, 10);
    ctx.fill();

    ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(2, 1, 1);
    sprite.userData.isNotPickable = true;
    sprite.userData.isMeasurement = true;
    this.scene.add(sprite);
    this.interactionManager.excludeFromPick(sprite);

    return sprite;
  }

  updateMeasurementLine() {
    if (this.measurementPoints.length < 2) return;

    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      this.interactionManager.includeInPick(this.measurementLine);
    }

    const points = this.measurementPoints.map(p => p.position);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    this.measurementLine = new THREE.Line(geometry, material);
    this.measurementLine.userData.isNotPickable = true;
    this.measurementLine.userData.isMeasurement = true;
    this.interactionManager.excludeFromPick(this.measurementLine);
    this.scene.add(this.measurementLine);
  }

  clearMeasurements() {
    if (this.measurementPoints) {
      this.measurementPoints.forEach(p => {
        this.interactionManager.includeInPick(p.mesh);
        this.scene.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
      });
    }

    if (this.measurementLine) {
      this.interactionManager.includeInPick(this.measurementLine);
      this.scene.remove(this.measurementLine);
      if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
      if (this.measurementLine.material) this.measurementLine.material.dispose();
    }

    this.measurementLabels.forEach(label => {
      this.interactionManager.includeInPick(label);
      this.scene.remove(label);
      if (label.material) {
        if (label.material.map) label.material.map.dispose();
        label.material.dispose();
      }
    });

    this.measurementPoints = [];
    this.measurementLine = null;
    this.measurementLabels = [];
  }

  setUnit(unit) {
    this.unit = unit;
  }

  setPrecision(precision) {
    this.precision = precision;
  }

  getPoints() {
    return this.measurementPoints.map(p => p.position.clone());
  }

  getDistance() {
    if (this.measurementPoints.length >= 2) {
      return this.measurementPoints[0].position.distanceTo(
        this.measurementPoints[1].position
      );
    }
    return null;
  }

  getAngle() {
    if (this.measurementPoints.length >= 3) {
      const v1 = this.measurementPoints[0].position.clone()
        .sub(this.measurementPoints[1].position);
      const v2 = this.measurementPoints[2].position.clone()
        .sub(this.measurementPoints[1].position);
      return v1.angleTo(v2) * (180 / Math.PI);
    }
    return null;
  }

  getArea() {
    if (this.measurementPoints.length >= 3) {
      const v1 = this.measurementPoints[0].position.clone()
        .sub(this.measurementPoints[1].position);
      const v2 = this.measurementPoints[2].position.clone()
        .sub(this.measurementPoints[1].position);
      const cross = new THREE.Vector3().crossVectors(v1, v2);
      return cross.length() / 2;
    }
    return null;
  }

  dispose() {
    this.clearMeasurements();
  }
}
