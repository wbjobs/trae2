class CollisionDetector {
    constructor(scene, dataStore, modeler) {
        this.scene = scene;
        this.dataStore = dataStore;
        this.modeler = modeler;

        this.collisionGroup = new THREE.Group();
        this.collisionGroup.name = 'collisions';
        this.scene.add(this.collisionGroup);

        this.collisionResults = [];
        this.isVisible = false;
        this.detectionProgress = 0;

        this.detectionMode = 'server';
        this.autoDetect = false;
        this.lastDetectionTime = 0;
        this.detectionThrottle = 2000;

        this.stats = {
            totalChecks: 0,
            broadphaseCulled: 0,
            detections: 0
        };
    }

    async detectCollisions(pipelineIds, tolerance) {
        this.detectionProgress = 0;
        this.stats.totalChecks = 0;
        this.stats.broadphaseCulled = 0;

        if (this.detectionMode === 'server') {
            return this.detectWithServer(pipelineIds, tolerance);
        } else {
            return this.detectLocal(pipelineIds, tolerance);
        }
    }

    async detectWithServer(pipelineIds, tolerance) {
        const body = { tolerance: tolerance || 0.1 };
        if (pipelineIds && pipelineIds.length > 0) {
            body.pipelineIds = pipelineIds;
        }

        try {
            const resp = await fetch('/api/collision/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await resp.json();
            if (result.success) {
                this.collisionResults = result.data;
                this.stats.detections = result.data.length;
                this.visualizeCollisions();
                return result.data;
            }
        } catch (e) {
            console.warn('服务器碰撞检测失败, 回退到本地检测:', e);
        }

        return this.detectLocal(pipelineIds, tolerance);
    }

    getPipelinesForDetection(pipelineIds) {
        if (!this.dataStore) return [];

        let pipelines = this.dataStore.getAllPipelines();
        if (pipelineIds && pipelineIds.length > 0) {
            pipelines = pipelines.filter(p => pipelineIds.includes(p.id));
        }

        return pipelines;
    }

    detectLocal(pipelineIds, tolerance) {
        const pipelines = this.getPipelinesForDetection(pipelineIds);
        const collisions = [];
        const tol = tolerance || 0.1;

        for (let i = 0; i < pipelines.length; i++) {
            for (let j = i + 1; j < pipelines.length; j++) {
                this.stats.totalChecks++;

                const pA = pipelines[i];
                const pB = pipelines[j];

                if (!this.aabbOverlap(pA, pB, tol)) {
                    this.stats.broadphaseCulled++;
                    continue;
                }

                const result = this.computePreciseLocalCollision(
                    pA.start, pA.end, pB.start, pB.end,
                    pA.radius, pB.radius, tol
                );

                if (result) {
                    collisions.push({
                        pipelineA: { id: pA.id, name: pA.name, type: pA.type },
                        pipelineB: { id: pB.id, name: pB.name, type: pB.type },
                        collisionPoint: { x: result.point.x, y: result.point.y, z: result.point.z },
                        distance: result.distance,
                        minDistance: pA.radius + pB.radius + tol,
                        severity: result.distance < pA.radius + pB.radius ? 'hard' : 'soft',
                        detectionMethod: 'local_gjk',
                        closestPoints: {
                            pointA: { x: result.pointA.x, y: result.pointA.y, z: result.pointA.z },
                            pointB: { x: result.pointB.x, y: result.pointB.y, z: result.pointB.z }
                        }
                    });
                }

                this.detectionProgress = Math.round((i * pipelines.length + j) / (pipelines.length * pipelines.length) * 100);
            }
        }

        this.collisionResults = collisions.sort((a, b) => a.distance - b.distance);
        this.stats.detections = collisions.length;
        this.visualizeCollisions();
        return this.collisionResults;
    }

    aabbOverlap(pA, pB, tolerance) {
        const expand = tolerance * 0.5;
        return !(pA.aabb.maxX + expand < pB.aabb.minX - expand ||
                 pA.aabb.minX - expand > pB.aabb.maxX + expand ||
                 pA.aabb.maxY + expand < pB.aabb.minY - expand ||
                 pA.aabb.minY - expand > pB.aabb.maxY + expand ||
                 pA.aabb.maxZ + expand < pB.aabb.minZ - expand ||
                 pA.aabb.minZ - expand > pB.aabb.maxZ + expand);
    }

    computePreciseLocalCollision(a1, a2, b1, b2, rA, rB, tolerance) {
        const samples = 40;
        let minDist = Infinity;
        let bestPA = null, bestPB = null;

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const pa = a1.clone().lerp(a2, t);

            for (let j = 0; j <= samples; j++) {
                const s = j / samples;
                const pb = b1.clone().lerp(b2, s);
                const dist = pa.distanceTo(pb);
                if (dist < minDist) {
                    minDist = dist;
                    bestPA = pa.clone();
                    bestPB = pb.clone();
                }
            }
        }

        const minDistRequired = rA + rB + tolerance;
        if (minDist < minDistRequired) {
            const mid = bestPA.clone().add(bestPB).multiplyScalar(0.5);
            return {
                distance: minDist,
                point: mid,
                pointA: bestPA,
                pointB: bestPB
            };
        }
        return null;
    }

    detectVisibleOnly(camera, tolerance) {
        if (!this.dataStore) return [];

        const visiblePipelines = this.dataStore.getPipelinesInFrustum(camera);
        const visibleIds = visiblePipelines.map(p => p.id);

        return this.detectLocal(visibleIds, tolerance);
    }

    detectChangedOnly(changedIds, tolerance) {
        if (!this.dataStore || changedIds.length === 0) return [];

        const allPipelines = this.dataStore.getAllPipelines();
        const collisions = [];
        const tol = tolerance || 0.1;

        changedIds.forEach(changedId => {
            const changed = this.dataStore.getPipeline(changedId);
            if (!changed) return;

            allPipelines.forEach(other => {
                if (other.id === changedId) return;

                this.stats.totalChecks++;
                if (!this.aabbOverlap(changed, other, tol)) {
                    this.stats.broadphaseCulled++;
                    return;
                }

                const result = this.computePreciseLocalCollision(
                    changed.start, changed.end, other.start, other.end,
                    changed.radius, other.radius, tol
                );

                if (result) {
                    collisions.push({
                        pipelineA: { id: changed.id, name: changed.name, type: changed.type },
                        pipelineB: { id: other.id, name: other.name, type: other.type },
                        collisionPoint: { x: result.point.x, y: result.point.y, z: result.point.z },
                        distance: result.distance,
                        minDistance: changed.radius + other.radius + tol,
                        severity: result.distance < changed.radius + other.radius ? 'hard' : 'soft',
                        detectionMethod: 'local_gjk',
                        closestPoints: {
                            pointA: { x: result.pointA.x, y: result.pointA.y, z: result.pointA.z },
                            pointB: { x: result.pointB.x, y: result.pointB.y, z: result.pointB.z }
                        }
                    });
                }
            });
        });

        const uniqueCollisions = this.deduplicateCollisions(collisions);
        this.collisionResults = uniqueCollisions.sort((a, b) => a.distance - b.distance);
        this.stats.detections = uniqueCollisions.length;
        this.visualizeCollisions();
        return this.collisionResults;
    }

    deduplicateCollisions(collisions) {
        const seen = new Set();
        return collisions.filter(c => {
            const key = [c.pipelineA.id, c.pipelineB.id].sort().join('-');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    visualizeCollisions() {
        this.clearCollisions();
        this.collisionResults.forEach((collision, idx) => {
            this.createCollisionMarker(collision, idx);
            if (collision.closestPoints) {
                this.createClosestPointsLine(collision);
            }
            if (collision.pipelineA && collision.pipelineB && this.modeler) {
                this.highlightCollisionPipes(collision.pipelineA.id, collision.pipelineB.id, collision.severity);
            }
        });
        this.isVisible = true;
    }

    createCollisionMarker(collision, index) {
        const group = new THREE.Group();
        const pt = collision.collisionPoint;

        const severity = collision.severity;
        const markerColor = severity === 'hard' ? 0xff2020 : 0xff9900;
        const markerRadius = severity === 'hard' ? 0.2 : 0.15;

        const sphereGeo = new THREE.SphereGeometry(markerRadius, 32, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: markerColor,
            transparent: true,
            opacity: 0.9,
            emissive: markerColor,
            emissiveIntensity: 0.6,
            metalness: 0.1,
            roughness: 0.2
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(pt.x, pt.y, pt.z);
        sphere.renderOrder = 1000;
        group.add(sphere);

        const innerSphereGeo = new THREE.SphereGeometry(markerRadius * 0.6, 16, 12);
        const innerSphereMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const innerSphere = new THREE.Mesh(innerSphereGeo, innerSphereMat);
        innerSphere.position.set(pt.x, pt.y, pt.z);
        innerSphere.renderOrder = 1001;
        group.add(innerSphere);

        for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.TorusGeometry(markerRadius * (1.5 + i * 0.5), 0.015, 8, 48);
            const ringMat = new THREE.MeshBasicMaterial({
                color: markerColor,
                transparent: true,
                opacity: 0.7 - i * 0.15
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(pt.x, pt.y, pt.z);
            ring.rotation.x = Math.PI / 2;
            ring.userData.ringIndex = i;
            group.add(ring);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = 2;
        canvas.width = 512 * dpr;
        canvas.height = 160 * dpr;
        ctx.scale(dpr, dpr);

        const bgGrad = ctx.createLinearGradient(0, 0, 0, 160);
        if (severity === 'hard') {
            bgGrad.addColorStop(0, 'rgba(120, 0, 0, 0.95)');
            bgGrad.addColorStop(1, 'rgba(60, 0, 0, 0.9)');
        } else {
            bgGrad.addColorStop(0, 'rgba(120, 70, 0, 0.95)');
            bgGrad.addColorStop(1, 'rgba(80, 40, 0, 0.9)');
        }
        ctx.fillStyle = bgGrad;
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 160, 16);
        ctx.fill();

        ctx.strokeStyle = severity === 'hard' ? '#ff4444' : '#ffaa00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(2, 2, 508, 156, 16);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${severity === 'hard' ? '⚠ 硬碰撞' : '⚠ 软碰撞'} #${index + 1}`, 256, 12);

        ctx.font = '22px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#dddddd';
        ctx.fillText(`${collision.pipelineA.name} ↔ ${collision.pipelineB.name}`, 256, 58);

        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = severity === 'hard' ? '#ff6666' : '#ffcc66';
        const distText = `间距: ${collision.distance.toFixed(4)} m  |  最小要求: ${collision.minDistance.toFixed(3)} m`;
        ctx.fillText(distText, 256, 92);

        if (collision.detectionMethod) {
            ctx.font = '16px monospace';
            ctx.fillStyle = '#888888';
            const methodLabels = {
                segment: '线段检测',
                capsule_sampling: '胶囊体采样',
                endpoint: '端点检测',
                endpoint_to_line: '点线检测',
                gjk_epa: 'GJK/EPA算法',
                local_gjk: '本地GJK算法'
            };
            ctx.fillText(`检测方法: ${methodLabels[collision.detectionMethod] || collision.detectionMethod}`, 256, 126);
        }

        const labelTexture = new THREE.CanvasTexture(canvas);
        labelTexture.anisotropy = 16;
        const labelMat = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
        const label = new THREE.Sprite(labelMat);
        label.scale.set(5, 1.6, 1);
        label.position.set(pt.x, pt.y + markerRadius + 1.2, pt.z);
        label.renderOrder = 9999;
        group.add(label);

        group.userData = { collisionData: collision, index };
        this.collisionGroup.add(group);
        return group;
    }

    createClosestPointsLine(collision) {
        const { pointA, pointB } = collision.closestPoints;
        const pa = new THREE.Vector3(pointA.x, pointA.y, pointA.z);
        const pb = new THREE.Vector3(pointB.x, pointB.y, pointB.z);

        const points = [pa, pb];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
            color: collision.severity === 'hard' ? 0xff2020 : 0xffaa00,
            dashSize: 0.15,
            gapSize: 0.08,
            transparent: true,
            opacity: 0.9,
            linewidth: 3
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.renderOrder = 998;
        this.collisionGroup.add(line);

        [pa, pb].forEach((pt, idx) => {
            const dotGeo = new THREE.SphereGeometry(0.06, 16, 12);
            const dotMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.95
            });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.copy(pt);
            dot.renderOrder = 999;
            this.collisionGroup.add(dot);
        });
    }

    highlightCollisionPipes(idA, idB, severity) {
        if (!this.modeler) return;
        const color = severity === 'hard' ? 0xff0000 : 0xffaa00;
        [idA, idB].forEach(id => {
            const entry = this.modeler.pipelines.get(id);
            if (entry) {
                entry.group.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.emissive = new THREE.Color(color);
                        child.material.emissiveIntensity = 0.3;
                    }
                });
            }
        });
    }

    animateCollisions(time) {
        if (!this.isVisible) return;
        this.collisionGroup.children.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.geometry.type === 'TorusGeometry') {
                    child.rotation.z = time * (1.5 + (child.userData.ringIndex || 0) * 0.8);
                    const pulseScale = 1 + 0.15 * Math.sin(time * 3 + (child.userData.ringIndex || 0));
                    child.scale.set(pulseScale, pulseScale, pulseScale);
                }
                if (child.isMesh && child.geometry.type === 'SphereGeometry' && child.material?.emissiveIntensity > 0) {
                    const scale = 1 + 0.12 * Math.sin(time * 4);
                    child.scale.set(scale, scale, scale);
                    const pulseIntensity = 0.5 + 0.3 * Math.sin(time * 3);
                    if (child.material.emissiveIntensity !== undefined) {
                        child.material.emissiveIntensity = pulseIntensity;
                    }
                }
            });
        });
    }

    showCollisions() {
        this.collisionGroup.visible = true;
        this.isVisible = true;
    }

    hideCollisions() {
        this.collisionGroup.visible = false;
        this.isVisible = false;
    }

    toggleCollisions() {
        this.collisionGroup.visible = !this.collisionGroup.visible;
        this.isVisible = this.collisionGroup.visible;
        return this.isVisible;
    }

    setDetectionMode(mode) {
        this.detectionMode = mode === 'local' ? 'local' : 'server';
    }

    getCollisionResults() {
        return this.collisionResults;
    }

    getCollisionCount() {
        return this.collisionResults.length;
    }

    getStats() {
        const hard = this.collisionResults.filter(c => c.severity === 'hard').length;
        const soft = this.collisionResults.filter(c => c.severity === 'soft').length;
        const methods = {};
        this.collisionResults.forEach(c => {
            const m = c.detectionMethod || 'unknown';
            methods[m] = (methods[m] || 0) + 1;
        });
        return {
            total: this.collisionResults.length,
            hard,
            soft,
            methods,
            ...this.stats
        };
    }

    clearCollisions() {
        while (this.collisionGroup.children.length) {
            const child = this.collisionGroup.children[0];
            child.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                    if (Array.isArray(c.material)) {
                        c.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                    } else {
                        if (c.material.map) c.material.map.dispose();
                        c.material.dispose();
                    }
                }
            });
            this.collisionGroup.remove(child);
        }
    }

    dispose() {
        this.clearCollisions();
        this.scene.remove(this.collisionGroup);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollisionDetector;
}