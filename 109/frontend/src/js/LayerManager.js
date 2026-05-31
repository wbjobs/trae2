export class LayerManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.layers = new Map();
        this.layerOrder = [];
        this._initDefaultLayers();
    }

    _initDefaultLayers() {
        this.createLayer('pointcloud', '点云数据', { color: '#3b82f6', icon: '📊' });
        this.createLayer('terrain', '地形表面', { color: '#10b981', icon: '🏔️' });
        this.createLayer('annotation', '开采标注', { color: '#f59e0b', icon: '✏️' });
        this.createLayer('slice', '地形剖切', { color: '#ef4444', icon: '🔪' });
    }

    createLayer(id, name, options = {}) {
        const layer = {
            id: id,
            name: name,
            visible: true,
            locked: false,
            opacity: 1.0,
            color: options.color || '#6b7280',
            icon: options.icon || '📁',
            meshes: [],
            groups: [],
            parent: options.parent || null,
            children: [],
            expanded: true,
            metadata: options.metadata || {}
        };

        this.layers.set(id, layer);
        this.layerOrder.push(id);

        return layer;
    }

    addMeshToLayer(layerId, mesh) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.meshes.push(mesh);
        mesh.metadata = mesh.metadata || {};
        mesh.metadata.layerId = layerId;

        if (!layer.visible) {
            mesh.setEnabled(false);
        }

        if (layer.opacity < 1) {
            this._applyOpacityToMesh(mesh, layer.opacity);
        }

        return true;
    }

    addGroupToLayer(layerId, group) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.groups.push(group);
        group.metadata = group.metadata || {};
        group.metadata.layerId = layerId;

        if (!layer.visible) {
            group.setEnabled(false);
        }

        return true;
    }

    removeMeshFromLayer(layerId, mesh) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        const index = layer.meshes.indexOf(mesh);
        if (index > -1) {
            layer.meshes.splice(index, 1);
            return true;
        }
        return false;
    }

    removeGroupFromLayer(layerId, group) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        const index = layer.groups.indexOf(group);
        if (index > -1) {
            layer.groups.splice(index, 1);
            return true;
        }
        return false;
    }

    setLayerVisibility(layerId, visible) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.visible = visible;

        for (const mesh of layer.meshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.setEnabled(visible);
            }
        }

        for (const group of layer.groups) {
            if (group) {
                group.setEnabled(visible);
            }
        }

        for (const childId of layer.children) {
            this.setLayerVisibility(childId, visible);
        }

        return true;
    }

    toggleLayerVisibility(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        return this.setLayerVisibility(layerId, !layer.visible);
    }

    setLayerOpacity(layerId, opacity) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.opacity = Math.max(0, Math.min(1, opacity));

        for (const mesh of layer.meshes) {
            if (mesh && !mesh.isDisposed()) {
                this._applyOpacityToMesh(mesh, layer.opacity);
            }
        }

        for (const group of layer.groups) {
            if (group) {
                group.getChildMeshes().forEach(mesh => {
                    this._applyOpacityToMesh(mesh, layer.opacity);
                });
            }
        }

        return true;
    }

    setLayerLocked(layerId, locked) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.locked = locked;

        for (const mesh of layer.meshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.isPickable = !locked;
            }
        }

        for (const group of layer.groups) {
            if (group) {
                group.getChildMeshes().forEach(mesh => {
                    mesh.isPickable = !locked;
                });
            }
        }

        return true;
    }

    createSubLayer(parentId, id, name, options = {}) {
        const parent = this.layers.get(parentId);
        if (!parent) return null;

        const layer = this.createLayer(id, name, options);
        layer.parent = parentId;
        parent.children.push(id);

        return layer;
    }

    _applyOpacityToMesh(mesh, opacity) {
        if (!mesh.material) return;

        if (opacity >= 1) {
            mesh.material.alpha = 1;
            mesh.material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
        } else if (opacity <= 0) {
            mesh.material.alpha = 0;
            mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        } else {
            mesh.material.alpha = opacity;
            mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        }
    }

    getLayer(layerId) {
        return this.layers.get(layerId);
    }

    getAllLayers() {
        return this.layerOrder.map(id => this.layers.get(id)).filter(Boolean);
    }

    getTopLevelLayers() {
        return this.layerOrder
            .map(id => this.layers.get(id))
            .filter(layer => layer && !layer.parent);
    }

    getLayerMeshes(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return [];

        const allMeshes = [...layer.meshes.filter(m => m && !m.isDisposed())];

        for (const group of layer.groups) {
            if (group) {
                allMeshes.push(...group.getChildMeshes());
            }
        }

        return allMeshes;
    }

    getLayerStats(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return null;

        const meshCount = layer.meshes.filter(m => m && !m.isDisposed()).length;
        const groupCount = layer.groups.length;

        return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            meshCount: meshCount,
            groupCount: groupCount
        };
    }

    clearLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        for (const mesh of layer.meshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.dispose();
            }
        }
        layer.meshes = [];

        for (const group of layer.groups) {
            if (group) {
                group.dispose();
            }
        }
        layer.groups = [];
    }

    deleteLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        this.clearLayer(layerId);

        if (layer.parent) {
            const parent = this.layers.get(layer.parent);
            if (parent) {
                const idx = parent.children.indexOf(layerId);
                if (idx > -1) parent.children.splice(idx, 1);
            }
        }

        for (const childId of [...layer.children]) {
            this.deleteLayer(childId);
        }

        this.layers.delete(layerId);
        const orderIdx = this.layerOrder.indexOf(layerId);
        if (orderIdx > -1) this.layerOrder.splice(orderIdx, 1);
    }

    renderLayerPanel() {
        const container = document.getElementById('layerList');
        if (!container) return;

        const topLayers = this.getTopLevelLayers();

        container.innerHTML = topLayers.map(layer => this._renderLayerItem(layer)).join('');

        container.querySelectorAll('.layer-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.layerId;
                this.toggleLayerVisibility(id);
                this.renderLayerPanel();
            });
        });

        container.querySelectorAll('.layer-lock').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.layerId;
                const layer = this.layers.get(id);
                if (layer) {
                    this.setLayerLocked(id, !layer.locked);
                    this.renderLayerPanel();
                }
            });
        });

        container.querySelectorAll('.layer-opacity').forEach(el => {
            el.addEventListener('input', (e) => {
                const id = el.dataset.layerId;
                this.setLayerOpacity(id, parseFloat(e.target.value));
            });
        });
    }

    _renderLayerItem(layer) {
        const childrenHtml = layer.children.length > 0 && layer.expanded
            ? layer.children.map(childId => {
                const child = this.layers.get(childId);
                return child ? this._renderLayerItem(child) : '';
            }).join('')
            : '';

        const stats = this.getLayerStats(layer.id);

        return `
            <div class="layer-item ${layer.visible ? '' : 'layer-hidden'} ${layer.locked ? 'layer-locked' : ''}">
                <div class="layer-header">
                    <button class="layer-toggle" data-layer-id="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">
                        ${layer.visible ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <span class="layer-icon">${layer.icon}</span>
                    <span class="layer-name">${layer.name}</span>
                    <span class="layer-count">(${stats.meshCount + stats.groupCount})</span>
                    <button class="layer-lock" data-layer-id="${layer.id}" title="${layer.locked ? '解锁' : '锁定'}">
                        ${layer.locked ? '🔒' : '🔓'}
                    </button>
                </div>
                <div class="layer-opacity-control">
                    <input type="range" class="layer-opacity" data-layer-id="${layer.id}"
                           min="0" max="1" step="0.1" value="${layer.opacity}">
                    <span class="opacity-value">${Math.round(layer.opacity * 100)}%</span>
                </div>
                ${childrenHtml}
            </div>
        `;
    }
}
