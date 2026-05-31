class SceneController {
  constructor(canvas, qualityConfig) {
    this.canvas = canvas;
    this.config = qualityConfig;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    
    this.cameraAngle = Math.PI / 4;
    this.cameraHeight = 12;
    this.cameraDistance = 20;
    
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    this.animationFrameId = null;
    this.isRunning = false;
    
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1628);
    
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.updateCameraPosition();
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.config.antialias,
      powerPreference: 'high-performance'
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    RenderConfig.applyConfigToRenderer(this.renderer, this.config);
    
    this.setupLighting();
    this.createGround();
    this.setupControls();
    
    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = this.config.shadowQuality > 0;
    
    if (sunLight.castShadow) {
      const shadowRes = RenderConfig.getShadowResolution(this.config);
      sunLight.shadow.mapSize.width = shadowRes;
      sunLight.shadow.mapSize.height = shadowRes;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 50;
      sunLight.shadow.camera.left = -20;
      sunLight.shadow.camera.right = 20;
      sunLight.shadow.camera.top = 20;
      sunLight.shadow.camera.bottom = -20;
    }
    
    this.scene.add(sunLight);
    this.scene.userData.sunLight = sunLight;

    const fillLight = new THREE.DirectionalLight(0x6688cc, 0.3);
    fillLight.position.set(-10, 5, -10);
    this.scene.add(fillLight);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(60, 60, 20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a1a,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true
    });

    const vertices = groundGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] += (Math.random() - 0.5) * 0.3;
    }
    groundGeometry.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = this.config.shadowQuality > 0;
    this.scene.add(ground);

    if (this.config.animationQuality >= 1) {
      this.addEnvironmentDecorations();
    }
  }

  addEnvironmentDecorations() {
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.9
    });

    for (let i = 0; i < 10; i++) {
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      rock.position.set(
        (Math.random() - 0.5) * 40,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 40
      );
      rock.scale.setScalar(0.3 + Math.random() * 0.7);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = this.config.shadowQuality > 0;
      this.scene.add(rock);
    }

    const grassGeometry = new THREE.ConeGeometry(0.08, 0.4, 4);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a2d
    });

    for (let i = 0; i < 100; i++) {
      const grass = new THREE.Mesh(grassGeometry, grassMaterial);
      grass.position.set(
        (Math.random() - 0.5) * 50,
        0.2,
        (Math.random() - 0.5) * 50
      );
      grass.rotation.y = Math.random() * Math.PI;
      this.scene.add(grass);
    }
  }

  setupControls() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        
        this.cameraAngle += deltaX * 0.01;
        this.cameraHeight = Math.max(5, Math.min(25, this.cameraHeight - deltaY * 0.05));
        
        this.updateCameraPosition();
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(10, Math.min(40, this.cameraDistance + e.deltaY * 0.05));
      this.updateCameraPosition();
    }, { passive: false });
  }

  updateCameraPosition() {
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraDistance;
    this.camera.position.z = Math.cos(this.cameraAngle) * this.cameraDistance;
    this.camera.position.y = this.cameraHeight;
    this.camera.lookAt(0, 2, 0);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateQuality(newConfig) {
    this.config = newConfig;
    RenderConfig.applyConfigToRenderer(this.renderer, newConfig);
    
    if (this.scene.userData.sunLight) {
      this.scene.userData.sunLight.castShadow = newConfig.shadowQuality > 0;
    }
  }

  getDelta() {
    return Math.min(this.clock.getDelta(), 0.1) * this.config.animationQuality;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  startAnimationLoop(callback) {
    this.isRunning = true;
    
    const animate = () => {
      if (!this.isRunning) return;
      
      this.animationFrameId = requestAnimationFrame(animate);
      
      const delta = this.getDelta();
      callback(delta);
      
      this.render();
    };
    
    animate();
  }

  stopAnimationLoop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose() {
    this.stopAnimationLoop();
    this.renderer.dispose();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SceneController;
}
