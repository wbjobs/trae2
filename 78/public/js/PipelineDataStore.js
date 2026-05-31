class PipelineDataStore {
    constructor() {
        this.pipelines = new Map();
        this.pipelineList = [];
        this.sections = [];
        this.listeners = new Map();
        this.typeMetadata = {
            ventilation: { label: '通风', color: 0x4FC3F7 },
            fire_water: { label: '消防水', color: 0xEF5350 },
            fire_sprinkler: { label: '喷淋', color: 0xFF7043 },
            electrical: { label: '电力', color: 0xFDD835 },
            communication: { label: '通信', color: 0x66BB6A },
            water_supply: { label: '给水', color: 0x42A5F5 },
            drainage: { label: '排水', color: 0x7E57C2 },
            gas: { label: '燃气', color: 0xFFA726 },
            smoke_exhaust: { label: '排烟', color: 0x8D6E63 }
        };
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const idx = callbacks.indexOf(callback);
            if (idx > -1) callbacks.splice(idx, 1);
        }
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    }

    setPipelines(dataList) {
        this.pipelines.clear();
        this.pipelineList = [];
        dataList.forEach(data => {
            const enriched = this.enrichPipelineData(data);
            this.pipelines.set(data.id, enriched);
            this.pipelineList.push(enriched);
        });
        this.emit('pipelinesUpdated', this.pipelineList);
    }

    setSections(sectionData) {
        this.sections = sectionData;
        this.emit('sectionsUpdated', this.sections);
    }

    enrichPipelineData(data) {
        const start = new THREE.Vector3(data.startX, data.startY, data.startZ);
        const end = new THREE.Vector3(data.endX, data.endY, data.endZ);
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const mid = start.clone().add(end).multiplyScalar(0.5);
        const dirNormalized = length > 0 ? direction.clone().normalize() : new THREE.Vector3(0, 0, 1);
        const radius = Math.max(0.01, data.radius || 0.05);
        const typeMeta = this.typeMetadata[data.type] || { label: data.type, color: 0xCCCCCC };

        return {
            ...data,
            start,
            end,
            mid,
            direction,
            dirNormalized,
            length,
            radius,
            typeLabel: typeMeta.label,
            typeColor: typeMeta.color,
            boundingBox: this.computeBoundingBox(start, end, radius),
            aabb: {
                minX: Math.min(start.x, end.x) - radius,
                maxX: Math.max(start.x, end.x) + radius,
                minY: Math.min(start.y, end.y) - radius,
                maxY: Math.max(start.y, end.y) + radius,
                minZ: Math.min(start.z, end.z) - radius,
                maxZ: Math.max(start.z, end.z) + radius
            }
        };
    }

    computeBoundingBox(start, end, radius) {
        const box = new THREE.Box3();
        const pts = [start, end];
        for (let i = 0; i < 8; i++) {
            const dx = (i & 1) ? radius : -radius;
            const dy = (i & 2) ? radius : -radius;
            const dz = (i & 4) ? radius : -radius;
            pts.push(new THREE.Vector3(start.x + dx, start.y + dy, start.z + dz));
            pts.push(new THREE.Vector3(end.x + dx, end.y + dy, end.z + dz));
        }
        pts.forEach(p => box.expandByPoint(p));
        return box;
    }

    getPipeline(id) {
        return this.pipelines.get(id);
    }

    getAllPipelines() {
        return this.pipelineList;
    }

    getPipelinesByType(type) {
        return this.pipelineList.filter(p => p.type === type);
    }

    getPipelineIds() {
        return Array.from(this.pipelines.keys());
    }

    getTypes() {
        return Array.from(new Set(this.pipelineList.map(p => p.type)));
    }

    getTypeColor(type) {
        return this.typeMetadata[type]?.color || 0xCCCCCC;
    }

    getTypeLabel(type) {
        return this.typeMetadata[type]?.label || type;
    }

    getSections() {
        return this.sections;
    }

    getStats() {
        const typeCount = {};
        let totalLength = 0;
        this.pipelineList.forEach(p => {
            typeCount[p.type] = (typeCount[p.type] || 0) + 1;
            totalLength += p.length;
        });
        return {
            totalPipelines: this.pipelineList.length,
            typeCount,
            totalLength: Math.round(totalLength * 100) / 100
        };
    }

    queryPipelines(condition) {
        return this.pipelineList.filter(p => {
            for (const key in condition) {
                if (condition[key] === undefined) continue;
                if (Array.isArray(condition[key])) {
                    if (!condition[key].includes(p[key])) return false;
                } else if (typeof condition[key] === 'function') {
                    if (!condition[key](p[key])) return false;
                } else {
                    if (p[key] !== condition[key]) return false;
                }
            }
            return true;
        });
    }

    updatePipeline(id, updates) {
        const existing = this.pipelines.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        const enriched = this.enrichPipelineData(updated);
        this.pipelines.set(id, enriched);
        const idx = this.pipelineList.findIndex(p => p.id === id);
        if (idx > -1) this.pipelineList[idx] = enriched;
        this.emit('pipelineUpdated', enriched);
        return enriched;
    }

    addPipeline(data) {
        if (this.pipelines.has(data.id)) return null;
        const enriched = this.enrichPipelineData(data);
        this.pipelines.set(data.id, enriched);
        this.pipelineList.push(enriched);
        this.emit('pipelineAdded', enriched);
        return enriched;
    }

    removePipeline(id) {
        const removed = this.pipelines.get(id);
        if (!removed) return null;
        this.pipelines.delete(id);
        const idx = this.pipelineList.findIndex(p => p.id === id);
        if (idx > -1) this.pipelineList.splice(idx, 1);
        this.emit('pipelineRemoved', removed);
        return removed;
    }

    getPipelinesInFrustum(camera) {
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(projScreenMatrix);
        return this.pipelineList.filter(p => frustum.intersectsBox(p.boundingBox));
    }

    getPipelinesNearPoint(point, distance) {
        return this.pipelineList.filter(p => {
            const d = this.pointToLineDistance(point, p.start, p.end);
            return d < distance + p.radius;
        });
    }

    pointToLineDistance(point, lineStart, lineEnd) {
        const lineDir = lineEnd.clone().sub(lineStart).normalize();
        const pointDir = point.clone().sub(lineStart);
        const dot = pointDir.dot(lineDir);
        const closestPoint = lineStart.clone().add(lineDir.multiplyScalar(Math.max(0, Math.min(1, dot))));
        return point.distanceTo(closestPoint);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PipelineDataStore;
}