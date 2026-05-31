class PipelineModeler {
    constructor(scene, camera, renderer, dataStore) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.dataStore = dataStore || null;

        this.pipelineGroup = new THREE.Group();
        this.pipelineGroup.name = 'pipelines';
        this.scene.add(this.pipelineGroup);

        this.tunnelGroup = new THREE.Group();
        this.tunnelGroup.name = 'tunnel';
        this.scene.add(this.tunnelGroup);

        this.pipelines = new Map();
        this.lodObjects = [];
        this.renderOrder = 10;

        this.geometryCache = new Map();
        this.materialCache = new Map();
        this.instanceGroups = new Map();

        this.globalOpacity = 1.0;
        this.typeOpacity = {};
        this.hiddenTypes = new Set();

        this.performanceMonitor = {
            totalMeshes: 0,
            totalVertices: 0,
            totalTriangles: 0,
            visiblePipelines: 0,
            culledPipelines: 0
        };

        this.frustumCulling = true;
        this.lodEnabled = true;
        this.instancingEnabled = true;

        this.initRendererSettings();
        this.initDataStoreListeners();
    }

    initRendererSettings() {
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.antialias = true;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.physicallyCorrectLights = true;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.2;
        }
    }

    initDataStoreListeners() {
        if (!this.dataStore) return;

        this.dataStore.on('pipelinesUpdated', (pipelines) => {
            this.buildPipelinesFromStore(pipelines);
        });

        this.dataStore.on('pipelineAdded', (pipeline) => {
            this.createPipelineFromStore(pipeline);
        });

        this.dataStore.on('pipelineUpdated', (pipeline) => {
            this.updatePipeline(pipeline);
        });

        this.dataStore.on('pipelineRemoved', (pipeline) => {
            this.removePipeline(pipeline.id);
        });

        this.dataStore.on('sectionsUpdated', (sections) => {
            this.buildTunnel(sections);
        });
    }

    getTypeColor(type) {
        return this.dataStore ? this.dataStore.getTypeColor(type) : 0xCCCCCC;
    }

    getTypeLabel(type) {
        return this.dataStore ? this.dataStore.getTypeLabel(type) : type;
    }

    getGeometryCacheKey(params) {
        return Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
    }

    getCachedGeometry(type, params) {
        const key = this.getGeometryCacheKey({ type, ...params });
        if (this.geometryCache.has(key)) {
            return this.geometryCache.get(key);
        }
        return null;
    }

    cacheGeometry(type, params, geometry) {
        const key = this.getGeometryCacheKey({ type, ...params });
        if (!this.geometryCache.has(key)) {
            this.geometryCache.set(key, geometry);
        }
        return geometry;
    }

    getCachedMaterial(type, color, options = {}) {
        const key = `mat|${type}|${color}|${JSON.stringify(options)}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key).clone();
        }

        const material = new THREE.MeshStandardMaterial({
            color: color,
            metalness: options.metalness || 0.2,
            roughness: options.roughness || 0.4,
            transparent: true,
            opacity: options.opacity ?? 0.92,
            side: THREE.FrontSide,
            depthWrite: options.depthWrite !== false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: options.polygonOffsetFactor || 0,
            polygonOffsetUnits: options.polygonOffsetUnits || 0,
            emissive: color,
            emissiveIntensity: options.emissiveIntensity || 0.03
        });

        this.materialCache.set(key, material);
        return material.clone();
    }

    getEffectiveOpacity(type) {
        const typeOp = this.typeOpacity[type];
        if (typeOp !== undefined) {
            return typeOp * this.globalOpacity;
        }
        return this.globalOpacity;
    }

    setGlobalOpacity(opacity) {
        this.globalOpacity = Math.max(0.1, Math.min(1.0, opacity));
        this.updateAllOpacity();
    }

    setTypeOpacity(type, opacity) {
        this.typeOpacity[type] = Math.max(0.1, Math.min(1.0, opacity));
        this.updateTypeOpacity(type);
    }

    resetTypeOpacity(type) {
        if (type) {
            delete this.typeOpacity[type];
            this.updateTypeOpacity(type);
        } else {
            this.typeOpacity = {};
            this.updateAllOpacity();
        }
    }

    setTypeVisible(type, visible) {
        if (visible) {
            this.hiddenTypes.delete(type);
        } else {
            this.hiddenTypes.add(type);
        }
        this.updateTypeVisibility(type, visible);
    }

    updateAllOpacity() {
        this.pipelines.forEach((entry, id) => {
            const effOpacity = this.getEffectiveOpacity(entry.data.type);
            entry.group.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.opacity = effOpacity;
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    updateTypeOpacity(type) {
        this.pipelines.forEach((entry, id) => {
            if (entry.data.type === type) {
                const effOpacity = this.getEffectiveOpacity(type);
                entry.group.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.opacity = effOpacity;
                        child.material.needsUpdate = true;
                    }
                });
            }
        });
    }

    updateTypeVisibility(type, visible) {
        this.pipelines.forEach((entry, id) => {
            if (entry.data.type === type) {
                entry.group.visible = visible;
            }
        });
    }

    buildPipelines(dataList) {
        this.clearPipelines();
        dataList.forEach(data => this.createPipeline(data));
    }

    buildPipelinesFromStore(pipelines) {
        this.clearPipelines();
        pipelines.forEach(p => this.createPipelineFromStore(p));
    }

    getOptimalRadialSegments(radius, distance) {
        if (distance < 20) return Math.max(24, Math.ceil(32 + radius * 40));
        if (distance < 50) return Math.max(16, Math.ceil(20 + radius * 25));
        if (distance < 100) return 12;
        return 8;
    }

    createPipelineFromStore(pipelineData) {
        return this.createPipelineInternal(pipelineData);
    }

    createPipeline(data) {
        const enriched = this.dataStore
            ? this.dataStore.enrichPipelineData(data)
            : this.enrichData(data);
        return this.createPipelineInternal(enriched);
    }

    enrichData(data) {
        const start = new THREE.Vector3(data.startX, data.startY, data.startZ);
        const end = new THREE.Vector3(data.endX, data.endY, data.endZ);
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const mid = start.clone().add(end).multiplyScalar(0.5);
        const radius = Math.max(0.01, data.radius || 0.05);
        const dirNormalized = length > 0 ? direction.clone().normalize() : new THREE.Vector3(0, 0, 1);

        return {
            ...data,
            start,
            end,
            mid,
            direction,
            dirNormalized,
            length,
            radius,
            typeColor: this.getTypeColor(data.type)
        };
    }

    createPipelineInternal(p) {
        const group = new THREE.Group();
        group.userData = { pipelineData: p };

        const color = p.typeColor;
        const camDistance = this.camera ? this.camera.position.distanceTo(p.mid) : 50;
        const effOpacity = this.getEffectiveOpacity(p.type);

        const lod = new THREE.LOD();
        const radialSegmentsHi = this.getOptimalRadialSegments(p.radius, 30);
        const radialSegmentsMed = this.getOptimalRadialSegments(p.radius, 60);
        const radialSegmentsLo = this.getOptimalRadialSegments(p.radius, 100);

        const tubeHi = this.createTubeMesh(p, color, radialSegmentsHi, 2, true, effOpacity);
        const tubeMed = this.createTubeMesh(p, color, radialSegmentsMed, 1, false, effOpacity);
        const tubeLo = this.createTubeMesh(p, color, Math.max(8, Math.floor(radialSegmentsLo / 2)), 1, false, effOpacity);

        lod.addLevel(tubeHi, 0);
        lod.addLevel(tubeMed, 35);
        lod.addLevel(tubeLo, 70);
        lod.position.set(0, 0, 0);
        this.lodObjects.push(lod);
        group.add(lod);

        const capGeo = this.getCachedGeometry('sphere', { radius: p.radius * 1.001, segments: Math.min(32, radialSegmentsHi + 8) }) ||
            this.cacheGeometry('sphere', { radius: p.radius * 1.001, segments: Math.min(32, radialSegmentsHi + 8) },
                new THREE.SphereGeometry(p.radius * 1.001, Math.min(32, radialSegmentsHi + 8), Math.min(16, radialSegmentsHi / 2)));

        const capMat = this.getCachedMaterial('cap', color, {
            metalness: 0.15, roughness: 0.45, opacity: effOpacity,
            polygonOffsetFactor: -0.5, polygonOffsetUnits: -1, emissiveIntensity: 0
        });

        const capStart = new THREE.Mesh(capGeo, capMat);
        capStart.position.copy(p.start);
        capStart.renderOrder = this.renderOrder + 1;
        group.add(capStart);

        const capEnd = new THREE.Mesh(capGeo, capMat);
        capEnd.position.copy(p.end);
        capEnd.renderOrder = this.renderOrder + 1;
        group.add(capEnd);

        const seamGeo = this.getCachedGeometry('torus', { radius: p.radius * 0.998, tube: p.radius * 0.06, radialSegments: 8, tubularSegments: Math.min(32, radialSegmentsHi) }) ||
            this.cacheGeometry('torus', { radius: p.radius * 0.998, tube: p.radius * 0.06, radialSegments: 8, tubularSegments: Math.min(32, radialSegmentsHi) },
                new THREE.TorusGeometry(p.radius * 0.998, p.radius * 0.06, 8, Math.min(32, radialSegmentsHi)));

        const seamMat = this.getCachedMaterial('seam', color, {
            metalness: 0.2, roughness: 0.35, opacity: effOpacity * 0.95,
            polygonOffsetFactor: -1, polygonOffsetUnits: -2, emissiveIntensity: 0
        });

        const orientQuat = new THREE.Quaternion();
        orientQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dirNormalized);

        const seamStart = new THREE.Mesh(seamGeo, seamMat);
        seamStart.position.copy(p.start);
        seamStart.setRotationFromQuaternion(orientQuat);
        seamStart.rotateX(Math.PI / 2);
        group.add(seamStart);

        const seamEnd = seamStart.clone();
        seamEnd.position.copy(p.end);
        group.add(seamEnd);

        const ringGeo = this.getCachedGeometry('torus_ring', { radius: p.radius * 0.999, tube: p.radius * 0.025, radialSegments: 6, tubularSegments: Math.min(24, radialSegmentsMed) }) ||
            this.cacheGeometry('torus_ring', { radius: p.radius * 0.999, tube: p.radius * 0.025, radialSegments: 6, tubularSegments: Math.min(24, radialSegmentsMed) },
                new THREE.TorusGeometry(p.radius * 0.999, p.radius * 0.025, 6, Math.min(24, radialSegmentsMed)));

        const ringMat = this.getCachedMaterial('ring', color, {
            metalness: 0.25, roughness: 0.3, opacity: effOpacity * 0.8,
            polygonOffsetFactor: -0.8, polygonOffsetUnits: -1.5, emissiveIntensity: 0.05
        });

        for (let i = 1; i <= 3; i++) {
            const t = i / 4;
            const ringPos = p.start.clone().lerp(p.end, t);
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(ringPos);
            ring.setRotationFromQuaternion(orientQuat);
            ring.rotateX(Math.PI / 2);
            group.add(ring);
        }

        const labelSprite = this.createLabel(p.name, color);
        labelSprite.position.copy(p.mid);
        labelSprite.position.y += p.radius + 0.3;
        labelSprite.renderOrder = 999;
        group.add(labelSprite);

        if (this.hiddenTypes.has(p.type)) {
            group.visible = false;
        }

        this.pipelineGroup.add(group);
        this.pipelines.set(p.id, { group, tube: tubeHi, data: p, lod, caps: [capStart, capEnd] });

        this.updatePerformanceStats();
        return group;
    }

    createTubeMesh(p, color, radialSegments, heightSegments, highQuality, opacity) {
        const geoCacheKey = {
            type: 'tube',
            startX: p.start.x, startY: p.start.y, startZ: p.start.z,
            endX: p.end.x, endY: p.end.y, endZ: p.end.z,
            radius: p.radius, radialSegments, heightSegments
        };

        let tubeGeometry = this.getCachedGeometry('tube', geoCacheKey);
        if (!tubeGeometry) {
            const curve = new THREE.LineCurve3(p.start.clone(), p.end.clone());
            tubeGeometry = new THREE.TubeGeometry(curve, Math.max(8, heightSegments * 4), p.radius, radialSegments, false);
            tubeGeometry.computeVertexNormals();
            this.cacheGeometry('tube', geoCacheKey, tubeGeometry);
        }

        const tubeMaterial = this.getCachedMaterial('tube', color, {
            metalness: highQuality ? 0.25 : 0.1,
            roughness: highQuality ? 0.35 : 0.55,
            opacity: opacity,
            emissiveIntensity: highQuality ? 0.03 : 0
        });

        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.castShadow = true;
        tube.receiveShadow = true;
        tube.renderOrder = this.renderOrder;

        return tube;
    }

    createLabel(text, color) {
        const cacheKey = `label|${text}|${color}`;
        if (this.materialCache.has(cacheKey)) {
            const mat = this.materialCache.get(cacheKey).clone();
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(4, 1, 1);
            return sprite;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = 2;
        canvas.width = 512 * dpr;
        canvas.height = 128 * dpr;
        ctx.scale(dpr, dpr);

        const gradient = ctx.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, 'rgba(0, 20, 40, 0.92)');
        gradient.addColorStop(1, 'rgba(0, 40, 80, 0.85)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 128, 12);
        ctx.fill();

        ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(1.5, 1.5, 509, 125, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(text, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = this.renderer ? this.renderer.capabilities.getMaxAnisotropy() : 8;
        texture.needsUpdate = true;

        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });

        this.materialCache.set(cacheKey, spriteMat);

        const sprite = new THREE.Sprite(spriteMat.clone());
        sprite.scale.set(4, 1, 1);
        return sprite;
    }

    buildTunnel(sectionData) {
        this.clearTunnel();
        sectionData.forEach(section => {
            this.createTunnelSection(section);
        });
    }

    createTunnelSection(section) {
        const group = new THREE.Group();
        const l = section.length || 100;
        const w = section.width || 3.5;
        const h = section.height || 3.0;

        const floorGeo = this.getCachedGeometry('floor', { width: l, height: w, wSeg: 64, hSeg: 16 }) ||
            this.cacheGeometry('floor', { width: l, height: w, wSeg: 64, hSeg: 16 },
                new THREE.PlaneGeometry(l, w, 64, 16));

        const floorMat = this.getCachedMaterial('tunnel_floor', 0x3a3a3a, {
            transparent: true, opacity: 0.65, side: THREE.DoubleSide,
            roughness: 0.9, metalness: 0.05, depthWrite: false
        });

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(l / 2, 0, 0);
        floor.receiveShadow = true;
        group.add(floor);

        const ceilingGeo = this.getCachedGeometry('ceiling', { width: l, height: w, wSeg: 64, hSeg: 16 }) ||
            this.cacheGeometry('ceiling', { width: l, height: w, wSeg: 64, hSeg: 16 },
                new THREE.PlaneGeometry(l, w, 64, 16));

        const ceilingMat = this.getCachedMaterial('tunnel_ceiling', 0x666666, {
            transparent: true, opacity: 0.4, side: THREE.DoubleSide,
            roughness: 0.7, depthWrite: false
        });

        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(l / 2, h, 0);
        group.add(ceiling);

        const wallMat = this.getCachedMaterial('tunnel_wall', 0x4a4a4a, {
            transparent: true, opacity: 0.35, side: THREE.DoubleSide,
            roughness: 0.8, depthWrite: false
        });

        const wallLGeo = this.getCachedGeometry('wall', { width: l, height: h, wSeg: 64, hSeg: 16 }) ||
            this.cacheGeometry('wall', { width: l, height: h, wSeg: 64, hSeg: 16 },
                new THREE.PlaneGeometry(l, h, 64, 16));

        const wallL = new THREE.Mesh(wallLGeo, wallMat);
        wallL.position.set(l / 2, h / 2, -w / 2);
        group.add(wallL);

        const wallR = new THREE.Mesh(wallLGeo, wallMat);
        wallR.position.set(l / 2, h / 2, w / 2);
        wallR.rotation.y = Math.PI;
        group.add(wallR);

        const edgeMat = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.7,
            linewidth: 2
        });

        const boxGeo = this.getCachedGeometry('box', { w: l, h: h, d: w, wSeg: 64, hSeg: 16, dSeg: 16 }) ||
            this.cacheGeometry('box', { w: l, h: h, d: w, wSeg: 64, hSeg: 16, dSeg: 16 },
                new THREE.BoxGeometry(l, h, w, 64, 16, 16));

        const edgesGeo = new THREE.EdgesGeometry(boxGeo, 20);
        const edges = new THREE.LineSegments(edgesGeo, edgeMat);
        edges.position.set(l / 2, h / 2, 0);
        edges.renderOrder = 5;
        group.add(edges);

        const gridHelper = new THREE.GridHelper(l, 60, 0x226644, 0x1a4433);
        gridHelper.position.set(l / 2, 0.001, 0);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.3;
        group.add(gridHelper);

        const sectionLabel = this.createLabel(section.name, 0x00ff88);
        sectionLabel.position.set(l / 2, h + 0.5, 0);
        sectionLabel.renderOrder = 999;
        group.add(sectionLabel);

        group.userData = { sectionData: section };
        this.tunnelGroup.add(group);
        return group;
    }

    updatePipeline(updatedData) {
        const entry = this.pipelines.get(updatedData.id);
        if (!entry) return;

        this.removePipeline(updatedData.id);
        this.createPipelineFromStore(updatedData);
    }

    removePipeline(id) {
        const entry = this.pipelines.get(id);
        if (!entry) return;

        const lodIdx = this.lodObjects.indexOf(entry.lod);
        if (lodIdx > -1) this.lodObjects.splice(lodIdx, 1);

        this.disposeGroup(entry.group);
        this.pipelineGroup.remove(entry.group);
        this.pipelines.delete(id);
        this.updatePerformanceStats();
    }

    highlightPipeline(id, highlight = true) {
        const entry = this.pipelines.get(id);
        if (!entry) return;

        entry.group.traverse(child => {
            if (child.isMesh && child.material) {
                if (highlight) {
                    child.material.emissive = new THREE.Color(0xffff00);
                    child.material.emissiveIntensity = 0.4;
                    child.material.opacity = 1.0;
                    if (child.material.polygonOffset !== undefined) {
                        child.material.polygonOffsetFactor = -2;
                        child.material.polygonOffsetUnits = -4;
                    }
                } else {
                    const effOpacity = this.getEffectiveOpacity(entry.data.type);
                    child.material.emissive = new THREE.Color(child.material.color);
                    child.material.emissiveIntensity = child.geometry && child.geometry.type === 'TubeGeometry' ? 0.03 : 0;
                    child.material.opacity = effOpacity;
                    if (child.material.polygonOffset !== undefined) {
                        child.material.polygonOffsetFactor = 0;
                        child.material.polygonOffsetUnits = 0;
                    }
                }
                child.material.needsUpdate = true;
            }
        });
    }

    isolatePipeline(id) {
        this.pipelines.forEach((entry, pid) => {
            entry.group.visible = pid === id;
        });
    }

    showAll() {
        this.pipelines.forEach(entry => {
            entry.group.visible = !this.hiddenTypes.has(entry.data.type);
            this.highlightPipeline(entry.data.id, false);
        });
    }

    filterByType(type) {
        this.pipelines.forEach((entry, pid) => {
            entry.group.visible = !type || entry.data.type === type;
        });
    }

    updateLOD() {
        if (!this.lodEnabled || !this.camera) return;

        this.lodObjects.forEach(lod => {
            lod.update(this.camera);
        });
    }

    updateFrustumCulling() {
        if (!this.frustumCulling || !this.camera || !this.dataStore) return;

        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(projScreenMatrix);

        let visibleCount = 0;
        let culledCount = 0;

        this.pipelines.forEach((entry, id) => {
            const pipelineData = this.dataStore.getPipeline(id);
            if (pipelineData && !this.hiddenTypes.has(pipelineData.type)) {
                const isVisible = frustum.intersectsBox(pipelineData.boundingBox);
                entry.group.visible = isVisible;
                if (isVisible) visibleCount++;
                else culledCount++;
            }
        });

        this.performanceMonitor.visiblePipelines = visibleCount;
        this.performanceMonitor.culledPipelines = culledCount;
    }

    updatePerformanceStats() {
        let meshCount = 0;
        let vertexCount = 0;
        let triangleCount = 0;

        this.pipelineGroup.traverse(child => {
            if (child.isMesh) {
                meshCount++;
                if (child.geometry) {
                    const posAttr = child.geometry.getAttribute('position');
                    if (posAttr) {
                        vertexCount += posAttr.count;
                        const index = child.geometry.getIndex();
                        if (index) {
                            triangleCount += index.count / 3;
                        } else {
                            triangleCount += posAttr.count / 3;
                        }
                    }
                }
            }
        });

        this.performanceMonitor.totalMeshes = meshCount;
        this.performanceMonitor.totalVertices = vertexCount;
        this.performanceMonitor.totalTriangles = Math.floor(triangleCount);
    }

    getPerformanceStats() {
        return {
            ...this.performanceMonitor,
            geometryCacheSize: this.geometryCache.size,
            materialCacheSize: this.materialCache.size,
            totalPipelines: this.pipelines.size
        };
    }

    clearCaches() {
        this.geometryCache.forEach(geo => geo.dispose());
        this.materialCache.forEach(mat => mat.dispose());
        this.geometryCache.clear();
        this.materialCache.clear();
    }

    clearPipelines() {
        while (this.pipelineGroup.children.length) {
            const child = this.pipelineGroup.children[0];
            this.disposeGroup(child);
            this.pipelineGroup.remove(child);
        }
        this.pipelines.clear();
        this.lodObjects = [];
        this.updatePerformanceStats();
    }

    clearTunnel() {
        while (this.tunnelGroup.children.length) {
            const child = this.tunnelGroup.children[0];
            this.disposeGroup(child);
            this.tunnelGroup.remove(child);
        }
    }

    disposeGroup(group) {
        group.traverse(child => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        if (m.normalMap) m.normalMap.dispose();
                        if (m.roughnessMap) m.roughnessMap.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.normalMap) child.material.normalMap.dispose();
                    if (child.material.roughnessMap) child.material.roughnessMap.dispose();
                    child.material.dispose();
                }
            }
        });
    }

    dispose() {
        this.clearPipelines();
        this.clearTunnel();
        this.clearCaches();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PipelineModeler;
}