class PartRenderer {
  constructor(scene) {
    this.scene = scene;
    this.partMeshes = new Map();
    this.materials = this.createMaterials();
    this.geometryCache = new Map();
    this.loadingQueue = [];
    this.isProcessingQueue = false;
    this.instancedMeshes = new Map();
    this.batchGroups = new Map();
    this.useInstancing = true;
    this.useBatching = true;
  }

  createMaterials() {
    const sharedMaterialProps = {
      envMapIntensity: 0.5,
      flatShading: false
    };

    return {
      brass: new THREE.MeshStandardMaterial({
        color: 0xB5A642,
        metalness: 0.75,
        roughness: 0.35,
        ...sharedMaterialProps
      }),
      copper: new THREE.MeshStandardMaterial({
        color: 0xB87333,
        metalness: 0.65,
        roughness: 0.45,
        ...sharedMaterialProps
      }),
      iron: new THREE.MeshStandardMaterial({
        color: 0x434343,
        metalness: 0.85,
        roughness: 0.25,
        ...sharedMaterialProps
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x71797E,
        metalness: 0.8,
        roughness: 0.3,
        ...sharedMaterialProps
      }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.15,
        ...sharedMaterialProps
      }),
      wood: new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        metalness: 0.1,
        roughness: 0.75,
        ...sharedMaterialProps
      }),
      highlight: new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.25,
        metalness: 0.5,
        roughness: 0.5
      }),
      selected: new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        emissive: 0x00aaff,
        emissiveIntensity: 0.2,
        metalness: 0.5,
        roughness: 0.5
      }),
      darkIron: new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.8,
        roughness: 0.3,
        ...sharedMaterialProps
      }),
      leather: new THREE.MeshStandardMaterial({
        color: 0x2c1810,
        roughness: 0.9,
        metalness: 0.1
      })
    };
  }

  getMaterialByColor(colorValue) {
    const colorMap = {
      0xB5A642: this.materials.brass,
      0xB87333: this.materials.copper,
      0x434343: this.materials.iron,
      0x71797E: this.materials.steel,
      0xFFD700: this.materials.gold,
      0x8B4513: this.materials.wood
    };
    return colorMap[colorValue] || this.materials.steel;
  }

  getCachedGeometry(key, creator) {
    if (!this.geometryCache.has(key)) {
      const geometry = creator();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.geometryCache.set(key, geometry);
    }
    return this.geometryCache.get(key);
  }

  createGear(partData) {
    const group = new THREE.Group();
    const teeth = partData.teeth || 8;
    const radius = 0.5;
    const thickness = 0.15;
    const cacheKey = `gear_${teeth}_${radius}_${thickness}`;

    const gearGeometry = this.getCachedGeometry(cacheKey, () => {
      const mainShape = new THREE.Shape();
      const toothDepth = 0.08;
      const toothWidth = (Math.PI * 2) / teeth * 0.4;

      for (let i = 0; i < teeth; i++) {
        const angle = (i / teeth) * Math.PI * 2;
        const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
        
        if (i === 0) {
          mainShape.moveTo(
            Math.cos(angle) * (radius - toothDepth),
            Math.sin(angle) * (radius - toothDepth)
          );
        }
        
        mainShape.lineTo(
          Math.cos(angle + toothWidth / 2) * (radius - toothDepth),
          Math.sin(angle + toothWidth / 2) * (radius - toothDepth)
        );
        mainShape.lineTo(
          Math.cos(angle + toothWidth / 2) * radius,
          Math.sin(angle + toothWidth / 2) * radius
        );
        mainShape.lineTo(
          Math.cos(nextAngle - toothWidth / 2) * radius,
          Math.sin(nextAngle - toothWidth / 2) * radius
        );
        mainShape.lineTo(
          Math.cos(nextAngle - toothWidth / 2) * (radius - toothDepth),
          Math.sin(nextAngle - toothWidth / 2) * (radius - toothDepth)
        );
      }
      mainShape.closePath();

      const holePath = new THREE.Path();
      holePath.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
      mainShape.holes.push(holePath);

      const extrudeSettings = {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 2
      };

      return new THREE.ExtrudeGeometry(mainShape, extrudeSettings);
    });

    const material = this.getMaterialByColor(partData.color);
    const mesh = new THREE.Mesh(gearGeometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const hubGeometry = this.getCachedGeometry('hub_0.15_0.18', () => 
      new THREE.CylinderGeometry(0.15, 0.15, thickness * 1.2, 12)
    );
    const hubMesh = new THREE.Mesh(hubGeometry, this.materials.steel);
    hubMesh.castShadow = true;
    group.add(hubMesh);

    return group;
  }

  createAxle(partData) {
    const group = new THREE.Group();
    const length = partData.length || 2;
    const radius = 0.08;
    const cacheKey = `axle_${length}_${radius}`;

    const shaftGeometry = this.getCachedGeometry(cacheKey, () =>
      new THREE.CylinderGeometry(radius, radius, length, 12)
    );

    const material = this.getMaterialByColor(partData.color);
    const mesh = new THREE.Mesh(shaftGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const capGeometry = this.getCachedGeometry('axle_cap', () =>
      new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 0.05, 12)
    );

    const topCap = new THREE.Mesh(capGeometry, this.materials.iron);
    topCap.position.y = length / 2;
    topCap.castShadow = true;
    group.add(topCap);

    const bottomCap = new THREE.Mesh(capGeometry, this.materials.iron);
    bottomCap.position.y = -length / 2;
    bottomCap.castShadow = true;
    group.add(bottomCap);

    return group;
  }

  createPlate(partData) {
    const group = new THREE.Group();
    const cols = partData.width || 2;
    const rows = partData.height || 2;
    const width = cols * 0.5;
    const height = rows * 0.5;
    const thickness = 0.1;

    const plateGeometry = this.getCachedGeometry(`plate_${cols}x${rows}`, () =>
      new THREE.BoxGeometry(width, thickness, height)
    );

    const material = this.getMaterialByColor(partData.color);
    const mesh = new THREE.Mesh(plateGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const studGeometry = this.getCachedGeometry('stud', () =>
      new THREE.CylinderGeometry(0.04, 0.032, 0.06, 6)
    );

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const stud = new THREE.Mesh(studGeometry, this.materials.iron);
        stud.position.set(
          (i - cols / 2 + 0.5) * 0.5,
          thickness / 2 + 0.03,
          (j - rows / 2 + 0.5) * 0.5
        );
        stud.castShadow = true;
        group.add(stud);
      }
    }

    return group;
  }

  createLever(partData) {
    const group = new THREE.Group();
    const length = partData.length || 1.5;

    const handleGeometry = this.getCachedGeometry(`lever_handle_${length}`, () =>
      new THREE.BoxGeometry(0.08, 0.08, length)
    );

    const handleMaterial = this.getMaterialByColor(partData.color);
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.castShadow = true;
    group.add(handle);

    const pivotGeometry = this.getCachedGeometry('lever_pivot', () =>
      new THREE.CylinderGeometry(0.1, 0.1, 0.15, 10)
    );
    const pivot = new THREE.Mesh(pivotGeometry, this.materials.iron);
    pivot.rotation.x = Math.PI / 2;
    pivot.castShadow = true;
    group.add(pivot);

    const knobGeometry = this.getCachedGeometry('lever_knob', () =>
      new THREE.SphereGeometry(0.08, 8, 8)
    );
    const knob = new THREE.Mesh(knobGeometry, this.materials.wood);
    knob.position.z = length / 2 - 0.1;
    knob.castShadow = true;
    group.add(knob);

    return group;
  }

  createWheel(partData) {
    const group = new THREE.Group();
    const radius = partData.radius || 0.5;
    const thickness = 0.1;

    const rimGeometry = this.getCachedGeometry(`wheel_rim_${radius}`, () =>
      new THREE.TorusGeometry(radius, 0.05, 6, 16)
    );
    const rimMaterial = this.getMaterialByColor(partData.color);
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    group.add(rim);

    const hubGeometry = this.getCachedGeometry('wheel_hub', () =>
      new THREE.CylinderGeometry(0.08, 0.08, thickness * 1.5, 10)
    );
    const hub = new THREE.Mesh(hubGeometry, this.materials.steel);
    hub.castShadow = true;
    group.add(hub);

    const spokeGeometry = this.getCachedGeometry(`wheel_spoke_${radius}`, () =>
      new THREE.BoxGeometry(0.03, 0.03, radius * 2 - 0.1)
    );
    
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(spokeGeometry, this.materials.iron);
      spoke.rotation.y = (i / 4) * Math.PI;
      spoke.castShadow = true;
      group.add(spoke);
    }

    return group;
  }

  createSpring(partData) {
    const group = new THREE.Group();
    const length = partData.length || 1;
    const radius = 0.12;
    const coils = 6;

    const springGeometry = this.getCachedGeometry(`spring_${length}_${coils}`, () => {
      const points = [];
      for (let i = 0; i <= coils * 16; i++) {
        const t = i / (coils * 16);
        const angle = t * coils * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          t * length - length / 2,
          Math.sin(angle) * radius
        ));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, coils * 8, 0.02, 6, false);
    });

    const material = this.getMaterialByColor(partData.color);
    const spring = new THREE.Mesh(springGeometry, material);
    spring.castShadow = true;
    group.add(spring);

    return group;
  }

  createScrew(partData) {
    const group = new THREE.Group();
    const length = 0.4;
    const headRadius = 0.12;

    const shaftGeometry = this.getCachedGeometry('screw_shaft', () =>
      new THREE.CylinderGeometry(0.05, 0.05, length, 8)
    );
    const shaftMaterial = this.getMaterialByColor(partData.color);
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.y = -length / 2;
    shaft.castShadow = true;
    group.add(shaft);

    const headGeometry = this.getCachedGeometry('screw_head', () =>
      new THREE.CylinderGeometry(headRadius, headRadius * 0.8, 0.08, 6)
    );
    const head = new THREE.Mesh(headGeometry, this.materials.steel);
    head.position.y = 0.04;
    head.castShadow = true;
    group.add(head);

    const slotGeometry = this.getCachedGeometry('screw_slot', () =>
      new THREE.BoxGeometry(headRadius * 1.4, 0.015, 0.025)
    );
    const slot = new THREE.Mesh(slotGeometry, this.materials.darkIron);
    slot.position.y = 0.08;
    group.add(slot);

    return group;
  }

  createPipe(partData) {
    const group = new THREE.Group();
    const length = partData.length || 2;
    const outerRadius = 0.1;
    const innerRadius = 0.07;

    const outerGeometry = this.getCachedGeometry(`pipe_outer_${length}`, () =>
      new THREE.CylinderGeometry(outerRadius, outerRadius, length, 12, 1, true)
    );
    const material = this.getMaterialByColor(partData.color);
    const outer = new THREE.Mesh(outerGeometry, material);
    outer.castShadow = true;
    group.add(outer);

    const ringGeometry = this.getCachedGeometry(`pipe_ring_${outerRadius}_${innerRadius}`, () =>
      new THREE.TorusGeometry((outerRadius + innerRadius) / 2, (outerRadius - innerRadius) / 2, 4, 12)
    );

    const topRing = new THREE.Mesh(ringGeometry, material);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = length / 2;
    topRing.castShadow = true;
    group.add(topRing);

    const bottomRing = new THREE.Mesh(ringGeometry, material);
    bottomRing.rotation.x = Math.PI / 2;
    bottomRing.position.y = -length / 2;
    bottomRing.castShadow = true;
    group.add(bottomRing);

    return group;
  }

  createPiston(partData) {
    const group = new THREE.Group();
    const length = partData.length || 1.5;

    const cylinderGeometry = this.getCachedGeometry('piston_cylinder', () =>
      new THREE.CylinderGeometry(0.15, 0.15, length * 0.6, 12)
    );
    const cylinder = new THREE.Mesh(cylinderGeometry, this.materials.steel);
    cylinder.position.y = length * 0.1;
    cylinder.castShadow = true;
    group.add(cylinder);

    const rodGeometry = this.getCachedGeometry('piston_rod', () =>
      new THREE.CylinderGeometry(0.05, 0.05, length * 0.5, 8)
    );
    const rod = new THREE.Mesh(rodGeometry, this.materials.iron);
    rod.position.y = -length * 0.35;
    rod.castShadow = true;
    group.add(rod);

    const pinGeometry = this.getCachedGeometry('piston_pin', () =>
      new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8)
    );
    const pin = new THREE.Mesh(pinGeometry, this.materials.brass);
    pin.rotation.x = Math.PI / 2;
    pin.position.y = -length * 0.55;
    pin.castShadow = true;
    group.add(pin);

    return group;
  }

  createBelt(partData) {
    const group = new THREE.Group();
    const length = partData.length || 2;

    const beltGeometry = this.getCachedGeometry(`belt_${length}`, () => {
      const beltShape = new THREE.Shape();
      beltShape.moveTo(-length / 2, -0.04);
      beltShape.lineTo(length / 2, -0.04);
      beltShape.lineTo(length / 2, 0.04);
      beltShape.lineTo(-length / 2, 0.04);
      beltShape.closePath();

      const extrudeSettings = { depth: 0.02, bevelEnabled: false };
      return new THREE.ExtrudeGeometry(beltShape, extrudeSettings);
    });

    const belt = new THREE.Mesh(beltGeometry, this.materials.leather);
    belt.rotation.x = Math.PI / 2;
    belt.castShadow = true;
    group.add(belt);

    return group;
  }

  createPartMesh(partData) {
    let mesh;
    
    switch (partData.type) {
      case 'gear':
        mesh = this.createGear(partData);
        break;
      case 'axle':
        mesh = this.createAxle(partData);
        break;
      case 'plate':
        mesh = this.createPlate(partData);
        break;
      case 'lever':
        mesh = this.createLever(partData);
        break;
      case 'wheel':
        mesh = this.createWheel(partData);
        break;
      case 'spring':
        mesh = this.createSpring(partData);
        break;
      case 'screw':
        mesh = this.createScrew(partData);
        break;
      case 'pipe':
        mesh = this.createPipe(partData);
        break;
      case 'piston':
        mesh = this.createPiston(partData);
        break;
      case 'belt':
        mesh = this.createBelt(partData);
        break;
      default:
        mesh = new THREE.Group();
        const defaultGeo = this.getCachedGeometry('default_cube', () =>
          new THREE.BoxGeometry(0.5, 0.5, 0.5)
        );
        mesh.add(new THREE.Mesh(defaultGeo, this.materials.steel));
    }

    mesh.position.set(
      partData.position.x || 0,
      partData.position.y || 0,
      partData.position.z || 0
    );
    mesh.rotation.set(
      partData.rotation.x || 0,
      partData.rotation.y || 0,
      partData.rotation.z || 0
    );
    
    const scale = partData.scale || 1;
    mesh.scale.set(scale, scale, scale);
    
    mesh.userData.partId = partData.id;
    mesh.userData.partType = partData.type;
    mesh.matrixAutoUpdate = true;

    this.partMeshes.set(partData.id, mesh);
    this.scene.add(mesh);

    return mesh;
  }

  updatePart(partData) {
    const mesh = this.partMeshes.get(partData.id);
    if (mesh) {
      if (partData.position) {
        mesh.position.set(
          partData.position.x,
          partData.position.y,
          partData.position.z
        );
      }
      if (partData.rotation) {
        mesh.rotation.set(
          partData.rotation.x,
          partData.rotation.y,
          partData.rotation.z
        );
      }
    }
  }

  removePart(partId) {
    const mesh = this.partMeshes.get(partId);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
        }
      });
      this.partMeshes.delete(partId);
    }
  }

  getPartMesh(partId) {
    return this.partMeshes.get(partId);
  }

  highlightPart(partId, isHighlighted) {
    const mesh = this.partMeshes.get(partId);
    if (mesh) {
      mesh.traverse((child) => {
        if (child.isMesh) {
          if (isHighlighted) {
            if (!child.userData.isHighlighted) {
              child.userData.originalMaterial = child.material;
              child.material = this.materials.highlight;
              child.userData.isHighlighted = true;
            }
          } else if (child.userData.isHighlighted) {
            if (child.userData.originalMaterial) {
              child.material = child.userData.originalMaterial;
            }
            child.userData.isHighlighted = false;
          }
        }
      });
    }
  }

  selectPart(partId, isSelected) {
    const mesh = this.partMeshes.get(partId);
    if (mesh) {
      mesh.traverse((child) => {
        if (child.isMesh) {
          if (isSelected) {
            if (!child.userData.isSelected) {
              child.userData.originalMaterial = child.material;
              child.material = this.materials.selected;
              child.userData.isSelected = true;
            }
          } else if (child.userData.isSelected) {
            if (child.userData.originalMaterial) {
              child.material = child.userData.originalMaterial;
            }
            child.userData.isSelected = false;
          }
        }
      });
    }
  }

  createInstancedMesh(geometry, material, maxCount = 100) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return instancedMesh;
  }

  getOrCreateInstancedMesh(cacheKey, geometry, material) {
    const key = `${cacheKey}_${material.name || 'default'}`;
    if (!this.instancedMeshes.has(key)) {
      const instancedMesh = this.createInstancedMesh(geometry, material);
      this.instancedMeshes.set(key, {
        mesh: instancedMesh,
        count: 0,
        instanceIds: []
      });
      this.scene.add(instancedMesh);
    }
    return this.instancedMeshes.get(key);
  }

  addToBatch(partId, cacheKey, geometry, material, position, rotation, scale) {
    if (!this.useBatching) return false;

    const batch = this.getOrCreateInstancedMesh(cacheKey, geometry, material);
    const index = batch.count;
    
    if (index >= batch.mesh.count) return false;

    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    dummy.rotation.copy(rotation);
    dummy.scale.copy(scale);
    dummy.updateMatrix();
    
    batch.mesh.setMatrixAt(index, dummy.matrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.instanceIds.push(partId);
    batch.count++;

    return true;
  }

  updateBatchMatrix(cacheKey, partId, position, rotation, scale) {
    const key = `${cacheKey}_default`;
    const batch = this.instancedMeshes.get(key);
    if (!batch) return;

    const index = batch.instanceIds.indexOf(partId);
    if (index === -1) return;

    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    dummy.rotation.copy(rotation);
    dummy.scale.copy(scale);
    dummy.updateMatrix();
    
    batch.mesh.setMatrixAt(index, dummy.matrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
  }

  mergeGeometries(geometries, transforms) {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];

    const mergedGeometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let indexOffset = 0;

    geometries.forEach((geometry, i) => {
      const transform = transforms[i] || new THREE.Matrix4();
      
      const posAttr = geometry.getAttribute('position');
      const normAttr = geometry.getAttribute('normal');
      const uvAttr = geometry.getAttribute('uv');
      const indexAttr = geometry.getIndex();

      if (!posAttr) return;

      const tempVec = new THREE.Vector3();
      for (let j = 0; j < posAttr.count; j++) {
        tempVec.fromBufferAttribute(posAttr, j);
        tempVec.applyMatrix4(transform);
        positions.push(tempVec.x, tempVec.y, tempVec.z);

        if (normAttr) {
          tempVec.fromBufferAttribute(normAttr, j);
          tempVec.transformDirection(transform);
          tempVec.normalize();
          normals.push(tempVec.x, tempVec.y, tempVec.z);
        }
      }

      if (uvAttr) {
        for (let j = 0; j < uvAttr.count; j++) {
          uvs.push(uvAttr.getX(j), uvAttr.getY(j));
        }
      }

      if (indexAttr) {
        for (let j = 0; j < indexAttr.count; j++) {
          indices.push(indexAttr.getX(j) + indexOffset);
        }
      } else {
        for (let j = 0; j < posAttr.count; j++) {
          indices.push(j + indexOffset);
        }
      }

      indexOffset += posAttr.count;
    });

    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    if (uvs.length > 0) {
      mergedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    if (indices.length > 0) {
      mergedGeometry.setIndex(indices);
    }

    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();

    return mergedGeometry;
  }

  clearAll() {
    this.partMeshes.forEach((mesh, partId) => {
      this.scene.remove(mesh);
      mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
        }
      });
    });
    this.partMeshes.clear();

    this.instancedMeshes.forEach((batch) => {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
    });
    this.instancedMeshes.clear();
    this.batchGroups.clear();
  }

  dispose() {
    this.clearAll();
    
    this.geometryCache.forEach((geometry) => {
      geometry.dispose();
    });
    this.geometryCache.clear();

    Object.values(this.materials).forEach(material => {
      material.dispose();
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PartRenderer;
}
