class CollisionDetector {
  constructor(config, world) {
    this.config = config;
    this.world = world;
    this.collisionEvents = [];
    this.maxCollisionEvents = 100;
  }

  update(vehicles, deltaTime) {
    this.collisionEvents = [];

    for (const vehicle of vehicles) {
      if (!vehicle.alive) continue;

      this.checkBoundaryCollision(vehicle);
      this.checkObstacleCollision(vehicle);
      this.checkVehicleCollision(vehicle, vehicles);
      this.checkTerrainCollision(vehicle);
    }

    return this.collisionEvents;
  }

  checkBoundaryCollision(vehicle) {
    const boundary = this.config.WORLD.SIZE / 2 - this.config.COLLISION.BOUNDARY_PADDING;
    const padding = this.config.COLLISION.BOUNDARY_PADDING;
    
    let collision = false;
    let normal = { x: 0, y: 0, z: 0 };
    let maxPenetration = 0;

    if (vehicle.position.x > boundary) {
      const penetration = vehicle.position.x - boundary;
      vehicle.position.x = boundary;
      normal.x = -1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    } else if (vehicle.position.x < -boundary) {
      const penetration = -boundary - vehicle.position.x;
      vehicle.position.x = -boundary;
      normal.x = 1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    }

    if (vehicle.position.z > boundary) {
      const penetration = vehicle.position.z - boundary;
      vehicle.position.z = boundary;
      normal.z = -1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    } else if (vehicle.position.z < -boundary) {
      const penetration = -boundary - vehicle.position.z;
      vehicle.position.z = -boundary;
      normal.z = 1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    }

    const maxDepth = this.config.WORLD.DEPTH - padding;
    if (vehicle.position.y < -maxDepth) {
      const penetration = -maxDepth - vehicle.position.y;
      vehicle.position.y = -maxDepth;
      normal.y = 1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    }

    if (vehicle.position.y > 0) {
      const penetration = vehicle.position.y;
      vehicle.position.y = 0;
      normal.y = -1;
      maxPenetration = Math.max(maxPenetration, penetration);
      collision = true;
    }

    if (collision && maxPenetration > 0) {
      const normalLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
      if (normalLen > 0.001) {
        normal.x /= normalLen;
        normal.y /= normalLen;
        normal.z /= normalLen;
      }
      this.handleCollision(vehicle, normal, maxPenetration, 'boundary');
    }
  }

  checkObstacleCollision(vehicle) {
    const vehicleRadius = Math.max(
      this.config.VEHICLE.SIZE.x,
      this.config.VEHICLE.SIZE.y,
      this.config.VEHICLE.SIZE.z
    ) / 2;

    for (const obstacle of this.world.obstacles) {
      const dx = vehicle.position.x - obstacle.position.x;
      const dy = vehicle.position.y - obstacle.position.y;
      const dz = vehicle.position.z - obstacle.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      const minDistance = vehicleRadius + obstacle.radius;

      if (distanceSq < minDistance * minDistance && distanceSq > 0.0001) {
        const distance = Math.sqrt(distanceSq);
        const normal = {
          x: dx / distance,
          y: dy / distance,
          z: dz / distance
        };
        const penetration = minDistance - distance;

        vehicle.position.x += normal.x * penetration;
        vehicle.position.y += normal.y * penetration;
        vehicle.position.z += normal.z * penetration;

        if (distanceSq > 0.01) {
          obstacle.discovered = true;
        }

        this.handleCollision(vehicle, normal, penetration, 'obstacle', obstacle);
      } else if (distanceSq <= 0.0001) {
        const normal = { x: 0, y: 1, z: 0 };
        const penetration = minDistance;
        vehicle.position.y += penetration;
        this.handleCollision(vehicle, normal, penetration, 'obstacle', obstacle);
      }
    }
  }

  checkVehicleCollision(vehicle, allVehicles) {
    const vehicleRadius = Math.max(
      this.config.VEHICLE.SIZE.x,
      this.config.VEHICLE.SIZE.y,
      this.config.VEHICLE.SIZE.z
    ) / 2;

    for (const other of allVehicles) {
      if (other.id === vehicle.id || !other.alive) continue;

      const dx = vehicle.position.x - other.position.x;
      const dy = vehicle.position.y - other.position.y;
      const dz = vehicle.position.z - other.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      const minDistance = vehicleRadius * 2;

      if (distanceSq < minDistance * minDistance && distanceSq > 0.0001) {
        const distance = Math.sqrt(distanceSq);
        const normal = {
          x: dx / distance,
          y: dy / distance,
          z: dz / distance
        };
        const penetration = (minDistance - distance) / 2;

        vehicle.position.x += normal.x * penetration;
        vehicle.position.y += normal.y * penetration;
        vehicle.position.z += normal.z * penetration;

        other.position.x -= normal.x * penetration;
        other.position.y -= normal.y * penetration;
        other.position.z -= normal.z * penetration;

        this.handleCollision(vehicle, normal, penetration, 'vehicle', other);
        this.handleCollision(other, { x: -normal.x, y: -normal.y, z: -normal.z }, penetration, 'vehicle', vehicle);
      } else if (distanceSq <= 0.0001) {
        const normal = { x: 1, y: 0, z: 0 };
        const penetration = minDistance / 2;
        vehicle.position.x += penetration;
        other.position.x -= penetration;
      }
    }
  }

