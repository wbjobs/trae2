class InputManager {
  constructor(renderer, network) {
    this.renderer = renderer;
    this.network = network;
    this.prediction = new PredictionEngine(renderer, network);
    this.keys = {};
    this.mouse = { x: 0, y: 0, down: false, dragging: false };
    this.selectedPartId = null;
    this.grabbedPartId = null;
    this.dragStart = null;
    this.rotationMode = false;
    this.snapThreshold = 0.5;
    this.enabled = true;
    this.moveAccumulator = { x: 0, y: 0, z: 0 };
    this.lastMoveSend = 0;
    this.moveSendInterval = 30;

    this.init();
  }

  init() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKeyDown(event) {
    if (!this.enabled) return;

    this.keys[event.code] = true;

    if (event.code === 'KeyR') {
      this.rotationMode = !this.rotationMode;
      this.updateUI();
    }

    if (event.code === 'KeyF' && this.selectedPartId) {
      if (this.grabbedPartId === this.selectedPartId) {
        this.assemblePart();
      }
    }

    if (event.code === 'KeyG' && this.selectedPartId) {
      if (!this.grabbedPartId) {
        this.grabPart(this.selectedPartId);
      } else {
        this.releasePart(this.grabbedPartId);
      }
    }

    if (event.code === 'Escape') {
      this.clearSelection();
    }

    if (event.code === 'Space' && this.grabbedPartId) {
      event.preventDefault();
      this.assemblePart();
    }
  }

  onKeyUp(event) {
    this.keys[event.code] = false;
  }

  onMouseDown(event) {
    if (event.target !== this.renderer.canvas) return;

    this.mouse.down = true;
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;

    if (event.button === 0) {
      this.dragStart = { x: event.clientX, y: event.clientY };
    }
  }

  onMouseUp(event) {
    if (event.target !== this.renderer.canvas) return;

    this.mouse.down = false;

    if (event.button === 0 && this.dragStart) {
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 5) {
        this.handleClick(event);
      }

      this.dragStart = null;
      this.mouse.dragging = false;
    }
  }

  onMouseMove(event) {
    if (event.target !== this.renderer.canvas) return;

    if (this.mouse.down && this.dragStart && this.grabbedPartId) {
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 5) {
        this.mouse.dragging = true;
        this.dragPart(dx, dy);
        this.dragStart = { x: event.clientX, y: event.clientY };
      }
    }
  }

  onWheel(event) {
    if (!this.grabbedPartId) return;
    event.preventDefault();

    const partObj = this.renderer.getPartById(this.grabbedPartId);
    if (!partObj) return;

    const delta = event.deltaY > 0 ? 1 : -1;

    if (this.rotationMode || event.ctrlKey) {
      const rotation = { ...partObj.data.rotation };
      rotation.y += delta * 15;
      this.network.rotatePart(this.grabbedPartId, rotation);
    } else {
      const position = { ...partObj.data.position };
      position.y += delta * 0.5;
      this.network.movePart(this.grabbedPartId, position);
    }
  }

  handleClick(event) {
    if (event.button !== 0) return;

    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.renderer.camera);

    const meshes = Object.values(this.renderer.parts).map(p => p.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.partId) {
        obj = obj.parent;
      }

      if (obj.userData && obj.userData.partId) {
        this.selectPart(obj.userData.partId);
      }
    } else {
      this.clearSelection();
    }
  }

  selectPart(partId) {
    this.selectedPartId = partId;
    this.renderer.selectPart(partId);
    this.updateUI();

    if (this.onPartSelected) {
      this.onPartSelected(partId);
    }
  }

  clearSelection() {
    if (this.grabbedPartId) {
      this.releasePart(this.grabbedPartId);
    }
    this.selectedPartId = null;
    this.renderer.clearSelection();
    this.updateUI();

    if (this.onSelectionCleared) {
      this.onSelectionCleared();
    }
  }

  grabPart(partId) {
    this.network.grabPart(partId);
    this.grabbedPartId = partId;
    this.prediction.predictPartPosition(partId, 'grab', {});
    this.updateUI();
  }

  releasePart(partId) {
    this.network.releasePart(partId);
    this.grabbedPartId = null;
    this.prediction.clearPrediction(partId);
    this.updateUI();
  }

  dragPart(dx, dy) {
    if (!this.grabbedPartId || !this.enabled) return;

    const partObj = this.renderer.getPartById(this.grabbedPartId);
    if (!partObj) return;

    const position = { ...partObj.data.position };
    const moveSpeed = 0.02;

    if (this.rotationMode || this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      const rotation = { ...partObj.data.rotation };
      rotation.y += dx * moveSpeed * 100;
      rotation.x += dy * moveSpeed * 100;
      this.rotatePart(this.grabbedPartId, rotation);
    } else {
      const direction = new THREE.Vector3(dx, 0, dy);
      direction.applyQuaternion(this.renderer.camera.quaternion);
      direction.y = 0;
      direction.normalize();

      position.x += direction.x * Math.abs(dx) * moveSpeed;
      position.z += direction.z * Math.abs(dy) * moveSpeed;

      this.movePart(this.grabbedPartId, position);
    }
  }

  movePart(partId, position) {
    const now = Date.now();
    if (now - this.lastMoveSend > this.moveSendInterval) {
      this.network.movePart(partId, position);
      this.lastMoveSend = now;
    }

    this.prediction.predictPartPosition(partId, 'move', { position });

    const partObj = this.renderer.getPartById(partId);
    if (partObj) {
      partObj.data.position = { ...position };
      partObj.targetPosition.set(position.x, position.y, position.z);
      partObj.interpolating = true;
    }
  }

  rotatePart(partId, rotation) {
    this.network.rotatePart(partId, rotation);
    this.prediction.predictPartPosition(partId, 'rotate', { rotation });

    const partObj = this.renderer.getPartById(partId);
    if (partObj) {
      partObj.data.rotation = { ...rotation };
      partObj.targetRotation.set(
        rotation.x * Math.PI / 180,
        rotation.y * Math.PI / 180,
        rotation.z * Math.PI / 180
      );
      partObj.interpolating = true;
    }
  }

  assemblePart() {
    if (!this.grabbedPartId || !this.enabled) return;
    this.network.assemblePart(this.grabbedPartId);
    this.prediction.clearPrediction(this.grabbedPartId);
    this.grabbedPartId = null;
    this.updateUI();
  }

  disassemblePart(partId) {
    if (!this.enabled) return;
    this.network.disassemblePart(partId);
    this.updateUI();
  }

  updateUI() {
    const rotationIndicator = document.getElementById('rotation-mode');
    if (rotationIndicator) {
      rotationIndicator.textContent = this.rotationMode ? '[旋转模式]' : '[移动模式]';
      rotationIndicator.className = this.rotationMode ? 'badge badge-warning' : 'badge badge-info';
    }

    const selectedInfo = document.getElementById('selected-part-info');
    if (selectedInfo) {
      if (this.selectedPartId) {
        const partData = this.renderer.getPartData(this.selectedPartId);
        if (partData) {
          selectedInfo.innerHTML = `
            <strong>${partData.name}</strong>
            <span class="state-badge state-${partData.state}">${this.getStateText(partData.state)}</span>
          `;
        }
      } else {
        selectedInfo.innerHTML = '<span class="text-muted">点击零件进行选择</span>';
      }
    }
  }

  getStateText(state) {
    const states = {
      'assembled': '已装配',
      'disassembled': '未装配',
      'grabbed': '抓取中',
      'snapped': '已吸附'
    };
    return states[state] || state;
  }
}

window.InputManager = InputManager;
