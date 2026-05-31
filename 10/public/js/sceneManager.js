class SceneManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.geometries = new Map();
        this.selectedGeometry = null;
        this.outlineMesh = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.onSelectCallback = null;
        this.onTransformCallback = null;
        this.isTransforming = false;

        this.init();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f0f1a);

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(8, 6, 8);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 50;

        this.setupLighting();
        this.setupGrid();

        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0x00ff88, 0.5, 30);
        pointLight1.position.set(-10, 10, -10);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x00d4ff, 0.5, 30);
        pointLight2.position.set(10, 5, 10);
        this.scene.add(pointLight2);
    }

    setupGrid() {
        const gridHelper = new THREE.GridHelper(30, 30, 0x333333, 0x222222);
        this.scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (event) => this.onCanvasClick(event));
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
    }

    onCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const objects = Array.from(this.geometries.values()).map(g => g.mesh);
        const intersects = this.raycaster.intersectObjects(objects);

        if (intersects.length > 0) {
            this.selectGeometry(intersects[0].object.userData.id);
        } else {
            this.deselectGeometry();
        }
    }

    onKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (this.selectedGeometry && this.onTransformCallback) {
                this.onTransformCallback({
                    type: 'DELETE',
                    geometryId: this.selectedGeometry
                });
            }
        }
    }

    createGeometry(data) {
        const { id, type, position, rotation, scale, color } = data;

        if (this.geometries.has(id)) {
            return this.geometries.get(id).mesh;
        }

        let geometry;
        switch (type) {
            case 'box':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 32, 32);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color || 0x00ff00),
            metalness: 0.1,
            roughness: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = id;
        mesh.userData.type = type;

        if (position) {
            mesh.position.set(position.x, position.y, position.z);
        }
        if (rotation) {
            mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        }
        if (scale) {
            mesh.scale.set(scale.x, scale.y, scale.z);
        }

        this.scene.add(mesh);
        this.geometries.set(id, { mesh, data: { ...data } });

        return mesh;
    }

    updateGeometry(id, updates) {
        const geometryData = this.geometries.get(id);
        if (!geometryData) return;

        const { mesh, data } = geometryData;

        if (updates.position) {
            mesh.position.set(updates.position.x, updates.position.y, updates.position.z);
            data.position = { ...updates.position };
        }
        if (updates.rotation) {
            mesh.rotation.set(updates.rotation.x, updates.rotation.y, updates.rotation.z);
            data.rotation = { ...updates.rotation };
        }
        if (updates.scale) {
            mesh.scale.set(updates.scale.x, updates.scale.y, updates.scale.z);
            data.scale = { ...updates.scale };
        }
        if (updates.color) {
            mesh.material.color.set(updates.color);
            data.color = updates.color;
        }

        if (this.outlineMesh && this.selectedGeometry === id) {
            this.updateOutline(mesh);
        }

        if (this.selectedGeometry === id && this.onSelectCallback) {
            this.onSelectCallback(this.getGeometryData(id));
        }
    }

    deleteGeometry(id) {
        const geometryData = this.geometries.get(id);
        if (!geometryData) return;

        if (this.selectedGeometry === id) {
            this.deselectGeometry();
        }

        this.scene.remove(geometryData.mesh);
        geometryData.mesh.geometry.dispose();
        geometryData.mesh.material.dispose();
        this.geometries.delete(id);
    }

    selectGeometry(id) {
        const geometryData = this.geometries.get(id);
        if (!geometryData) return;

        this.selectedGeometry = id;
        this.createOutline(geometryData.mesh);

        if (this.onSelectCallback) {
            this.onSelectCallback(this.getGeometryData(id));
        }
    }

    deselectGeometry() {
        this.selectedGeometry = null;
        this.removeOutline();

        if (this.onSelectCallback) {
            this.onSelectCallback(null);
        }
    }

    createOutline(mesh) {
        this.removeOutline();

        const outlineGeometry = mesh.geometry.clone();
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            side: THREE.BackSide
        });

        this.outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
        this.outlineMesh.scale.multiplyScalar(1.05);
        this.outlineMesh.position.copy(mesh.position);
        this.outlineMesh.rotation.copy(mesh.rotation);

        this.scene.add(this.outlineMesh);
    }

    updateOutline(mesh) {
        if (this.outlineMesh) {
            this.outlineMesh.position.copy(mesh.position);
            this.outlineMesh.rotation.copy(mesh.rotation);
            this.outlineMesh.scale.copy(mesh.scale).multiplyScalar(1.05);
        }
    }

    removeOutline() {
        if (this.outlineMesh) {
            this.scene.remove(this.outlineMesh);
            this.outlineMesh.geometry.dispose();
            this.outlineMesh.material.dispose();
            this.outlineMesh = null;
        }
    }

    getGeometryData(id) {
        const geometryData = this.geometries.get(id);
        if (!geometryData) return null;

        const { mesh, data } = geometryData;
        return {
            id,
            type: data.type,
            position: {
                x: parseFloat(mesh.position.x.toFixed(2)),
                y: parseFloat(mesh.position.y.toFixed(2)),
                z: parseFloat(mesh.position.z.toFixed(2))
            },
            rotation: {
                x: parseFloat(mesh.rotation.x.toFixed(2)),
                y: parseFloat(mesh.rotation.y.toFixed(2)),
                z: parseFloat(mesh.rotation.z.toFixed(2))
            },
            scale: {
                x: parseFloat(mesh.scale.x.toFixed(2)),
                y: parseFloat(mesh.scale.y.toFixed(2)),
                z: parseFloat(mesh.scale.z.toFixed(2))
            },
            color: '#' + mesh.material.color.getHexString()
        };
    }

    clearAll() {
        this.geometries.forEach((_, id) => this.deleteGeometry(id));
        this.geometries.clear();
        this.selectedGeometry = null;
        this.removeOutline();
    }

    getAllGeometries() {
        const result = [];
        this.geometries.forEach((_, id) => {
            const data = this.getGeometryData(id);
            if (data) result.push(data);
        });
        return result;
    }

    onSelect(callback) {
        this.onSelectCallback = callback;
    }

    onTransform(callback) {
        this.onTransformCallback = callback;
    }

    onResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    getSelectedId() {
        return this.selectedGeometry;
    }

    getAllGeometries() {
        return Array.from(this.geometries.values()).map(g => g.data);
    }
}
