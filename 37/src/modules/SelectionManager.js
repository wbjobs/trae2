import * as THREE from 'three';

class SelectionManager {
  constructor(sceneLoader, container) {
    this.sceneLoader = sceneLoader;
    this.container = container;
    
    this.selectedObjects = new Set();
    this.annotations = new Map();
    
    this.isBoxSelecting = false;
    this.selectionStart = new THREE.Vector2();
    this.selectionEnd = new THREE.Vector2();
    
    this.onSelectionChange = null;
    this.onAnnotationAdd = null;
    this.onAnnotationRemove = null;
    
    this.selectionBoxElement = null;
    
    this.initSelectionBox();
  }

  initSelectionBox() {
    this.selectionBoxElement = document.createElement('div');
    this.selectionBoxElement.style.cssText = `
      position: absolute;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 100;
      display: none;
    `;
    this.container.appendChild(this.selectionBoxElement);
  }

  startBoxSelection(event) {
    this.isBoxSelecting = true;
    this.selectionStart.set(event.clientX, event.clientY);
    this.selectionEnd.set(event.clientX, event.clientY);
    
    this.selectionBoxElement.style.display = 'block';
    this.updateSelectionBox();
    
    if (!event.shiftKey && !event.ctrlKey) {
      this.clearSelection();
    }
  }

  updateBoxSelection(event) {
    if (!this.isBoxSelecting) return;
    
    this.selectionEnd.set(event.clientX, event.clientY);
    this.updateSelectionBox();
  }

  endBoxSelection(event) {
    if (!this.isBoxSelecting) return;
    
    this.isBoxSelecting = false;
    this.selectionBoxElement.style.display = 'none';
    
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
    
    if (width > 5 && height > 5) {
      this.performBoxSelection();
    }
  }

  updateSelectionBox() {
    const left = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const top = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
    
    const containerRect = this.container.getBoundingClientRect();
    this.selectionBoxElement.style.left = `${left - containerRect.left}px`;
    this.selectionBoxElement.style.top = `${top - containerRect.top}px`;
    this.selectionBoxElement.style.width = `${width}px`;
    this.selectionBoxElement.style.height = `${height}px`;
  }

  performBoxSelection() {
    const containerRect = this.container.getBoundingClientRect();
    
    const startNdc = this.screenToNdc(this.selectionStart, containerRect);
    const endNdc = this.screenToNdc(this.selectionEnd, containerRect);
    
    const minX = Math.min(startNdc.x, endNdc.x);
    const maxX = Math.max(startNdc.x, endNdc.x);
    const minY = Math.min(startNdc.y, endNdc.y);
    const maxY = Math.max(startNdc.y, endNdc.y);
    
    const camera = this.sceneLoader.camera;
    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    
    const components = this.sceneLoader.components.filter(c => c.visible);
    
    components.forEach(obj => {
      const center = new THREE.Vector3();
      obj.getWorldPosition(center);
      
      const screenPos = center.clone().project(camera);
      
      if (screenPos.x >= minX && screenPos.x <= maxX &&
          screenPos.y >= minY && screenPos.y <= maxY &&
          screenPos.z >= -1 && screenPos.z <= 1) {
        this.addToSelection(obj);
      }
    });
    
    this.notifySelectionChange();
  }

  screenToNdc(screen, containerRect) {
    return new THREE.Vector2(
      ((screen.x - containerRect.left) / containerRect.width) * 2 - 1,
      -((screen.y - containerRect.top) / containerRect.height) * 2 + 1
    );
  }

  addToSelection(object) {
    if (this.selectedObjects.has(object.userData.componentId)) return;
    
    this.selectedObjects.add(object.userData.componentId);
    this.highlightObject(object);
  }

  removeFromSelection(object) {
    if (!this.selectedObjects.has(object.userData.componentId)) return;
    
    this.selectedObjects.delete(object.userData.componentId);
    this.unhighlightObject(object);
  }

