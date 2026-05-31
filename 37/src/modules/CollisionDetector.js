import * as THREE from 'three';

class CollisionDetector {
  constructor() {
    this.collisions = [];
    this.isDetecting = false;
    this.onProgress = null;
    this.onComplete = null;
    this.tolerance = 50;
    this.precision = 'medium';
  }

  setTolerance(tolerance) {
    this.tolerance = tolerance;
  }

  setPrecision(precision) {
    this.precision = precision;
  }

  async detectCollisions(components, options = {}) {
    if (this.isDetecting) return [];
    
    this.isDetecting = true;
    this.collisions = [];
    const checkedPairs = new Set();
    
    const { 
      tolerance = this.tolerance, 
      precision = this.precision,
      layers = null,
      checkSameLayer = false
    } = options;

    let filteredComponents = components;
    if (layers) {
      filteredComponents = components.filter(c => layers.includes(c.userData.layer));
    }

    if (filteredComponents.length < 2) {
      this.isDetecting = false;
      return [];
    }

    const totalComponents = filteredComponents.length;
    let checkedCount = 0;
    let lastProgress = 0;

    const boxes = filteredComponents.map(comp => {
      const box = new THREE.Box3().setFromObject(comp);
      box.expandByScalar(tolerance * 0.5);
      return { 
        component: comp, 
        box, 
        userData: comp.userData,
        id: comp.userData.componentId
      };
    });

    const gridSize = this.getGridSize(precision);
    const grid = this.buildSpatialGrid(boxes, gridSize);

    for (let i = 0; i < totalComponents; i++) {
      const boxA = boxes[i];
      const nearbyBoxes = this.getNearbyBoxes(grid, boxA, gridSize);

      for (const boxB of nearbyBoxes) {
        if (boxA.component === boxB.component) continue;
        
        const pairKey = boxA.id < boxB.id ? `${boxA.id}_${boxB.id}` : `${boxB.id}_${boxA.id}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        
        if (!checkSameLayer && boxA.component.userData.layer === boxB.component.userData.layer) {
          continue;
        }

        const collision = this.checkCollision(boxA, boxB, tolerance, precision);
        
        if (collision) {
          this.collisions.push(collision);
        }
      }

      checkedCount++;
      const progress = Math.floor((checkedCount / totalComponents) * 100);
      if (progress !== lastProgress && this.onProgress) {
        this.onProgress(progress);
        lastProgress = progress;
      }

      if (i % 20 === 0) {
        await this.yieldToMainThread();
      }
    }

    this.collisions = this.removeDuplicateCollisions(this.collisions);
    
    this.collisions.sort((a, b) => b.depth - a.depth);
    
    this.isDetecting = false;
    
    if (this.onComplete) {
      this.onComplete(this.collisions);
    }

    return this.collisions;
  }

  removeDuplicateCollisions(collisions) {
    const unique = new Map();
    collisions.forEach(c => {
      if (!unique.has(c.id)) {
        unique.set(c.id, c);
      }
    });
    return Array.from(unique.values());
  }

  getGridSize(precision) {
    switch (precision) {
      case 'high': return 5;
      case 'medium': return 10;
      case 'low': return 20;
      default: return 10;
    }
  }

  buildSpatialGrid(boxes, gridSize) {
    const grid = new Map();

    boxes.forEach(boxData => {
      const minX = Math.floor(boxData.box.min.x / gridSize);
      const maxX = Math.floor(boxData.box.max.x / gridSize);
      const minY = Math.floor(boxData.box.min.y / gridSize);
      const maxY = Math.floor(boxData.box.max.y / gridSize);
      const minZ = Math.floor(boxData.box.min.z / gridSize);
      const maxZ = Math.floor(boxData.box.max.z / gridSize);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            const key = `${x},${y},${z}`;
            if (!grid.has(key)) {
              grid.set(key, []);
            }
            grid.get(key).push(boxData);
          }
        }
      }
    });

    return grid;
  }

  getNearbyBoxes(grid, boxData, gridSize) {
    const nearby = new Set();
    const minX = Math.floor(boxData.box.min.x / gridSize) - 1;
    const maxX = Math.floor(boxData.box.max.x / gridSize) + 1;
    const minY = Math.floor(boxData.box.min.y / gridSize) - 1;
    const maxY = Math.floor(boxData.box.max.y / gridSize) + 1;
    const minZ = Math.floor(boxData.box.min.z / gridSize) - 1;
    const maxZ = Math.floor(boxData.box.max.z / gridSize) + 1;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${y},${z}`;
          const cell = grid.get(key);
          if (cell) {
            cell.forEach(b => nearby.add(b));
          }
        }
      }
    }