  checkTerrainCollision(vehicle) {
    const terrainHeight = this.getTerrainHeight(vehicle.position.x, vehicle.position.z);
    const vehicleBottom = vehicle.position.y - this.config.VEHICLE.SIZE.y / 2;

    if (vehicleBottom < terrainHeight) {
      const penetration = terrainHeight - vehicleBottom;
      vehicle.position.y = terrainHeight + this.config.VEHICLE.SIZE.y / 2;
      
      this.handleCollision(vehicle, { x: 0, y: 1, z: 0 }, penetration, 'terrain');
    }
  }

  getTerrainHeight(x, z) {
    const scale = 0.01;
    const noiseVal = Utils.noise(x * scale, z * scale);
    return -this.config.WORLD.DEPTH + noiseVal * 20;
  }

  handleCollision(vehicle, normal, penetration, type, target = null) {
    const velocityMagnitude = Math.sqrt(
      vehicle.velocity.x ** 2 +
      vehicle.velocity.y ** 2 +
      vehicle.velocity.z ** 2
    );

    const dotProduct = 
      vehicle.velocity.x * normal.x +
      vehicle.velocity.y * normal.y +
      vehicle.velocity.z * normal.z;

    if (dotProduct < 0) {
      const restitution = 0.3;
      const impulse = -(1 + restitution) * dotProduct;
      vehicle.velocity.x += impulse * normal.x;
      vehicle.velocity.y += impulse * normal.y;
      vehicle.velocity.z += impulse * normal.z;
    }

    let damage = 0;
    if (velocityMagnitude > this.config.COLLISION.MIN_COLLISION_SPEED) {
      damage = velocityMagnitude * this.config.COLLISION.COLLISION_DAMAGE_FACTOR * penetration;
      vehicle.health = Math.max(0, vehicle.health - damage);

      if (vehicle.health <= 0) {
        vehicle.alive = false;
      }
    }

    if (this.collisionEvents.length < this.maxCollisionEvents) {
      this.collisionEvents.push({
        vehicleId: vehicle.id,
        type: type,
        targetId: target ? target.id : null,
        normal: { ...normal },
        penetration: penetration,
        velocity: velocityMagnitude,
        damage: damage,
        position: { ...vehicle.position }
      });
    }
  }

  getCollisionEvents() {
    return this.collisionEvents;
  }

  raycast(origin, direction, maxDistance, layerMask = null) {
    let closestHit = null;
    let closestDist = maxDistance;

    for (const obstacle of this.world.obstacles) {
      if (layerMask && !layerMask.includes(obstacle.type)) continue;

      const hit = this.raySphereIntersect(origin, direction, obstacle.position, obstacle.radius);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = {
          distance: hit.distance,
          point: hit.point,
          normal: hit.normal,
          object: obstacle
        };
      }
    }

    return closestHit;
  }

  raySphereIntersect(origin, direction, sphereCenter, sphereRadius) {
    const oc = {
      x: origin.x - sphereCenter.x,
      y: origin.y - sphereCenter.y,
      z: origin.z - sphereCenter.z
    };

    const a = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
    if (a < 0.0001) return null;

    const b = 2 * (oc.x * direction.x + oc.y * direction.y + oc.z * direction.z);
    const c = oc.x ** 2 + oc.y ** 2 + oc.z ** 2 - sphereRadius ** 2;

    const discriminant = b ** 2 - 4 * a * c;

    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t = (-b - sqrtDisc) / (2 * a);

    if (t < 0) {
      const t2 = (-b + sqrtDisc) / (2 * a);
      if (t2 < 0) return null;
      
      const point2 = {
        x: origin.x + direction.x * t2,
        y: origin.y + direction.y * t2,
        z: origin.z + direction.z * t2
      };
      const normal2 = Utils.vectorNormalize(Utils.vectorSub(point2, sphereCenter));
      return { distance: t2, point: point2, normal: normal2 };
    }

    const point = {
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
      z: origin.z + direction.z * t
    };

    const normal = Utils.vectorNormalize(Utils.vectorSub(point, sphereCenter));

    return { distance: t, point, normal };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  const Utils = require('./utils');
  module.exports = CollisionDetector;
} else if (typeof window !== 'undefined') {
  window.CollisionDetector = CollisionDetector;
}
