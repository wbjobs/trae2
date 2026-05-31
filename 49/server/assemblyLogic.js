const { ConnectionTypes, PartTypes } = require('../shared/partTypes');

class AssemblyValidator {
  constructor() {
    this.snapDistance = 0.5;
    this.rotationTolerance = 0.5;
    this.precisionSnapDistance = 0.3;
  }

  validateSnap(part1, part2) {
    const centerDistance = this.calculateDistance(part1.position, part2.position);
    
    if (centerDistance > 3.0) {
      return { valid: false, reason: '距离太远' };
    }

    const compatibleConnection = this.findBestCompatibleConnection(part1, part2);
    if (!compatibleConnection) {
      return { valid: false, reason: '没有可匹配的连接点' };
    }

    const alignmentScore = this.calculateAlignmentScore(
      this.getWorldConnectionPosition(part1, compatibleConnection.conn1),
      this.getWorldConnectionPosition(part2, compatibleConnection.conn2)
    );

    if (alignmentScore < 0.3) {
      return { valid: false, reason: '对齐度不足' };
    }

    return {
      valid: true,
      snapPosition: this.calculateSnapPosition(part1, part2, compatibleConnection),
      connectionType: compatibleConnection.type,
      alignmentScore: alignmentScore
    };
  }

  calculateDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = (pos1.x || 0) - (pos2.x || 0);
    const dy = (pos1.y || 0) - (pos2.y || 0);
    const dz = (pos1.z || 0) - (pos2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  findBestCompatibleConnection(part1, part2) {
    let bestConnection = null;
    let bestScore = -1;

    if (!part1.connections || !part2.connections) {
      return this.createFallbackConnection(part1, part2);
    }

    for (const conn1 of part1.connections) {
      for (const conn2 of part2.connections) {
        if (this.isConnectionCompatible(conn1, conn2)) {
          const worldPos1 = this.getWorldConnectionPosition(part1, conn1);
          const worldPos2 = this.getWorldConnectionPosition(part2, conn2);
          const distance = this.calculateDistance(worldPos1, worldPos2);
          
          if (distance < this.snapDistance) {
            const score = 1 - (distance / this.snapDistance);
            if (score > bestScore) {
              bestScore = score;
              bestConnection = { type: conn1.type, conn1, conn2, score };
            }
          }
        }
      }
    }

    if (!bestConnection) {
      return this.createFallbackConnection(part1, part2);
    }

    return bestConnection;
  }

  createFallbackConnection(part1, part2) {
    const distance = this.calculateDistance(part1.position, part2.position);
    
    if (distance < this.snapDistance * 2) {
      const fallbackConn = {
        type: ConnectionTypes.SNAP,
        position: { x: 0, y: 0, z: 0 },
        direction: 'center'
      };
      
      return {
        type: ConnectionTypes.SNAP,
        conn1: fallbackConn,
        conn2: fallbackConn,
        score: 0.5,
        isFallback: true
      };
    }
    
    return null;
  }

  isConnectionCompatible(conn1, conn2) {
    if (!conn1 || !conn2) return false;
    return conn1.type === conn2.type;
  }

  getWorldConnectionPosition(part, connection) {
    if (!part || !connection || !part.position) {
      return { x: 0, y: 0, z: 0 };
    }
    
    const connPos = connection.position || { x: 0, y: 0, z: 0 };
    const partPos = part.position;
    
    return {
      x: (partPos.x || 0) + (connPos.x || 0),
      y: (partPos.y || 0) + (connPos.y || 0),
      z: (partPos.z || 0) + (connPos.z || 0)
    };
  }

  calculateSnapPosition(part1, part2, compatibleConnection) {
    const { conn1, conn2 } = compatibleConnection;
    const targetPos = this.getWorldConnectionPosition(part1, conn1);
    const conn2Pos = conn2.position || { x: 0, y: 0, z: 0 };
    
    return {
      x: Math.round((targetPos.x - conn2Pos.x) * 1000) / 1000,
      y: Math.round((targetPos.y - conn2Pos.y) * 1000) / 1000,
      z: Math.round((targetPos.z - conn2Pos.z) * 1000) / 1000
    };
  }

  calculateAlignmentScore(pos1, pos2) {
    const distance = this.calculateDistance(pos1, pos2);
    return Math.max(0, 1 - distance / this.snapDistance);
  }

  validateAssemblyChain(parts, startPartId) {
    const visited = new Set();
    const queue = [startPartId];
    const chain = [];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      
      visited.add(currentId);
      chain.push(currentId);

      const currentPart = parts.find(p => p.id === currentId);
      if (currentPart) {
        for (const connection of currentPart.connectedTo) {
          if (!visited.has(connection.partId)) {
            queue.push(connection.partId);
          }
        }
      }
    }

    return {
      valid: chain.length > 0,
      chain: chain,
      length: chain.length
    };
  }

