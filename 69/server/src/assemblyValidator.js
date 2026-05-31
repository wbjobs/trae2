class AssemblyValidator {
  constructor() {
    this.SNAP_DISTANCE = 2.5;
    this.ANGLE_TOLERANCE = 45;
    this.SNAP_POINT_OFFSET = 0.5;
  }

  validateSnap(part, targetPart, snapPoint, targetSnapPoint) {
    const partSnapWorldPos = this.getWorldPosition(part, snapPoint.position);
    const targetSnapWorldPos = this.getWorldPosition(targetPart, targetSnapPoint.position);
    const distance = this.calculateDistance(partSnapWorldPos, targetSnapWorldPos);

    if (distance > this.SNAP_DISTANCE) {
      return {
        valid: false,
        reason: `距离过远 (${distance.toFixed(2)} > ${this.SNAP_DISTANCE})，请将零件移近`,
        distance
      };
    }

    const angleValid = this.validateAngle(part.rotation, targetPart.rotation, part.type, targetPart.type);
    if (!angleValid) {
      return {
        valid: false,
        reason: '角度不匹配，请调整零件方向',
        angleDiff: this.calculateAngleDiff(part.rotation, targetPart.rotation)
      };
    }

    const connectionValid = this.validateConnection(part, targetPart, snapPoint, targetSnapPoint);
    if (!connectionValid) {
      return {
        valid: false,
        reason: '连接点不匹配，请检查零件组合'
      };
    }

    return {
      valid: true,
      snapDistance: distance,
      aligned: true,
      suggestedPosition: this.calculateSnapPosition(part, targetPart, snapPoint, targetSnapPoint)
    };
  }

  getWorldPosition(part, localOffset) {
    const radX = part.rotation.x * Math.PI / 180;
    const radY = part.rotation.y * Math.PI / 180;
    const radZ = part.rotation.z * Math.PI / 180;

    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const cosZ = Math.cos(radZ);
    const sinZ = Math.sin(radZ);

    let x = localOffset.x;
    let y = localOffset.y;
    let z = localOffset.z;

    let tempX = x * cosY - z * sinY;
    let tempZ = x * sinY + z * cosY;
    x = tempX;
    z = tempZ;

    let tempY = y * cosX - z * sinX;
    tempZ = y * sinX + z * cosX;
    y = tempY;
    z = tempZ;

    tempX = x * cosZ - y * sinZ;
    tempY = x * sinZ + y * cosZ;
    x = tempX;
    y = tempY;

    return {
      x: part.position.x + x,
      y: part.position.y + y,
      z: part.position.z + z
    };
  }

  validateConnection(part, targetPart, snapPoint, targetSnapPoint) {
    if (!snapPoint || !targetSnapPoint) return false;
    if (!snapPoint.connectsTo || !targetSnapPoint.connectsTo) return false;

    const connectsToTarget = snapPoint.connectsTo === targetSnapPoint.id ||
                             targetSnapPoint.connectsTo === snapPoint.id;

    const partConnections = part.connections || [];
    const targetConnections = targetPart.connections || [];
    const partsConnected = partConnections.includes(targetPart.id) ||
                           targetConnections.includes(part.id);

    return connectsToTarget && partsConnected;
  }

  validateAngle(rot1, rot2, partType1, partType2) {
    const diff = this.calculateAngleDiff(rot1, rot2);

    if (partType1 === 'gear' || partType2 === 'gear') {
      return true;
    }

    if (partType1 === 'shaft' || partType2 === 'shaft') {
      return diff.y <= this.ANGLE_TOLERANCE * 2;
    }

    if (partType1 === 'wheel' || partType2 === 'wheel') {
      return diff.x <= this.ANGLE_TOLERANCE * 2 && diff.z <= this.ANGLE_TOLERANCE * 2;
    }

    return diff.x <= this.ANGLE_TOLERANCE &&
           diff.y <= this.ANGLE_TOLERANCE &&
           diff.z <= this.ANGLE_TOLERANCE;
  }

  calculateAngleDiff(rot1, rot2) {
    return {
      x: Math.min(
        Math.abs(((rot1.x - rot2.x) % 360 + 540) % 360 - 180),
        Math.abs(((rot2.x - rot1.x) % 360 + 540) % 360 - 180)
      ),
      y: Math.min(
        Math.abs(((rot1.y - rot2.y) % 360 + 540) % 360 - 180),
        Math.abs(((rot2.y - rot1.y) % 360 + 540) % 360 - 180)
      ),
      z: Math.min(
        Math.abs(((rot1.z - rot2.z) % 360 + 540) % 360 - 180),
        Math.abs(((rot2.z - rot1.z) % 360 + 540) % 360 - 180)
      )
    };
  }

  calculateDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  calculateSnapPosition(part, targetPart, snapPoint, targetSnapPoint) {
    const targetSnapWorld = this.getWorldPosition(targetPart, targetSnapPoint.position);

    const partWorldSnap = this.getWorldPosition(part, snapPoint.position);
    const offset = {
      x: part.position.x - partWorldSnap.x,
      y: part.position.y - partWorldSnap.y,
      z: part.position.z - partWorldSnap.z
    };

    return {
      x: targetSnapWorld.x + offset.x,
      y: targetSnapWorld.y + offset.y,
      z: targetSnapWorld.z + offset.z
    };
  }

  checkCompletion(parts) {
    const keyParts = parts.filter(p => p.isKey);
    const assembledCount = parts.filter(p => p.state === 'assembled').length;
    const totalCount = parts.length;
    const progress = totalCount > 0 ? assembledCount / totalCount : 0;

    const keyPartsComplete = keyParts.length > 0
      ? keyParts.filter(p => p.state === 'assembled').length === keyParts.length
      : true;

    const allAssembled = assembledCount === totalCount;

    return {
      complete: allAssembled,
      keyPartsComplete,
      assembledCount,
      totalCount,
      progress
    };
  }

  validatePartAction(player, part, action, parts) {
    if (!part) {
      return { valid: false, reason: '零件不存在' };
    }

    switch (action) {
      case 'grab':
        if (part.grabbedBy && part.grabbedBy !== player.id) {
          return { valid: false, reason: '零件已被其他玩家抓取' };
        }
        if (part.state === 'assembled') {
          return { valid: false, reason: '零件已装配，请先使用拆解功能' };
        }
        break;

      case 'release':
        if (part.grabbedBy !== player.id) {
          return { valid: false, reason: '你未抓取此零件' };
        }
        break;

      case 'assemble':
        if (!part.grabbedBy || part.grabbedBy !== player.id) {
          return { valid: false, reason: '请先抓取零件' };
        }
        break;

      case 'disassemble':
        if (part.state !== 'assembled') {
          return { valid: false, reason: '零件未装配' };
        }
        break;
    }

    return { valid: true };
  }

  findSnapCandidates(part, parts) {
    const candidates = [];
    const partSnapPoints = part.snapPoints || [];

    for (const targetPart of parts) {
      if (targetPart.id === part.id) continue;
      if (targetPart.state !== 'assembled' && targetPart.state !== 'disassembled') continue;

      const targetSnapPoints = targetPart.snapPoints || [];

      for (const snapPoint of partSnapPoints) {
        for (const targetSnapPoint of targetSnapPoints) {
          const result = this.validateSnap(part, targetPart, snapPoint, targetSnapPoint);
          if (result.valid) {
            candidates.push({
              targetPart,
              snapPoint,
              targetSnapPoint,
              distance: result.snapDistance,
              suggestedPosition: result.suggestedPosition
            });
          }
        }
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates;
  }
}

module.exports = AssemblyValidator;
