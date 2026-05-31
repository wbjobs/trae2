import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const vertexShader = /* glsl */`
  attribute vec3 customColor;
  attribute float lodLevel;
  attribute float selected;
  attribute float highlight;
  
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBasePointSize;
  uniform float uDistanceScale;
  uniform vec3  uCameraPos;
  
  varying vec3 vColor;
  varying float vSelected;
  varying float vHighlight;
  varying float vLodLevel;
  
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = length(uCameraPos - position);
    float sizeScale = 1.0 / (1.0 + dist * uDistanceScale * 0.001);
    gl_PointSize = uBasePointSize * uPixelRatio * sizeScale;
    gl_Position = projectionMatrix * mvPosition;
    
    vColor = customColor;
    vSelected = selected;
    vHighlight = highlight;
    vLodLevel = lodLevel;
  }
`;

const fragmentShader = /* glsl */`
  precision mediump float;
  
  uniform float uTime;
  uniform vec3 uHighlightColor;
  uniform vec3 uSelectedColor;
  
  varying vec3 vColor;
  varying float vSelected;
  varying float vHighlight;
  varying float vLodLevel;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;
    
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    
    vec3 color = vColor;
    
    if (vHighlight > 0.5) {
      float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
      color = mix(color, uHighlightColor, 0.4 + 0.4 * pulse);
      alpha = min(alpha + 0.3, 1.0);
    }
    
    if (vSelected > 0.5) {
      color = mix(color, uSelectedColor, 0.5);
    }
    
    gl_FragColor = vec4(color, alpha);
  }
`;

class PointCloudRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      backgroundColor: 0x1a1a2e,
      cameraPosition: { x: 0, y: -500, z: 300 },
      cameraFov: 60,
      near: 0.1,
      far: 10000,
      pointSize: 1,
      maxTotalPoints: 2000000,
      maxGPUMemoryMB: 256,
      bytesPerPoint: 32,
      lodColors: [
        [0.2, 0.4, 1.0],
        [0.3, 0.7, 1.0],
        [0.4, 1.0, 0.7],
        [1.0, 0.9, 0.4],
        [1.0, 0.5, 0.3],
        [1.0, 0.2, 0.2]
      ],
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.pointClouds = new Map();
    this.animationId = null;
    this._evictionCallbacks = [];
    this._highlightIds = new Set();
    this._selectedIds = new Set();
    this._lastFrameTime = 0;
    this._fpsHistory = [];
    this._loadingPaused = false;
    this._boxSelection = null;
    this._onBoxSelectionComplete = null;
    this._uniforms = null;
    this._isDragging = false;
    this._dragStart = null;
    this._dragEnd = null;
    this._selectionBoxMesh = null;

    this.stats = {
      totalPoints: 0,
      frameCount: 0,
      fps: 0,
      gpuMemoryMB: 0,
      evictedCount: 0,
      selectedCount: 0,
      highlightedCount: 0
    };

    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);

    this._initCamera();
    this._initRenderer();
    this._initControls();
    this._initLights();
    this._initGridHelper();
    this._initAxesHelper();
    this._initSelectionBox();

    this._uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBasePointSize: { value: this.options.pointSize },
      uDistanceScale: { value: 1.0 },
      uCameraPos: { value: new THREE.Vector3() },
      uHighlightColor: { value: new THREE.Color(0xffff00) },
      uSelectedColor: { value: new THREE.Color(0x00ffff) }
    };

    window.addEventListener('resize', () => this._onResize());
    this._initMouseInteraction();
    this._animate();
  }

  _initCamera() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera = new THREE.PerspectiveCamera(
      this.options.cameraFov,
      width / height,
      this.options.near,
      this.options.far
    );
    this.camera.position.set(
      this.options.cameraPosition.x,
      this.options.cameraPosition.y,
      this.options.cameraPosition.z
    );
    this.camera.lookAt(0, 0, 0);
  }

  _initRenderer() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.9;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 5000;
  }

  _initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    this.scene.add(directionalLight);
  }

  _initGridHelper() {
    const gridHelper = new THREE.GridHelper(2000, 100, 0x444444, 0x333333);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);
  }

  _initAxesHelper() {
    const axesHelper = new THREE.AxesHelper(100);
    this.scene.add(axesHelper);
  }

  _initSelectionBox() {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    const faceMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    this._selectionBoxMesh = new THREE.Group();
    const lineSegments = new THREE.LineSegments(edges, lineMaterial);
    const boxMesh = new THREE.Mesh(boxGeometry, faceMaterial);
    this._selectionBoxMesh.add(boxMesh);
    this._selectionBoxMesh.add(lineSegments);
    this._selectionBoxMesh.visible = false;
    this.scene.add(this._selectionBoxMesh);
  }

  _initMouseInteraction() {
    const dom = this.renderer.domElement;
    
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 && e.shiftKey) {
        this._isDragging = true;
        const rect = dom.getBoundingClientRect();
        this._dragStart = {
          x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
          clientX: e.clientX,
          clientY: e.clientY
        };
        this._dragEnd = { ...this._dragStart };
        this._showSelectionBoxPreview();
      }
    });
    
    dom.addEventListener('mousemove', (e) => {
      if (this._isDragging) {
        const rect = dom.getBoundingClientRect();
        this._dragEnd = {
          x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
          clientX: e.clientX,
          clientY: e.clientY
        };
        this._updateSelectionBoxPreview();
      }
    });
    
    dom.addEventListener('mouseup', (e) => {
      if (this._isDragging && e.button === 0) {
        this._isDragging = false;
        this._selectionBoxMesh.visible = false;
        
        if (this._onBoxSelectionComplete) {
          const bounds = this._getSelectionBoxWorldBounds();
          if (bounds) {
            this._onBoxSelectionComplete(bounds);
          }
        }
        this._dragStart = null;
        this._dragEnd = null;
      }
    });
  }

  _showSelectionBoxPreview() {
    this._selectionBoxMesh.visible = true;
    this._updateSelectionBoxPreview();
  }

  _updateSelectionBoxPreview() {
    if (!this._dragStart || !this._dragEnd || !this._selectionBoxMesh.visible) return;
    
    const bounds = this._getSelectionBoxWorldBounds();
    if (!bounds) return;
    
    const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const size = new THREE.Vector3(
      Math.max(maxX - minX, 0.1),
      Math.max(maxY - minY, 0.1),
      Math.max(maxZ - minZ, 0.1)
    );
    
    this._selectionBoxMesh.position.copy(center);
    this._selectionBoxMesh.scale.copy(size);
  }

  _getSelectionBoxWorldBounds() {
    if (!this._dragStart || !this._dragEnd) return null;
    
    const minXNDC = Math.min(this._dragStart.x, this._dragEnd.x);
    const maxXNDC = Math.max(this._dragStart.x, this._dragEnd.x);
    const minYNDC = Math.min(this._dragStart.y, this._dragEnd.y);
    const maxYNDC = Math.max(this._dragStart.y, this._dragEnd.y);
    
    const ndcToWorld = (nx, ny, z) => {
      const vec = new THREE.Vector3(nx, ny, z);
      vec.unproject(this.camera);
      return vec;
    };
    
    const nearPts = [
      ndcToWorld(minXNDC, minYNDC, -1),
      ndcToWorld(maxXNDC, minYNDC, -1),
      ndcToWorld(maxXNDC, maxYNDC, -1),
      ndcToWorld(minXNDC, maxYNDC, -1)
    ];
    const farPts = [
      ndcToWorld(minXNDC, minYNDC, 1),
      ndcToWorld(maxXNDC, minYNDC, 1),
      ndcToWorld(maxXNDC, maxYNDC, 1),
      ndcToWorld(minXNDC, maxYNDC, 1)
    ];
    
    const allPts = [...nearPts, ...farPts];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (const p of allPts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }
    
    return { minX, minY, minZ, maxX, maxY, maxY, maxZ };
  }

  onBoxSelection(callback) {
    this._onBoxSelectionComplete = callback;
  }

  getMemoryEstimateMB() {
    return (this.stats.totalPoints * this.options.bytesPerPoint) / (1024 * 1024);
  }

  _canAcceptPoints(pointCount) {
    const projectedPoints = this.stats.totalPoints + pointCount;
    const projectedMemory = (projectedPoints * this.options.bytesPerPoint) / (1024 * 1024);
    
    if (projectedPoints > this.options.maxTotalPoints) {
      return false;
    }
    
    if (projectedMemory > this.options.maxGPUMemoryMB) {
      return false;
    }
    
    return true;
  }

  _evictToMakeRoom(neededPoints) {
    const evictionTarget = Math.ceil(neededPoints * 1.5);
    let evictedPoints = 0;
    const sortedEntries = Array.from(this.pointClouds.entries())
      .filter(([id]) => !id.startsWith('sample_'))
      .sort((a, b) => {
        const distA = this._getDistanceToCamera(a[1]);
        const distB = this._getDistanceToCamera(b[1]);
        return distB - distA;
      });
    
    for (const [layerId, pointCloud] of sortedEntries) {
      if (evictedPoints >= evictionTarget) break;
      const pointCount = pointCloud.userData.pointCount;
      
      console.log(`Evicting tile ${layerId} (${pointCount.toLocaleString()} pts) to free memory`);
      this.removePointCloud(layerId);
      evictedPoints += pointCount;
      
      for (const cb of this._evictionCallbacks) {
        try { cb(layerId); } catch (e) {}
      }
    }
    
    this.stats.evictedCount += evictedPoints;
    return evictedPoints;
  }

  _getDistanceToCamera(pointCloud) {
    const bbox = new THREE.Box3().setFromObject(pointCloud);
    const center = bbox.getCenter(new THREE.Vector3());
    return center.distanceTo(this.camera.position);
  }

  onEvict(callback) {
    this._evictionCallbacks.push(callback);
  }

  _getLodColor(lod) {
    const colors = this.options.lodColors;
    const idx = Math.min(lod, colors.length - 1);
    return colors[idx];
  }

  _computeDistanceFactor(pointCloud) {
    const dist = this._getDistanceToCamera(pointCloud);
    const near = this.controls.minDistance;
    const far = this.controls.maxDistance;
    return THREE.MathUtils.clamp((dist - near) / (far - near), 0, 1);
  }

  addPointCloud(layerId, pointsData, options = {}) {
    const { points, colors, normals, intensities, lod } = pointsData;
    
    if (!points || points.length === 0) {
      return null;
    }

    const pointCount = points.length / 3;

    if (!this._canAcceptPoints(pointCount)) {
      const evicted = this._evictToMakeRoom(pointCount);
      if (!this._canAcceptPoints(pointCount)) {
        console.warn(
          `Cannot load tile ${layerId}: still exceeds memory limit after evicting ${evicted.toLocaleString()} pts. ` +
          `Current: ${this.stats.totalPoints.toLocaleString()}, need: ${pointCount.toLocaleString()}`
        );
        return null;
      }
    }

    if (this.pointClouds.has(layerId)) {
      this.removePointCloud(layerId);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

    const customColors = new Float32Array(pointCount * 3);
    const lodLevels = new Float32Array(pointCount);
    const selectedFlags = new Float32Array(pointCount);
    const highlightFlags = new Float32Array(pointCount);
    
    const lodLevel = lod !== undefined ? lod : 0;
    const lodColor = this._getLodColor(lodLevel);
    
    if (colors && colors.length > 0) {
      for (let i = 0; i < pointCount; i++) {
        customColors[i * 3] = colors[i * 3];
        customColors[i * 3 + 1] = colors[i * 3 + 1];
        customColors[i * 3 + 2] = colors[i * 3 + 2];
        lodLevels[i] = lodLevel;
      }
    } else {
      for (let i = 0; i < pointCount; i++) {
        customColors[i * 3] = lodColor[0];
        customColors[i * 3 + 1] = lodColor[1];
        customColors[i * 3 + 2] = lodColor[2];
        lodLevels[i] = lodLevel;
      }
    }
    
    if (options.color && (!colors || colors.length === 0)) {
      for (let i = 0; i < pointCount; i++) {
        customColors[i * 3] = options.color[0] / 255;
        customColors[i * 3 + 1] = options.color[1] / 255;
        customColors[i * 3 + 2] = options.color[2] / 255;
      }
    }
    
    geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(customColors, 3));
    geometry.setAttribute('lodLevel', new THREE.Float32BufferAttribute(lodLevels, 1));
    geometry.setAttribute('selected', new THREE.Float32BufferAttribute(selectedFlags, 1));
    geometry.setAttribute('highlight', new THREE.Float32BufferAttribute(highlightFlags, 1));

    if (normals && normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }

    if (intensities && intensities.length > 0) {
      geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(intensities, 1));
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this._uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      vertexColors: false
    });

    const pointCloud = new THREE.Points(geometry, material);
    pointCloud.userData = {
      layerId,
      pointCount,
      options,
      lod: lodLevel,
      addedAt: Date.now(),
      _selectedSet: new Set(),
      _highlightedSet: new Set()
    };
    pointCloud.visible = options.visible !== undefined ? options.visible : true;

    this.scene.add(pointCloud);
    this.pointClouds.set(layerId, pointCloud);
    this.stats.totalPoints += pointCount;
    this.stats.gpuMemoryMB = this.getMemoryEstimateMB();

    return pointCloud;
  }

  _applyAttributeUpdates(pointCloud) {
    const geo = pointCloud.geometry;
    if (!geo.attributes) return;
    
    const selAttr = geo.attributes.selected;
    const hiAttr = geo.attributes.highlight;
    const selSet = pointCloud.userData._selectedSet;
    const hiSet = pointCloud.userData._highlightedSet;
    
    if (selAttr) {
      const selArr = selAttr.array;
      for (let i = 0; i < selArr.length; i++) {
        selArr[i] = selSet.has(i) ? 1.0 : 0.0;
      }
      selAttr.needsUpdate = true;
    }
    
    if (hiAttr) {
      const hiArr = hiAttr.array;
      for (let i = 0; i < hiArr.length; i++) {
        hiArr[i] = hiSet.has(i) ? 1.0 : 0.0;
      }
      hiAttr.needsUpdate = true;
    }
  }

  highlightPoints(layerId, indices, pulse = true) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) return;
    
    const hiSet = pointCloud.userData._highlightedSet;
    for (const idx of indices) {
      hiSet.add(idx);
      this._highlightIds.add(`${layerId}_${idx}`);
    }
    this._applyAttributeUpdates(pointCloud);
    this.stats.highlightedCount += indices.length;
  }

  unhighlightPoints(layerId, indices) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) return;
    
    const hiSet = pointCloud.userData._highlightedSet;
    for (const idx of indices) {
      hiSet.delete(idx);
      this._highlightIds.delete(`${layerId}_${idx}`);
    }
    this._applyAttributeUpdates(pointCloud);
    this.stats.highlightedCount = Math.max(0, this.stats.highlightedCount - indices.length);
  }

  clearHighlights() {
    for (const [layerId, pointCloud] of this.pointClouds) {
      pointCloud.userData._highlightedSet.clear();
      this._applyAttributeUpdates(pointCloud);
    }
    this._highlightIds.clear();
    this.stats.highlightedCount = 0;
  }

  selectPoints(layerId, indices) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) return;
    
    const selSet = pointCloud.userData._selectedSet;
    for (const idx of indices) {
      selSet.add(idx);
      this._selectedIds.add(`${layerId}_${idx}`);
    }
    this._applyAttributeUpdates(pointCloud);
    this.stats.selectedCount += indices.length;
  }

  deselectPoints(layerId, indices) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) return;
    
    const selSet = pointCloud.userData._selectedSet;
    for (const idx of indices) {
      selSet.delete(idx);
      this._selectedIds.delete(`${layerId}_${idx}`);
    }
    this._applyAttributeUpdates(pointCloud);
    this.stats.selectedCount = Math.max(0, this.stats.selectedCount - indices.length);
  }

  clearSelection() {
    for (const [layerId, pointCloud] of this.pointClouds) {
      pointCloud.userData._selectedSet.clear();
      this._applyAttributeUpdates(pointCloud);
    }
    this._selectedIds.clear();
    this.stats.selectedCount = 0;
  }

  getSelectedPoints() {
    const result = {};
    for (const [layerId, pointCloud] of this.pointClouds) {
      const selSet = pointCloud.userData._selectedSet;
      if (selSet.size > 0) {
        result[layerId] = Array.from(selSet);
      }
    }
    return result;
  }

  selectByBounds(bounds) {
    const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
    
    for (const [layerId, pointCloud] of this.pointClouds) {
      if (!pointCloud.visible) continue;
      
      const posAttr = pointCloud.geometry.attributes.position;
      if (!posAttr) continue;
      
      const indices = [];
      const posArr = posAttr.array;
      
      for (let i = 0; i < posArr.length; i += 3) {
        const x = posArr[i];
        const y = posArr[i + 1];
        const z = posArr[i + 2];
        
        if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) {
          indices.push(i / 3);
        }
      }
      
      if (indices.length > 0) {
        this.selectPoints(layerId, indices);
      }
    }
    
    return this.getSelectedPoints();
  }

  filterByAttribute(layerId, attributeName, min, max) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) return [];
    
    const attr = pointCloud.geometry.attributes[attributeName];
    if (!attr) return [];
    
    const indices = [];
    const arr = attr.array;
    const stride = attr.itemSize;
    
    for (let i = 0; i < arr.length; i += stride) {
      const val = arr[i];
      if (val >= min && val <= max) {
        indices.push(i / stride);
      }
    }
    
    return indices;
  }

  highlightByAttribute(layerId, attributeName, min, max) {
    const indices = this.filterByAttribute(layerId, attributeName, min, max);
    this.highlightPoints(layerId, indices);
    return indices;
  }

  isolateSelection() {
    for (const [layerId, pointCloud] of this.pointClouds) {
      const selSet = pointCloud.userData._selectedSet;
      const hasSelection = selSet.size > 0;
      
      const hiSet = pointCloud.userData._highlightedSet;
      const hasHighlight = hiSet.size > 0;
      
      if (hasSelection || hasHighlight) {
        pointCloud.visible = true;
      } else {
        pointCloud.visible = false;
      }
    }
  }

  restoreVisibility() {
    for (const [layerId, pointCloud] of this.pointClouds) {
      pointCloud.visible = true;
    }
  }

  updatePointCloud(layerId, pointsData) {
    const pointCloud = this.pointClouds.get(layerId);
    if (!pointCloud) {
      return this.addPointCloud(layerId, pointsData);
    }

    const { points, colors, normals, intensities } = pointsData;
    const geometry = pointCloud.geometry;

    if (points) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.attributes.position.needsUpdate = true;
      
      const pointCount = points.length / 3;
      const customColors = new Float32Array(pointCount * 3);
      const lodLevels = new Float32Array(pointCount);
      const selectedFlags = new Float32Array(pointCount);
      const highlightFlags = new Float32Array(pointCount);
      
      if (colors && colors.length > 0) {
        for (let i = 0; i < pointCount; i++) {
          customColors[i * 3] = colors[i * 3];
          customColors[i * 3 + 1] = colors[i * 3 + 1];
          customColors[i * 3 + 2] = colors[i * 3 + 2];
        }
      }
      
      geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(customColors, 3));
      geometry.setAttribute('lodLevel', new THREE.Float32BufferAttribute(lodLevels, 1));
      geometry.setAttribute('selected', new THREE.Float32BufferAttribute(selectedFlags, 1));
      geometry.setAttribute('highlight', new THREE.Float32BufferAttribute(highlightFlags, 1));
    }

    if (normals) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.attributes.normal.needsUpdate = true;
    }

    if (intensities) {
      geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(intensities, 1));
      geometry.attributes.intensity.needsUpdate = true;
    }

    geometry.computeBoundingSphere();
    pointCloud.userData.pointCount = points ? points.length / 3 : pointCloud.userData.pointCount;

    return pointCloud;
  }

  removePointCloud(layerId) {
    const pointCloud = this.pointClouds.get(layerId);
    if (pointCloud) {
      this.scene.remove(pointCloud);
      this._disposePointCloud(pointCloud);
      this.stats.totalPoints -= pointCloud.userData.pointCount;
      this.stats.gpuMemoryMB = this.getMemoryEstimateMB();
      this.pointClouds.delete(layerId);
      return true;
    }
    return false;
  }

  _disposePointCloud(pointCloud) {
    const geometry = pointCloud.geometry;
    if (geometry) {
      if (geometry.attributes) {
        for (const attrName in geometry.attributes) {
          const attr = geometry.attributes[attrName];
          if (attr && attr.array) {
            attr.array = null;
          }
          if (attr && attr.dispose) {
            attr.dispose();
          }
        }
      }
      if (geometry.index) {
        geometry.index.array = null;
        geometry.index.dispose();
      }
      geometry.dispose();
    }
    if (pointCloud.material) {
      pointCloud.material.dispose();
    }
  }

  setLayerVisibility(layerId, visible) {
    const pointCloud = this.pointClouds.get(layerId);
    if (pointCloud) {
      pointCloud.visible = visible;
      return true;
    }
    return false;
  }

  setLayerOpacity(layerId, opacity) {
    const pointCloud = this.pointClouds.get(layerId);
    if (pointCloud) {
      pointCloud.material.transparent = opacity < 1;
      pointCloud.material.needsUpdate = true;
      return true;
    }
    return false;
  }

  setLayerPointSize(layerId, size) {
    this._uniforms.uBasePointSize.value = size;
    return true;
  }

  setLayerColor(layerId, color) {
    const pointCloud = this.pointClouds.get(layerId);
    if (pointCloud) {
      const customColor = pointCloud.geometry.attributes.customColor;
      if (customColor) {
        const arr = customColor.array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] = color[0] / 255;
          arr[i + 1] = color[1] / 255;
          arr[i + 2] = color[2] / 255;
        }
        customColor.needsUpdate = true;
      }
      return true;
    }
    return false;
  }

  setHighlightColor(hexColor) {
    this._uniforms.uHighlightColor.value = new THREE.Color(hexColor);
  }

  setSelectedColor(hexColor) {
    this._uniforms.uSelectedColor.value = new THREE.Color(hexColor);
  }

  getViewBounds() {
    const position = this.camera.position;
    const distance = this.controls.getDistance();
    const fov = this.camera.fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * this.camera.aspect;

    return {
      minX: position.x - width / 2,
      maxX: position.x + width / 2,
      minY: position.y - height / 2,
      maxY: position.y + height / 2,
      minZ: position.z - distance,
      maxZ: position.z + distance
    };
  }

  getViewBoundsExpanded(factor = 1.3) {
    const bounds = this.getViewBounds();
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const halfW = (bounds.maxX - bounds.minX) / 2 * factor;
    const halfH = (bounds.maxY - bounds.minY) / 2 * factor;
    const halfD = (bounds.maxZ - bounds.minZ) / 2 * factor;
    return {
      minX: centerX - halfW,
      maxX: centerX + halfW,
      minY: centerY - halfH,
      maxY: centerY + halfH,
      minZ: centerZ - halfD,
      maxZ: centerZ + halfD
    };
  }

  getCurrentLodLevel() {
    const distance = this.controls.getDistance();
    if (distance < 50) return 5;
    if (distance < 150) return 4;
    if (distance < 300) return 3;
    if (distance < 600) return 2;
    if (distance < 1000) return 1;
    return 0;
  }

  predictPreloadBounds() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const bounds = this.getViewBounds();
    const distance = this.controls.getDistance();
    const fov = this.camera.fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * this.camera.aspect;
    const forward = dir.clone().multiplyScalar(distance * 0.5);
    
    return {
      minX: bounds.minX + forward.x - width * 0.3,
      maxX: bounds.maxX + forward.x + width * 0.3,
      minY: bounds.minY + forward.y - height * 0.3,
      maxY: bounds.maxY + forward.y + height * 0.3,
      minZ: bounds.minZ + forward.z - distance * 0.3,
      maxZ: bounds.maxZ + forward.z + distance * 0.3
    };
  }

  raycast(screenX, screenY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    raycaster.params.Points.threshold = 5;

    const intersects = raycaster.intersectObjects(
      Array.from(this.pointClouds.values()),
      true
    );

    return intersects.map(intersect => ({
      point: intersect.point,
      layerId: intersect.object.userData.layerId,
      index: intersect.index,
      distance: intersect.distance
    }));
  }

  zoomToBounds(bounds) {
    const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const size = new THREE.Vector3(
      maxX - minX,
      maxY - minY,
      maxZ - minZ
    );
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2));

    const direction = new THREE.Vector3(0, -1, 0.5).normalize();
    this.camera.position.copy(center).add(direction.multiplyScalar(distance * 1.5));
    this.controls.target.copy(center);
    this.controls.update();
  }

  resetView() {
    this.camera.position.set(
      this.options.cameraPosition.x,
      this.options.cameraPosition.y,
      this.options.cameraPosition.z
    );
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  _onResize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this._uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  }

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    
    const now = performance.now();
    const delta = now - (this._lastFrameTime || now);
    this._lastFrameTime = now;
    
    if (delta > 0) {
      const instantFps = 1000 / delta;
      this._fpsHistory.push(instantFps);
      if (this._fpsHistory.length > 30) this._fpsHistory.shift();
      
      this.stats.fps = Math.round(
        this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length
      );
      
      this._loadingPaused = this.stats.fps < 20;
    }
    
    this._uniforms.uTime.value = now * 0.001;
    this._uniforms.uCameraPos.value.copy(this.camera.position);
    
    this.renderer.render(this.scene, this.camera);

    this.stats.frameCount++;
  }

  isLoadingPaused() {
    return this._loadingPaused;
  }

  getStats() {
    return {
      ...this.stats,
      layerCount: this.pointClouds.size,
      maxTotalPoints: this.options.maxTotalPoints,
      maxGPUMemoryMB: this.options.maxGPUMemoryMB,
      loadingPaused: this._loadingPaused,
      layers: Array.from(this.pointClouds.entries()).map(([id, pc]) => ({
        id,
        pointCount: pc.userData.pointCount,
        visible: pc.visible,
        lod: pc.userData.lod,
        selectedCount: pc.userData._selectedSet ? pc.userData._selectedSet.size : 0,
        highlightedCount: pc.userData._highlightedSet ? pc.userData._highlightedSet.size : 0,
        addedAt: pc.userData.addedAt
      }))
    };
  }

  clearAll() {
    this.pointClouds.forEach((_, layerId) => {
      this.removePointCloud(layerId);
    });
    this._highlightIds.clear();
    this._selectedIds.clear();
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.clearAll();
    this.controls.dispose();
    this.renderer.dispose();
    window.removeEventListener('resize', () => this._onResize());
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

export default PointCloudRenderer;
