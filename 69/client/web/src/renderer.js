class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.parts = {};
    this.players = {};
    this.selectedPart = null;
    this.hoveredPart = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.gridHelper = null;
    this.ambientLight = null;
    this.directionalLight = null;
    this.pointLight = null;

    this.particleSystem = null;
    this.mechanicalAnimation = null;
    this.effectsEnabled = true;

    this.interpolationEnabled = true;
    this.interpolationSpeed = 0.15;
    this.lastFrameTime = 0;
    this.deltaTime = 0;

    this.partUpdateQueue = new Map();
    this.updateBatchInterval = 30;
    this.lastBatchTime = 0;

    this.loadingParts = new Set();
    this.partsLoaded = false;

    this.sharedGeometries = {};
    this.sharedMaterials = {};
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 30, 100);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(18, 12, 18);
    this.camera.lookAt(0, 2, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.setupLights();
    this.setupGrid();
    this.setupControls();

    this.particleSystem = new ParticleSystem(this.scene);
    this.mechanicalAnimation = new MechanicalAnimation();

    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('click', (e) => this.onClick(e));

    this.animate();
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.directionalLight.position.set(15, 25, 15);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left = -30;
    this.directionalLight.shadow.camera.right = 30;
    this.directionalLight.shadow.camera.top = 30;
    this.directionalLight.shadow.camera.bottom = -30;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.bias = -0.0005;
    this.directionalLight.shadow.normalBias = 0.02;
    this.scene.add(this.directionalLight);

    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-10, 15, -10);
    this.scene.add(fillLight);

    this.pointLight = new THREE.PointLight(0xffaa00, 0.4, 40);
    this.pointLight.position.set(0, 12, 0);
    this.scene.add(this.pointLight);

    const rimLight = new THREE.DirectionalLight(0xffaa44, 0.2);
    rimLight.position.set(0, 10, -15);
    this.scene.add(rimLight);
  }

  setupGrid() {
    const gridSize = 40;
    const gridDivisions = 40;
    this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x3a3a5a, 0x2a2a4a);
    this.gridHelper.position.y = -0.01;
    this.scene.add(this.gridHelper);

    const groundGeometry = new THREE.PlaneGeometry(60, 60);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x252535,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setupControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 2, 0);
    this.controls.screenSpacePanning = false;
  }

  getSharedGeometry(type, size) {
    const key = `${type}_${size.x}_${size.y}_${size.z}`;
    if (!this.sharedGeometries[key]) {
      let geometry;
      switch (type) {
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
      this.sharedGeometries[key] = geometry;
    }
    return this.sharedGeometries[key];
  }

  getSharedMaterial(color, roughness = 0.35, metalness = 0.7) {
    const key = `${color}_${roughness}_${metalness}`;
    if (!this.sharedMaterials[key]) {
      this.sharedMaterials[key] = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        emissive: new THREE.Color(color).multiplyScalar(0.05),
        envMapIntensity: 0.5
      });
    }
    return this.sharedMaterials[key];
  }

  createPartMesh(partData) {
    const props = partData.properties || {};
    const size = props.size || { x: 1, y: 1, z: 1 };
    const group = new THREE.Group();

    const color = props.color || this.getPartColor(partData.type);
    const mainGeometry = this.getSharedGeometry(partData.model, size);
    const mainMaterial = this.getSharedMaterial(color);

    const mainMesh = new THREE.Mesh(mainGeometry, mainMaterial);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    group.add(mainMesh);

    if (props.teeth) {
      this.addGearTeeth(group, size, props.teeth, color);
    }

    if (partData.type === 'boiler' || partData.type === 'cylinder') {
      this.addDetails(group, partData.type, size, color);
    }

    group.position.set(
      partData.position.x,
      partData.position.y,
      partData.position.z
    );
    group.rotation.set(
      partData.rotation.x * Math.PI / 180,
      partData.rotation.y * Math.PI / 180,
      partData.rotation.z * Math.PI / 180
    );

    group.userData = {
      partId: partData.id,
      partName: partData.name,
      partType: partData.type,
      isKey: partData.isKey || false,
      targetPosition: partData.targetPosition ? { ...partData.targetPosition } : null,
      targetRotation: partData.targetRotation ? { ...partData.targetRotation } : null,
      targetPositionVec: new THREE.Vector3(),
      targetRotationEuler: new THREE.Euler(),
      interpolating: false
    };

    if (partData.targetPosition) {
      group.userData.targetPositionVec.set(
        partData.targetPosition.x,
        partData.targetPosition.y,
        partData.targetPosition.z
      );
    }
    if (partData.targetRotation) {
      group.userData.targetRotationEuler.set(
        partData.targetRotation.x * Math.PI / 180,
        partData.targetRotation.y * Math.PI / 180,
        partData.targetRotation.z * Math.PI / 180
      );
    }

    this.addSnapPoints(group, partData.snapPoints || []);

    return group;
  }

  addDetails(group, type, size, color) {
    if (type === 'boiler') {
      const ringGeometry = new THREE.TorusGeometry(size.x / 2 + 0.1, 0.08, 8, 32);
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.5,
        metalness: 0.8
      });

      for (let i = -1; i <= 1; i++) {
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = i * (size.y / 4);
        ring.castShadow = true;
        group.add(ring);
      }
    }

    if (type === 'cylinder') {
      const flangeGeometry = new THREE.CylinderGeometry(size.x / 2 + 0.3, size.x / 2 + 0.3, 0.15, 16);
      const flangeMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a5a5a,
        roughness: 0.4,
        metalness: 0.7
      });

      [-1, 1].forEach(dir => {
        const flange = new THREE.Mesh(flangeGeometry, flangeMaterial);
        flange.position.y = dir * (size.y / 2 + 0.07);
        flange.castShadow = true;
        group.add(flange);
      });
    }
  }

  addGearTeeth(group, size, teethCount, color) {
    const toothHeight = 0.25;
    const toothWidth = (Math.PI * size.x) / teethCount * 0.5;

    for (let i = 0; i < teethCount; i++) {
      const angle = (i / teethCount) * Math.PI * 2;
      const toothGeometry = new THREE.BoxGeometry(
        toothWidth,
        toothHeight,
        size.z * 0.85
      );
      const toothMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.6
      });
      const tooth = new THREE.Mesh(toothGeometry, toothMaterial);

      const radius = size.x / 2;
      tooth.position.set(
        Math.cos(angle) * radius,
        toothHeight / 2,
        Math.sin(angle) * radius
      );
      tooth.rotation.y = -angle;
      tooth.castShadow = true;
      group.add(tooth);
    }
  }

  addSnapPoints(group, snapPoints) {
    snapPoints.forEach(sp => {
      const markerGeometry = new THREE.SphereGeometry(0.12, 12, 12);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.7
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(sp.position.x, sp.position.y, sp.position.z);
      marker.userData.isSnapPoint = true;
      marker.userData.snapPointId = sp.id;
      marker.visible = false;
      group.add(marker);
    });
  }

  getPartColor(type) {
    const colors = {
      boiler: 0x8B4513,
      cylinder: 0x4682B4,
      piston: 0xB0B0B0,
      flywheel: 0x2F4F4F,
      pipe: 0x708090,
      gear: 0xCD853F,
      shaft: 0xC8C8C8,
      frame: 0x505060,
      chassis: 0x2F2F3F,
      stack: 0x1C1C2C,
      dome: 0xB8860B,
      wheel: 0x3A3A4A,
      rod: 0x909090
    };
    return colors[type] || 0x808080;
  }

  async addPart(partData) {
    if (this.parts[partData.id]) {
      this.updatePart(partData);
      return;
    }

    this.loadingParts.add(partData.id);

    await new Promise(resolve => setTimeout(resolve, 0));

    const mesh = this.createPartMesh(partData);
    this.scene.add(mesh);

    this.parts[partData.id] = {
      data: { ...partData },
      mesh,
      targetPosition: new THREE.Vector3(
        partData.position.x,
        partData.position.y,
        partData.position.z
      ),
      targetRotation: new THREE.Euler(
        partData.rotation.x * Math.PI / 180,
        partData.rotation.y * Math.PI / 180,
        partData.rotation.z * Math.PI / 180
      ),
      interpolating: false
    };

    this.updatePartState(partData.id, partData.state);

    this.loadingParts.delete(partData.id);
    if (this.loadingParts.size === 0) {
      this.partsLoaded = true;
      this.mechanicalAnimation.autoDetectAnimations(this.parts);
      this.onPartsLoaded?.();
    }
  }

  addPartsBatch(partsData) {
    const sortedParts = [...partsData].sort((a, b) => {
      if (a.isKey && !b.isKey) return -1;
      if (!a.isKey && b.isKey) return 1;
      return 0;
    });

    sortedParts.forEach((partData, index) => {
      setTimeout(() => {
        this.addPart(partData);
      }, index * 10);
    });
  }

  updatePart(partData) {
    const partObj = this.parts[partData.id];
    if (!partObj) return;

    const prevState = partObj.data.state;
    partObj.data = { ...partData };

    partObj.targetPosition.set(
      partData.position.x,
      partData.position.y,
      partData.position.z
    );
    partObj.targetRotation.set(
      partData.rotation.x * Math.PI / 180,
      partData.rotation.y * Math.PI / 180,
      partData.rotation.z * Math.PI / 180
    );

    if (!this.interpolationEnabled) {
      partObj.mesh.position.copy(partObj.targetPosition);
      partObj.mesh.rotation.copy(partObj.targetRotation);
    } else {
      partObj.interpolating = true;
    }

    this.updatePartState(partData.id, partData.state, prevState);
  }

  updatePartState(partId, state, prevState = null) {
    const partObj = this.parts[partId];
    if (!partObj) return;

    const mesh = partObj.mesh;
    const data = partObj.data;

    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        const material = child.material;

        switch (state) {
          case 'assembled':
            if (material.emissive) {
              material.emissive.setHex(0x1a1a00);
            }
            if (child.userData && child.userData.isSnapPoint) {
              child.visible = false;
            }
            if (prevState !== 'assembled' && this.effectsEnabled) {
              this.emitAssembleEffect(partObj);
            }
            break;
          case 'grabbed':
            if (material.emissive) {
              material.emissive.setHex(0x333300);
            }
            break;
          case 'disassembled':
            if (material.emissive) {
              material.emissive.setHex(0x0a0a0a);
            }
            if (prevState === 'assembled' && this.effectsEnabled) {
              this.emitDisassembleEffect(partObj);
            }
            break;
        }
      }
    });
  }

  emitAssembleEffect(partObj) {
    const pos = partObj.mesh.position.clone();

    if (this.particleSystem) {
      this.particleSystem.emitSparks(pos, 15, 0xffff00);
      this.particleSystem.emitSteam(pos, 8);

      const effectPos = pos.clone();
      effectPos.y += 1;
      this.particleSystem.startContinuousEffect(
        `assembled_${partObj.data.id}`,
        'steam',
        effectPos,
        800
      );
    }
  }

  emitDisassembleEffect(partObj) {
    const pos = partObj.mesh.position.clone();

    if (this.particleSystem) {
      this.particleSystem.emitSmoke(pos, 6);
      this.particleSystem.emitSparks(pos, 8, 0xff6600);
      this.particleSystem.stopContinuousEffect(`assembled_${partObj.data.id}`);
    }
  }

  removePart(partId) {
    if (this.parts[partId]) {
      this.scene.remove(this.parts[partId].mesh);
      this.disposeMesh(this.parts[partId].mesh);
      delete this.parts[partId];
    }
  }

  disposeMesh(mesh) {
    mesh.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  addPlayer(playerData) {
    if (this.players[playerData.id]) return;

    const playerGroup = new THREE.Group();

    const bodyGeometry = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(playerData.color || 0x6688ff),
      emissive: new THREE.Color(playerData.color || 0x6688ff).multiplyScalar(0.15),
      roughness: 0.6,
      metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    playerGroup.add(body);

    const headGeometry = new THREE.SphereGeometry(0.28, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe0bd,
      emissive: 0x332200,
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    playerGroup.add(head);

    const hatGeometry = new THREE.ConeGeometry(0.35, 0.4, 8);
    const hatMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(playerData.color || 0x6688ff),
      roughness: 0.5,
      metalness: 0.4
    });
    const hat = new THREE.Mesh(hatGeometry, hatMaterial);
    hat.position.y = 1.9;
    hat.castShadow = true;
    playerGroup.add(hat);

    playerGroup.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );

    playerGroup.userData = {
      playerId: playerData.id,
      targetPosition: new THREE.Vector3(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      ),
      interpolating: true
    };

    const nameSprite = this.createNameSprite(playerData.name || '玩家');
    nameSprite.position.y = 2.4;
    playerGroup.add(nameSprite);

    this.scene.add(playerGroup);
    this.players[playerData.id] = {
      data: { ...playerData },
      group: playerGroup
    };
  }

  createNameSprite(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, 20);
    context.fill();

    context.font = 'bold 48px Arial, sans-serif';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = '#000000';
    context.shadowBlur = 4;
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
  }

  updatePlayer(playerData) {
    const playerObj = this.players[playerData.id];
    if (!playerObj) return;

    playerObj.data = { ...playerData };
    playerObj.group.userData.targetPosition.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
  }

  removePlayer(playerId) {
    if (this.players[playerId]) {
      this.scene.remove(this.players[playerId].group);
      this.disposeMesh(this.players[playerId].group);
      delete this.players[playerId];
    }
  }

  selectPart(partId) {
    this.clearSelection();
    if (partId && this.parts[partId]) {
      this.selectedPart = partId;
      const partObj = this.parts[partId];
      partObj.mesh.traverse(child => {
        if (child.userData && child.userData.isSnapPoint) {
          child.visible = true;
        }
      });
      this.highlightPart(partId, true);
    }
  }

  clearSelection() {
    if (this.selectedPart && this.parts[this.selectedPart]) {
      this.highlightPart(this.selectedPart, false);
      const partObj = this.parts[this.selectedPart];
      partObj.mesh.traverse(child => {
        if (child.userData && child.userData.isSnapPoint) {
          child.visible = false;
        }
      });
    }
    this.selectedPart = null;
  }

  highlightPart(partId, highlight) {
    const partObj = this.parts[partId];
    if (!partObj) return;

    partObj.mesh.traverse(child => {
      if (child.isMesh && child.material && child.material.emissive) {
        if (highlight) {
          child.material.emissive.setHex(0xffaa00);
          child.material.emissiveIntensity = 0.5;
        } else {
          this.updatePartState(partId, partObj.data.state);
        }
      }
    });
  }

  setHoveredPart(partId) {
    if (this.hoveredPart && this.hoveredPart !== this.selectedPart) {
      this.highlightPart(this.hoveredPart, false);
    }
    this.hoveredPart = partId;
    if (partId && partId !== this.selectedPart) {
      this.highlightPart(partId, true);
    }
  }

  getIntersects(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Object.values(this.parts).map(p => p.mesh);
    return this.raycaster.intersectObjects(meshes, true);
  }

  onMouseMove(event) {
    const intersects = this.getIntersects(event);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.partId) {
        obj = obj.parent;
      }
      if (obj.userData && obj.userData.partId) {
        document.body.style.cursor = 'pointer';
        this.setHoveredPart(obj.userData.partId);
        return;
      }
    }

    document.body.style.cursor = 'default';
    this.setHoveredPart(null);
  }

  onClick(event) {
    if (event.target !== this.canvas) return;

    const intersects = this.getIntersects(event);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.partId) {
        obj = obj.parent;
      }
      if (obj.userData && obj.userData.partId) {
        if (this.onPartClick) {
          this.onPartClick(obj.userData.partId);
        }
        return;
      }
    }

    if (this.onBackgroundClick) {
      this.onBackgroundClick();
    }
  }

  updateInterpolations(delta) {
    if (!this.interpolationEnabled) return;

    const speed = this.interpolationSpeed * delta * 60;

    Object.values(this.parts).forEach(partObj => {
      if (partObj.interpolating ||
          partObj.mesh.position.distanceTo(partObj.targetPosition) > 0.01) {

        partObj.mesh.position.lerp(partObj.targetPosition, speed);

        const targetQuat = new THREE.Quaternion().setFromEuler(partObj.targetRotation);
        partObj.mesh.quaternion.slerp(targetQuat, speed);

        if (partObj.mesh.position.distanceTo(partObj.targetPosition) < 0.01) {
          partObj.interpolating = false;
        }
      }
    });

    Object.values(this.players).forEach(playerObj => {
      const group = playerObj.group;
      if (group.userData.interpolating) {
        group.position.lerp(group.userData.targetPosition, speed * 0.8);
      }
    });
  }

  updateAssembledAnimations(delta) {
    if (this.mechanicalAnimation) {
      this.mechanicalAnimation.update(this.parts, delta, this.particleSystem);
    }

    if (this.particleSystem) {
      this.particleSystem.update(delta);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.deltaTime = Math.min(this.clock.getDelta(), 0.1);

    this.controls.update();

    this.updateInterpolations(this.deltaTime);
    this.updateAssembledAnimations(this.deltaTime);

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  clearScene() {
    Object.keys(this.parts).forEach(partId => {
      this.removePart(partId);
    });
    this.parts = {};

    Object.keys(this.players).forEach(playerId => {
      this.removePlayer(playerId);
    });
    this.players = {};

    if (this.particleSystem) {
      this.particleSystem.clearAll();
    }
    if (this.mechanicalAnimation) {
      this.mechanicalAnimation.reset();
    }

    this.selectedPart = null;
    this.hoveredPart = null;
    this.partsLoaded = false;
    this.loadingParts.clear();
  }

  getPartById(partId) {
    return this.parts[partId];
  }

  getPartData(partId) {
    return this.parts[partId] ? this.parts[partId].data : null;
  }

  waitForPartsLoaded() {
    return new Promise(resolve => {
      if (this.loadingParts.size === 0) {
        resolve();
      } else {
        this.onPartsLoaded = resolve;
      }
    });
  }
}

window.Renderer = Renderer;
