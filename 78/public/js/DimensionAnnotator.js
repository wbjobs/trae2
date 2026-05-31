class DimensionAnnotator {
    constructor(scene, modeler) {
        this.scene = scene;
        this.modeler = modeler;
        this.annotationGroup = new THREE.Group();
        this.annotationGroup.name = 'annotations';
        this.scene.add(this.annotationGroup);
        this.annotations = [];
        this.isMeasuring = false;
        this.measureStart = null;
        this.measureStartRaw = null;
        this.measurePreview = null;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = { threshold: 0.1 };
        this.raycaster.params.Points = { threshold: 0.1 };
        this.precisionMode = true;
        this.subpixelSamples = 3;
        this.lastMeasuredDistance = 0;
    }

    startMeasure() {
        this.isMeasuring = true;
        this.measureStart = null;
        this.measureStartRaw = null;
    }

    stopMeasure() {
        this.isMeasuring = false;
        this.measureStart = null;
        this.measureStartRaw = null;
        if (this.measurePreview) {
            this.disposeObj(this.measurePreview);
            this.annotationGroup.remove(this.measurePreview);
            this.measurePreview = null;
        }
    }

    handleClick(event, camera, container) {
        if (!this.isMeasuring) return false;

        const point = this.getPreciseIntersection(event, camera, container);
        if (!point) return false;

        if (!this.measureStart) {
            this.measureStart = point.surfacePoint.clone();
            this.measureStartRaw = point;
            this.createStartMarker(point.surfacePoint);
            this.updateBottomBar(`起点已设置: (${point.surfacePoint.x.toFixed(4)}, ${point.surfacePoint.y.toFixed(4)}, ${point.surfacePoint.z.toFixed(4)}) m`);
        } else {
            const correctedStart = this.refinePointOnSurface(this.measureStartRaw);
            const correctedEnd = this.refinePointOnSurface(point);

            const distance3D = correctedStart.surfacePoint.distanceTo(correctedEnd.surfacePoint);
            const distanceAxis = this.computeAxisDistance(correctedStart, correctedEnd);

            this.createDimensionLine(
                correctedStart.surfacePoint,
                correctedEnd.surfacePoint,
                distance3D,
                {
                    rawStart: this.measureStartRaw,
                    rawEnd: point,
                    correctedStart,
                    correctedEnd,
                    axisDistance: distanceAxis
                }
            );

            this.lastMeasuredDistance = distance3D;
            this.updateBottomBar(`测量完成: ${distance3D.toFixed(6)} m | 轴线距离: ${distanceAxis.toFixed(6)} m`);
            this.measureStart = null;
            this.measureStartRaw = null;
            this.isMeasuring = false;
        }
        return true;
    }

    handleMouseMove(event, camera, container) {
        if (!this.isMeasuring || !this.measureStart) return;

        const point = this.getPreciseIntersection(event, camera, container);
        if (!point) return;

        const correctedStart = this.refinePointOnSurface(this.measureStartRaw);
        const correctedEnd = this.refinePointOnSurface(point);
        const distance = correctedStart.surfacePoint.distanceTo(correctedEnd.surfacePoint);
        this.lastMeasuredDistance = distance;

        this.updatePreview(this.measureStart, point.surfacePoint, distance);
        this.updateBottomBar(`预览距离: ${distance.toFixed(6)} m | 正在测量...`);
    }

    getPreciseIntersection(event, camera, container) {
        const rect = container.getBoundingClientRect();
        const baseMouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const samples = [];
        const halfStep = 1.0 / Math.max(rect.width, rect.height) * this.subpixelSamples;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const mouse = new THREE.Vector2(
                    baseMouse.x + dx * halfStep,
                    baseMouse.y + dy * halfStep
                );
                const result = this.singleRayPick(mouse, camera);
                if (result) samples.push(result);
            }
        }

        if (samples.length === 0) {
            const single = this.singleRayPick(baseMouse, camera);
            return single;
        }

        return this.averageSamplePoints(samples);
    }

    singleRayPick(mouse, camera) {
        this.raycaster.setFromCamera(mouse, camera);

        const pipelineGroup = this.scene.getObjectByName('pipelines');
        const tunnelGroup = this.scene.getObjectByName('tunnel');
        const targets = [];
        if (pipelineGroup) targets.push(...pipelineGroup.children);
        if (tunnelGroup) targets.push(...tunnelGroup.children);

        const intersects = this.raycaster.intersectObjects(targets, true);
        if (intersects.length === 0) return null;

        const hit = intersects[0];
        let pipelineData = null;
        let obj = hit.object;

        while (obj.parent && !obj.userData.pipelineData) {
            obj = obj.parent;
        }
        if (obj.userData.pipelineData) {
            pipelineData = obj.userData.pipelineData;
        }

        return {
            surfacePoint: hit.point.clone(),
            face: hit.face ? hit.face.clone() : null,
            faceNormal: hit.face ? hit.face.normal.clone() : null,
            distance: hit.distance,
            uv: hit.uv ? hit.uv.clone() : null,
            pipelineData,
            object: hit.object,
            cameraPosition: camera.position.clone(),
            rayDirection: this.raycaster.ray.direction.clone()
        };
    }

    averageSamplePoints(samples) {
        if (samples.length === 1) return samples[0];

        samples.sort((a, b) => a.distance - b.distance);
        const medianDistance = samples[Math.floor(samples.length / 2)].distance;

        const filtered = samples.filter(s => Math.abs(s.distance - medianDistance) < medianDistance * 0.05);
        if (filtered.length === 0) return samples[0];

        const weights = filtered.map(s => 1 / (s.distance * s.distance));
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        const avgPoint = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < filtered.length; i++) {
            const w = weights[i] / totalWeight;
            avgPoint.add(filtered[i].surfacePoint.clone().multiplyScalar(w));
        }

        return {
            ...filtered[0],
            surfacePoint: avgPoint,
            sampleCount: filtered.length,
            rawSamples: filtered
        };
    }

    refinePointOnSurface(hit) {
        if (!hit || !hit.pipelineData || !this.modeler) {
            return {
                surfacePoint: hit.surfacePoint.clone(),
                axisPoint: hit.surfacePoint.clone(),
                isSurfacePoint: true,
                method: 'direct'
            };
        }

        const data = hit.pipelineData;
        const start = new THREE.Vector3(data.startX, data.startY, data.startZ);
        const end = new THREE.Vector3(data.endX, data.endY, data.endZ);
        const radius = Math.max(0.01, data.radius || 0.05);

        const axis = end.clone().sub(start).normalize();
        const axisLength = start.distanceTo(end);

        const hitPoint = hit.surfacePoint.clone();
        const toHit = hitPoint.clone().sub(start);

        let t = toHit.dot(axis);
        t = Math.max(0, Math.min(axisLength, t));

        const axisPoint = start.clone().add(axis.clone().multiplyScalar(t));
        const toSurface = hitPoint.clone().sub(axisPoint);
        const distFromAxis = toSurface.length();

        let correctedSurfacePoint;
        let method = 'axis_projection';

        if (distFromAxis > 1e-6) {
            const surfaceNormal = toSurface.clone().normalize();
            correctedSurfacePoint = axisPoint.clone().add(surfaceNormal.clone().multiplyScalar(radius));
            method = 'cylinder_projection';
        } else {
            const camDir = hit.cameraPosition ? axisPoint.clone().sub(hit.cameraPosition).normalize() : new THREE.Vector3(0, 1, 0);
            const perp1 = new THREE.Vector3().crossVectors(axis, camDir).normalize();
            const perp2 = new THREE.Vector3().crossVectors(axis, perp1).normalize();
            correctedSurfacePoint = axisPoint.clone()
                .add(perp1.multiplyScalar(radius * 0.5))
                .add(perp2.multiplyScalar(radius * 0.5));
            method = 'perpendicular_estimation';
        }

        const refined = this.iterativeRefinePoint(
            hit.surfacePoint,
            correctedSurfacePoint,
            axisPoint,
            start,
            end,
            radius,
            axis,
            hit.rayDirection
        );

        return {
            surfacePoint: refined.surfacePoint,
            axisPoint: axisPoint,
            pipeStart: start,
            pipeEnd: end,
            pipeRadius: radius,
            pipeAxis: axis,
            parameter: t,
            isSurfacePoint: true,
            method: refined.method || method,
            iterations: refined.iterations || 0,
            error: refined.error || 0
        };
    }

    iterativeRefinePoint(rawPoint, initialGuess, axisPoint, start, end, radius, axis, rayDir) {
        let bestPoint = initialGuess.clone();
        let bestError = Infinity;
        let bestMethod = 'initial';

        for (let iter = 0; iter < 8; iter++) {
            const currentPoint = bestPoint.clone();
            const toCurrent = currentPoint.clone().sub(start);
            let t = Math.max(0, Math.min(start.distanceTo(end), toCurrent.dot(axis)));
            const newAxisPoint = start.clone().add(axis.clone().multiplyScalar(t));

            const toSurface = currentPoint.clone().sub(newAxisPoint);
            const dist = toSurface.length();

            if (dist < 1e-8) {
                return {
                    surfacePoint: bestPoint,
                    method: bestMethod,
                    iterations: iter,
                    error: bestError
                };
            }

            const normal = toSurface.clone().normalize();
            const newSurfacePoint = newAxisPoint.clone().add(normal.clone().multiplyScalar(radius));
            const error = newSurfacePoint.distanceTo(rawPoint);

            if (error < bestError) {
                bestError = error;
                bestPoint = newSurfacePoint.clone();
                bestMethod = `iterative_${iter}`;
            }

            if (error < 1e-6 || Math.abs(error - bestError) < 1e-8) {
                break;
            }
        }

        return {
            surfacePoint: bestPoint,
            method: bestMethod,
            iterations: 8,
            error: bestError
        };
    }

    computeAxisDistance(startData, endData) {
        if (!startData.pipeAxis || !endData.pipeAxis) return 0;

        const p1 = startData.axisPoint;
        const p2 = endData.axisPoint;

        return p1.distanceTo(p2);
    }

    createStartMarker(point) {
        const group = new THREE.Group();
        group.userData.isStartMarker = true;

        const sphereGeo = new THREE.SphereGeometry(0.08, 32, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.8,
            metalness: 0.2,
            roughness: 0.3,
            transparent: true,
            opacity: 0.9
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(point);
        sphere.renderOrder = 1000;
        group.add(sphere);

        const ringGeo = new THREE.TorusGeometry(0.12, 0.01, 8, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.7
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(point);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        const crossSize = 0.15;
        const crossMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const crossPts1 = [
            new THREE.Vector3(point.x - crossSize, point.y, point.z),
            new THREE.Vector3(point.x + crossSize, point.y, point.z)
        ];
        const crossPts2 = [
            new THREE.Vector3(point.x, point.y, point.z - crossSize),
            new THREE.Vector3(point.x, point.y, point.z + crossSize)
        ];
        const cross1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossPts1), crossMat);
        const cross2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossPts2), crossMat);
        group.add(cross1, cross2);

        this.annotationGroup.add(group);
    }

    updatePreview(start, end, distance) {
        if (this.measurePreview) {
            this.disposeObj(this.measurePreview);
            this.annotationGroup.remove(this.measurePreview);
        }
        this.measurePreview = new THREE.Group();

        const points = [start.clone(), end.clone()];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
            color: 0x00ff88,
            dashSize: 0.15,
            gapSize: 0.08,
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.renderOrder = 998;
        this.measurePreview.add(line);

        const endGeo = new THREE.SphereGeometry(0.06, 24, 16);
        const endMat = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.9
        });
        const endMarker = new THREE.Mesh(endGeo, endMat);
        endMarker.position.copy(end);
        endMarker.renderOrder = 999;
        this.measurePreview.add(endMarker);

        const mid = start.clone().add(end).multiplyScalar(0.5);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 384;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0, 40, 20, 0.9)';
        ctx.fillRect(0, 0, 384, 64);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 382, 62);
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${distance.toFixed(6)} m`, 192, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3, 0.5, 1);
        sprite.position.copy(mid);
        sprite.position.y += 0.4;
        sprite.renderOrder = 9999;
        this.measurePreview.add(sprite);

        this.annotationGroup.add(this.measurePreview);
    }

    createDimensionLine(start, end, distance, metadata) {
        const group = new THREE.Group();
        group.userData.isAnnotation = true;
        group.userData.metadata = metadata;

        const lineGeo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.95,
            linewidth: 3
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 998;
        group.add(line);

        const extLen = 0.25;
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        let perp = new THREE.Vector3().crossVectors(dir, worldUp).normalize();

        if (perp.lengthSq() < 0.01) {
            perp = new THREE.Vector3(1, 0, 0);
        }

        [start, end].forEach(pt => {
            const extPts = [
                pt.clone().add(perp.clone().multiplyScalar(extLen)),
                pt.clone().sub(perp.clone().multiplyScalar(extLen))
            ];
            const extGeo = new THREE.BufferGeometry().setFromPoints(extPts);
            const extLine = new THREE.Line(extGeo, lineMat);
            extLine.renderOrder = 998;
            group.add(extLine);

            const perp2 = new THREE.Vector3().crossVectors(perp, dir).normalize();
            const extPts2 = [
                pt.clone().add(perp2.clone().multiplyScalar(extLen)),
                pt.clone().sub(perp2.clone().multiplyScalar(extLen))
            ];
            const extGeo2 = new THREE.BufferGeometry().setFromPoints(extPts2);
            const extLine2 = new THREE.Line(extGeo2, lineMat);
            extLine2.renderOrder = 998;
            group.add(extLine2);
        });

        const arrowLen = 0.18;
        const arrowAngle = Math.PI / 6;
        [start, end].forEach((pt, idx) => {
            const d = idx === 0 ? dir.clone() : dir.clone().negate();

            const arrowPerp1 = d.clone().applyAxisAngle(perp, arrowAngle).multiplyScalar(arrowLen);
            const arrowPerp2 = d.clone().applyAxisAngle(perp, -arrowAngle).multiplyScalar(arrowLen);
            const arrowPerp3 = d.clone().applyAxisAngle(
                new THREE.Vector3().crossVectors(perp, dir).normalize(),
                arrowAngle
            ).multiplyScalar(arrowLen);
            const arrowPerp4 = d.clone().applyAxisAngle(
                new THREE.Vector3().crossVectors(perp, dir).normalize(),
                -arrowAngle
            ).multiplyScalar(arrowLen);

            const arrows = [arrowPerp1, arrowPerp2, arrowPerp3, arrowPerp4];
            arrows.forEach(ap => {
                const aPts = [pt.clone(), pt.clone().add(ap)];
                const aLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(aPts), lineMat);
                aLine.renderOrder = 998;
                group.add(aLine);
            });
        });

        const mid = start.clone().add(end).multiplyScalar(0.5);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = 2;
        canvas.width = 512 * dpr;
        canvas.height = 140 * dpr;
        ctx.scale(dpr, dpr);

        const gradient = ctx.createLinearGradient(0, 0, 0, 140);
        gradient.addColorStop(0, 'rgba(0, 50, 30, 0.95)');
        gradient.addColorStop(1, 'rgba(0, 80, 50, 0.9)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 140, 12);
        ctx.fill();

        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(1.5, 1.5, 509, 137, 12);
        ctx.stroke();

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 8;
        ctx.fillText(`${distance.toFixed(6)} m`, 256, 36);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#88cc88';
        ctx.font = '18px monospace';

        let yOffset = 72;
        ctx.fillText(`三维距离: ${distance.toFixed(6)} m`, 256, yOffset);
        yOffset += 24;

        if (metadata && metadata.axisDistance > 0) {
            ctx.fillText(`轴线距离: ${metadata.axisDistance.toFixed(6)} m`, 256, yOffset);
            yOffset += 24;
        }

        ctx.fillStyle = '#669966';
        ctx.font = '14px monospace';
        const startStr = `起点(${start.x.toFixed(3)}, ${start.y.toFixed(3)}, ${start.z.toFixed(3)})`;
        const endStr = `终点(${end.x.toFixed(3)}, ${end.y.toFixed(3)}, ${end.z.toFixed(3)})`;
        ctx.fillText(startStr, 256, yOffset);
        yOffset += 20;
        ctx.fillText(endStr, 256, yOffset);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 16;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(5, 1.4, 1);
        sprite.position.copy(mid);
        sprite.position.y += 0.6;
        sprite.renderOrder = 9999;
        group.add(sprite);

        [start, end].forEach((pt, idx) => {
            const sphereGeo = new THREE.SphereGeometry(0.07, 24, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
                color: 0x00ff88,
                emissive: 0x00ff88,
                emissiveIntensity: 0.7,
                metalness: 0.2,
                roughness: 0.3,
                transparent: true,
                opacity: 0.95
            });
            const marker = new THREE.Mesh(sphereGeo, sphereMat);
            marker.position.copy(pt);
            marker.renderOrder = 999;
            group.add(marker);

            const ringGeo = new THREE.TorusGeometry(0.1, 0.01, 8, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.6
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pt);
            ring.rotation.x = Math.PI / 2;
            ring.userData.ringIdx = idx;
            group.add(ring);
        });

        if (metadata && metadata.correctedStart && metadata.correctedStart.axisPoint &&
            metadata.correctedEnd && metadata.correctedEnd.axisPoint) {
            const axisPoints = [
                metadata.correctedStart.axisPoint.clone(),
                metadata.correctedEnd.axisPoint.clone()
            ];
            const axisLineGeo = new THREE.BufferGeometry().setFromPoints(axisPoints);
            const axisLineMat = new THREE.LineDashedMaterial({
                color: 0x88aaff,
                dashSize: 0.2,
                gapSize: 0.1,
                transparent: true,
                opacity: 0.6
            });
            const axisLine = new THREE.Line(axisLineGeo, axisLineMat);
            axisLine.computeLineDistances();
            axisLine.renderOrder = 997;
            group.add(axisLine);
        }

        this.annotationGroup.add(group);
        this.annotations.push({ start, end, distance, group, metadata });

        this.annotationGroup.children.forEach(child => {
            if (child.userData.isStartMarker) {
                this.disposeObj(child);
                this.annotationGroup.remove(child);
            }
        });

        return { start, end, distance, metadata };
    }

    addPointToPointDimension(p1, p2) {
        const start = new THREE.Vector3(p1.x, p1.y, p1.z);
        const end = new THREE.Vector3(p2.x, p2.y, p2.z);
        const distance = start.distanceTo(end);
        return this.createDimensionLine(start, end, distance, {});
    }

    updateBottomBar(text) {
        const bar = document.getElementById('bottom-bar');
        if (bar) {
            const statusEl = bar.querySelector('.status-text');
            if (statusEl) statusEl.textContent = text;
        }
    }

    animate(time) {
        this.annotationGroup.children.forEach(group => {
            group.traverse(child => {
                if (child.userData.ringIdx !== undefined && child.geometry?.type === 'TorusGeometry') {
                    child.rotation.z = time * 1.5;
                }
                if (child.userData.isStartMarker) {
                    group.traverse(c => {
                        if (c.isMesh && c.geometry?.type === 'TorusGeometry') {
                            c.rotation.z = time * 2;
                            const scale = 1 + 0.1 * Math.sin(time * 3);
                            c.scale.set(scale, scale, scale);
                        }
                    });
                }
            });
        });
    }

    clearAll() {
        while (this.annotationGroup.children.length) {
            const child = this.annotationGroup.children[0];
            this.disposeObj(child);
            this.annotationGroup.remove(child);
        }
        this.annotations = [];
        this.measureStart = null;
        this.measureStartRaw = null;
        this.measurePreview = null;
        this.lastMeasuredDistance = 0;
    }

    getAnnotations() {
        return this.annotations.map(a => ({
            start: { x: a.start.x, y: a.start.y, z: a.start.z },
            end: { x: a.end.x, y: a.end.y, z: a.end.z },
            distance: a.distance,
            metadata: a.metadata ? {
                axisDistance: a.metadata.axisDistance,
                method: a.metadata.correctedStart?.method
            } : null
        }));
    }

    disposeObj(obj) {
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        if (m.normalMap) m.normalMap.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.normalMap) child.material.normalMap.dispose();
                    child.material.dispose();
                }
            }
        });
    }
}
