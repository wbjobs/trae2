export class AnnotationTool {
    constructor(sceneManager, terrainReconstructor = null) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.terrainReconstructor = terrainReconstructor;
        this.currentPoints = [];
        this.annotationMeshes = [];
        this.areaMeshes = [];
        this.previewLine = null;
        this.previewPolygon = null;
        this.dynamicPoint = null;
        this.unitsPerMeter = 1;
    }

    setScale(unitsPerMeter) {
        this.unitsPerMeter = unitsPerMeter;
    }

    setTerrainReconstructor(tr) {
        this.terrainReconstructor = tr;
    }

    startAnnotation() {
        this.clearCurrentAnnotation();
    }

    addPoint(point) {
        const terrainY = this.getTerrainHeightAt(point.x, point.z);
        const adjustedPoint = new BABYLON.Vector3(point.x, Math.max(point.y, terrainY), point.z);
        
        this.currentPoints.push(adjustedPoint);
        this.updatePreview();
        return this.currentPoints.length;
    }

    getTerrainHeightAt(x, z) {
        if (this.terrainReconstructor) {
            return this.terrainReconstructor.getHeightAt(x, z);
        }
        return 0;
    }

    updateDynamicPoint(screenX, screenY) {
        const pickInfo = this.scene.pick(screenX, screenY, (mesh) => {
            return mesh.name === 'terrainMesh' || mesh.name === 'ground';
        });

        if (pickInfo && pickInfo.hit) {
            if (this.dynamicPoint) {
                this.dynamicPoint.position = pickInfo.pickedPoint;
            } else {
                this.dynamicPoint = BABYLON.MeshBuilder.CreateSphere(
                    'dynamicPoint',
                    { diameter: 0.8, segments: 8 },
                    this.scene
                );
                const mat = new BABYLON.StandardMaterial('dynamicMat', this.scene);
                mat.diffuseColor = new BABYLON.Color3(1, 0.8, 0);
                mat.alpha = 0.8;
                this.dynamicPoint.material = mat;
                this.dynamicPoint.position = pickInfo.pickedPoint;
                this.annotationMeshes.push(this.dynamicPoint);
            }

            if (this.currentPoints.length > 0 && this.previewLine) {
                const lastPoint = this.currentPoints[this.currentPoints.length - 1];
                const tempPoints = [...this.currentPoints, pickInfo.pickedPoint];
                if (this.currentPoints.length >= 2) {
                    tempPoints.push(this.currentPoints[0]);
                }
                
                BABYLON.MeshBuilder.CreateLines(
                    'previewLine',
                    { points: tempPoints, instance: this.previewLine, updatable: true },
                    this.scene
                );
            }
        }
    }

    getPointCount() {
        return this.currentPoints.length;
    }

    getPoints() {
        return [...this.currentPoints];
    }

    updatePreview() {
        this.clearPreview();
        this.dynamicPoint = null;

        if (this.currentPoints.length === 0) return;

        for (let i = 0; i < this.currentPoints.length; i++) {
            const point = this.currentPoints[i];
            const marker = this.createPointMarker(point, i);
            this.annotationMeshes.push(marker);
        }

        if (this.currentPoints.length >= 2) {
            const linePoints = [...this.currentPoints];
            if (this.currentPoints.length >= 3) {
                linePoints.push(this.currentPoints[0]);
            }

            this.previewLine = BABYLON.MeshBuilder.CreateLines(
                'previewLine',
                { points: linePoints, updatable: true },
                this.scene
            );
            this.previewLine.color = new BABYLON.Color3(1, 0.5, 0);
            this.previewLine.alpha = 0.9;
            this.previewLine.enableEdgesRendering();
            this.annotationMeshes.push(this.previewLine);
        }

        if (this.currentPoints.length >= 3) {
            this.previewPolygon = this.createPolygonMesh(
                this.currentPoints,
                new BABYLON.Color4(1, 0.6, 0, 0.25)
            );
            this.annotationMeshes.push(this.previewPolygon);
        }
    }

    createPointMarker(point, index) {
        const marker = BABYLON.MeshBuilder.CreateSphere(
            `marker_${index}`,
            { diameter: 1.2, segments: 12 },
            this.scene
        );
        marker.position = point.clone();

        const material = new BABYLON.StandardMaterial(`markerMaterial_${index}`, this.scene);
        material.diffuseColor = new BABYLON.Color3(1, 0.5, 0);
        material.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0);
        material.specularColor = new BABYLON.Color3(0, 0, 0);
        marker.material = material;

        return marker;
    }

    createPolygonMesh(points, color) {
        if (points.length < 3) return null;

        const shape = points.map(p => new BABYLON.Vector2(p.x, p.z));

        const polygon = BABYLON.MeshBuilder.ExtrudePolygon(
            'polygon',
            {
                shape: shape,
                depth: 0.3,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            },
            this.scene
        );

        const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        polygon.position.y = avgY - 0.15;

        const material = new BABYLON.StandardMaterial('polygonMaterial', this.scene);
        material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
        material.alpha = color.a;
        material.backFaceCulling = false;
        material.specularColor = new BABYLON.Color3(0, 0, 0);
        polygon.material = material;

        return polygon;
    }

    calculateArea() {
        if (this.currentPoints.length < 3) return 0;

        const coords = this.currentPoints.map(p => ({ x: p.x, y: p.z }));
        let area = 0;
        const n = coords.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coords[i].x * coords[j].y;
            area -= coords[j].x * coords[i].y;
        }

        const sceneArea = Math.abs(area / 2);
        return sceneArea / (this.unitsPerMeter * this.unitsPerMeter);
    }

    calculatePolygonArea(points) {
        if (points.length < 3) return 0;

        let area = 0;
        const n = points.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].z;
            area -= points[j].x * points[i].z;
        }

        const sceneArea = Math.abs(area / 2);
        return sceneArea / (this.unitsPerMeter * this.unitsPerMeter);
    }

    finishAnnotation(name, area) {
        if (this.currentPoints.length < 3) return;

        const areaMesh = this.createAreaMesh(this.currentPoints, name, area);
        this.areaMeshes.push(areaMesh);

        this.clearCurrentAnnotation();
    }

    createAreaMesh(points, name, area) {
        const group = new BABYLON.TransformNode(`area_${name}`, this.scene);

        const linePoints = [...points, points[0]];
        const outline = BABYLON.MeshBuilder.CreateLines(
            `outline_${name}`,
            { points: linePoints },
            this.scene
        );
        outline.color = new BABYLON.Color3(0, 0.9, 0.45);
        outline.parent = group;

        const fillPolygon = BABYLON.MeshBuilder.ExtrudePolygon(
            `fill_${name}`,
            {
                shape: points.map(p => new BABYLON.Vector2(p.x, p.z)),
                depth: 0.2,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            },
            this.scene
        );
        const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        fillPolygon.position.y = avgY - 0.1;
        
        const fillMaterial = new BABYLON.StandardMaterial(`fillMaterial_${name}`, this.scene);
        fillMaterial.diffuseColor = new BABYLON.Color3(0, 0.8, 0.4);
        fillMaterial.alpha = 0.35;
        fillMaterial.backFaceCulling = false;
        fillMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        fillPolygon.material = fillMaterial;
        fillPolygon.parent = group;

        for (let i = 0; i < points.length; i++) {
            const marker = BABYLON.MeshBuilder.CreateSphere(
                `area_marker_${name}_${i}`,
                { diameter: 0.8, segments: 10 },
                this.scene
            );
            marker.position = points[i].clone();
            
            const markerMaterial = new BABYLON.StandardMaterial(`areaMarkerMaterial_${name}_${i}`, this.scene);
            markerMaterial.diffuseColor = new BABYLON.Color3(0, 0.9, 0.45);
            markerMaterial.emissiveColor = new BABYLON.Color3(0, 0.25, 0.1);
            markerMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
            marker.material = markerMaterial;
            marker.parent = group;
        }

        group.metadata = {
            name: name,
            area: area,
            points: [...points]
        };

        return group;
    }

    renderArea(name, points, area) {
        const areaMesh = this.createAreaMesh(points, name, area);
        this.areaMeshes.push(areaMesh);
        return areaMesh;
    }

    cancelAnnotation() {
        this.clearCurrentAnnotation();
    }

    clearPreview() {
        for (const mesh of this.annotationMeshes) {
            mesh.dispose();
        }
        this.annotationMeshes = [];
        this.previewLine = null;
        this.previewPolygon = null;
        this.dynamicPoint = null;
    }

    clearCurrentAnnotation() {
        this.clearPreview();
        this.currentPoints = [];
    }

    clearAreas() {
        for (const mesh of this.areaMeshes) {
            mesh.dispose();
        }
        this.areaMeshes = [];
    }

    clearAll() {
        this.clearCurrentAnnotation();
        this.clearAreas();
    }
}
