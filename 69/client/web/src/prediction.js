class PredictionEngine {
  constructor(renderer, network) {
    this.renderer = renderer;
    this.network = network;
    this.enabled = true;
    this.predictedParts = new Map();
    this.serverState = new Map();
    this.lastServerUpdate = 0;
    this.smoothing = 0.1;
    this.extrapolationEnabled = true;
    this.maxPredictionTime = 100;
  }

  predictPartPosition(partId, action, data) {
    if (!this.enabled) return;

    const partObj = this.renderer.parts[partId];
    if (!partObj) return;

    const prediction = {
      timestamp: Date.now(),
      action,
      data: { ...data },
      originalPosition: partObj.mesh.position.clone(),
      originalRotation: partObj.mesh.rotation.clone()
    };

    this.predictedParts.set(partId, prediction);

    switch (action) {
      case 'move':
        partObj.targetPosition.set(data.position.x, data.position.y, data.position.z);
        partObj.interpolating = true;
        break;
      case 'rotate':
        partObj.targetRotation.set(
          data.rotation.x * Math.PI / 180,
          data.rotation.y * Math.PI / 180,
          data.rotation.z * Math.PI / 180
        );
        partObj.interpolating = true;
        break;
      case 'grab':
      case 'release':
      case 'assemble':
      case 'disassemble':
        break;
    }
  }

  onServerUpdate(partId, serverData) {
    const prediction = this.predictedParts.get(partId);

    if (prediction) {
      const partObj = this.renderer.parts[partId];
      if (partObj) {
        partObj.targetPosition.set(
          serverData.position.x,
          serverData.position.y,
          serverData.position.z
        );
        partObj.targetRotation.set(
          serverData.rotation.x * Math.PI / 180,
          serverData.rotation.y * Math.PI / 180,
          serverData.rotation.z * Math.PI / 180
        );
        partObj.interpolating = true;
      }

      this.predictedParts.delete(partId);
    }

    this.serverState.set(partId, {
      ...serverData,
      timestamp: Date.now()
    });

    this.lastServerUpdate = Date.now();
  }

  extrapolatePosition(partObj, deltaTime) {
    if (!this.extrapolationEnabled) return;

    const serverState = this.serverState.get(partObj.data.id);
    if (!serverState) return;

    const timeSinceUpdate = Date.now() - serverState.timestamp;
    if (timeSinceUpdate < this.maxPredictionTime) return;
  }

  clearPrediction(partId) {
    this.predictedParts.delete(partId);
  }

  reset() {
    this.predictedParts.clear();
    this.serverState.clear();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

window.PredictionEngine = PredictionEngine;
