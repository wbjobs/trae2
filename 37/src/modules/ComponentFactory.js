import * as THREE from 'three';

class ComponentFactory {
  constructor() {
    this.materials = new Map();
  }

  createComponent(componentData) {
    try {
      const { type, position, rotation, dimensions, color } = componentData;
      
      if (!dimensions) {
        console.warn('Missing dimensions for component:', componentData);
        return null;
      }
      
      const safeDimensions = {
        width: Math.max(0.01, dimensions.width || 1),
        height: Math.max(0.01, dimensions.height || 1),
        depth: Math.max(0.01, dimensions.depth || 1)
      };
      
      const safePosition = {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        z: position?.z ?? 0
      };
      
      const safeRotation = {
        x: rotation?.x ?? 0,
        y: rotation?.y ?? 0,
        z: rotation?.z ?? 0
      };
      
      let mesh;
      
      switch (type) {
        case 'floor':
          mesh = this.createFloor(safeDimensions, color);
          break;
        case 'column':
          mesh = this.createColumn(safeDimensions, color);
          break;
        case 'wall':
          mesh = this.createWall(safeDimensions, color);
          break;
        case 'beam':
          mesh = this.createBeam(safeDimensions, color);
          break;
        case 'duct':
          mesh = this.createDuct(safeDimensions, color);
          break;
        case 'ahu':
          mesh = this.createAHU(safeDimensions, color);
          break;
        case 'diffuser':
          mesh = this.createDiffuser(safeDimensions, color);
          break;
        case 'pipe_water':
        case 'pipe_drain':
        case 'pipe_fire':
          mesh = this.createPipe(safeDimensions, color);
          break;
        case 'fixture':
          mesh = this.createFixture(safeDimensions, color);
          break;
        case 'cable_tray':
          mesh = this.createCableTray(safeDimensions, color);
          break;
        case 'panel':
          mesh = this.createPanel(safeDimensions, color);
          break;
        case 'light':
          mesh = this.createLight(safeDimensions, color);
          break;
        case 'sprinkler':
          mesh = this.createSprinkler(safeDimensions, color);
          break;
        case 'hydrant':
          mesh = this.createHydrant(safeDimensions, color);
          break;
        default:
          mesh = this.createGeneric(safeDimensions, color);
      }
      
      if (!mesh) {
        console.warn('Failed to create mesh for type:', type);
        return null;
      }
      
      mesh.position.set(safePosition.x, safePosition.y, safePosition.z);
      mesh.rotation.set(safeRotation.x, safeRotation.y, safeRotation.z);
      
      return mesh;
    } catch (error) {
      console.error('Error creating component:', error, componentData);
      return null;
    }
  }

