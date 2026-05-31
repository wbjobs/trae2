class AnimationController {
  constructor(gameClient) {
    this.gameClient = gameClient;
    this.animationSystem = new AnimationSystem();
    this.compressor = new NetworkCompressor();
    this.predictedStates = new Map();
    this.usePrediction = true;
    this.useCompression = true;
  }

  setAnimation(partId, type, config) {
    this.animationSystem.setAnimationForPart(partId, type, config);
    this.gameClient.socket.emit('set-animation', { partId, type, config });
  }

  startAnimations() {
    this.animationSystem.start();
    this.gameClient.socket.emit('start-animations');
  }

  stopAnimations() {
    this.animationSystem.stop();
    this.gameClient.socket.emit('stop-animations');
  }

  setSpeed(speed) {
    this.animationSystem.setSpeed(speed);
    this.gameClient.socket.emit('set-animation-speed', { speed });
  }

  updateLocal(deltaTime) {
    if (!this.animationSystem.isRunning) return;

    this.animationSystem.updateAll(
      deltaTime,
      (partId) => {
        const mesh = this.gameClient.partRenderer.getPartMesh(partId);
        if (mesh) {
          return {
            position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }
          };
        }
        return null;
      },
      (partId, state) => {
        const mesh = this.gameClient.partRenderer.getPartMesh(partId);
        if (mesh) {
          if (state.position) {
            mesh.position.set(state.position.x, state.position.y, state.position.z);
          }
          if (state.rotation) {
            mesh.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
          }
        }
      }
    );
  }

  predictMovement(partId, velocity, deltaTime) {
    if (!this.usePrediction) return;

    const state = this.predictedStates.get(partId);
    if (!state) return;

    const predictedPos = {
      x: state.position.x + velocity.x * deltaTime,
      y: state.position.y + velocity.y * deltaTime,
      z: state.position.z + velocity.z * deltaTime
    };

    const mesh = this.gameClient.partRenderer.getPartMesh(partId);
    if (mesh) {
      mesh.position.lerp(new THREE.Vector3(predictedPos.x, predictedPos.y, predictedPos.z), 0.1);
    }
  }

  handleCompressedStateUpdate(data) {
    if (!data) return;

    data.p.forEach(compressedPart => {
      const partState = this.compressor.decompressPartState(compressedPart);
      this.updatePartFromState(partState);
    });
  }

  handleDeltaStateUpdate(data) {
    if (!data || !data.c) return;

    data.c.forEach(change => {
      switch (change.type) {
        case 'add':
        case 'update':
          const partState = this.compressor.decompressPartState(change.state);
          this.updatePartFromState(partState);
          break;
        case 'remove':
          this.gameClient.partRenderer.removePart(change.id);
          break;
      }
    });
  }

  updatePartFromState(partState) {
    const mesh = this.gameClient.partRenderer.getPartMesh(partState.id);
    if (!mesh) {
      const partData = this.gameClient.gameState?.parts?.get(partState.id);
      if (partData) {
        this.gameClient.partRenderer.createPart(partData);
      }
      return;
    }

    if (partState.position) {
      this.gameClient.partTargetStates.set(partState.id, {
        ...this.gameClient.partTargetStates.get(partState.id),
        position: partState.position
      });
    }

    if (partState.rotation) {
      this.gameClient.partTargetStates.set(partState.id, {
        ...this.gameClient.partTargetStates.get(partState.id),
        rotation: partState.rotation
      });
    }

    mesh.userData.assembled = partState.assembled;
  }

  setupSocketHandlers() {
    const socket = this.gameClient.socket;

    socket.on('animation-updated', ({ partId, type, config }) => {
      this.animationSystem.setAnimationForPart(partId, type, config);
    });

    socket.on('animations-started', () => {
      this.animationSystem.start();
    });

    socket.on('animations-stopped', () => {
      this.animationSystem.stop();
    });

    socket.on('animation-speed-changed', ({ speed }) => {
      this.animationSystem.setSpeed(speed);
    });

    socket.on('compressed-state-update', (data) => {
      this.handleCompressedStateUpdate(data);
    });

    socket.on('delta-state-update', (data) => {
      this.handleDeltaStateUpdate(data);
    });
  }

  clear() {
    this.animationSystem.clear();
    this.predictedStates.clear();
  }
}

class LevelEditor {
  constructor(gameClient) {
    this.gameClient = gameClient;
    this.isActive = false;
    this.selectedPartType = null;
    this.ghostMesh = null;
    this.placedParts = [];
  }

  activate() {
    this.isActive = true;
    this.showEditorUI();
  }

  deactivate() {
    this.isActive = false;
    this.hideEditorUI();
    this.removeGhostMesh();
  }

