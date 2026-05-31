class MechanicalAnimation {
  constructor() {
    this.animations = new Map();
    this.gearChains = [];
    this.steamLinks = [];
    this.time = 0;
    this.enabled = true;
    this.speed = 1;
  }

  addGearChain(gearParts) {
    const chain = {
      parts: gearParts,
      baseSpeed: 1,
      active: false
    };
    this.gearChains.push(chain);
    return chain;
  }

  addSteamLink(sourcePart, targetPart, intensity = 1) {
    const link = {
      source: sourcePart,
      target: targetPart,
      intensity,
      active: false,
      pulsePhase: Math.random() * Math.PI * 2
    };
    this.steamLinks.push(link);
    return link;
  }

  registerPartAnimation(partId, animationType, options = {}) {
    const animation = {
      type: animationType,
      options,
      startTime: this.time,
      phase: options.phase || 0,
      speed: options.speed || 1,
      amplitude: options.amplitude || 1,
      active: options.active !== false
    };

    this.animations.set(partId, animation);
    return animation;
  }

  updatePartAnimation(partObj, animation, delta) {
    if (!animation.active) return;

    const mesh = partObj.mesh;
    const t = this.time * animation.speed + animation.phase;

    switch (animation.type) {
      case 'rotate':
        mesh.rotation.y += delta * animation.speed * 2;
        break;

      case 'oscillate':
        if (!partObj.originalPosition) {
          partObj.originalPosition = mesh.position.clone();
        }
        mesh.position.x = partObj.originalPosition.x + Math.sin(t) * 0.3 * animation.amplitude;
        break;

      case 'piston':
        if (!partObj.originalX) {
          partObj.originalX = mesh.position.x;
        }
        mesh.position.x = partObj.originalX + Math.sin(t * 3) * 0.5 * animation.amplitude;
        break;

      case 'flywheel':
        mesh.rotation.z += delta * animation.speed * 3;
        break;

      case 'gear':
        const teeth = partObj.data.properties?.teeth || 20;
        mesh.rotation.y += delta * animation.speed * (3 / teeth) * animation.amplitude;
        break;

      case 'valve':
        if (!partObj.originalY) {
          partObj.originalY = mesh.position.y;
        }
        const valveOffset = Math.sin(t * 4) > 0 ? 0.1 : 0;
        mesh.position.y = partObj.originalY + valveOffset * animation.amplitude;
        break;

      case 'pulse':
        const pulse = 1 + Math.sin(t * 2) * 0.05 * animation.amplitude;
        mesh.scale.setScalar(pulse);
        break;

      case 'swing':
        if (!partObj.originalRotation) {
          partObj.originalRotation = mesh.rotation.z;
        }
        mesh.rotation.z = partObj.originalRotation + Math.sin(t) * 0.2 * animation.amplitude;
        break;
    }
  }

  updateGearChains(isAssembled) {
    this.gearChains.forEach(chain => {
      chain.active = isAssembled;
      if (chain.active) {
        chain.parts.forEach((partId, index) => {
          if (this.animations.has(partId)) {
            const anim = this.animations.get(partId);
            anim.active = true;
            anim.speed = chain.baseSpeed * (index % 2 === 0 ? 1 : -1);
          }
        });
      }
    });
  }

  updateSteamLinks(isAssembled, particleSystem) {
    this.steamLinks.forEach(link => {
      link.active = isAssembled;
      if (link.active && particleSystem) {
        link.pulsePhase += 0.05 * this.speed;
        if (Math.sin(link.pulsePhase) > 0.8) {
          const sourcePart = link.source;
          if (sourcePart && sourcePart.mesh) {
            const emitPos = sourcePart.mesh.position.clone();
            emitPos.y += 1;
            particleSystem.emitSteam(emitPos, 1);
          }
        }
      }
    });
  }

  update(parts, delta, particleSystem) {
    if (!this.enabled) return;

    this.time += delta * this.speed;

    const allAssembled = Object.values(parts).every(p => p.data.state === 'assembled');

    Object.keys(parts).forEach(partId => {
      const partObj = parts[partId];
      const animation = this.animations.get(partId);

      if (animation && partObj.data.state === 'assembled') {
        this.updatePartAnimation(partObj, animation, delta * this.speed);
      }
    });

    this.updateGearChains(allAssembled);
    this.updateSteamLinks(allAssembled, particleSystem);
  }

  autoDetectAnimations(parts) {
    this.animations.clear();
    this.gearChains = [];
    this.steamLinks = [];

    const gearParts = [];
    const steamParts = [];

    Object.values(parts).forEach(partObj => {
      const type = partObj.data.type;

      switch (type) {
        case 'gear':
          gearParts.push(partObj.data.id);
          this.registerPartAnimation(partObj.data.id, 'gear', {
            active: false,
            speed: 1,
            amplitude: 1
          });
          break;

        case 'flywheel':
          this.registerPartAnimation(partObj.data.id, 'flywheel', {
            active: false,
            speed: 1
          });
          break;

        case 'piston':
          this.registerPartAnimation(partObj.data.id, 'piston', {
            active: false,
            speed: 1,
            amplitude: 1
          });
          break;

        case 'cylinder':
          this.registerPartAnimation(partObj.data.id, 'pulse', {
            active: false,
            speed: 1,
            amplitude: 1
          });
          break;

        case 'boiler':
          this.registerPartAnimation(partObj.data.id, 'pulse', {
            active: false,
            speed: 0.5,
            amplitude: 0.5
          });
          steamParts.push(partObj);
          break;

        case 'pipe':
          this.registerPartAnimation(partObj.data.id, 'pulse', {
            active: false,
            speed: 1,
            amplitude: 0.3
          });
          break;

        case 'shaft':
          this.registerPartAnimation(partObj.data.id, 'rotate', {
            active: false,
            speed: 1
          });
          break;

        case 'wheel':
          this.registerPartAnimation(partObj.data.id, 'rotate', {
            active: false,
            speed: 1
          });
          break;
      }
    });

    if (gearParts.length > 0) {
      this.addGearChain(gearParts);
    }
  }

  setSpeed(speed) {
    this.speed = Math.max(0, Math.min(3, speed));
  }

  toggle() {
    this.enabled = !this.enabled;
  }

  reset() {
    this.animations.clear();
    this.gearChains = [];
    this.steamLinks = [];
    this.time = 0;
    this.speed = 1;
    this.enabled = true;
  }
}

window.MechanicalAnimation = MechanicalAnimation;