    return Array.from(nearby);
  }

  checkCollision(boxA, boxB, tolerance, precision) {
    const detectionBoxA = boxA.box.clone().expandByScalar(tolerance);
    const detectionBoxB = boxB.box.clone().expandByScalar(tolerance);

    if (!detectionBoxA.intersectsBox(detectionBoxB)) {
      return null;
    }

    const actualIntersection = new THREE.Box3();
    actualIntersection.copy(boxA.box);
    actualIntersection.intersect(boxB.box);
    
    const isIntersecting = !actualIntersection.isEmpty();
    
    let depth = 0;
    if (isIntersecting) {
      depth = this.calculateCollisionDepth(boxA.box, boxB.box);
    } else {
      depth = -this.calculateDistance(boxA.box, boxB.box);
    }
    
    const effectiveDepth = depth + tolerance;
    if (effectiveDepth <= 0) {
      return null;
    }

    if (precision === 'high' && isIntersecting) {
      const preciseCollision = this.checkPreciseCollision(
        boxA.component, 
        boxB.component, 
        tolerance
      );
      if (!preciseCollision) return null;
      depth = preciseCollision.depth;
    }

    const center = new THREE.Vector3();
    if (isIntersecting) {
      actualIntersection.getCenter(center);
    } else {
      this.getMidPoint(boxA.box, boxB.box, center);
    }

    const type = depth > tolerance ? 'hard' : 'soft';

    return {
      id: `${boxA.userData.componentId}_${boxB.userData.componentId}`,
      componentA: boxA.userData,
      componentB: boxB.userData,
      objectA: boxA.component,
      objectB: boxB.component,
      position: center,
      depth: Math.max(0, effectiveDepth),
      type: type,
      isIntersecting: isIntersecting,
      intersectionBox: actualIntersection
    };
  }

  calculateDistance(boxA, boxB) {
    const dx = Math.max(0, boxA.min.x - boxB.max.x, boxB.min.x - boxA.max.x);
    const dy = Math.max(0, boxA.min.y - boxB.max.y, boxB.min.y - boxA.max.y);
    const dz = Math.max(0, boxA.min.z - boxB.max.z, boxB.min.z - boxA.max.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  getMidPoint(boxA, boxB, target) {
    const centerA = boxA.getCenter(new THREE.Vector3());
    const centerB = boxB.getCenter(new THREE.Vector3());
    target.copy(centerA).add(centerB).multiplyScalar(0.5);
    return target;
  }

  calculateCollisionDepth(boxA, boxB) {
    const overlapX = Math.min(boxA.max.x, boxB.max.x) - Math.max(boxA.min.x, boxB.min.x);
    const overlapY = Math.min(boxA.max.y, boxB.max.y) - Math.max(boxA.min.y, boxB.min.y);
    const overlapZ = Math.min(boxA.max.z, boxB.max.z) - Math.max(boxA.min.z, boxB.min.z);

    return Math.min(
      Math.max(0, overlapX),
      Math.max(0, overlapY),
      Math.max(0, overlapZ)
    );
  }

  checkPreciseCollision(objectA, objectB, tolerance) {
    const meshesA = [];
    const meshesB = [];

    objectA.traverse(child => {
      if (child.isMesh) meshesA.push(child);
    });
    objectB.traverse(child => {
      if (child.isMesh) meshesB.push(child);
    });

    let maxDepth = 0;
    let collisionFound = false;

    for (const meshA of meshesA) {
      for (const meshB of meshesB) {
        const depth = this.checkMeshCollision(meshA, meshB, tolerance);
        if (depth > 0) {
          collisionFound = true;
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    }

    return collisionFound ? { depth: maxDepth } : null;
  }

  checkMeshCollision(meshA, meshB, tolerance) {
    const boxA = new THREE.Box3().setFromObject(meshA);
    const boxB = new THREE.Box3().setFromObject(meshB);
    
    const expandedBoxA = boxA.clone().expandByScalar(tolerance);
    if (!expandedBoxA.intersectsBox(boxB)) {
      return 0;
    }

    return this.calculateCollisionDepth(boxA, boxB);
  }

  yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  getCollisionStats() {
    const hardCollisions = this.collisions.filter(c => c.type === 'hard').length;
    const softCollisions = this.collisions.filter(c => c.type === 'soft').length;
    
    return {
      total: this.collisions.length,
      hard: hardCollisions,
      soft: softCollisions
    };
  }

  getCollisionsByType(type) {
    return this.collisions.filter(c => c.type === type);
  }

  getCollisionsByLayer(layerId) {
    return this.collisions.filter(c => 
      c.componentA.layer === layerId || c.componentB.layer === layerId
    );
  }

  clear() {
    this.collisions = [];
    this.isDetecting = false;
  }
}

export default CollisionDetector;