  checkLevelCompletion(level, assembledParts) {
    const targets = level.assemblyTarget || [];
    let completedTargets = 0;

    for (const target of targets) {
      const part = assembledParts.find(p => p.id === target.partId);
      if (part && part.assembled) {
        const distance = this.calculateDistance(part.position, target.targetPosition);
        if (distance < this.snapDistance) {
          completedTargets++;
        }
      }
    }

    return {
      completed: completedTargets === targets.length,
      progress: targets.length > 0 ? completedTargets / targets.length : 0,
      completedTargets: completedTargets,
      totalTargets: targets.length
    };
  }

  validatePartPlacement(part, targetPosition, boundary = { min: -10, max: 10 }) {
    if (targetPosition.x < boundary.min || targetPosition.x > boundary.max ||
        targetPosition.y < boundary.min || targetPosition.y > boundary.max ||
        targetPosition.z < boundary.min || targetPosition.z > boundary.max) {
      return { valid: false, reason: '超出边界' };
    }

    return { valid: true };
  }

  calculateAlignmentScore(part1, part2) {
    const distance = this.calculateDistance(part1.position, part2.position);
    const distanceScore = Math.max(0, 1 - distance / this.snapDistance);

    const rotationDiff = this.calculateRotationDifference(part1.rotation, part2.rotation);
    const rotationScore = Math.max(0, 1 - rotationDiff / Math.PI);

    return (distanceScore * 0.7 + rotationScore * 0.3);
  }

  calculateRotationDifference(rot1, rot2) {
    const dx = Math.abs(rot1.x - rot2.x);
    const dy = Math.abs(rot1.y - rot2.y);
    const dz = Math.abs(rot1.z - rot2.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

class AssemblyManager {
  constructor() {
    this.validator = new AssemblyValidator();
    this.assemblyGroups = new Map();
  }

  attemptAssembly(partId, targetPartId, allParts) {
    const part = allParts.find(p => p.id === partId);
    const targetPart = allParts.find(p => p.id === targetPartId);

    if (!part || !targetPart) {
      return { success: false, message: '零件不存在' };
    }

    const validation = this.validator.validateSnap(part, targetPart);
    
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    part.position = validation.snapPosition;
    part.placed = true;
    part.assembled = true;
    part.connectTo(targetPartId, validation.connectionType);
    targetPart.connectTo(partId, validation.connectionType);

    this.updateAssemblyGroups(partId, targetPartId);

    return {
      success: true,
      message: '组装成功',
      snappedPosition: validation.snapPosition,
      connectionType: validation.connectionType
    };
  }

  updateAssemblyGroups(partId, targetPartId) {
    let groupId = this.findGroupForPart(targetPartId);
    
    if (!groupId) {
      groupId = 'group_' + Date.now();
      this.assemblyGroups.set(groupId, new Set([targetPartId]));
    }

    const group = this.assemblyGroups.get(groupId);
    group.add(partId);

    const partGroupId = this.findGroupForPart(partId);
    if (partGroupId && partGroupId !== groupId) {
      const partGroup = this.assemblyGroups.get(partGroupId);
      partGroup.forEach(id => group.add(id));
      this.assemblyGroups.delete(partGroupId);
    }
  }

  findGroupForPart(partId) {
    for (const [groupId, parts] of this.assemblyGroups) {
      if (parts.has(partId)) {
        return groupId;
      }
    }
    return null;
  }

  getAssemblyGroup(partId) {
    const groupId = this.findGroupForPart(partId);
    if (groupId) {
      return Array.from(this.assemblyGroups.get(groupId));
    }
    return [partId];
  }

  disassemblePart(partId, allParts) {
    const part = allParts.find(p => p.id === partId);
    if (!part) return;

    part.assembled = false;
    part.connectedTo = [];

    for (const otherPart of allParts) {
      otherPart.connectedTo = otherPart.connectedTo.filter(c => c.partId !== partId);
    }

    for (const [groupId, parts] of this.assemblyGroups) {
      if (parts.has(partId)) {
        parts.delete(partId);
        if (parts.size === 0) {
          this.assemblyGroups.delete(groupId);
        }
        break;
      }
    }
  }

  getAssemblyProgress(allParts) {
    const totalParts = allParts.length;
    const assembledParts = allParts.filter(p => p.assembled).length;
    
    return {
      total: totalParts,
      assembled: assembledParts,
      percentage: totalParts > 0 ? (assembledParts / totalParts * 100).toFixed(1) : 0,
      groups: this.assemblyGroups.size
    };
  }
}

module.exports = { AssemblyValidator, AssemblyManager };
