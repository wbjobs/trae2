class LevelEditor {
  constructor(network, storage) {
    this.network = network;
    this.storage = storage;
    this.active = false;
    this.editingLevel = null;
    this.selectedPartType = null;
    this.draggingNewPart = false;
    this.placingPart = null;
    this.ghostMesh = null;

    this.partTypes = [
      { type: 'box', name: '方块', model: 'box', size: { x: 2, y: 2, z: 2 }, color: 0x888888 },
      { type: 'cylinder', name: '圆柱', model: 'cylinder', size: { x: 2, y: 3, z: 2 }, color: 0x777777 },
      { type: 'sphere', name: '球体', model: 'sphere', size: { x: 2, y: 2, z: 2 }, color: 0x999999 },
      { type: 'boiler', name: '锅炉', model: 'cylinder', size: { x: 3, y: 4, z: 3 }, color: 0x8B4513 },
      { type: 'pipe', name: '管道', model: 'cylinder', size: { x: 1, y: 2, z: 1 }, color: 0x708090 },
      { type: 'cylinder', name: '汽缸', model: 'box', size: { x: 4, y: 3, z: 3 }, color: 0x4682B4 },
      { type: 'piston', name: '活塞', model: 'cylinder', size: { x: 2, y: 1, z: 1 }, color: 0xA9A9A9 },
      { type: 'gear', name: '齿轮', model: 'cylinder', size: { x: 2, y: 0.5, z: 2 }, color: 0xCD853F, teeth: 20 },
      { type: 'shaft', name: '轴', model: 'cylinder', size: { x: 0.5, y: 4, z: 0.5 }, color: 0xC0C0C0 },
      { type: 'frame', name: '框架', model: 'box', size: { x: 10, y: 1, z: 4 }, color: 0x696969 },
      { type: 'flywheel', name: '飞轮', model: 'cylinder', size: { x: 3, y: 0.5, z: 3 }, color: 0x2F4F4F },
      { type: 'wheel', name: '轮子', model: 'cylinder', size: { x: 2, y: 2, z: 2 }, color: 0x4A4A4A }
    ];

    this.partsLibrary = [];
    this.connections = [];
  }

  activate(renderer) {
    this.active = true;
    this.renderer = renderer;
    this.createUI();
  }

  deactivate() {
    this.active = false;
    this.removeUI();
    this.clearGhostMesh();
  }

  createUI() {
    if (document.getElementById('editor-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'editor-panel';
    panel.className = 'editor-panel';
    panel.innerHTML = `
      <div class="editor-header">
        <h3>🔧 关卡编辑器</h3>
        <button id="close-editor" class="btn-close">✕</button>
      </div>
      <div class="editor-content">
        <div class="editor-section">
          <label>关卡名称</label>
          <input type="text" id="editor-level-name" placeholder="输入关卡名称">
        </div>
        <div class="editor-section">
          <label>关卡描述</label>
          <textarea id="editor-level-desc" placeholder="描述关卡内容" rows="2"></textarea>
        </div>
        <div class="editor-section">
          <label>难度等级</label>
          <select id="editor-difficulty">
            <option value="1">简单</option>
            <option value="2">中等</option>
            <option value="3">困难</option>
          </select>
        </div>
        <div class="editor-section">
          <label>零件库</label>
          <div class="part-library" id="part-library"></div>
        </div>
        <div class="editor-section">
          <label>操作</label>
          <div class="editor-actions">
            <button id="btn-clear-parts" class="btn btn-warning">清空零件</button>
            <button id="btn-export-level" class="btn btn-primary">导出关卡</button>
            <button id="btn-save-local" class="btn btn-secondary">保存到本地</button>
          </div>
        </div>
        <div class="editor-section">
          <label>操作说明</label>
          <small class="text-muted">
            • 点击零件库添加零件<br>
            • 拖动零件调整位置<br>
            • 滚轮旋转零件<br>
            • Shift+滚轮调整高度<br>
            • 右键取消选择
          </small>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.populatePartLibrary();
    this.bindEvents();
  }

  populatePartLibrary() {
    const library = document.getElementById('part-library');
    if (!library) return;

    library.innerHTML = this.partTypes.map(pt => `
      <div class="part-item" data-type="${pt.type}" data-model="${pt.model}">
        <div class="part-icon" style="background: #${pt.color.toString(16).padStart(6, '0')}"></div>
        <span>${pt.name}</span>
      </div>
    `).join('');
  }

  bindEvents() {
    document.getElementById('close-editor')?.addEventListener('click', () => {
      this.deactivate();
    });

    document.querySelectorAll('.part-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const model = item.dataset.model;
        this.addPart(type, model);
      });
    });

    document.getElementById('btn-clear-parts')?.addEventListener('click', () => {
      if (confirm('确定要清空所有零件吗？')) {
        this.clearAllParts();
      }
    });

    document.getElementById('btn-export-level')?.addEventListener('click', () => {
      this.exportLevel();
    });

    document.getElementById('btn-save-local')?.addEventListener('click', () => {
      this.saveToLocal();
    });

    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('contextmenu', (e) => {
      if (this.active) {
        e.preventDefault();
        this.cancelPlacing();
      }
    });
  }

  handleKeyDown(e) {
    if (!this.active) return;

    if (e.key === 'Escape') {
      this.cancelPlacing();
    }
    if (e.key === 'Delete' && this.renderer?.selectedPart) {
      this.deleteSelectedPart();
    }
  }

  addPart(type, model) {
    const typeConfig = this.partTypes.find(pt => pt.type === type);
    if (!typeConfig) return;

    const partId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const partData = {
      id: partId,
      name: typeConfig.name,
      type: typeConfig.type,
      model: typeConfig.model,
      position: { x: 0, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 2, z: 0 },
      targetRotation: { x: 0, y: 0, z: 0 },
      snapPoints: [],
      connections: [],
      initialState: 'disassembled',
      isKey: false,
      properties: {
        color: typeConfig.color,
        size: { ...typeConfig.size },
        teeth: typeConfig.teeth
      }
    };

    this.placingPart = partData;
    this.createGhostMesh(partData);

    this.showNotification('移动鼠标放置零件，点击确认，右键取消', 'info');
  }

  createGhostMesh(partData) {
    this.clearGhostMesh();

    const size = partData.properties.size;
    let geometry;

    switch (partData.model) {
      case 'box':
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(
          Math.max(size.x, size.z) / 2,
          Math.max(size.x, size.z) / 2,
          size.y,
          24
        );
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(Math.max(size.x, size.y, size.z) / 2, 24, 24);
        break;
      default:
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    }

    const material = new THREE.MeshStandardMaterial({
      color: partData.properties.color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });

    this.ghostMesh = new THREE.Mesh(geometry, material);
    this.ghostMesh.position.set(0, 2, 0);

    if (this.renderer?.scene) {
      this.renderer.scene.add(this.ghostMesh);
    }

    this.ghostMoveHandler = (e) => this.updateGhostPosition(e);
    this.ghostClickHandler = (e) => this.confirmPlacement(e);

    document.addEventListener('mousemove', this.ghostMoveHandler);
    document.addEventListener('click', this.ghostClickHandler);
  }

  updateGhostPosition(event) {
    if (!this.ghostMesh || !this.renderer) return;

    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.renderer.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);

    if (intersectPoint) {
      this.ghostMesh.position.copy(intersectPoint);
      this.ghostMesh.position.y = 1;
    }
  }

  confirmPlacement(event) {
    if (!this.placingPart || !this.ghostMesh) return;

    this.placingPart.position = {
      x: this.ghostMesh.position.x,
      y: this.ghostMesh.position.y,
      z: this.ghostMesh.position.z
    };
    this.placingPart.targetPosition = { ...this.placingPart.position };

    if (this.renderer) {
      this.renderer.addPart(this.placingPart);
    }

    this.partsLibrary.push(this.placingPart);
    this.cancelPlacing();
    this.showNotification(`已添加 ${this.placingPart.name}`, 'success');
  }

  cancelPlacing() {
    this.placingPart = null;
    this.clearGhostMesh();

    if (this.ghostMoveHandler) {
      document.removeEventListener('mousemove', this.ghostMoveHandler);
      this.ghostMoveHandler = null;
    }
    if (this.ghostClickHandler) {
      document.removeEventListener('click', this.ghostClickHandler);
      this.ghostClickHandler = null;
    }
  }

  clearGhostMesh() {
    if (this.ghostMesh && this.renderer?.scene) {
      this.renderer.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry?.dispose();
      this.ghostMesh.material?.dispose();
      this.ghostMesh = null;
    }
  }

  deleteSelectedPart() {
    if (!this.renderer?.selectedPart) return;

    const partId = this.renderer.selectedPart;
    this.renderer.removePart(partId);
    this.partsLibrary = this.partsLibrary.filter(p => p.id !== partId);
    this.showNotification('零件已删除', 'info');
  }

  clearAllParts() {
    if (this.renderer) {
      this.partsLibrary.forEach(p => {
        this.renderer.removePart(p.id);
      });
    }
    this.partsLibrary = [];
    this.connections = [];
  }

  addSnapPoint(partId, position, connectsTo = null) {
    const part = this.partsLibrary.find(p => p.id === partId);
    if (!part) return;

    const snapId = `snap_${partId}_${part.snapPoints.length}`;
    part.snapPoints.push({
      id: snapId,
      position: { ...position },
      connectsTo
    });

    this.showNotification('吸附点已添加', 'success');
  }

  addConnection(partId1, partId2) {
    const part1 = this.partsLibrary.find(p => p.id === partId1);
    const part2 = this.partsLibrary.find(p => p.id === partId2);

    if (part1 && part2) {
      if (!part1.connections.includes(partId2)) {
        part1.connections.push(partId2);
      }
      if (!part2.connections.includes(partId1)) {
        part2.connections.push(partId1);
      }
      this.showNotification('连接已建立', 'success');
    }
  }

  exportLevel() {
    const levelData = this.generateLevelData();
    const dataStr = JSON.stringify(levelData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${levelData.id || 'custom-level'}.json`;
    link.click();

    URL.revokeObjectURL(url);
    this.showNotification('关卡已导出', 'success');
  }

  generateLevelData() {
    const name = document.getElementById('editor-level-name')?.value || '自定义关卡';
    const desc = document.getElementById('editor-level-desc')?.value || '';
    const difficulty = parseInt(document.getElementById('editor-difficulty')?.value || '1');

    return {
      id: `custom_${Date.now()}`,
      name,
      description: desc,
      difficulty,
      parts: this.partsLibrary.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        model: p.model,
        position: { ...p.position },
        rotation: { ...p.rotation },
        targetPosition: { ...p.targetPosition },
        targetRotation: { ...p.targetRotation },
        snapPoints: p.snapPoints,
        connections: p.connections,
        initialState: p.initialState,
        isKey: p.isKey,
        properties: { ...p.properties }
      }))
    };
  }

  saveToLocal() {
    const levelData = this.generateLevelData();
    const savedLevels = this.storage.getCustomLevels();
    savedLevels.push(levelData);
    this.storage.saveCustomLevels(savedLevels);
    this.showNotification('关卡已保存到本地', 'success');
  }

  loadLevel(levelData) {
    if (this.renderer) {
      this.clearAllParts();
      levelData.parts.forEach(part => {
        this.renderer.addPart(part);
        this.partsLibrary.push({ ...part });
      });

      document.getElementById('editor-level-name').value = levelData.name;
      document.getElementById('editor-level-desc').value = levelData.description;
      document.getElementById('editor-difficulty').value = levelData.difficulty.toString();
    }
  }

  removeUI() {
    const panel = document.getElementById('editor-panel');
    if (panel) {
      panel.remove();
    }
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.cancelPlacing();
  }

  showNotification(message, type = 'info') {
    const event = new CustomEvent('showNotification', {
      detail: { message, type }
    });
    document.dispatchEvent(event);
  }

  toggle(renderer) {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate(renderer);
    }
    return this.active;
  }
}

window.LevelEditor = LevelEditor;
