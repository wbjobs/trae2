class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.cameraMode = 'follow';
    this.mouseSensitivity = 0.002;
  }

  followVehicle(vehicle) {
    if (!vehicle) return;

    const offset = new THREE.Vector3(0, 8, -20);
    offset.applyQuaternion(vehicle.quaternion);
    
    const targetPosition = vehicle.position.clone().add(offset);
    this.camera.position.lerp(targetPosition, 0.05);
    this.camera.lookAt(vehicle.position);
  }

  freeCamera(deltaX, deltaY, deltaZ) {
    const moveSpeed = 5;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    this.camera.position.addScaledVector(forward, deltaZ * moveSpeed);
    this.camera.position.addScaledVector(right, deltaX * moveSpeed);
    this.camera.position.y += deltaY * moveSpeed;
  }

  rotateCamera(deltaX, deltaY) {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(this.camera.quaternion);
    euler.y += deltaX * this.mouseSensitivity;
    euler.x += deltaY * this.mouseSensitivity;
    euler.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, euler.x));
    this.camera.quaternion.setFromEuler(euler);
  }

  setMode(mode) {
    this.cameraMode = mode;
  }

  getMode() {
    return this.cameraMode;
  }

  toggleMode() {
    this.cameraMode = this.cameraMode === 'follow' ? 'free' : 'follow';
    return this.cameraMode;
  }
}