  toggleSelection(object) {
    if (this.selectedObjects.has(object.userData.componentId)) {
      this.removeFromSelection(object);
    } else {
      this.addToSelection(object);
    }
    this.notifySelectionChange();
  }

  clearSelection() {
    this.selectedObjects.forEach(id => {
      const obj = this.sceneLoader.componentMap.get(id);
      if (obj) {
        this.unhighlightObject(obj);
      }
    });
    this.selectedObjects.clear();
    this.notifySelectionChange();
  }

  highlightObject(object) {
    if (!object.userData.selectionMaterial) {
      object.userData.selectionMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.3
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

  unhighlightObject(object) {
    object.traverse(child => {
      if (child.isMesh && child.userData.originalSelectionMaterial) {
        child.material = child.userData.originalSelectionMaterial;
      }
    });
  }

  selectByLayer(layerId) {
    this.clearSelection();
    
    this.sceneLoader.components.forEach(obj => {
      if (obj.visible && obj.userData.layer === layerId) {
        this.addToSelection(obj);
      }
    });
    
    this.notifySelectionChange();
  }

  selectBySystem(system) {
    this.clearSelection();
    
    this.sceneLoader.components.forEach(obj => {
      if (obj.visible && obj.userData.system === system) {
        this.addToSelection(obj);
      }
    });
    
    this.notifySelectionChange();
  }

  getSelectedObjects() {
    return Array.from(this.selectedObjects).map(id => 
      this.sceneLoader.componentMap.get(id)
    ).filter(Boolean);
  }

  getSelectedCount() {
    return this.selectedObjects.size;
  }

  notifySelectionChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedObjects());
    }
  }

  addAnnotation(object, text, options = {}) {
    const id = `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const annotation = {
      id,
      objectId: object.userData.componentId,
      text,
      position: options.position || object.position.clone(),
      color: options.color || '#3b82f6',
      author: options.author || '当前用户',
      createdAt: new Date().toISOString(),
      type: options.type || 'note'
    };
    
    this.annotations.set(id, annotation);
    
    this.createAnnotationMarker(annotation);
    
    if (this.onAnnotationAdd) {
      this.onAnnotationAdd(annotation);
    }
    
    return annotation;
  }

  createAnnotationMarker(annotation) {
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(annotation.color),
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(annotation.position);
    marker.userData.annotationId = annotation.id;
    
    const ringGeometry = new THREE.RingGeometry(0.2, 0.25, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(annotation.color),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    marker.add(ring);
    
    this.sceneLoader.scene.add(marker);
    annotation.marker = marker;
  }

  removeAnnotation(annotationId) {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) return;
    
    if (annotation.marker) {
      this.sceneLoader.scene.remove(annotation.marker);
      annotation.marker.geometry?.dispose();
      annotation.marker.material?.dispose();
    }
    
    this.annotations.delete(annotationId);
    
    if (this.onAnnotationRemove) {
      this.onAnnotationRemove(annotationId);
    }
  }

  getAnnotations() {
    return Array.from(this.annotations.values());
  }

  getAnnotationsForObject(objectId) {
    return Array.from(this.annotations.values()).filter(
      a => a.objectId === objectId
    );
  }

  hideSelection() {
    this.getSelectedObjects().forEach(obj => {
      obj.visible = false;
    });
  }

  isolateSelection() {
    this.sceneLoader.components.forEach(obj => {
      obj.visible = this.selectedObjects.has(obj.userData.componentId);
    });
  }

  exportSelection() {
    return this.getSelectedObjects().map(obj => ({
      componentId: obj.userData.componentId,
      name: obj.userData.name,
      system: obj.userData.system,
      layer: obj.userData.layer
    }));
  }

  dispose() {
    this.clearSelection();
    this.annotations.forEach(anno => {
      if (anno.marker) {
        this.sceneLoader.scene.remove(anno.marker);
        anno.marker.geometry?.dispose();
        anno.marker.material?.dispose();
      }
    });
    this.annotations.clear();
    
    if (this.selectionBoxElement) {
      this.selectionBoxElement.remove();
    }
  }
}

export default SelectionManager;
