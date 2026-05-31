import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { InteractionManager } from './interactionManager.js';
import { AnimationManager } from './animationManager.js';
import { MeasurementTool } from './measurementTool.js';

export class ViewController {
  constructor(camera, renderer, scene) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;

    this.currentMode = 'orbit';
    this.orbitControls = null;
    this.pointerLockControls = null;

    this.interactionManager = new InteractionManager(camera, renderer, scene);
    this.animationManager = new AnimationManager(camera, renderer, scene);
    this.measurementTool = new MeasurementTool(scene, this.interactionManager);

    this.onObjectClick = null;
    this.onObjectHover = null;
    this.onObjectSelected = null;
    this.onObjectDeselected = null;
    this.onModeChange = null;
    this.onDoubleClick = null;

    this.setupInteractionCallbacks();
    this.initOrbitControls();
    this.initPointerLockControls();
    this.initKeyboardShortcuts();
  }

  setupInteractionCallbacks() {
    this.interactionManager.onObjectClick = (object, intersect) => {
      if (this.measurementTool.enabled) {
        this.measurementTool.addMeasurementPoint(intersect.point);
        return;
      }
      if (this.onObjectClick) {
        this.onObjectClick(object, intersect);
      }
    };

    this.interactionManager.onObjectHover = (object, intersect) => {
      if (this.onObjectHover) {
        this.onObjectHover(object, intersect);
      }
    };

    this.interactionManager.onObjectSelected = (object) => {
      if (this.onObjectSelected) {
        this.onObjectSelected(object);
      }
    };

    this.interactionManager.onObjectDeselected = () => {
      if (this.onObjectDeselected) {
        this.onObjectDeselected();
      }
    };

    this.interactionManager.onDoubleClick = (object) => {
      this.focusOnObject(object, 15);
      if (this.onDoubleClick) {
        this.onDoubleClick(object);
      }
    };
  }

  initOrbitControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.screenSpacePanning = false;
    this.orbitControls.minDistance = 5;
    this.orbitControls.maxDistance = 200;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.orbitControls.target.set(0, 5, 0);
    this.orbitControls.enabled = true;

    this.orbitControls.addEventListener('start', () => {
      this.interactionManager.setInteracting(true);
    });

    this.orbitControls.addEventListener('end', () => {
      setTimeout(() => {
        this.interactionManager.setInteracting(false);
      }, 100);
    });
  }

  initPointerLockControls() {
    this.pointerLockControls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.pointerLockControls.enabled = false;

    this.pointerLockControls.addEventListener('lock', () => {
      this.interactionManager.setInteracting(true);
    });

    this.pointerLockControls.addEventListener('unlock', () => {
      this.interactionManager.setInteracting(false);
    });
  }

  initKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }

      if (event.repeat) return;

      switch (event.code) {
        case 'Digit1':
          this.switchMode('orbit');
          break;
        case 'Digit2':
          this.switchMode('firstPerson');
          break;
        case 'Digit3':
          this.switchMode('topDown');
          break;
        case 'KeyR':
          this.resetView();
          break;
        case 'Escape':
          if (this.currentMode === 'firstPerson' && this.pointerLockControls.isLocked) {
            this.pointerLockControls.unlock();
          }
          break;
      }
    }, { passive: false });
  }

  switchMode(mode) {
    if (this.currentMode === mode) return;

    this.orbitControls.enabled = false;
    this.pointerLockControls.enabled = false;
    this.stopAutoNavigation();
    this.measurementTool.disable();

    if (this.pointerLockControls.isLocked) {
      this.pointerLockControls.unlock();
    }

    this.currentMode = mode;

    switch (mode) {
      case 'orbit':
        this.orbitControls.enabled = true;
        if (!this.interactionManager.isInteracting) {
          this.camera.position.set(50, 30, 50);
        }
        this.orbitControls.target.set(0, 5, 0);
        this.orbitControls.update();
        break;

      case 'firstPerson':
        this.pointerLockControls.enabled = true;
        this.camera.position.set(0, 7, 20);
        this.camera.lookAt(0, 7, 0);
        break;

      case 'topDown':
        this.orbitControls.enabled = true;
        this.camera.position.set(0, 80, 0.1);
        this.orbitControls.target.set(0, 0, 0);
        this.orbitControls.update();
        break;
    }

    if (this.onModeChange) {
      this.onModeChange(mode);
    }
  }

  resetView() {
    this.switchMode(this.currentMode);
    this.deselectObject();
  }

  update(delta) {
    if (this.currentMode === 'orbit' && this.orbitControls.enabled) {
      this.orbitControls.update();
    }

    if (this.currentMode === 'firstPerson' && this.pointerLockControls.isLocked) {
      this.animationManager.update(
        delta,
        this.interactionManager.keys,
        this.pointerLockControls
      );
    } else {
      this.animationManager.update(delta);
    }
  }

  setWaypoints(waypoints) {
    this.animationManager.setWaypoints(waypoints);
  }

  addWaypoint(position) {
    this.animationManager.addWaypoint(position);
  }

  startAutoNavigation() {
    this.animationManager.startAutoNavigation();
    this.orbitControls.enabled = false;
    this.pointerLockControls.enabled = false;
  }

  stopAutoNavigation() {
    this.animationManager.stopAutoNavigation();
    this.switchMode('orbit');
  }

  get isAutoNavigating() {
    return this.animationManager.isAutoNavigating;
  }

  flyTo(position, duration = 1000) {
    return this.animationManager.flyTo(position, duration);
  }

  focusOnObject(object, distance = 20) {
    const objectPosition = new THREE.Vector3();
    object.getWorldPosition(objectPosition);

    const direction = this.camera.position.clone().sub(objectPosition).normalize();
    const targetPosition = objectPosition.clone().add(direction.multiplyScalar(distance));

    this.flyTo(targetPosition, 1500).then(() => {
      if (this.orbitControls && this.currentMode === 'orbit') {
        this.orbitControls.target.copy(objectPosition);
        this.orbitControls.update();
      }
    });
  }

  getViewState() {
    return {
      mode: this.currentMode,
      ...this.animationManager.getViewState(this.orbitControls)
    };
  }

  restoreViewState(state) {
    if (state.mode) {
      this.switchMode(state.mode);
    }
    this.animationManager.restoreViewState(state, this.orbitControls);
  }

  getSelectedObject() {
    return this.interactionManager.getSelectedObject();
  }

  getHoveredObject() {
    return this.interactionManager.getHoveredObject();
  }

  selectObject(object) {
    this.interactionManager.selectObject(object);
  }

  deselectObject() {
    this.interactionManager.deselectObject();
  }

  excludeFromPick(object) {
    this.interactionManager.excludeFromPick(object);
  }

  includeInPick(object) {
    this.interactionManager.includeInPick(object);
  }

  setDragThreshold(pixels) {
    this.interactionManager.setDragThreshold(pixels);
  }

  setMouseMoveThrottle(ms) {
    this.interactionManager.setMouseMoveThrottle(ms);
  }

  enableMeasurement() {
    this.measurementTool.enable();
    this.deselectObject();
  }

  disableMeasurement() {
    this.measurementTool.disable();
  }

  getMeasurementDistance() {
    return this.measurementTool.getDistance();
  }

  clearMeasurements() {
    this.measurementTool.clearMeasurements();
  }

  createAnimation(id, config) {
    return this.animationManager.createAnimation(id, config);
  }

  startAnimation(id) {
    this.animationManager.startAnimation(id);
  }

  pauseAnimation(id) {
    this.animationManager.pauseAnimation(id);
  }

  resumeAnimation(id) {
    this.animationManager.resumeAnimation(id);
  }

  stopAnimation(id) {
    this.animationManager.stopAnimation(id);
  }

  get keys() {
    return this.interactionManager.keys;
  }

  dispose() {
    this.interactionManager.dispose();
    this.animationManager.dispose();
    this.measurementTool.dispose();

    if (this.orbitControls) {
      this.orbitControls.dispose();
    }
    if (this.pointerLockControls) {
      this.pointerLockControls.dispose();
    }
  }
}
