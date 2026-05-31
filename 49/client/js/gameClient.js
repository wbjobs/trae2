class GameClient {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.partRenderer = null;
    this.socket = null;
    this.playerId = null;
    this.selectedPartId = null;
    this.hoveredPartId = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.assemblyProgress = { total: 0, assembled: 0, percentage: 0 };
    this.players = new Map();
    this.initialized = false;
    this.pendingParts = new Map();
    this.partTargetStates = new Map();
    this.interpolationSpeed = 0.15;
    this.networkThrottle = 50;
    this.lastMoveTime = 0;
    this.pendingMoveUpdates = new Map();
    this.animationFrameId = null;
    this.isAnimating = false;
    this.animationController = null;
    this.levelEditor = null;
    this.useCompressedSync = true;
    this.lastDeltaSync = 0;
    this.deltaSyncInterval = 100;
  }

  init() {
    this.initThreeJS();
    this.initControls();
    this.initLighting();
    this.initGround();
    this.partRenderer = new PartRenderer(this.scene);
    this.animationController = new AnimationController(this);
    this.levelEditor = new LevelEditor(this);
    this.setupEventListeners();
    this.startAnimationLoop();
    this.initialized = true;
  }

  initThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(8, 8, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game-container').appendChild(this.renderer.domElement);
  }

  initControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.screenSpacePanning = true;
  }

  initLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 0.7);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 15, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    mainLight.shadow.bias = -0.0005;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffd700, 0.25);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff6b35, 0.15);
    rimLight.position.set(-5, 3, 5);
    this.scene.add(rimLight);
  }

  initGround() {
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    this.scene.add(gridHelper);

    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d2d,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setupEventListeners() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('beforeunload', () => this.cleanup());
  }

  onMouseDown(event) {
    if (!this.playerId) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const intersects = this.getIntersects();
    
    if (intersects.length > 0) {
      const partId = this.getPartIdFromObject(intersects[0].object);
      if (partId) {
        this.selectPart(partId);
        this.isDragging = true;
        this.controls.enabled = false;

        const intersectPoint = intersects[0].point;
        this.dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          intersectPoint
        );
      }
    }
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (this.isDragging && this.selectedPartId) {
      const intersectPoint = new THREE.Vector3();
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);

      if (intersectPoint) {
        const mesh = this.partRenderer.getPartMesh(this.selectedPartId);
        if (mesh) {
          mesh.position.copy(intersectPoint);
          this.throttledPartMove(this.selectedPartId, {
            x: Math.round(intersectPoint.x * 1000) / 1000,
            y: Math.round(intersectPoint.y * 1000) / 1000,
            z: Math.round(intersectPoint.z * 1000) / 1000
          });
        }
      }
    } else {
      const intersects = this.getIntersects();
      if (intersects.length > 0) {
        const partId = this.getPartIdFromObject(intersects[0].object);
        if (partId && partId !== this.hoveredPartId) {
          if (this.hoveredPartId && this.hoveredPartId !== this.selectedPartId) {
            this.partRenderer.highlightPart(this.hoveredPartId, false);
          }
          this.hoveredPartId = partId;
          if (this.hoveredPartId !== this.selectedPartId) {
            this.partRenderer.highlightPart(this.hoveredPartId, true);
          }
        }
      } else if (this.hoveredPartId) {
        if (this.hoveredPartId !== this.selectedPartId) {
          this.partRenderer.highlightPart(this.hoveredPartId, false);
        }
        this.hoveredPartId = null;
      }
    }
  }

  onMouseUp(event) {
    if (this.isDragging && this.selectedPartId) {
      const mesh = this.partRenderer.getPartMesh(this.selectedPartId);
      if (mesh) {
        this.emitPartPlace(this.selectedPartId, {
          x: Math.round(mesh.position.x * 1000) / 1000,
          y: Math.round(mesh.position.y * 1000) / 1000,
          z: Math.round(mesh.position.z * 1000) / 1000
        });

        this.attemptAssembly(this.selectedPartId);
      }
    }
    
    this.isDragging = false;
    this.controls.enabled = true;
    this.flushPendingMoves();
  }

  onWheel(event) {
    if (this.selectedPartId && event.ctrlKey) {
      event.preventDefault();
      const mesh = this.partRenderer.getPartMesh(this.selectedPartId);
      if (mesh) {
        mesh.rotation.y += event.deltaY > 0 ? 0.05 : -0.05;
        this.throttledPartRotate(this.selectedPartId, {
          x: Math.round(mesh.rotation.x * 1000) / 1000,
          y: Math.round(mesh.rotation.y * 1000) / 1000,
          z: Math.round(mesh.rotation.z * 1000) / 1000
        });
      }
    }
  }

  onKeyDown(event) {
    if (this.selectedPartId) {
      const mesh = this.partRenderer.getPartMesh(this.selectedPartId);
      if (mesh) {
        let rotated = false;
        const rotateAmount = Math.PI / 16;

        switch (event.key.toLowerCase()) {
          case 'x':
            mesh.rotation.x += event.shiftKey ? -rotateAmount : rotateAmount;
            rotated = true;
            break;
          case 'y':
            mesh.rotation.y += event.shiftKey ? -rotateAmount : rotateAmount;
            rotated = true;
            break;
          case 'z':
            mesh.rotation.z += event.shiftKey ? -rotateAmount : rotateAmount;
            rotated = true;
            break;
          case 'escape':
            this.deselectPart();
            break;
          case 'delete':
          case 'backspace':
            this.emitDisassembly(this.selectedPartId);
            break;
        }

        if (rotated) {
          this.emitPartRotate(this.selectedPartId, {
            x: Math.round(mesh.rotation.x * 1000) / 1000,
            y: Math.round(mesh.rotation.y * 1000) / 1000,
            z: Math.round(mesh.rotation.z * 1000) / 1000
          });
        }
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  getIntersects() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = [];
    this.partRenderer.partMeshes.forEach(group => {
      group.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
    });
    return this.raycaster.intersectObjects(meshes, false);
  }

  getPartIdFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.partId) {
        return current.userData.partId;
      }
      current = current.parent;
    }
    return null;
  }

  selectPart(partId) {
    if (this.selectedPartId && this.selectedPartId !== partId) {
      this.partRenderer.selectPart(this.selectedPartId, false);
    }
    this.selectedPartId = partId;
    this.partRenderer.selectPart(partId, true);
    this.updatePartInfo(partId);
  }

  deselectPart() {
    if (this.selectedPartId) {
      this.partRenderer.selectPart(this.selectedPartId, false);
      this.selectedPartId = null;
    }
  }

  throttledPartMove(partId, position) {
    const now = Date.now();
    this.pendingMoveUpdates.set(partId, position);
    
    if (now - this.lastMoveTime >= this.networkThrottle) {
      this.flushPendingMoves();
      this.lastMoveTime = now;
    }
  }

  throttledPartRotate(partId, rotation) {
    const now = Date.now();
    this.pendingMoveUpdates.set(partId + '_rot', rotation);
    
    if (now - this.lastMoveTime >= this.networkThrottle) {
      this.flushPendingMoves();
      this.lastMoveTime = now;
    }
  }

  flushPendingMoves() {
    this.pendingMoveUpdates.forEach((data, key) => {
      if (key.endsWith('_rot')) {
        this.emitPartRotate(key.replace('_rot', ''), data);
      } else {
        this.emitPartMove(key, data);
      }
    });
    this.pendingMoveUpdates.clear();
  }

  attemptAssembly(partId) {
    const mesh = this.partRenderer.getPartMesh(partId);
    if (!mesh) return;

    let nearestPartId = null;
    let nearestDistance = Infinity;

    this.partRenderer.partMeshes.forEach((otherMesh, otherId) => {
      if (otherId !== partId) {
        const distance = mesh.position.distanceTo(otherMesh.position);
        if (distance < 1.5 && distance < nearestDistance) {
          nearestDistance = distance;
          nearestPartId = otherId;
        }
      }
    });

    if (nearestPartId) {
      this.emitAssemblyAttempt(partId, nearestPartId);
    }
  }

  connectToServer(serverUrl) {
    const actualUrl = serverUrl || window.location.origin;
    this.socket = io(actualUrl, { 
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.addChatMessage('系统', '已连接到服务器');
    });

    this.socket.on('player-joined', (data) => {
      this.playerId = data.playerId;
      console.log('Joined as:', data.player.name);
    });

    this.socket.on('game-state-update', (state) => {
      this.updateGameStateInterpolated(state);
    });

    this.socket.on('assembly-progress', (progress) => {
      this.assemblyProgress = progress;
      this.updateProgressUI();
    });

    this.socket.on('part-moved', (data) => {
      if (data.partId !== this.selectedPartId && data.playerId !== this.playerId) {
        this.setPartTargetState(data.partId, {
          position: data.position
        });
      }
    });

    this.socket.on('part-rotated', (data) => {
      if (data.partId !== this.selectedPartId && data.playerId !== this.playerId) {
        this.setPartTargetState(data.partId, {
          rotation: data.rotation
        });
      }
    });

    this.socket.on('part-placed', (data) => {
      if (data.partId !== this.selectedPartId) {
        this.setPartTargetState(data.partId, {
          position: data.position,
          placed: true
        });
      }
    });

    this.socket.on('assembly-success', (data) => {
      this.setPartTargetState(data.partId, {
        position: data.snappedPosition,
        assembled: true
      });
      this.showAssemblyEffect(data.partId);
      this.addChatMessage('系统', `零件组装成功！`);
    });

    this.socket.on('part-disassembled', (data) => {
      this.addChatMessage('系统', '零件已拆卸');
    });

    this.socket.on('level-complete', (data) => {
      this.showLevelComplete(data);
    });

    this.socket.on('player-left', (data) => {
      this.players.delete(data.playerId);
      this.updatePlayerList();
    });

    this.socket.on('chat-message', (data) => {
      this.addChatMessage(data.playerName, data.message);
    });

    this.socket.on('save-result', (result) => {
      alert(result.message);
    });

    this.socket.on('part-added', (data) => {
      if (data.part) {
        this.partRenderer.createPartMesh(data.part);
        this.setPartTargetState(data.part.id, {
          position: data.part.position,
          rotation: data.part.rotation
        });
      }
    });

    this.socket.on('part-removed', (data) => {
      this.partRenderer.removePart(data.partId);
      this.partTargetStates.delete(data.partId);
    });

    this.animationController.setupSocketHandlers();

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.addChatMessage('系统', '与服务器断开连接');
    });

    this.socket.on('reconnect', () => {
      console.log('Reconnected to server');
      this.addChatMessage('系统', '重新连接到服务器');
      this.socket.emit('request-state');
    });

    return this.socket;
  }

  setPartTargetState(partId, state) {
    const currentState = this.partTargetStates.get(partId) || {};
    this.partTargetStates.set(partId, {
      ...currentState,
      ...state,
      timestamp: Date.now()
    });
  }

  joinRoom(roomId, playerName, levelId) {
    if (this.socket) {
      this.socket.emit('join-room', { roomId, playerName, levelId });
    }
  }

  emitPartMove(partId, position) {
    if (this.socket) {
      this.socket.emit('part-move', { partId, position });
    }
  }

  emitPartRotate(partId, rotation) {
    if (this.socket) {
      this.socket.emit('part-rotate', { partId, rotation });
    }
  }

  emitPartPlace(partId, position) {
    if (this.socket) {
      this.socket.emit('part-place', { partId, position });
    }
  }

  emitAssemblyAttempt(partId, targetPartId) {
    if (this.socket) {
      this.socket.emit('attempt-assembly', { partId, targetPartId });
    }
  }

  emitDisassembly(partId) {
    if (this.socket) {
      this.socket.emit('disassembly', { partId });
    }
  }

  sendChatMessage(message) {
    if (this.socket) {
      this.socket.emit('chat-message', { message });
    }
  }

  saveGame(slotId) {
    if (this.socket) {
      this.socket.emit('save-game', { slotId });
    }
  }

  updateGameStateInterpolated(state) {
    const existingParts = new Set(this.partRenderer.partMeshes.keys());
    const newParts = new Set();

    state.parts.forEach(partData => {
      newParts.add(partData.id);
      if (existingParts.has(partData.id)) {
        if (partData.id !== this.selectedPartId || !this.isDragging) {
          this.setPartTargetState(partData.id, {
            position: partData.position,
            rotation: partData.rotation,
            assembled: partData.assembled
          });
        }
      } else {
        this.partRenderer.createPartMesh(partData);
        this.setPartTargetState(partData.id, {
          position: partData.position,
          rotation: partData.rotation
        });
      }
    });

    existingParts.forEach(partId => {
      if (!newParts.has(partId)) {
        this.partRenderer.removePart(partId);
        this.partTargetStates.delete(partId);
      }
    });

    this.players.clear();
    state.players.forEach(player => {
      this.players.set(player.id, player);
    });
    this.updatePlayerList();
  }

  updateInterpolations() {
    this.partTargetStates.forEach((targetState, partId) => {
      if (partId === this.selectedPartId && this.isDragging) {
        return;
      }

      const mesh = this.partRenderer.getPartMesh(partId);
      if (!mesh || !targetState) return;

      if (targetState.position) {
        mesh.position.lerp(
          new THREE.Vector3(
            targetState.position.x,
            targetState.position.y,
            targetState.position.z
          ),
          this.interpolationSpeed
        );
      }

      if (targetState.rotation) {
        const targetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            targetState.rotation.x,
            targetState.rotation.y,
            targetState.rotation.z
          )
        );
        mesh.quaternion.slerp(targetQuat, this.interpolationSpeed);
      }
    });
  }

  showAssemblyEffect(partId) {
    const mesh = this.partRenderer.getPartMesh(partId);
    if (mesh) {
      const originalScale = mesh.scale.clone();
      mesh.scale.multiplyScalar(1.2);
      setTimeout(() => {
        mesh.scale.copy(originalScale);
      }, 200);
    }
  }

  updateProgressUI() {
    const progressEl = document.getElementById('progress-bar');
    const textEl = document.getElementById('progress-text');
    if (progressEl && textEl) {
      progressEl.style.width = `${this.assemblyProgress.percentage}%`;
      textEl.textContent = `进度: ${this.assemblyProgress.assembled}/${this.assemblyProgress.total}`;
    }
  }

  updatePartInfo(partId) {
    const infoEl = document.getElementById('part-info');
    if (infoEl) {
      infoEl.textContent = `选中零件: ${partId}`;
    }
  }

  updatePlayerList() {
    const listEl = document.getElementById('player-list');
    if (listEl) {
      listEl.innerHTML = '';
      this.players.forEach(player => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        playerEl.innerHTML = `
          <span class="player-color" style="background-color: #${player.color.toString(16).padStart(6, '0')}"></span>
          <span class="player-name">${player.name}</span>
          <span class="player-score">${player.score}分</span>
        `;
        listEl.appendChild(playerEl);
      });
    }
  }

  addChatMessage(playerName, message) {
    const chatEl = document.getElementById('chat-messages');
    if (chatEl) {
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-message';
      msgEl.innerHTML = `<span class="chat-sender">${playerName}:</span> ${message}`;
      chatEl.appendChild(msgEl);
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }

  showLevelComplete(data) {
    const overlay = document.getElementById('complete-overlay');
    if (overlay) {
      overlay.classList.add('visible');
      const scoresEl = document.getElementById('final-scores');
      scoresEl.innerHTML = '';
      data.scores.forEach(score => {
        const item = document.createElement('div');
        item.textContent = `${score.name}: ${score.score}分`;
        scoresEl.appendChild(item);
      });
    }
  }

  startAnimationLoop() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.lastFrameTime = performance.now();
    
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      
      const currentTime = performance.now();
      const deltaTime = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;
      
      this.controls.update();
      this.updateInterpolations();
      this.animationController.updateLocal(deltaTime);
      
      if (this.useCompressedSync && currentTime - this.lastDeltaSync > this.deltaSyncInterval) {
        this.socket?.emit('request-delta-state');
        this.lastDeltaSync = currentTime;
      }
      
      this.renderer.render(this.scene, this.camera);
    };
    
    animate();
  }

  openLevelEditor() {
    this.levelEditor.activate();
  }

  closeLevelEditor() {
    this.levelEditor.deactivate();
  }

  cleanup() {
    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.socket) {
      this.socket.disconnect();
    }
    this.flushPendingMoves();
  }

  clearScene() {
    this.partRenderer.clearAll();
    this.selectedPartId = null;
    this.hoveredPartId = null;
    this.partTargetStates.clear();
    this.pendingMoveUpdates.clear();
  }
}
