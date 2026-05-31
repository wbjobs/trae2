export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.engine = null;
        this.scene = null;
        this.camera = null;
        this.light = null;
        this.ground = null;
        this.isPickingEnabled = false;
        this.onPointClicked = null;
        this.initialCameraPosition = new BABYLON.Vector3(0, 100, 100);
        this.initialCameraTarget = new BABYLON.Vector3(0, 0, 0);
    }

    init() {
        this.engine = new BABYLON.Engine(this.canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });

        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.05, 0.1, 0.2, 1.0);
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.001;
        this.scene.fogColor = new BABYLON.Color3(0.05, 0.1, 0.2);

        this.setupCamera();
        this.setupLight();
        this.setupGround();
        this.setupSkybox();
        this.setupEvents();

        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    setupCamera() {
        this.camera = new BABYLON.ArcRotateCamera(
            'camera',
            -Math.PI / 2,
            Math.PI / 3,
            150,
            BABYLON.Vector3.Zero(),
            this.scene
        );

        this.camera.attachControl(this.canvas, true);
        
        this.camera.lowerRadiusLimit = 10;
        this.camera.upperRadiusLimit = 500;
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2 - 0.1;
        
        this.camera.wheelPrecision = 50;
        this.camera.pinchPrecision = 50;
        
        this.camera.useBouncingBehavior = true;
        this.camera.useAutoRotationBehavior = false;
        
        this.camera.position = this.initialCameraPosition.clone();
        this.camera.setTarget(this.initialCameraTarget.clone());
    }

    setupLight() {
        const hemisphericLight = new BABYLON.HemisphericLight(
            'hemisphericLight',
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        hemisphericLight.intensity = 0.6;
        hemisphericLight.diffuse = new BABYLON.Color3(1, 1, 1);
        hemisphericLight.groundColor = new BABYLON.Color3(0.2, 0.2, 0.3);

        const directionalLight = new BABYLON.DirectionalLight(
            'directionalLight',
            new BABYLON.Vector3(-1, -2, -1),
            this.scene
        );
        directionalLight.position = new BABYLON.Vector3(50, 100, 50);
        directionalLight.intensity = 0.8;

        this.light = directionalLight;
    }

    setupGround() {
        this.ground = BABYLON.MeshBuilder.CreateGround(
            'ground',
            { width: 200, height: 200, subdivisions: 50 },
            this.scene
        );

        const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', this.scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.35, 0.3);
        groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        groundMaterial.alpha = 0.8;
        this.ground.material = groundMaterial;

        this.ground.position.y = -0.1;
        this.ground.isPickable = true;
    }

    setupSkybox() {
        const skybox = BABYLON.MeshBuilder.CreateBox('skybox', { size: 500 }, this.scene);
        const skyboxMaterial = new BABYLON.StandardMaterial('skyboxMaterial', this.scene);
        
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.disableLighting = true;
        skyboxMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.15, 0.25);
        skybox.material = skyboxMaterial;
        
        skybox.infiniteDistance = true;
    }

    setupEvents() {
        this.canvas.addEventListener('pointerdown', (event) => {
            if (this.isPickingEnabled && event.button === 0) {
                const pickResult = this.scene.pick(event.clientX, event.clientY);
                if (pickResult.hit) {
                    if (this.onPointClicked) {
                        this.onPointClicked(pickResult.pickedPoint);
                    }
                }
            }
        });
    }

    setPickingEnabled(enabled) {
        this.isPickingEnabled = enabled;
        this.camera.attachControl(this.canvas, !enabled);
    }

    getGroundPosition(screenPoint) {
        const pickInfo = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            (mesh) => mesh === this.ground || mesh.name === 'terrainMesh'
        );

        if (pickInfo.hit) {
            return pickInfo.pickedPoint;
        }
        return null;
    }

    resetCamera() {
        this.camera.radius = 150;
        this.camera.alpha = -Math.PI / 2;
        this.camera.beta = Math.PI / 3;
        this.camera.setTarget(BABYLON.Vector3.Zero());
    }

    fitCameraToBounds(bounds) {
        const center = new BABYLON.Vector3(
            (bounds.minX + bounds.maxX) / 2,
            (bounds.minY + bounds.maxY) / 2,
            (bounds.minZ + bounds.maxZ) / 2
        );

        const size = Math.max(
            bounds.maxX - bounds.minX,
            bounds.maxZ - bounds.minZ,
            bounds.maxY - bounds.minY
        );

        this.camera.setTarget(center);
        this.camera.radius = size * 1.5;
        
        if (this.ground) {
            const groundSize = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 1.5;
            this.ground.scaling.x = groundSize / 200;
            this.ground.scaling.z = groundSize / 200;
        }
    }

    focusOnPosition(position) {
        this.camera.setTarget(position);
    }

    getScene() {
        return this.scene;
    }

    getEngine() {
        return this.engine;
    }

    getCamera() {
        return this.camera;
    }

    getGround() {
        return this.ground;
    }
}
