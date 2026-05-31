const { PartTypes, PartColors, ConnectionTypes } = require('./partTypes');

class Part {
  constructor(id, type, position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    this.id = id;
    this.type = type;
    this.position = position;
    this.rotation = rotation;
    this.scale = 1;
    this.color = this.getDefaultColor(type);
    this.connections = [];
    this.connectedTo = [];
    this.placed = false;
    this.assembled = false;
    this.playerId = null;
  }

  getDefaultColor(type) {
    switch (type) {
      case PartTypes.GEAR:
      case PartTypes.WHEEL:
        return PartColors.BRASS;
      case PartTypes.AXLE:
      case PartTypes.SCREW:
        return PartColors.STEEL;
      case PartTypes.PLATE:
      case PartTypes.PIPE:
        return PartColors.COPPER;
      case PartTypes.LEVER:
      case PartTypes.SPRING:
        return PartColors.IRON;
      default:
        return PartColors.STEEL;
    }
  }

  addConnection(connection) {
    this.connections.push(connection);
  }

  connectTo(partId, connectionType) {
    if (!this.connectedTo.find(c => c.partId === partId)) {
      this.connectedTo.push({ partId, connectionType });
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
      color: this.color,
      connections: this.connections,
      connectedTo: this.connectedTo,
      placed: this.placed,
      assembled: this.assembled,
      playerId: this.playerId
    };
  }

  static fromJSON(data) {
    const part = new Part(data.id, data.type, data.position, data.rotation);
    part.scale = data.scale || 1;
    part.color = data.color;
    part.connections = data.connections || [];
    part.connectedTo = data.connectedTo || [];
    part.placed = data.placed || false;
    part.assembled = data.assembled || false;
    part.playerId = data.playerId;
    return part;
  }
}

class PartFactory {
  static createPart(type, id) {
    return new Part(id, type);
  }

  static createGear(id, teeth = 8) {
    const part = new Part(id, PartTypes.GEAR);
    part.teeth = teeth;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: 0, z: 0 }, direction: 'center' });
    return part;
  }

  static createAxle(id, length = 2) {
    const part = new Part(id, PartTypes.AXLE);
    part.length = length;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: length / 2, z: 0 }, direction: 'top' });
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: -length / 2, z: 0 }, direction: 'bottom' });
    return part;
  }

  static createPlate(id, width = 2, height = 2) {
    const part = new Part(id, PartTypes.PLATE);
    part.width = width;
    part.height = height;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        part.addConnection({
          type: ConnectionTypes.SNAP,
          position: { x: (i - width / 2 + 0.5) * 0.5, y: 0, z: (j - height / 2 + 0.5) * 0.5 },
          direction: 'top'
        });
      }
    }
    return part;
  }

  static createLever(id, length = 1.5) {
    const part = new Part(id, PartTypes.LEVER);
    part.length = length;
    part.addConnection({ type: ConnectionTypes.HINGE, position: { x: 0, y: 0, z: 0 }, direction: 'pivot' });
    return part;
  }

  static createWheel(id, radius = 0.5) {
    const part = new Part(id, PartTypes.WHEEL);
    part.radius = radius;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: 0, z: 0 }, direction: 'center' });
    return part;
  }

  static createSpring(id, length = 1) {
    const part = new Part(id, PartTypes.SPRING);
    part.length = length;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: length / 2, z: 0 }, direction: 'top' });
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: -length / 2, z: 0 }, direction: 'bottom' });
    return part;
  }

  static createScrew(id) {
    const part = new Part(id, PartTypes.SCREW);
    part.addConnection({ type: ConnectionTypes.SCREW, position: { x: 0, y: 0, z: 0 }, direction: 'bottom' });
    return part;
  }

  static createPipe(id, length = 2) {
    const part = new Part(id, PartTypes.PIPE);
    part.length = length;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: length / 2, z: 0 }, direction: 'top' });
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: -length / 2, z: 0 }, direction: 'bottom' });
    return part;
  }

  static createPiston(id, length = 1.5) {
    const part = new Part(id, PartTypes.PISTON);
    part.length = length;
    part.addConnection({ type: ConnectionTypes.SNAP, position: { x: 0, y: length / 2, z: 0 }, direction: 'top' });
    part.addConnection({ type: ConnectionTypes.HINGE, position: { x: 0, y: -length / 2, z: 0 }, direction: 'bottom' });
    return part;
  }

  static createBelt(id, length = 2) {
    const part = new Part(id, PartTypes.BELT);
    part.length = length;
    return part;
  }
}

module.exports = { Part, PartFactory };
