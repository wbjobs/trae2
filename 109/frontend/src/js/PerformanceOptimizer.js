export class PerformanceOptimizer {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.engine = sceneManager.getEngine();
        this.camera = sceneManager.getCamera();
        this.frozenMeshes = new Set();
        this.lodLevels = new Map();
        this.lastCameraPosition = null;
        this.lastCameraRadius = 0;
        this.cameraMoveThreshold = 5;
        this.isOptimized = false;
        this.occlusionBoxes = [];
        this.frameId = 0;
    }

    enableOptimizations() {
        if (this.isOptimized) return;
        this.isOptimized = true;

        this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

        this.scene.freezeActiveMeshes();

        this.scene.onBeforeRenderObservable.add(() => {
            this._onBeforeRender();
        });

        this.scene.onAfterRenderObservable.add(() => {
            this._onAfterRender();
        });

        this._setupFrustumCulling();

        this._setupAdaptiveResolution();

        console.log('Performance optimizations enabled');
    }

    _onBeforeRender() {
        this.frameId++;

        if (this.frameId % 30 === 0) {
            this._updateLOD();
            this._updateOcclusionCulling();
        }
    }

    _onAfterRender() {
        if (this.frameId % 60 === 0) {
            this._checkPerformanceAndAdapt();
        }
    }

    freezeStaticMeshes(meshNames = []) {
        const meshesToFreeze = meshNames.length > 0
            ? this.scene.meshes.filter(m => meshNames.includes(m.name))
            : this.scene.meshes.filter(m => !m.metadata || !m.metadata.dynamic);

        for (const mesh of meshesToFreeze) {
            if (mesh.isReady() && !this.frozenMeshes.has(mesh)) {
                mesh.freezeWorldMatrix();
                if (mesh.material && mesh.material.isReadyForFrame) {
                    mesh.material.freeze();
                }
                this.frozenMeshes.add(mesh);
            }
        }
    }

    unfreezeAllMeshes() {
        for (const mesh of this.frozenMeshes) {
            if (!mesh.isDisposed()) {
                mesh.unfreezeWorldMatrix();
                if (mesh.material && mesh.material.isFrozen) {
                    mesh.material.unfreeze();
                }
            }
        }
        this.frozenMeshes.clear();
    }

    setupLOD(mesh, highResMesh, lowResMesh, threshold = 100) {
        const lod = {
            mesh: mesh,
            highRes: highResMesh,
            lowRes: lowResMesh,
            threshold: threshold,
            currentLevel: 'high'
        };

        this.lodLevels.set(mesh.uniqueId, lod);
    }

    setupTerrainLOD(terrainMesh, resolutions = [128, 64, 32, 16]) {
        if (!terrainMesh) return;

        const bounds = this._getMeshBounds(terrainMesh);

        for (let i = 1; i < resolutions.length; i++) {
            const lodMesh = terrainMesh.clone(`terrain_LOD_${resolutions[i]}`);
            lodMesh.simplify(
                [{ quality: resolutions[i] / resolutions[0], distance: 50 * i }],
                true,
                BABYLON.SimplificationType.QUADRATIC,
                () => {
                    console.log(`LOD level ${i} created at distance ${50 * i}`);
                }
            );
        }
    }

    _updateLOD() {
        if (!this.camera) return;

        const cameraRadius = this.camera.radius;

        for (const [id, lod] of this.lodLevels) {
            if (lod.mesh.isDisposed()) {
                this.lodLevels.delete(id);
                continue;
            }

            const meshDistance = BABYLON.Vector3.Distance(
                this.camera.position,
                lod.mesh.getAbsolutePosition()
            );

            if (meshDistance > lod.threshold && lod.currentLevel === 'high') {
                lod.highRes.setEnabled(false);
                lod.lowRes.setEnabled(true);
                lod.currentLevel = 'low';
            } else if (meshDistance <= lod.threshold && lod.currentLevel === 'low') {
                lod.lowRes.setEnabled(false);
                lod.highRes.setEnabled(true);
                lod.currentLevel = 'high';
            }
        }
    }

    _setupFrustumCulling() {
        this.scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
            const frustumPlanes = this.scene.getFrustumPlanes(this.scene.getTransformMatrix());

            for (const mesh of this.scene.meshes) {
                if (mesh.isDisposed() || !mesh.getTotalVertices()) continue;

                if (this._isMeshInFrustum(mesh, frustumPlanes)) {
                    mesh.setBoundingInfo(mesh.getBoundingInfo());
                }
            }
        });
    }

    _isMeshInFrustum(mesh, frustumPlanes) {
        if (!mesh._boundingInfo) return true;

        const boundingInfo = mesh.getBoundingInfo();
        const center = boundingInfo.boundingSphere.centerWorld;
        const radius = boundingInfo.boundingSphere.radiusWorld;

        for (const plane of frustumPlanes) {
            if (plane.dotCoordinate(center) + plane.d < -radius) {
                return false;
            }
        }

        return true;
    }

    _updateOcclusionCulling() {
        for (const box of this.occlusionBoxes) {
            if (box.mesh.isDisposed()) continue;

            const occluded = this._isOccluded(box.mesh);
            if (occluded !== box.occluded) {
                box.occluded = occluded;
                box.targetMeshes.forEach(m => {
                    if (!m.isDisposed()) {
                        m.setEnabled(!occluded);
                    }
                });
            }
        }
    }

    addOccluder(mesh, targetMeshes = []) {
        this.occlusionBoxes.push({
            mesh: mesh,
            targetMeshes: targetMeshes,
            occluded: false
        });
    }

    _isOccluded(mesh) {
        if (!this.camera) return false;

        const distance = BABYLON.Vector3.Distance(
            this.camera.position,
            mesh.getAbsolutePosition()
        );

        return distance > 300;
    }

    _setupAdaptiveResolution() {
        this._targetFPS = 45;
        this._minScaling = 0.5;
        this._maxScaling = 1.5;
        this._currentScaling = 1.0;

        this.scene.onAfterRenderObservable.add(() => {
            if (this.frameId % 120 !== 0) return;

            const fps = this.engine.getFps();

            if (fps < this._targetFPS - 10 && this._currentScaling > this._minScaling) {
                this._currentScaling = Math.max(this._minScaling, this._currentScaling - 0.1);
                this.engine.setHardwareScalingLevel(this._currentScaling);
            } else if (fps > this._targetFPS + 10 && this._currentScaling < this._maxScaling) {
                this._currentScaling = Math.min(this._maxScaling, this._currentScaling + 0.05);
                this.engine.setHardwareScalingLevel(1 / this._currentScaling);
            }
        });
    }

    _checkPerformanceAndAdapt() {
        const fps = this.engine.getFps();
        const activeMeshes = this.scene.getActiveMeshes().length;
        const totalVertices = this.scene.getTotalVertices();

        if (fps < 25) {
            this.freezeStaticMeshes();
            if (this.scene.fogDensity < 0.003) {
                this.scene.fogDensity += 0.0005;
            }
        }
    }

    optimizeMaterial(material) {
        if (!material) return;

        material.freeze();

        if (material.diffuseTexture) {
            material.diffuseTexture.anisotropicFilteringLevel = 1;
        }
    }

    optimizeMeshForPicking(mesh) {
        if (!mesh) return;

        const vertexCount = mesh.getTotalVertices();
        if (vertexCount > 100000) {
            mesh.isPickable = false;
        }
    }

    createInstancedMeshes(baseMesh, positions) {
        if (!baseMesh || positions.length === 0) return [];

        const instances = [];
        const maxInstances = Math.min(positions.length, 10000);

        for (let i = 0; i < maxInstances; i++) {
            const instance = baseMesh.createInstance(`instance_${i}`);
            instance.position = positions[i].position || BABYLON.Vector3.Zero();
            
            if (positions[i].rotation) {
                instance.rotation = positions[i].rotation;
            }
            if (positions[i].scaling) {
                instance.scaling = positions[i].scaling;
            }

            instance.isPickable = false;
            instances.push(instance);
        }

        return instances;
    }

    getPerformanceMetrics() {
        return {
            fps: this.engine.getFps().toFixed(1),
            activeMeshes: this.scene.getActiveMeshes().length,
            totalMeshes: this.scene.meshes.length,
            totalVertices: this.scene.getTotalVertices(),
            totalIndices: this.scene.getTotalIndices(),
            drawCalls: this.engine._drawCalls.current,
            frozenMeshes: this.frozenMeshes.size,
            lodLevels: this.lodLevels.size,
            hardwareScaling: this.engine.getHardwareScalingLevel().toFixed(2)
        };
    }

    enablePointsCloudOptimization(pointCloudMesh) {
        if (!pointCloudMesh) return;

        pointCloudMesh.alwaysSelectAsActiveMesh = true;

        const material = pointCloudMesh.material;
        if (material) {
            material.freeze();
            material.pointSize = Math.max(1, material.pointSize);
        }
    }

    disableOptimizations() {
        this.isOptimized = false;
        this.unfreezeAllMeshes();

        if (this.scene._activeMeshesFrozen) {
            this.scene.unfreezeActiveMeshes();
        }

        this.engine.setHardwareScalingLevel(1);
        this.scene.fogDensity = 0.001;
    }
}
