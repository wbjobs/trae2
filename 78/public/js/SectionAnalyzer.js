class SectionAnalyzer {
    constructor(scene, renderer, dataStore, modeler) {
        this.scene = scene;
        this.renderer = renderer;
        this.dataStore = dataStore;
        this.modeler = modeler;

        this.sectionPlane = null;
        this.sectionHelper = null;
        this.sectionGroup = new THREE.Group();
        this.sectionGroup.name = 'sectionAnalysis';
        this.scene.add(this.sectionGroup);

        this.isActive = false;
        this.planePosition = new THREE.Vector3(60, 1.5, 0);
        this.planeNormal = new THREE.Vector3(1, 0, 0);
        this.planeSize = 6;

        this.lastSectionData = null;
        this.sectionPointScale = 100;
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;
        this.createSectionPlane();
        this.applyClipping();
    }

    deactivate() {
        this.isActive = false;
        this.removeSectionPlane();
        this.removeClipping();
        this.clearSectionView();
    }

    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
        return this.isActive;
    }

    createSectionPlane() {
        const geo = new THREE.PlaneGeometry(this.planeSize, this.planeSize);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.sectionPlane = new THREE.Mesh(geo, mat);
        this.sectionPlane.position.copy(this.planePosition);
        this.sectionPlane.lookAt(
            this.planePosition.x + this.planeNormal.x,
            this.planePosition.y + this.planeNormal.y,
            this.planePosition.z + this.planeNormal.z
        );
        this.sectionGroup.add(this.sectionPlane);

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
        const edgeGeo = new THREE.EdgesGeometry(geo);
        this.sectionHelper = new THREE.LineSegments(edgeGeo, edgeMat);
        this.sectionHelper.position.copy(this.planePosition);
        this.sectionHelper.lookAt(
            this.planePosition.x + this.planeNormal.x,
            this.planePosition.y + this.planeNormal.y,
            this.planePosition.z + this.planeNormal.z
        );
        this.sectionGroup.add(this.sectionHelper);

        const arrowDir = this.planeNormal.clone();
        const arrowOrigin = this.planePosition.clone();
        const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, 1.5, 0x00ffcc, 0.3, 0.15);
        this.sectionGroup.add(arrowHelper);
    }

    removeSectionPlane() {
        while (this.sectionGroup.children.length) {
            const child = this.sectionGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.sectionGroup.remove(child);
        }
        this.sectionPlane = null;
        this.sectionHelper = null;
    }

    applyClipping() {
        const clippingPlane = new THREE.Plane(this.planeNormal.clone(), -this.planeNormal.dot(this.planePosition));
        this.renderer.clippingPlanes = [clippingPlane];
        this.renderer.localClippingEnabled = true;
        this.renderer.clippingPlanesArray = [clippingPlane];
    }

    removeClipping() {
        this.renderer.clippingPlanes = [];
        this.renderer.localClippingEnabled = false;
    }

    setPosition(x, y, z) {
        this.planePosition.set(x, y, z);
        if (this.isActive) {
            this.removeSectionPlane();
            this.removeClipping();
            this.createSectionPlane();
            this.applyClipping();
            this.generateSectionView();
        }
    }

    setNormal(nx, ny, nz) {
        this.planeNormal.set(nx, ny, nz).normalize();
        if (this.isActive) {
            this.removeSectionPlane();
            this.removeClipping();
            this.createSectionPlane();
            this.applyClipping();
            this.generateSectionView();
        }
    }

    setAxis(axis) {
        switch (axis) {
            case 'X': this.setNormal(1, 0, 0); break;
            case 'Y': this.setNormal(0, 1, 0); break;
            case 'Z': this.setNormal(0, 0, 1); break;
        }
    }

    getSectionPlane() {
        return new THREE.Plane(this.planeNormal.clone(), -this.planeNormal.dot(this.planePosition));
    }

    generateSectionView() {
        this.clearSectionView();
        const plane = this.getSectionPlane();
        const pipelineGroup = this.scene.getObjectByName('pipelines');
        if (!pipelineGroup) return;

        const allIntersections = [];

        pipelineGroup.children.forEach(pipelineObj => {
            const pipelineData = pipelineObj.userData?.pipelineData;
            pipelineObj.traverse(child => {
                if (!child.isMesh || !child.geometry) return;
                const geo = child.geometry.clone();
                geo.applyMatrix4(child.matrixWorld);

                const intersectLine = this.computePlaneMeshIntersection(plane, geo);
                if (intersectLine && intersectLine.length > 0) {
                    intersectLine.forEach(pt => {
                        const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
                        const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
                        const dot = new THREE.Mesh(dotGeo, dotMat);
                        dot.position.copy(pt);
                        dot.userData.pipelineData = pipelineData;
                        this.sectionGroup.add(dot);
                    });

                    if (intersectLine.length >= 2) {
                        const lineGeo = new THREE.BufferGeometry().setFromPoints(intersectLine);
                        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
                        const line = new THREE.Line(lineGeo, lineMat);
                        this.sectionGroup.add(line);
                    }

                    allIntersections.push({
                        points: intersectLine,
                        pipelineData
                    });
                }
            });
        });

        this.lastSectionData = this.processSectionData(allIntersections, plane);
        return this.lastSectionData;
    }

    processSectionData(intersections, plane) {
        const pipelineDataStore = this.dataStore;
        const profiles = [];

        if (pipelineDataStore) {
            const allPipelines = pipelineDataStore.getAllPipelines();
            allPipelines.forEach(pipeline => {
                const profile = this.computePipelineProfile(pipeline, plane);
                if (profile) {
                    profiles.push(profile);
                }
            });
        }

        return {
            planePosition: { x: this.planePosition.x, y: this.planePosition.y, z: this.planePosition.z },
            planeNormal: { x: this.planeNormal.x, y: this.planeNormal.y, z: this.planeNormal.z },
            profiles,
            timestamp: Date.now()
        };
    }

    computePipelineProfile(pipeline, plane) {
        const t = this.computeLinePlaneIntersection(pipeline.start, pipeline.end, plane);
        if (t === null) return null;

        const intersectionPoint = pipeline.start.clone().lerp(pipeline.end, t);

        const perpDir1 = new THREE.Vector3();
        const perpDir2 = new THREE.Vector3();
        this.computePerpendicularVectors(pipeline.dirNormalized, perpDir1, perpDir2);

        const profilePoints = [];
        const segments = 32;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const pt = intersectionPoint.clone()
                .add(perpDir1.clone().multiplyScalar(pipeline.radius * cosA))
                .add(perpDir2.clone().multiplyScalar(pipeline.radius * sinA));
            profilePoints.push(pt);
        }

        const localCoords = this.toLocalCoordinates(intersectionPoint, perpDir1, perpDir2);

        return {
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            pipelineType: pipeline.type,
            center: intersectionPoint,
            localCenter: localCoords,
            radius: pipeline.radius,
            diameter: pipeline.radius * 2,
            perimeter: 2 * Math.PI * pipeline.radius,
            area: Math.PI * pipeline.radius * pipeline.radius,
            points: profilePoints,
            color: this.dataStore?.getTypeColor(pipeline.type) || 0xCCCCCC
        };
    }

    computeLinePlaneIntersection(lineStart, lineEnd, plane) {
        const dir = lineEnd.clone().sub(lineStart);
        const denom = plane.normal.dot(dir);
        if (Math.abs(denom) < 1e-10) return null;

        const t = -(plane.constant + plane.normal.dot(lineStart)) / denom;
        if (t < 0 || t > 1) return null;

        return t;
    }

    computePerpendicularVectors(axis, v1, v2) {
        const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        v1.crossVectors(axis, up).normalize();
        v2.crossVectors(axis, v1).normalize();
    }

    toLocalCoordinates(point, axisU, axisV) {
        const rel = point.clone().sub(this.planePosition);
        return {
            u: rel.dot(axisU),
            v: rel.dot(axisV)
        };
    }

    computePlaneMeshIntersection(plane, geometry) {
        const points = [];
        const posAttr = geometry.getAttribute('position');
        if (!posAttr) return points;

        const index = geometry.getIndex();
        const vertices = [];
        for (let i = 0; i < posAttr.count; i++) {
            vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
        }

        const triCount = index ? index.count / 3 : posAttr.count / 3;
        for (let i = 0; i < triCount; i++) {
            let a, b, c;
            if (index) {
                a = index.getX(i * 3);
                b = index.getX(i * 3 + 1);
                c = index.getX(i * 3 + 2);
            } else {
                a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
            }
            if (a >= vertices.length || b >= vertices.length || c >= vertices.length) continue;

            const vA = vertices[a], vB = vertices[b], vC = vertices[c];
            const dA = plane.distanceToPoint(vA);
            const dB = plane.distanceToPoint(vB);
            const dC = plane.distanceToPoint(vC);

            const isects = [];
            if (dA * dB < 0) isects.push(vA.clone().lerp(vB, dA / (dA - dB)));
            if (dB * dC < 0) isects.push(vB.clone().lerp(vC, dB / (dB - dC)));
            if (dA * dC < 0) isects.push(vA.clone().lerp(vC, dA / (dA - dC)));

            isects.forEach(pt => {
                const exists = points.some(p => p.distanceTo(pt) < 0.01);
                if (!exists) points.push(pt);
            });
        }

        return points;
    }

    exportSVG(options = {}) {
        if (!this.lastSectionData) {
            this.generateSectionView();
        }

        const scale = options.scale || 150;
        const padding = options.padding || 60;
        const showGrid = options.showGrid !== false;
        const showDimensions = options.showDimensions !== false;
        const showLegend = options.showLegend !== false;

        const profiles = this.lastSectionData.profiles;

        const minU = Math.min(...profiles.map(p => p.localCenter.u - p.radius), -this.planeSize / 2);
        const maxU = Math.max(...profiles.map(p => p.localCenter.u + p.radius), this.planeSize / 2);
        const minV = Math.min(...profiles.map(p => p.localCenter.v - p.radius), -this.planeSize / 2);
        const maxV = Math.max(...profiles.map(p => p.localCenter.v + p.radius), this.planeSize / 2);

        const width = (maxU - minU) * scale + padding * 2;
        const height = (maxV - minV) * scale + padding * 2;

        const toScreenU = (u) => padding + (u - minU) * scale;
        const toScreenV = (v) => height - padding - (v - minV) * scale;

        const typeColors = this.dataStore?.typeMetadata || {};

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .title { font-family: 'Microsoft YaHei', sans-serif; font-size: 20px; font-weight: bold; fill: #333; }
      .subtitle { font-family: 'Microsoft YaHei', sans-serif; font-size: 12px; fill: #666; }
      .grid-line { stroke: #e0e0e0; stroke-width: 0.5; }
      .grid-line-major { stroke: #bdbdbd; stroke-width: 1; }
      .profile-outline { fill-opacity: 0.3; stroke-width: 2; }
      .profile-center { fill: #333; }
      .dimension-line { stroke: #666; stroke-width: 1; }
      .dimension-text { font-family: monospace; font-size: 10px; fill: #666; }
      .legend-item { font-family: 'Microsoft YaHei', sans-serif; font-size: 11px; fill: #333; }
      .legend-color { stroke: #333; stroke-width: 0.5; }
    </style>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${padding}" y="30" class="title">综合管廊管线剖面图</text>
  <text x="${padding}" y="50" class="subtitle">剖切位置: X=${this.planePosition.x.toFixed(2)}, Y=${this.planePosition.y.toFixed(2)}, Z=${this.planePosition.z.toFixed(2)}</text>
  <text x="${padding}" y="66" class="subtitle">剖切方向: (${this.planeNormal.x.toFixed(2)}, ${this.planeNormal.y.toFixed(2)}, ${this.planeNormal.z.toFixed(2)})</text>
  <text x="${padding}" y="82" class="subtitle">比例: 1:${Math.round(100 / scale)}</text>
`;

        if (showGrid) {
            const gridStep = 1;
            for (let u = Math.ceil(minU); u <= Math.floor(maxU); u += gridStep) {
                const x = toScreenU(u);
                const isMajor = u % 5 === 0;
                svg += `  <line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" class="${isMajor ? 'grid-line-major' : 'grid-line'}"/>
`;
            }
            for (let v = Math.ceil(minV); v <= Math.floor(maxV); v += gridStep) {
                const y = toScreenV(v);
                const isMajor = v % 5 === 0;
                svg += `  <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="${isMajor ? 'grid-line-major' : 'grid-line'}"/>
`;
            }
        }

        const typeSet = new Set();
        profiles.forEach(profile => {
            const cx = toScreenU(profile.localCenter.u);
            const cy = toScreenV(profile.localCenter.v);
            const r = profile.radius * scale;
            const color = '#' + profile.color.toString(16).padStart(6, '0');
            typeSet.add(profile.pipelineType);

            svg += `  <circle cx="${cx}" cy="${cy}" r="${r}" class="profile-outline" fill="${color}" stroke="${color}" id="profile-${profile.pipelineId}"/>
`;
            svg += `  <circle cx="${cx}" cy="${cy}" r="3" class="profile-center"/>
`;

            if (showDimensions) {
                svg += `  <line x1="${cx - r}" y1="${cy + r + 15}" x2="${cx + r}" y2="${cy + r + 15}" class="dimension-line"/>
`;
                svg += `  <line x1="${cx - r}" y1="${cy + r + 10}" x2="${cx - r}" y2="${cy + r + 20}" class="dimension-line"/>
`;
                svg += `  <line x1="${cx + r}" y1="${cy + r + 10}" x2="${cx + r}" y2="${cy + r + 20}" class="dimension-line"/>
`;
                svg += `  <text x="${cx}" y="${cy + r + 30}" class="dimension-text" text-anchor="middle">Ø${(profile.diameter * 1000).toFixed(0)}mm</text>
`;

                svg += `  <text x="${cx}" y="${cy - r - 5}" class="dimension-text" text-anchor="middle" style="font-weight: bold;">${profile.pipelineName}</text>
`;
            }
        });

        if (showLegend) {
            const legendX = width - padding - 150;
            const legendY = padding + 20;
            svg += `  <rect x="${legendX - 10}" y="${legendY - 10}" width="160" height="${Array.from(typeSet).length * 25 + 30}" fill="#fafafa" stroke="#ddd"/>
`;
            svg += `  <text x="${legendX + 65}" y="${legendY + 10}" class="legend-item" text-anchor="middle" style="font-weight: bold;">管线图例</text>
`;

            let legendIdx = 0;
            typeSet.forEach(type => {
                const ly = legendY + 35 + legendIdx * 25;
                const typeColor = '#' + (this.dataStore?.getTypeColor(type) || 0xCCCCCC).toString(16).padStart(6, '0');
                const typeLabel = this.dataStore?.getTypeLabel(type) || type;
                svg += `  <rect x="${legendX}" y="${ly - 8}" width="16" height="16" class="legend-color" fill="${typeColor}"/>
`;
                svg += `  <text x="${legendX + 26}" y="${ly + 4}" class="legend-item">${typeLabel}</text>
`;
                legendIdx++;
            });
        }

        svg += `  <text x="${width - padding}" y="${height - 10}" class="subtitle" text-anchor="end">生成时间: ${new Date().toLocaleString('zh-CN')}</text>
`;
        svg += '</svg>';

        return svg;
    }

    exportPNG(options = {}) {
        const svg = this.exportSVG(options);
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = options.pngScale || 2;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);

                canvas.toBlob((blob) => {
                    resolve({
                        blob,
                        dataUrl: canvas.toDataURL('image/png'),
                        width: canvas.width,
                        height: canvas.height
                    });
                }, 'image/png');
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(e);
            };
            img.src = url;
        });
    }

    downloadSVG(filename, options) {
        const svg = this.exportSVG(options);
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        this.downloadBlob(blob, filename || `section_${Date.now()}.svg`);
    }

    async downloadPNG(filename, options) {
        const result = await this.exportPNG(options);
        this.downloadBlob(result.blob, filename || `section_${Date.now()}.png`);
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getSectionStats() {
        if (!this.lastSectionData) return null;

        const typeStats = {};
        let totalArea = 0;

        this.lastSectionData.profiles.forEach(profile => {
            const type = profile.pipelineType;
            if (!typeStats[type]) {
                typeStats[type] = { count: 0, totalArea: 0, maxDiameter: 0 };
            }
            typeStats[type].count++;
            typeStats[type].totalArea += profile.area;
            typeStats[type].maxDiameter = Math.max(typeStats[type].maxDiameter, profile.diameter);
            totalArea += profile.area;
        });

        return {
            totalPipelines: this.lastSectionData.profiles.length,
            types: typeStats,
            totalCrossSectionArea: totalArea,
            planePosition: this.lastSectionData.planePosition
        };
    }

    clearSectionView() {
        const toRemove = [];
        this.sectionGroup.children.forEach(child => {
            if (child !== this.sectionPlane && child !== this.sectionHelper) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.sectionGroup.remove(child);
        });
    }

    updateFromSlider(value, axis) {
        switch (axis) {
            case 'X': this.setPosition(value, this.planePosition.y, this.planePosition.z); break;
            case 'Y': this.setPosition(this.planePosition.x, value, this.planePosition.z); break;
            case 'Z': this.setPosition(this.planePosition.x, this.planePosition.y, value); break;
        }
    }

    dispose() {
        this.clearSectionView();
        this.removeSectionPlane();
        this.scene.remove(this.sectionGroup);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SectionAnalyzer;
}