class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.maxParticles = 200;
    this.particlePool = [];
    this.activeEffects = new Map();
  }

  createSteamParticle(position, velocity = null) {
    if (this.particles.length >= this.maxParticles) {
      const oldParticle = this.particles.shift();
      this.removeParticle(oldParticle);
    }

    const geometry = new THREE.SphereGeometry(0.08 + Math.random() * 0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });

    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);

    particle.userData = {
      velocity: velocity || new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        0.15 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.1
      ),
      life: 1.5 + Math.random(),
      maxLife: 1.5 + Math.random(),
      startScale: 0.5 + Math.random() * 0.5,
      type: 'steam'
    };

    particle.scale.setScalar(particle.userData.startScale);
    this.scene.add(particle);
    this.particles.push(particle);

    return particle;
  }

  createSparkParticle(position, color = 0xffaa00) {
    const geometry = new THREE.SphereGeometry(0.05, 6, 6);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1
    });

    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);

    const angle = Math.random() * Math.PI * 2;
    const speed = 0.2 + Math.random() * 0.3;
    particle.userData = {
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        0.3 + Math.random() * 0.2,
        Math.sin(angle) * speed
      ),
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      type: 'spark'
    };

    this.scene.add(particle);
    this.particles.push(particle);

    return particle;
  }

  createSmokeParticle(position) {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });

    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);

    particle.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        0.08 + Math.random() * 0.05,
        (Math.random() - 0.5) * 0.05
      ),
      life: 3 + Math.random() * 2,
      maxLife: 3 + Math.random() * 2,
      startScale: 1,
      type: 'smoke'
    };

    this.scene.add(particle);
    this.particles.push(particle);

    return particle;
  }

  createGearTrail(position, color = 0xffdd00) {
    const geometry = new THREE.TorusGeometry(0.1, 0.02, 8, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;

    ring.userData = {
      life: 0.8,
      maxLife: 0.8,
      startScale: 1,
      type: 'gearTrail'
    };

    this.scene.add(ring);
    this.particles.push(ring);

    return ring;
  }

  emitSteam(sourcePosition, count = 3) {
    for (let i = 0; i < count; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        0,
        (Math.random() - 0.5) * 0.3
      );
      this.createSteamParticle(sourcePosition.clone().add(offset));
    }
  }

  emitSparks(sourcePosition, count = 5, color = 0xffaa00) {
    for (let i = 0; i < count; i++) {
      this.createSparkParticle(sourcePosition.clone(), color);
    }
  }

  emitSmoke(sourcePosition, count = 2) {
    for (let i = 0; i < count; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0,
        (Math.random() - 0.5) * 0.2
      );
      this.createSmokeParticle(sourcePosition.clone().add(offset));
    }
  }

  startContinuousEffect(effectId, type, position, interval = 200) {
    this.stopContinuousEffect(effectId);

    const effect = {
      type,
      position: position.clone(),
      interval,
      lastEmit: 0
    };

    this.activeEffects.set(effectId, effect);
  }

  stopContinuousEffect(effectId) {
    this.activeEffects.delete(effectId);
  }

  updateContinuousEffects(time, delta) {
    this.activeEffects.forEach((effect, id) => {
      if (time - effect.lastEmit > effect.interval) {
        effect.lastEmit = time;

        switch (effect.type) {
          case 'steam':
            this.emitSteam(effect.position, 2);
            break;
          case 'smoke':
            this.emitSmoke(effect.position, 1);
            break;
          case 'sparks':
            this.emitSparks(effect.position, 2);
            break;
        }
      }
    });
  }

  update(delta) {
    const time = Date.now() * 0.001;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const data = particle.userData;

      data.life -= delta;

      if (data.life <= 0) {
        this.removeParticleAt(i);
        continue;
      }

      if (data.velocity) {
        particle.position.add(data.velocity.clone().multiplyScalar(delta * 60));
        data.velocity.y -= delta * 0.1;
      }

      const lifeRatio = data.life / data.maxLife;

      if (data.type === 'steam' || data.type === 'smoke') {
        const scale = data.startScale * (1 + (1 - lifeRatio) * 2);
        particle.scale.setScalar(scale);
        particle.material.opacity = lifeRatio * 0.5;
      } else if (data.type === 'spark') {
        particle.material.opacity = lifeRatio;
        const scale = 0.5 + lifeRatio * 0.5;
        particle.scale.setScalar(scale);
      } else if (data.type === 'gearTrail') {
        const scale = data.startScale * (1 + (1 - lifeRatio) * 1.5);
        particle.scale.setScalar(scale);
        particle.material.opacity = lifeRatio * 0.6;
      }
    }

    this.updateContinuousEffects(Date.now(), delta);
  }

  removeParticle(particle) {
    const index = this.particles.indexOf(particle);
    if (index !== -1) {
      this.removeParticleAt(index);
    }
  }

  removeParticleAt(index) {
    const particle = this.particles[index];
    this.scene.remove(particle);
    particle.geometry.dispose();
    particle.material.dispose();
    this.particles.splice(index, 1);
  }

  clearAll() {
    while (this.particles.length > 0) {
      this.removeParticleAt(0);
    }
    this.activeEffects.clear();
  }

  dispose() {
    this.clearAll();
  }
}

window.ParticleSystem = ParticleSystem;