  showEditorUI() {
    const editorPanel = document.createElement('div');
    editorPanel.id = 'level-editor-panel';
    editorPanel.className = 'editor-panel';
    editorPanel.innerHTML = `
      <h3>关卡编辑器</h3>
      <div class="editor-part-list">
        <button class="editor-part-btn" data-type="GEAR">⚙️ 齿轮</button>
        <button class="editor-part-btn" data-type="AXLE">🔩 轴</button>
        <button class="editor-part-btn" data-type="LEVER">🔧 杠杆</button>
        <button class="editor-part-btn" data-type="PLATE">📦 底座</button>
        <button class="editor-part-btn" data-type="SPRING">🔄 弹簧</button>
        <button class="editor-part-btn" data-type="PULLEY">🪢 滑轮</button>
        <button class="editor-part-btn" data-type="CAM">⭕ 凸轮</button>
        <button class="editor-part-btn" data-type="CRANK">⚡ 曲柄</button>
        <button class="editor-part-btn" data-type="PISTON">💨 活塞</button>
        <button class="editor-part-btn" data-type="ROD">📍 连杆</button>
      </div>
      <div class="editor-controls">
        <button id="editor-save-btn">💾 保存关卡</button>
        <button id="editor-clear-btn">🗑️ 清空场景</button>
        <button id="editor-close-btn">❌ 关闭编辑器</button>
      </div>
    `;
    document.body.appendChild(editorPanel);

    document.querySelectorAll('.editor-part-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectPartType(e.target.dataset.type);
      });
    });

    document.getElementById('editor-save-btn').addEventListener('click', () => {
      this.saveLevel();
    });

    document.getElementById('editor-clear-btn').addEventListener('click', () => {
      this.clearLevel();
    });

    document.getElementById('editor-close-btn').addEventListener('click', () => {
      this.deactivate();
    });

    this.addPlacementListeners();
  }

  hideEditorUI() {
    const panel = document.getElementById('level-editor-panel');
    if (panel) {
      panel.remove();
    }
    this.removePlacementListeners();
  }

  selectPartType(type) {
    this.selectedPartType = type;
    this.createGhostMesh(type);
    
    document.querySelectorAll('.editor-part-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
  }

  createGhostMesh(type) {
    this.removeGhostMesh();
    
    const partData = {
      id: 'ghost',
      type: type,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      connections: []
    };
    
    this.ghostMesh = this.gameClient.partRenderer.createPart(partData, true);
    if (this.ghostMesh) {
      this.ghostMesh.material.transparent = true;
      this.ghostMesh.material.opacity = 0.5;
      this.gameClient.scene.add(this.ghostMesh);
    }
  }

  removeGhostMesh() {
    if (this.ghostMesh) {
      this.gameClient.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
  }

  addPlacementListeners() {
    this.mouseMoveHandler = (e) => this.onMouseMove(e);
    this.clickHandler = (e) => this.onClick(e);

    this.gameClient.renderer.domElement.addEventListener('mousemove', this.mouseMoveHandler);
    this.gameClient.renderer.domElement.addEventListener('click', this.clickHandler);
  }

  removePlacementListeners() {
    if (this.mouseMoveHandler) {
      this.gameClient.renderer.domElement.removeEventListener('mousemove', this.mouseMoveHandler);
    }
    if (this.clickHandler) {
      this.gameClient.renderer.domElement.removeEventListener('click', this.clickHandler);
    }
  }

  onMouseMove(event) {
    if (!this.ghostMesh || !this.isActive) return;

    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.gameClient.camera);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectPoint);

    if (intersectPoint) {
      this.ghostMesh.position.set(
        Math.round(intersectPoint.x * 2) / 2,
        0.5,
        Math.round(intersectPoint.z * 2) / 2
      );
    }
  }

  onClick(event) {
    if (!this.selectedPartType || !this.isActive || !this.ghostMesh) return;

    const position = {
      x: this.ghostMesh.position.x,
      y: this.ghostMesh.position.y,
      z: this.ghostMesh.position.z
    };

    this.gameClient.socket.emit('editor-add-part', {
      partType: this.selectedPartType,
      position: position
    });

    this.placedParts.push({
      type: this.selectedPartType,
      position: position
    });
  }

  saveLevel() {
    const levelName = prompt('请输入关卡名称:', '自定义关卡');
    if (levelName === null) return;

    const description = prompt('请输入关卡描述:', '');
    if (description === null) return;

    this.gameClient.socket.emit('editor-save-level', {
      levelName: levelName,
      description: description
    });

    this.gameClient.socket.once('level-saved', (data) => {
      if (data.success) {
        alert(`关卡已保存! ID: ${data.levelId}`);
      }
    });
  }

  clearLevel() {
    if (!confirm('确定要清空所有零件吗?')) return;

    this.gameClient.gameState?.parts?.forEach((_, partId) => {
      this.gameClient.socket.emit('editor-remove-part', { partId });
    });

    this.placedParts = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnimationController, LevelEditor };
}
