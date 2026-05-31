class EnvironmentFactory {
  static createObstacle(obstacleData) {
    let geometry, material;

    switch (obstacleData.type) {
      case 'rock':
        geometry = new THREE.DodecahedronGeometry(obstacleData.radius, 0);
        material = new THREE.MeshPhongMaterial({ color: 0x5a5a5a });
        break;
      case 'coral':
        geometry = new THREE.ConeGeometry(obstacleData.radius * 0.8, obstacleData.radius * 2, 8);
        material = new THREE.MeshPhongMaterial({ color: 0xff6b6b });
        break;
      case 'cave':
        geometry = new THREE.TorusGeometry(obstacleData.radius, obstacleData.radius * 0.3, 8, 16);
        material = new THREE.MeshPhongMaterial({ color: 0x4a4a4a });
        break;
      case 'thermal_vent':
        geometry = new THREE.CylinderGeometry(obstacleData.radius * 0.5, obstacleData.radius, obstacleData.radius * 2, 8);
        material = new THREE.MeshPhongMaterial({ color: 0x8b4513 });
        break;
      case 'plant':
        geometry = new THREE.ConeGeometry(obstacleData.radius * 0.3, obstacleData.radius * 3, 6);
        material = new THREE.MeshPhongMaterial({ color: 0x228b22 });
        break;
      case 'ridge':
        geometry = new THREE.CylinderGeometry(obstacleData.radius, obstacleData.radius * 1.2, obstacleData.height || 50, 16);
        material = new THREE.MeshPhongMaterial({ color: 0x3d3d3d });
        break;
      case 'wreck':
        geometry = new THREE.BoxGeometry(obstacleData.radius * 2, obstacleData.radius, obstacleData.radius * 3);
        material = new THREE.MeshPhongMaterial({ color: 0x5c4033 });
        break;
      default:
        geometry = new THREE.SphereGeometry(obstacleData.radius, 16, 16);
        material = new THREE.MeshPhongMaterial({ color: 0x666666 });
    }

    const obstacle = new THREE.Mesh(geometry, material);
    obstacle.position.set(
      obstacleData.position.x,
      obstacleData.position.y,
      obstacleData.position.z
    );
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    obstacle.userData.data = obstacleData;

    if (obstacleData.type === 'thermal_vent') {
      const glowGeometry = new THREE.SphereGeometry(obstacleData.radius * 1.2, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.3
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      obstacle.add(glow);
    }

    return obstacle;
  }

  static createSample(sampleData) {
    let geometry, material;

    switch (sampleData.type) {
      case 'coral':
        geometry = new THREE.OctahedronGeometry(2, 0);
        material = new THREE.MeshPhongMaterial({ color: 0xff6b6b, emissive: 0x331111 });
        break;
      case 'rock':
        geometry = new THREE.DodecahedronGeometry(1.5, 0);
        material = new THREE.MeshPhongMaterial({ color: 0x8b7355 });
        break;
      case 'mineral':
        geometry = new THREE.IcosahedronGeometry(1.5, 0);
        material = new THREE.MeshPhongMaterial({ color: 0x4169e1, emissive: 0x112244 });
        break;
      case 'biological':
        geometry = new THREE.SphereGeometry(1.5, 8, 8);
        material = new THREE.MeshPhongMaterial({ color: 0x32cd32, emissive: 0x113311 });
        break;
      case 'artifact':
        geometry = new THREE.BoxGeometry(2, 2, 2);
        material = new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0x443300 });
        break;
      default:
        geometry = new THREE.SphereGeometry(1.5, 8, 8);
        material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    }

    const sample = new THREE.Mesh(geometry, material);
    sample.position.set(
      sampleData.position.x,
      sampleData.position.y,
      sampleData.position.z
    );
    sample.userData.data = sampleData;
    sample.userData.rotationSpeed = Math.random() * 0.02 + 0.01;

    const glowGeometry = new THREE.SphereGeometry(3, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.2
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    sample.add(glow);

    return sample;
  }

  static updateSample(sample, state) {
    sample.position.set(
      state.position.x,
      state.position.y,
      state.position.z
    );

    sample.rotation.y += sample.userData.rotationSpeed;
    sample.position.y += Math.sin(Date.now() * 0.002 + state.position.x) * 0.01;
  }
}
