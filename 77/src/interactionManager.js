import * as THREE from 'three';

export class InteractionManager {
  constructor(camera, renderer, scene) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 500;
    this.mouse = new THREE.Vector2();

    this.hoveredObject = null;
    this.selectedObject = null;

    this.isDragging = false;
    this.dragThreshold = 5;
    this.mouseDownPosition = { x: 0, y: 0 };
    this.lastClickTime = 0;
    this.doubleClickThreshold = 300;
    this.clickCooldown = 100;
    this.lastMouseEventTime = 0;
    this.mouseMoveThrottle = 16;

    this.isInteracting = false;
    this.eventLock = false;

    this.highlightedObjects = new Map();
    this.excludeFromPicking = new Set();

    this.onObjectClick = null;
    this.onObjectHover = null;
    this.onObjectSelected = null;
    this.onObjectDeselected = null;
    this.onDoubleClick = null;

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false
    };

    this.initEventListeners();
  }

  initEventListeners() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (event) => this.onMouseDown(event), { passive: false });
    canvas.addEventListener('mouseup', (event) => this.onMouseUp(event), { passive: false });
    canvas.addEventListener('mousemove', (event) => this.onMouseMove(event), { passive: false });
    canvas.addEventListener('click', (event) => this.onMouseClick(event), { passive: false });
    canvas.addEventListener('dblclick', (event) => this.onDoubleClick(event), { passive: false });
    canvas.addEventListener('contextmenu', (event) => this.onContextMenu(event), { passive: false });
    canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });

    canvas.addEventListener('touchstart', (event) => this.onTouchStart(event), { passive: false });
    canvas.addEventListener('touchmove', (event) => this.onTouchMove(event), { passive: false });
    canvas.addEventListener('touchend', (event) => this.onTouchEnd(event), { passive: false });

    document.addEventListener('keydown', (event) => this.onKeyDown(event), { passive: false });
    document.addEventListener('keyup', (event) => this.onKeyUp(event), { passive: false });
  }

  getNormalizedMousePosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    };
  }

  onMouseDown(event) {
    if (event.button !== 0) return;

    this.mouseDownPosition = { x: event.clientX, y: event.clientY };
    this.isDragging = false;
    this.eventLock = true;

    setTimeout(() => {
      this.eventLock = false;
    }, 50);
  }

  onMouseUp(event) {
    if (event.button !== 0) return;

    const dx = event.clientX - this.mouseDownPosition.x;
    const dy = event.clientY - this.mouseDownPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.dragThreshold) {
      this.isDragging = true;
    }
  }

  onMouseMove(event) {
    const now = Date.now();
    if (now - this.lastMouseEventTime < this.mouseMoveThrottle) {
      return;
    }
    this.lastMouseEventTime = now;

    if (this.eventLock || this.isInteracting) {
      return;
    }

    const pos = this.getNormalizedMousePosition(event);
    this.mouse.set(pos.x, pos.y);

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const pickableObjects = this.getPickableObjects();
    const intersects = this.raycaster.intersectObjects(pickableObjects, true);

    if (intersects.length > 0) {
      const hovered = this.findParentWithUserData(intersects[0].object);

      if (this.hoveredObject !== hovered) {
        if (this.hoveredObject) {
          this.restoreObjectAppearance(this.hoveredObject);
        }

        this.hoveredObject = hovered;
        this.renderer.domElement.style.cursor = 'pointer';

        if (hovered && hovered.material) {
          this.highlightObject(hovered);
        }

        if (this.onObjectHover) {
          this.onObjectHover(hovered, intersects[0]);
        }
      }
    } else {
      if (this.hoveredObject) {
        this.restoreObjectAppearance(this.hoveredObject);
      }
      this.hoveredObject = null;
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  onMouseClick(event) {
    if (event.button !== 0) return;

    const now = Date.now();
    if (now - this.lastClickTime < this.clickCooldown) {
      return;
    }

    if (this.isDragging) {
      this.isDragging = false;
      return;
    }

    if (this.isInteracting) {
      return;
    }

    this.lastClickTime = now;

    const pos = this.getNormalizedMousePosition(event);
    this.mouse.set(pos.x, pos.y);

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const pickableObjects = this.getPickableObjects();
    const intersects = this.raycaster.intersectObjects(pickableObjects, true);

    if (intersects.length > 0) {
      const clickedObject = this.findParentWithUserData(intersects[0].object);

      if (this.selectedObject && this.selectedObject !== clickedObject) {
        this.restoreObjectAppearance(this.selectedObject);
      }

      if (clickedObject) {
        this.selectObject(clickedObject);

        if (this.onObjectClick) {
          this.onObjectClick(clickedObject, intersects[0]);
        }
      } else {
        this.deselectObject();
      }
    } else {
      this.deselectObject();
    }
  }

  onDoubleClick(event) {
    const now = Date.now();
    if (now - this.lastClickTime < this.doubleClickThreshold) {
      return;
    }

    if (this.isDragging || this.isInteracting) {
      return;
    }

    if (this.hoveredObject) {
      if (this.onDoubleClick) {
        this.onDoubleClick(this.hoveredObject);
      }
    }
  }

  onContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  onWheel(event) {
  }

  onTouchStart(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.mouseDownPosition = { x: touch.clientX, y: touch.clientY };
    }
  }

  onTouchMove(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - this.mouseDownPosition.x;
      const dy = touch.clientY - this.mouseDownPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.dragThreshold) {
        this.isDragging = true;
      }
    }
  }

  onTouchEnd(event) {
    if (!this.isDragging && event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const mouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0
      };
      this.onMouseClick(mouseEvent);
    }
    this.isDragging = false;
  }

  onKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    if (event.repeat) return;

    switch (event.code) {
      case 'KeyW':
        this.keys.forward = true;
        break;
      case 'KeyS':
        this.keys.backward = true;
        break;
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'Space':
        event.preventDefault();
        this.keys.up = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.down = true;
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.keys.forward = false;
        break;
      case 'KeyS':
        this.keys.backward = false;
        break;
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.up = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.down = false;
        break;
    }
  }

  getPickableObjects() {
    const pickable = [];

    this.scene.traverse((object) => {
      if (object.isMesh || object.isSprite) {
        if (!this.excludeFromPicking.has(object)) {
          if (object.visible && !object.userData.isNotPickable) {
            pickable.push(object);
          }
        }
      }
    });

    return pickable;
  }

  findParentWithUserData(object) {
    let current = object;
    let maxDepth = 20;

    while (current && current.parent && maxDepth > 0) {
      if (current.userData && (current.userData.type || current.userData.diseaseId)) {
        return current;
      }
      current = current.parent;
      maxDepth--;
    }

    return object;
  }

  highlightObject(object) {
    if (!object || !object.material) return;

    if (!this.highlightedObjects.has(object)) {
      this.highlightedObjects.set(object, {
        originalMaterial: object.material,
        originalColor: object.material.color ? object.material.color.clone() : null
      });
    }

    if (!object.userData.highlighted) {
      object.userData.highlighted = true;

      if (object.material.clone && object.material.emissive !== undefined) {
        object.material = object.material.clone();
        object.material.emissive.setHex(0x333333);
        object.material.needsUpdate = true;
      }
    }
  }

  restoreObjectAppearance(object) {
    if (!object) return;

    const saved = this.highlightedObjects.get(object);
    if (saved) {
      if (object.material && object.material.dispose) {
        if (saved.originalMaterial !== object.material) {
          object.material.dispose();
        }
      }
      object.material = saved.originalMaterial;
      this.highlightedObjects.delete(object);
    }

    object.userData.highlighted = false;
  }

  selectObject(object) {
    if (this.selectedObject) {
      this.restoreObjectAppearance(this.selectedObject);
    }

    this.selectedObject = object;

    if (object && object.material) {
      if (object.material.clone && object.material.emissive !== undefined) {
        const clonedMaterial = object.material.clone();
        clonedMaterial.emissive.setHex(0x666600);
        object.material = clonedMaterial;
      }
    }

    if (this.onObjectSelected) {
      this.onObjectSelected(object);
    }
  }

  deselectObject() {
    if (this.selectedObject) {
      this.restoreObjectAppearance(this.selectedObject);
    }
    this.selectedObject = null;

    if (this.onObjectDeselected) {
      this.onObjectDeselected();
    }
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  getHoveredObject() {
    return this.hoveredObject;
  }

  excludeFromPick(object) {
    this.excludeFromPicking.add(object);
  }

  includeInPick(object) {
    this.excludeFromPicking.delete(object);
  }

  setDragThreshold(pixels) {
    this.dragThreshold = pixels;
  }

  setMouseMoveThrottle(ms) {
    this.mouseMoveThrottle = ms;
  }

  setInteracting(interacting) {
    this.isInteracting = interacting;
  }

  dispose() {
    this.highlightedObjects.forEach((saved, object) => {
      if (object.material && object.material !== saved.originalMaterial) {
        object.material.dispose();
      }
    });
    this.highlightedObjects.clear();
    this.excludeFromPicking.clear();
  }
}