  getMaterial(color) {
    if (!this.materials.has(color)) {
      this.materials.set(color, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide
      }));
    }
    return this.materials.get(color);
  }

  createFloor(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const geometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  createColumn(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const geometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  createWall(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const geometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  createBeam(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const geometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  createDuct(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const ductGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const mesh = new THREE.Mesh(ductGeometry, material);
    mesh.castShadow = true;
    group.add(mesh);

    const flangeMaterial = this.getMaterial('#666666');
    const flangeGeometry = new THREE.BoxGeometry(
      dimensions.width * 1.1,
      dimensions.height * 1.1,
      0.05
    );
    
    const flange1 = new THREE.Mesh(flangeGeometry, flangeMaterial);
    flange1.position.z = -dimensions.depth / 2;
    group.add(flange1);

    const flange2 = new THREE.Mesh(flangeGeometry, flangeMaterial);
    flange2.position.z = dimensions.depth / 2;
    group.add(flange2);

    return group;
  }

  createAHU(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const bodyGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const body = new THREE.Mesh(bodyGeometry, material);
    body.castShadow = true;
    group.add(body);

    const fanMaterial = this.getMaterial('#444444');
    const fanGeometry = new THREE.CylinderGeometry(
      dimensions.width * 0.3,
      dimensions.width * 0.3,
      0.1,
      8
    );
    const fan = new THREE.Mesh(fanGeometry, fanMaterial);
    fan.position.y = dimensions.height / 2 + 0.05;
    fan.rotation.x = Math.PI / 2;
    group.add(fan);

    return group;
  }

  createDiffuser(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const frameGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const frame = new THREE.Mesh(frameGeometry, material);
    group.add(frame);

    const vaneMaterial = this.getMaterial('#888888');
    const vaneCount = 3;
    const vaneSpacing = dimensions.width / (vaneCount + 1);
    
    for (let i = 1; i <= vaneCount; i++) {
      const vaneGeometry = new THREE.BoxGeometry(
        0.02,
        dimensions.height * 0.8,
        dimensions.depth * 0.9
      );
      const vane = new THREE.Mesh(vaneGeometry, vaneMaterial);
      vane.position.x = -dimensions.width / 2 + i * vaneSpacing;
      group.add(vane);
    }

    return group;
  }

  createPipe(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const radius = Math.max(dimensions.width, dimensions.height) / 2;
    const pipeGeometry = new THREE.CylinderGeometry(
      radius,
      radius,
      dimensions.depth,
      12
    );
    const pipe = new THREE.Mesh(pipeGeometry, material);
    pipe.rotation.x = Math.PI / 2;
    pipe.castShadow = true;
    group.add(pipe);

    return group;
  }

  createFixture(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const baseGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height * 0.2,
      dimensions.depth
    );
    const base = new THREE.Mesh(baseGeometry, material);
    base.position.y = -dimensions.height * 0.4;
    base.castShadow = true;
    group.add(base);

    const tankMaterial = this.getMaterial('#f0f0f0');
    const tankGeometry = new THREE.BoxGeometry(
      dimensions.width * 0.8,
      dimensions.height * 0.5,
      dimensions.depth * 0.8
    );
    const tank = new THREE.Mesh(tankGeometry, tankMaterial);
    tank.position.y = dimensions.height * 0.15;
    tank.castShadow = true;
    group.add(tank);

    return group;
  }

  createCableTray(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const bottomGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const bottom = new THREE.Mesh(bottomGeometry, material);
    bottom.castShadow = true;
    group.add(bottom);

    const sideGeometry = new THREE.BoxGeometry(
      0.02,
      dimensions.height * 3,
      dimensions.depth
    );
    
    const leftSide = new THREE.Mesh(sideGeometry, material);
    leftSide.position.x = -dimensions.width / 2;
    leftSide.position.y = dimensions.height;
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeometry, material);
    rightSide.position.x = dimensions.width / 2;
    rightSide.position.y = dimensions.height;
    group.add(rightSide);

    const cableMaterial = this.getMaterial('#2563eb');
    for (let i = 0; i < 5; i++) {
      const cableGeometry = new THREE.CylinderGeometry(
        0.015,
        0.015,
        dimensions.depth,
        6
      );
      const cable = new THREE.Mesh(cableGeometry, cableMaterial);
      cable.rotation.x = Math.PI / 2;
      cable.position.x = (i - 2) * 0.05;
      cable.position.y = dimensions.height * 2;
      group.add(cable);
    }

    return group;
  }

  createPanel(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const bodyGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const body = new THREE.Mesh(bodyGeometry, material);
    body.castShadow = true;
    group.add(body);

    const doorMaterial = this.getMaterial('#555555');
    const doorGeometry = new THREE.BoxGeometry(
      dimensions.width * 0.9,
      dimensions.height * 0.9,
      0.02
    );
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.z = dimensions.depth / 2 + 0.01;
    group.add(door);

    const handleGeometry = new THREE.BoxGeometry(0.02, 0.1, 0.02);
    const handle = new THREE.Mesh(handleGeometry, doorMaterial);
    handle.position.set(dimensions.width * 0.35, 0, dimensions.depth / 2 + 0.03);
    group.add(handle);

    return group;
  }

  createLight(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const frameGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const frame = new THREE.Mesh(frameGeometry, material);
    group.add(frame);

    const diffuserMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0xffffee,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const diffuserGeometry = new THREE.BoxGeometry(
      dimensions.width * 0.9,
      dimensions.height * 0.8,
      dimensions.depth * 0.9
    );
    const diffuser = new THREE.Mesh(diffuserGeometry, diffuserMaterial);
    diffuser.position.y = -dimensions.height / 4;
    group.add(diffuser);

    return group;
  }

  createSprinkler(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const headGeometry = new THREE.ConeGeometry(
      dimensions.width * 0.8,
      dimensions.height * 0.4,
      8
    );
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = -dimensions.height * 0.2;
    head.castShadow = true;
    group.add(head);

    const stemGeometry = new THREE.CylinderGeometry(
      dimensions.width * 0.3,
      dimensions.width * 0.3,
      dimensions.height * 0.6,
      8
    );
    const stem = new THREE.Mesh(stemGeometry, material);
    stem.position.y = dimensions.height * 0.3;
    group.add(stem);

    return group;
  }

  createHydrant(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const bodyGeometry = new THREE.BoxGeometry(
      dimensions.width,
      dimensions.height,
      dimensions.depth
    );
    const body = new THREE.Mesh(bodyGeometry, material);
    body.castShadow = true;
    group.add(body);

    const doorMaterial = this.getMaterial('#cc0000');
    const doorGeometry = new THREE.BoxGeometry(
      dimensions.width * 0.85,
      dimensions.height * 0.85,
      0.03
    );
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.z = dimensions.depth / 2 + 0.015;
    group.add(door);

    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff0000,
      emissiveIntensity: 0.2
    });
    const signGeometry = new THREE.BoxGeometry(
      dimensions.width * 0.3,
      dimensions.height * 0.15,
      0.01
    );
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(0, dimensions.height * 0.3, dimensions.depth / 2 + 0.05);
    group.add(sign);

    return group;
  }

  createGeneric(dimensions, color) {
    const group = new THREE.Group();
    const material = this.getMaterial(color);

    const geometry = new THREE.BoxGeometry(
      dimensions.width || 1,
      dimensions.height || 1,
      dimensions.depth || 1
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);

    return group;
  }

  createCollisionMarker(position, type = 'hard') {
    const color = type === 'hard' ? 0xef4444 : 0xf59e0b;
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    
    const ringGeometry = new THREE.RingGeometry(0.6, 0.8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    marker.add(ring);

    return marker;
  }

  dispose() {
    this.materials.forEach(material => material.dispose());
    this.materials.clear();
  }
}

export default ComponentFactory;
