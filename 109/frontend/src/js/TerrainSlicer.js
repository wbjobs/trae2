export class TerrainSlicer {
    constructor(sceneManager, terrainReconstructor) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.terrainReconstructor = terrainReconstructor;
        this.slicePlanes = [];
        this.sliceMeshes = [];
        this.sliceResults = [];
        this.activeSliceHeight = 0;
        this.isSlicing = false;
        this.terrainBounds = null;
        this.clipPlane = null;
    }

    createHorizontalSlice(height, options = {}) {
        const { color = new BABYLON.Color3(1, 0.3, 0.3), thickness = 0.3, showContour = true } = options;

        if (!this.terrainReconstructor.terrainMesh) {
            console.warn('请先重建地形表面');
            return null;
        }

        const terrainMesh = this.terrainReconstructor.terrainMesh;
        const bounds = this.terrainReconstructor.calculateBounds(
            this.terrainReconstructor.terrainMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)
        );

        const sliceGroup = new BABYLON.TransformNode(`slice_${height}`, this.scene);
        sliceGroup.metadata = { type: 'slice', height: height };

        if (showContour) {
            const contour = this.createContourLine(terrainMesh, height, color);
            if (contour) {
                contour.parent = sliceGroup;
            }
        }

        const plane = this.createSlicePlane(height, color, thickness);
        plane.parent = sliceGroup;

        const label = this.createHeightLabel(height);
        label.parent = sliceGroup;

        const sliceData = {
            height: height,
            group: sliceGroup,
            visible: true,
            color: color
        };

        this.slicePlanes.push(sliceData);
        this.activeSliceHeight = height;

        return sliceData;
    }

    createContourLine(terrainMesh, height, color) {
        const positions = terrainMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const indices = terrainMesh.getVerticesData(BABYLON.VertexBuffer.IndexKind);

        if (!positions || !indices) return null;

        const contourPoints = this.extractContourAtHeight(positions, indices, height);

        if (contourPoints.length < 2) return null;

        const lines = [];
        for (let i = 0; i < contourPoints.length - 1; i += 2) {
            const segment = [
                new BABYLON.Vector3(contourPoints[i].x, height, contourPoints[i].z),
                new BABYLON.Vector3(contourPoints[i + 1].x, height, contourPoints[i + 1].z)
            ];
            lines.push(segment);
        }

        if (lines.length === 0) return null;

        const lineSystem = BABYLON.MeshBuilder.CreateLineSystem(
            `contour_${height}`,
            { lines: lines },
            this.scene
        );
        lineSystem.color = color;
        lineSystem.alpha = 0.9;

        return lineSystem;
    }

    extractContourAtHeight(positions, indices, height) {
        const vertices = [];
        for (let i = 0; i < positions.length; i += 3) {
            vertices.push(new BABYLON.Vector3(positions[i], positions[i + 1], positions[i + 2]));
        }

        const contourPoints = [];

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const v0 = vertices[i0];
            const v1 = vertices[i1];
            const v2 = vertices[i2];

            const intersections = this.findTrianglePlaneIntersections(v0, v1, v2, height);

            for (const point of intersections) {
                contourPoints.push(point);
            }
        }

        return contourPoints;
    }

    findTrianglePlaneIntersections(v0, v1, v2, height) {
        const intersections = [];
        const edges = [[v0, v1], [v1, v2], [v2, v0]];

        for (const [a, b] of edges) {
            const point = this.findEdgePlaneIntersection(a, b, height);
            if (point) {
                intersections.push(point);
            }
        }

        return intersections;
    }

    findEdgePlaneIntersection(a, b, height) {
        if ((a.y - height) * (b.y - height) > 0) return null;

        const t = (height - a.y) / (b.y - a.y);

        if (t < 0 || t > 1) return null;

        return new BABYLON.Vector3(
            a.x + t * (b.x - a.x),
            height,
            a.z + t * (b.z - a.z)
        );
    }

    createSlicePlane(height, color, thickness) {
        const bounds = this.terrainReconstructor.calculateBounds(
            this.terrainReconstructor.terrainMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)
        );

        const plane = BABYLON.MeshBuilder.CreateBox(
            `slicePlane_${height}`,
            {
                width: 200,
                height: thickness,
                depth: 200
            },
            this.scene
        );

        plane.position.y = height;

        const material = new BABYLON.StandardMaterial(`sliceMaterial_${height}`, this.scene);
        material.diffuseColor = color;
        material.alpha = 0.25;
        material.backFaceCulling = false;
        material.specularColor = new BABYLON.Color3(0, 0, 0);
        plane.material = material;

        plane.isPickable = false;

        return plane;
    }

    createHeightLabel(height) {
        const plane = BABYLON.MeshBuilder.CreatePlane(
            `sliceLabel_${height}`,
            { width: 8, height: 2 },
            this.scene
        );
        plane.position.y = height + 2;
        plane.position.x = -90;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        const texture = new BABYLON.DynamicTexture(
            `sliceTexture_${height}`,
            { width: 256, height: 64 },
            this.scene,
            true
        );
        texture.hasAlpha = true;
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.roundRect(4, 4, 248, 56, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`高程: ${height.toFixed(1)}m`, 128, 32);
        texture.update();

        const material = new BABYLON.StandardMaterial(`sliceLabelMat_${height}`, this.scene);
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.useAlphaFromDiffuseTexture = true;
        material.backFaceCulling = false;
        material.specularColor = new BABYLON.Color3(0, 0, 0);
        plane.material = material;
        plane.isPickable = false;

        return plane;
    }

    createMultiLayerSlices(minHeight, maxHeight, interval = 10) {
        this.clearAllSlices();

        const colors = [
            new BABYLON.Color3(0.3, 0.6, 1.0),
            new BABYLON.Color3(0.3, 1.0, 0.5),
            new BABYLON.Color3(1.0, 0.8, 0.2),
            new BABYLON.Color3(1.0, 0.4, 0.3),
            new BABYLON.Color3(0.8, 0.3, 1.0)
        ];

        for (let h = minHeight; h <= maxHeight; h += interval) {
            const colorIdx = Math.floor((h - minHeight) / interval) % colors.length;
            this.createHorizontalSlice(h, { color: colors[colorIdx] });
        }

        return this.slicePlanes;
    }

    applyClippingAtHeight(height, direction = 'above') {
        if (this.clipPlane) {
            this.scene.clipPlane = null;
        }

        this.clipPlane = new BABYLON.Plane(0, -1, 0, height);

        if (direction === 'above') {
            this.clipPlane = new BABYLON.Plane(0, 1, 0, -height);
        }

        if (this.terrainReconstructor.terrainMesh) {
            const mesh = this.terrainReconstructor.terrainMesh;
            mesh.onBeforeRenderObservable.add(() => {
                this.scene.clipPlane = this.clipPlane;
            });
            mesh.onAfterRenderObservable.add(() => {
                this.scene.clipPlane = null;
            });
        }

        this.isSlicing = true;
    }

    removeClipping() {
        this.scene.clipPlane = null;
        this.clipPlane = null;
        this.isSlicing = false;

        if (this.terrainReconstructor.terrainMesh) {
            this.terrainReconstructor.terrainMesh.onBeforeRenderObservable.clear();
            this.terrainReconstructor.terrainMesh.onAfterRenderObservable.clear();
        }
    }

    toggleSliceVisibility(index) {
        if (index >= 0 && index < this.slicePlanes.length) {
            const slice = this.slicePlanes[index];
            slice.visible = !slice.visible;
            slice.group.setEnabled(slice.visible);
            return slice.visible;
        }
        return false;
    }

    setSliceOpacity(index, opacity) {
        if (index >= 0 && index < this.slicePlanes.length) {
            const slice = this.slicePlanes[index];
            slice.group.getChildMeshes().forEach(mesh => {
                if (mesh.material) {
                    mesh.material.alpha = opacity;
                }
            });
        }
    }

    getSliceAtHeight(height) {
        return this.slicePlanes.find(s => Math.abs(s.height - height) < 0.5);
    }

    getAllSlices() {
        return [...this.slicePlanes];
    }

    clearAllSlices() {
        for (const slice of this.slicePlanes) {
            slice.group.dispose();
        }
        this.slicePlanes = [];
        this.removeClipping();
    }

    removeSlice(index) {
        if (index >= 0 && index < this.slicePlanes.length) {
            this.slicePlanes[index].group.dispose();
            this.slicePlanes.splice(index, 1);
        }
    }
}
