class SonarRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.sonarLines = [];
  }

  updateSonar(sensorData, vehiclePosition, vehicleRotation) {
    this.clearSonarLines();

    if (!sensorData || !sensorData.sonar) return;

    const sonarGroup = new THREE.Group();
    
    for (const ray of sensorData.sonar) {
      const angle = ray.angle + vehicleRotation.y;
      const length = Math.min(ray.distance, this.config.SENSORS.SONAR_RANGE);
      
      const points = [];
      points.push(new THREE.Vector3(0, 0, 0));
      
      const endX = Math.sin(angle) * length;
      const endZ = Math.cos(angle) * length;
      points.push(new THREE.Vector3(endX, 0, endZ));

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: ray.hit ? 0xff4444 : 0x00ff88,
        transparent: true,
        opacity: 0.6
      });
      
      const line = new THREE.Line(geometry, material);
      line.position.copy(vehiclePosition);
      sonarGroup.add(line);

      if (ray.hit) {
        const hitGeometry = new THREE.SphereGeometry(1, 8, 8);
        const hitMaterial = new THREE.MeshBasicMaterial({
          color: 0xff4444,
          transparent: true,
          opacity: 0.8
        });
        const hitMarker = new THREE.Mesh(hitGeometry, hitMaterial);
        hitMarker.position.set(
          vehiclePosition.x + endX,
          vehiclePosition.y,
          vehiclePosition.z + endZ
        );
        sonarGroup.add(hitMarker);
      }
    }

    this.scene.add(sonarGroup);
    this.sonarLines.push(sonarGroup);
  }

  clearSonarLines() {
    for (const line of this.sonarLines) {
      this.scene.remove(line);
    }
    this.sonarLines = [];
  }
}
