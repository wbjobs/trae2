import * as THREE from 'three';

export class AnimationManager {
  constructor(camera, renderer, scene) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;

    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.isAutoNavigating = false;
    this.autoNavigationSpeed = 0.02;

    this.activeAnimations = new Map();
    this.animationQueue = [];

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints;
  }

  addWaypoint(position) {
    this.waypoints.push(position.clone());
  }

  startAutoNavigation() {
    if (this.waypoints.length === 0) return;
    this.isAutoNavigating = true;
    this.currentWaypointIndex = 0;
  }

  stopAutoNavigation() {
    this.isAutoNavigating = false;
  }

  updateAutoNavigation() {
    if (this.waypoints.length === 0) return;

    const target = this.waypoints[this.currentWaypointIndex];
    const currentPos = this.camera.position;

    const distance = currentPos.distanceTo(target);

    if (distance < 1) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
      return;
    }

    const direction = target.clone().sub(currentPos).normalize();
    const speed = this.autoNavigationSpeed * Math.min(distance, 5);
    currentPos.add(direction.multiplyScalar(speed));

    const lookTarget = this.waypoints[(this.currentWaypointIndex + 1) % this.waypoints.length];
    this.camera.lookAt(lookTarget);
  }

  flyTo(position, duration = 1000) {
    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();
      const endPos = position.clone();
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        this.camera.position.lerpVectors(startPos, endPos, easeT);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  focusOnObject(object, distance = 20) {
    const objectPosition = new THREE.Vector3();
    object.getWorldPosition(objectPosition);

    const direction = this.camera.position.clone().sub(objectPosition).normalize();
    const targetPosition = objectPosition.clone().add(direction.multiplyScalar(distance));

    return this.flyTo(targetPosition, 1500);
  }

  createAnimation(id, config) {
    const animation = {
      id,
      ...config,
      startTime: null,
      paused: false,
      completed: false
    };

    this.activeAnimations.set(id, animation);
    return animation;
  }

  startAnimation(id) {
    const animation = this.activeAnimations.get(id);
    if (animation) {
      animation.startTime = Date.now();
      animation.paused = false;
      animation.completed = false;
    }
  }

  pauseAnimation(id) {
    const animation = this.activeAnimations.get(id);
    if (animation) {
      animation.paused = true;
    }
  }

  resumeAnimation(id) {
    const animation = this.activeAnimations.get(id);
    if (animation) {
      animation.paused = false;
    }
  }

  stopAnimation(id) {
    this.activeAnimations.delete(id);
  }

  updateTweenAnimation(animation) {
    if (animation.paused || !animation.startTime) return;

    const elapsed = Date.now() - animation.startTime;
    const t = Math.min(elapsed / animation.duration, 1);
    const easeT = animation.easing ? animation.easing(t) : t;

    if (animation.onUpdate) {
      animation.onUpdate(easeT, t);
    }

    if (t >= 1) {
      animation.completed = true;
      if (animation.onComplete) {
        animation.onComplete();
      }
      if (animation.loop) {
        animation.startTime = Date.now();
        animation.completed = false;
      } else {
        this.activeAnimations.delete(animation.id);
      }
    }
  }

  updateFirstPersonMovement(delta, keys, pointerLockControls) {
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;
    this.velocity.y -= this.velocity.y * 10.0 * delta;

    this.direction.z = Number(keys.forward) - Number(keys.backward);
    this.direction.x = Number(keys.right) - Number(keys.left);
    this.direction.y = Number(keys.up) - Number(keys.down);
    this.direction.normalize();

    if (keys.forward || keys.backward) {
      this.velocity.z -= this.direction.z * 200.0 * delta;
    }
    if (keys.left || keys.right) {
      this.velocity.x -= this.direction.x * 200.0 * delta;
    }
    if (keys.up || keys.down) {
      this.velocity.y += this.direction.y * 200.0 * delta;
    }

    pointerLockControls.moveRight(-this.velocity.x * delta);
    pointerLockControls.moveForward(-this.velocity.z * delta);
    this.camera.position.y += this.velocity.y * delta;

    this.camera.position.y = Math.max(1, Math.min(50, this.camera.position.y));
  }

  update(delta, keys = null, pointerLockControls = null) {
    if (this.isAutoNavigating) {
      this.updateAutoNavigation();
    }

    if (keys && pointerLockControls) {
      this.updateFirstPersonMovement(delta, keys, pointerLockControls);
    }

    this.activeAnimations.forEach(animation => {
      this.updateTweenAnimation(animation);
    });
  }

  getViewState(orbitControls) {
    return {
      cameraPosition: this.camera.position.clone(),
      cameraRotation: this.camera.rotation.clone(),
      target: orbitControls ? orbitControls.target.clone() : null
    };
  }

  restoreViewState(state, orbitControls) {
    if (state.cameraPosition) {
      this.camera.position.copy(state.cameraPosition);
    }
    if (state.cameraRotation) {
      this.camera.rotation.copy(state.cameraRotation);
    }
    if (state.target && orbitControls) {
      orbitControls.target.copy(state.target);
      orbitControls.update();
    }
  }

  dispose() {
    this.activeAnimations.clear();
    this.animationQueue = [];
  }

  static easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  static easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  static easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }
}
