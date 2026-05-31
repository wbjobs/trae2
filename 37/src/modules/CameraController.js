import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

class CameraController {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.currentMode = 'orbit';
    this.targetPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.isAnimating = false;
  }

  setMode(mode) {
    this.currentMode = mode;
    
    switch (mode) {
      case 'orbit':
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        break;
      case 'pan':
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        break;
      case 'zoom':
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        break;
    }
  }

  getMode() {
    return this.currentMode;
  }

  flyTo(position, lookAt, duration = 1000) {
    return new Promise((resolve) => {
      if (this.isAnimating) {
        TWEEN.removeAll();
      }
      
      this.isAnimating = true;
      
      const startPosition = this.camera.position.clone();
      const startLookAt = this.controls.target.clone();
      
      const tween = new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ t }) => {
          this.camera.position.lerpVectors(startPosition, position, t);
          this.controls.target.lerpVectors(startLookAt, lookAt, t);
          this.controls.update();
        })
        .onComplete(() => {
          this.isAnimating = false;
          resolve();
        })
        .start();
      
      this.animateTween();
    });
  }

  focusOnObject(object, duration = 800) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    
    const newPosition = center.clone().add(direction.multiplyScalar(distance));
    
    return this.flyTo(newPosition, center, duration);
  }

  setTopView(boundingBox, duration = 800) {
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.z) * 1.2;
    
    const position = new THREE.Vector3(center.x, center.y + distance, center.z);
    return this.flyTo(position, center, duration);
  }

  setFrontView(boundingBox, duration = 800) {
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y) * 1.2;
    
    const position = new THREE.Vector3(center.x, center.y, center.z + distance);
    return this.flyTo(position, center, duration);
  }

  setSideView(boundingBox, duration = 800) {
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const distance = Math.max(size.y, size.z) * 1.2;
    
    const position = new THREE.Vector3(center.x + distance, center.y, center.z);
    return this.flyTo(position, center, duration);
  }

  setIsoView(boundingBox, duration = 800) {
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const distance = size.length() * 0.8;
    
    const position = new THREE.Vector3(
      center.x + distance * 0.5,
      center.y + distance * 0.5,
      center.z + distance * 0.5
    );
    return this.flyTo(position, center, duration);
  }

  fitToView(boundingBox, duration = 600) {
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
    
    const position = new THREE.Vector3(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.4,
      center.z + cameraZ * 0.5
    );
    
    return this.flyTo(position, center, duration);
  }

  zoomIn(amount = 0.2) {
    const direction = new THREE.Vector3()
      .subVectors(this.controls.target, this.camera.position)
      .normalize();
    
    const distance = this.camera.position.distanceTo(this.controls.target);
    const moveDistance = distance * amount;
    
    if (moveDistance < distance - this.controls.minDistance) {
      this.camera.position.add(direction.multiplyScalar(moveDistance));
      this.controls.update();
    }
  }

  zoomOut(amount = 0.2) {
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    
    const distance = this.camera.position.distanceTo(this.controls.target);
    const moveDistance = distance * amount;
    
    if (distance + moveDistance < this.controls.maxDistance) {
      this.camera.position.add(direction.multiplyScalar(moveDistance));
      this.controls.update();
    }
  }

  animateTween() {
    const animate = () => {
      if (TWEEN.getAll().length > 0) {
        requestAnimationFrame(animate);
        TWEEN.update();
      }
    };
    animate();
  }

  getPosition() {
    return this.camera.position.clone();
  }

  getTarget() {
    return this.controls.target.clone();
  }

  saveViewState() {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      mode: this.currentMode
    };
  }

  restoreViewState(state, duration = 500) {
    this.setMode(state.mode);
    return this.flyTo(state.position, state.target, duration);
  }
}

export default CameraController;
