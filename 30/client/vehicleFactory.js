class VehicleFactory {
  static createVehicle(color = 0x00ff88) {
    const vehicleGroup = new THREE.Group();

    const bodyGeometry = new THREE.CapsuleGeometry(1.5, 5, 8, 16);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: color,
      shininess: 100,
      specular: 0x444444
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    vehicleGroup.add(body);

    const headGeometry = new THREE.SphereGeometry(1.5, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.z = 3.5;
    head.scale.z = 1.2;
    head.castShadow = true;
    vehicleGroup.add(head);

    const glassGeometry = new THREE.SphereGeometry(0.8, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const glassMaterial = new THREE.MeshPhongMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.set(0, 0.5, 3.8);
    glass.rotation.x = -Math.PI / 4;
    vehicleGroup.add(glass);

    const tailGeometry = new THREE.BoxGeometry(0.3, 2, 2);
    const tailMaterial = new THREE.MeshPhongMaterial({ color: color });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.z = -4;
    tail.castShadow = true;
    vehicleGroup.add(tail);
    vehicleGroup.userData.tail = tail;

    const leftFinGeometry = new THREE.BoxGeometry(1.5, 0.1, 1);
    const finMaterial = new THREE.MeshPhongMaterial({ color: color });
    const leftFin = new THREE.Mesh(leftFinGeometry, finMaterial);
    leftFin.position.set(-1.5, 0, 1);
    leftFin.castShadow = true;
    vehicleGroup.add(leftFin);
    vehicleGroup.userData.leftFin = leftFin;

    const rightFin = new THREE.Mesh(leftFinGeometry, finMaterial);
    rightFin.position.set(1.5, 0, 1);
    rightFin.castShadow = true;
    vehicleGroup.add(rightFin);
    vehicleGroup.userData.rightFin = rightFin;

    const propellerGeometry = new THREE.BoxGeometry(0.1, 2, 0.3);
    const propellerMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
    propeller.position.z = -5.5;
    vehicleGroup.add(propeller);
    vehicleGroup.userData.propeller = propeller;

    const headlightGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    headlight.position.set(0, 0, 4.5);
    vehicleGroup.add(headlight);

    const spotLight = new THREE.SpotLight(0xffffcc, 1, 100, Math.PI / 6, 0.5);
    spotLight.position.set(0, 0, 4.5);
    spotLight.target.position.set(0, 0, 100);
    vehicleGroup.add(spotLight);
    vehicleGroup.add(spotLight.target);
    vehicleGroup.userData.spotLight = spotLight;

    return vehicleGroup;
  }

  static updateVehicle(vehicle, state) {
    vehicle.position.lerp(new THREE.Vector3(
      state.position.x,
      state.position.y,
      state.position.z
    ), 0.2);

    vehicle.rotation.x = state.rotation.x + (state.bionicState?.bodyPitch || 0);
    vehicle.rotation.y = state.rotation.y;
    vehicle.rotation.z = state.rotation.z + (state.bionicState?.bodyRoll || 0);

    if (vehicle.userData.tail && state.bionicState) {
      const tailAngle = Math.sin(state.bionicState.tailPhase) * state.bionicState.tailAmplitude;
      vehicle.userData.tail.rotation.y = tailAngle;
    }

    if (vehicle.userData.leftFin && state.bionicState) {
      vehicle.userData.leftFin.rotation.z = state.bionicState.leftFinAngle || 0;
    }

    if (vehicle.userData.rightFin && state.bionicState) {
      vehicle.userData.rightFin.rotation.z = -(state.bionicState.rightFinAngle || 0);
    }

    if (vehicle.userData.propeller) {
      vehicle.userData.propeller.rotation.z += 0.3;
    }
  }
}
