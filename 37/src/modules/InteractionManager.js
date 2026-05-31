import * as THREE from 'three';

class InteractionManager {
  constructor(sceneLoader, container) {
    this.sceneLoader = sceneLoader;
    this.container = container;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.selectedObject = null;
    this.hoveredObject = null;
    
    this.onObjectClick = null;
    this.onObjectHover = null;
    this.onObjectDoubleClick = null;
    this.onContextMenu = null;
    this.onSceneClick = null;
    
    this.lastClickTime = 0;
    this.doubleClickThreshold = 300;
    
    this.isDragging = false;
    this.dragThreshold = 5;
    this.mouseDownPosition = new THREE.Vector2();
    
    this.enabled = true;
    
    this.bindEvents();
  }

  bindEvents() {
    const domElement = this.sceneLoader.renderer.domElement;
    
    domElement.addEventListener('click', (e) => this.handleClick(e));
    domElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    domElement.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    domElement.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    domElement.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
    domElement.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
  }

  handleClick(event) {
    if (!this.enabled) return;
    if (this.isDragging) return;
    
    const now = Date.now();
    const isDoubleClick = (now - this.lastClickTime) < this.doubleClickThreshold;
    this.lastClickTime = now;
    
    this.updateMousePosition(event);
    
    const intersection = this.getIntersection();
    
    if (intersection) {
      const object = this.findComponentRoot(intersection.object);
      
      if (isDoubleClick) {
        this.handleDoubleClick(object, event);
      } else {
        this.handleSingleClick(object, event);
      }
    } else {
      if (this.onSceneClick) {
        this.onSceneClick(event);
      }
    }
  }

  handleSingleClick(object, event) {
    if (object) {
      this.selectObject(object);
      
      if (this.onObjectClick) {
        this.onObjectClick(object.userData, event, object);
      }
    }
  }

  handleDoubleClick(object, event) {
    if (object && this.onObjectDoubleClick) {
      this.onObjectDoubleClick(object.userData, event, object);
    }
  }

  handleMouseMove(event) {
    if (!this.enabled) return;
    
    if (this.isDragging) {
      return;
    }
    
    this.updateMousePosition(event);
    
    const intersection = this.getIntersection();
    
    if (intersection) {
      const object = this.findComponentRoot(intersection.object);
      
      if (object !== this.hoveredObject) {
        if (this.hoveredObject) {
          this.handleMouseLeave(this.hoveredObject);
        }
        
        this.hoveredObject = object;
        this.handleMouseEnter(object, event);
      }
    } else if (this.hoveredObject) {
      this.handleMouseLeave(this.hoveredObject);
      this.hoveredObject = null;
    }
  }

  handleMouseDown(event) {
    this.mouseDownPosition.set(event.clientX, event.clientY);
    this.isDragging = false;
  }

  handleMouseUp(event) {
    const distance = Math.sqrt(
      Math.pow(event.clientX - this.mouseDownPosition.x, 2) +
      Math.pow(event.clientY - this.mouseDownPosition.y, 2)
    );
    
    this.isDragging = distance > this.dragThreshold;
  }

  handleMouseEnter(object, event) {
    if (!object) return;
    
    this.highlightObject(object);
    
    if (this.onObjectHover) {
      this.onObjectHover(object.userData, event, object);
    }
    
    this.container.style.cursor = 'pointer';
  }

  handleMouseLeave(object) {
    if (!object) return;
    
    if (object !== this.selectedObject) {
      this.unhighlightObject(object);
    }
    
    if (this.onObjectHover) {
      this.onObjectHover(null, null, null);
    }
    
    this.container.style.cursor = 'default';
  }

  handleContextMenu(event) {
    event.preventDefault();
    
    if (!this.enabled) return;
    
    this.updateMousePosition(event);
    
    const intersection = this.getIntersection();
    
    if (intersection && this.onContextMenu) {
      const object = this.findComponentRoot(intersection.object);
      this.onContextMenu(object?.userData, event, object);
    }
  }

  handleMouseLeave(event) {
    if (this.hoveredObject && this.hoveredObject !== this.selectedObject) {
      this.unhighlightObject(this.hoveredObject);
    }
    this.hoveredObject = null;
    
    if (this.onObjectHover) {
      this.onObjectHover(null, null, null);
    }
    
    this.container.style.cursor = 'default';
  }

  updateMousePosition(event) {
    const rect = this.sceneLoader.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getIntersection() {
    this.raycaster.setFromCamera(this.mouse, this.sceneLoader.camera);
    const intersects = this.raycaster.intersectObjects(
      this.sceneLoader.components, 
      true
    );
    return intersects.length > 0 ? intersects[0] : null;
  }

  findComponentRoot(object) {
    let current = object;
    while (current && !current.userData?.componentId) {
      current = current.parent;
    }
    return current;
  }

  selectObject(object) {
    if (this.selectedObject === object) return;
    
    if (this.selectedObject) {
      this.unhighlightObject(this.selectedObject);
    }
    
    this.selectedObject = object;
    
    if (object) {
      this.highlightSelectedObject(object);
    }
  }

  deselectObject() {
    if (this.selectedObject) {
      this.unhighlightObject(this.selectedObject);
      this.selectedObject = null;
    }
  }

  highlightObject(object) {
    if (!object.userData.hoverMaterial) {
      object.userData.hoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.95
      });
    }
    
    object.traverse(child => {
      if (child.isMesh) {
        if (!child.userData.originalHoverMaterial) {
          child.userData.originalHoverMaterial = child.material;
        }
        child.material = object.userData.hoverMaterial.clone();
      }
    });
  }

  unhighlightObject(object) {
    object.traverse(child => {
      if (child.isMesh && child.userData.originalHoverMaterial) {
        child.material = child.userData.originalHoverMaterial;
      }
    });
  }

  highlightSelectedObject(object) {
    if (!object.userData.selectionMaterial) {
      object.userData.selectionMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9
      });
    }
    
    object.traverse(child => {
      if (child.isMesh) {
        if (!child.userData.originalSelectionMaterial) {
          child.userData.originalSelectionMaterial = child.material;
        }
        child.material = object.userData.selectionMaterial.clone();
      }
    });
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  getHoveredObject() {
    return this.hoveredObject;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  dispose() {
    const domElement = this.sceneLoader.renderer?.domElement;
    if (domElement) {
      domElement.removeEventListener('click', this.handleClick);
      domElement.removeEventListener('mousemove', this.handleMouseMove);
      domElement.removeEventListener('mousedown', this.handleMouseDown);
      domElement.removeEventListener('mouseup', this.handleMouseUp);
      domElement.removeEventListener('contextmenu', this.handleContextMenu);
      domElement.removeEventListener('mouseleave', this.handleMouseLeave);
    }
    
    this.selectedObject = null;
    this.hoveredObject = null;
  }
}

export default InteractionManager;
