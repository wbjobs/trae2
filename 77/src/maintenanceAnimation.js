import * as THREE from 'three';

export class MaintenanceAnimation {
  constructor(scene, camera, animationManager) {
    this.scene = scene;
    this.camera = camera;
    this.animationManager = animationManager;

    this.activeAnimations = new Map();
    this.animationSequence = [];
    this.isPlaying = false;
    this.currentAnimationId = null;

    this.workerModel = null;
    this.toolModels = new Map();

    this.onAnimationStart = null;
    this.onAnimationComplete = null;
    this.onAnimationProgress = null;

    this.init();
  }

  init() {
    this.createWorkerModel();
    this.createToolModels();
  }

  createWorkerModel() {
    const workerGroup = new THREE.Group();

    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.7,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    workerGroup.add(body);

    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    workerGroup.add(head);

    const helmetGeometry = new THREE.SphereGeometry(0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      roughness: 0.3,
      metalness: 0.6
    });
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.y = 1.55;
    workerGroup.add(helmet);

    const vestGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.25);
    const vestMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x003300,
      emissiveIntensity: 0.3,
      roughness: 0.5
    });
    const vest = new THREE.Mesh(vestGeometry, vestMaterial);
    vest.position.set(0, 0.8, 0);
    workerGroup.add(vest);

    workerGroup.visible = false;
    workerGroup.userData.isNotPickable = true;
    this.scene.add(workerGroup);
    this.workerModel = workerGroup;
  }

  createToolModels() {
    const wrenchGroup = new THREE.Group();
    const handleGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333,
      roughness: 0.4
    });
    const handle = new THREE.Mesh(handleGeom, handleMat);
    handle.rotation.z = Math.PI / 2;
    wrenchGroup.add(handle);

    const headGeom = new THREE.BoxGeometry(0.15, 0.05, 0.1);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.x = 0.2;
    wrenchGroup.add(head);

    wrenchGroup.visible = false;
    this.scene.add(wrenchGroup);
    this.toolModels.set('wrench', wrenchGroup);

    const jackGroup = new THREE.Group();
    const baseGeom = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x444444,
      roughness: 0.6, metalness: 0.5
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    jackGroup.add(base);

    const armGeom = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x666666,
      roughness: 0.4,
      metalness: 0.6
    });
    const arm = new THREE.Mesh(armGeom, armMat);
    arm.position.y = 0.3;
    jackGroup.add(arm);

    jackGroup.visible = false;
    this.scene.add(jackGroup);
    this.toolModels.set('jack', jackGroup);

    const sprayGroup = new THREE.Group();
    const canGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 16);
    const canMat = new THREE.MeshStandardMaterial({ color: 0xff4444,
      roughness: 0.3,
      metalness: 0.7
    });
    const can = new THREE.Mesh(canGeom, canMat);
    sprayGroup.add(can);

    const nozzleGeom = new THREE.ConeGeometry(0.03, 0.1, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzle.position.y = 0.2;
    sprayGroup.add(nozzle);

    sprayGroup.visible = false;
    this.scene.add(sprayGroup);
    this.toolModels.set('spray', sprayGroup);
  }

  async playBearingReplacement(bearing, options = {}) {
    const animationId = `bearing_replacement_${Date.now()}`;

    const bearingPosition = new THREE.Vector3();
    bearing.getWorldPosition(bearingPosition);

    const sequence = [
      {
        id: 'prepare',
        duration: 1000,
        action: (t) => {
          this.workerModel.visible = true;
          this.workerModel.position.lerpVectors(
            bearingPosition.clone().add(new THREE.Vector3(2, 0, 2)),
            bearingPosition.clone().add(new THREE.Vector3(1.5, 0, 1.5)),
            t
          );
        }
      },
      {
        id: 'lift_bearing',
        duration: 2000,
        action: (t) => {
          this.toolModels.get('jack').visible = true;
          this.toolModels.get('jack').position.copy(bearingPosition);
          this.toolModels.get('jack').position.y += t * 0.5;
          bearing.position.y = bearingPosition.y + t * 0.5;
        }
      },
      {
        id: 'remove_old',
        duration: 1500,
        action: (t) => {
          bearing.position.x = bearingPosition.x + t * 2;
          bearing.material.opacity = 1 - t * 0.5;
        }
      },
      {
        id: 'install_new',
        duration: 1500,
        action: (t) => {
          const newBearing = bearing.clone();
          newBearing.position.x = bearingPosition.x + 2 - t * 2;
          newBearing.position.y = bearingPosition.y + 0.5;
          newBearing.material.color.setHex(0x228b22);
        }
      },
      {
        id: 'lower_bearing',
        duration: 2000,
        action: (t) => {
          this.toolModels.get('jack').position.y = 0.5 - t * 0.5;
          bearing.position.y = bearingPosition.y + 0.5 - t * 0.5;
        }
      },
      {
        id: 'tighten',
        duration: 1000,
        action: (t) => {
          this.toolModels.get('wrench').visible = true;
          this.toolModels.get('wrench').position.copy(bearingPosition).add(new THREE.Vector3(0.5, 0.5, 0));
          this.toolModels.get('wrench').rotation.z = t * Math.PI * 4;
        }
      },
      {
        id: 'cleanup',
        duration: 1000,
        action: (t) => {
          this.toolModels.get('wrench').visible = false;
          this.toolModels.get('jack').visible = false;
          this.workerModel.position.lerpVectors(
            bearingPosition.clone().add(new THREE.Vector3(1.5, 0, 1.5)),
            bearingPosition.clone().add(new THREE.Vector3(3, 0, 3)),
            t
          );
        }
      }
    ];

    return this.playSequence(animationId, sequence, options);
  }

  async playGuardrailRepair(guardrailPost, options = {}) {
    const animationId = `guardrail_repair_${Date.now()}`;

    const postPosition = new THREE.Vector3();
    guardrailPost.getWorldPosition(postPosition);

    const sequence = [
      {
        id: 'inspect',
        duration: 1500,
        action: (t) => {
          this.workerModel.visible = true;
          this.workerModel.position.lerpVectors(
            postPosition.clone().add(new THREE.Vector3(2, 0, 0)),
            postPosition.clone().add(new THREE.Vector3(1, 0, 0)),
            t
          );
        }
      },
      {
        id: 'remove_damage',
        duration: 2000,
        action: (t) => {
          this.toolModels.get('wrench').visible = true;
          this.toolModels.get('wrench').position.copy(postPosition).add(new THREE.Vector3(0, 0.5, 0.3));
          this.toolModels.get('wrench').rotation.z = t * Math.PI * 6;

          guardrailPost.material.opacity = 1 - t * 0.5;
        }
      },
      {
        id: 'weld',
        duration: 2000,
        action: (t) => {
          this.toolModels.get('wrench').visible = false;

          if (Math.random() > 0.7) {
            const sparkGeometry = new THREE.SphereGeometry(0.02, 4, 4);
            const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            spark.position.copy(postPosition).add(new THREE.Vector3(0, 0.5, 0.2));
            spark.position.x += (Math.random() - 0.5) * 0.2;
            spark.position.y += Math.random() * 0.3;
            this.scene.add(spark);

            setTimeout(() => {
              this.scene.remove(spark);
              spark.geometry.dispose();
              spark.material.dispose();
            }, 200);
          }

          guardrailPost.material.opacity = 0.5 + t * 0.5;
        }
      },
      {
        id: 'paint',
        duration: 1500,
        action: (t) => {
          this.toolModels.get('spray').visible = true;
          this.toolModels.get('spray').position.copy(postPosition).add(new THREE.Vector3(0.3, 0.5, 0));
          this.toolModels.get('spray').rotation.z = Math.sin(t * Math.PI * 2) * 0.3;

          guardrailPost.material.color.lerpColors(
            guardrailPost.material.color,
            new THREE.Color(0x4488ff),
            t
          );
        }
      },
      {
        id: 'finish',
        duration: 1000,
        action: (t) => {
          this.toolModels.get('spray').visible = false;
          this.workerModel.position.lerpVectors(
            postPosition.clone().add(new THREE.Vector3(1, 0, 0)),
            postPosition.clone().add(new THREE.Vector3(3, 0, 0)),
            t
          );
        }
      }
    ];

    return this.playSequence(animationId, sequence, options);
  }

  async playDeckInspection(deck, options = {}) {
    const animationId = `deck_inspection_${Date.now()}`;

    const deckPosition = new THREE.Vector3();
    deck.getWorldPosition(deckPosition);

    const scanLineGeometry = new THREE.PlaneGeometry(10, 0.1);
    const scanLineMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const scanLine = new THREE.Mesh(scanLineGeometry, scanLineMaterial);
    scanLine.rotation.x = -Math.PI / 2;
    scanLine.position.copy(deckPosition);
    scanLine.position.y += 0.5;
    scanLine.position.z -= 5;
    scanLine.userData.isNotPickable = true;
    this.scene.add(scanLine);

    const sequence = [
      {
        id: 'start_scan',
        duration: 500,
        action: (t) => {
          this.workerModel.visible = true;
          this.workerModel.position.copy(deckPosition).add(new THREE.Vector3(0, 0.1, -6));
        }
      },
      {
        id: 'scan_move',
        duration: 4000,
        action: (t) => {
          scanLine.position.z = deckPosition.z - 5 + t * 10;
          this.workerModel.position.z = deckPosition.z - 6 + t * 10;

          if (Math.random() > 0.95) {
            const markerGeometry = new THREE.RingGeometry(0.3, 0.5, 32);
            const markerMaterial = new THREE.MeshBasicMaterial({
              color: 0xff0000,
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.rotation.x = -Math.PI / 2;
            marker.position.copy(deckPosition);
            marker.position.y += 0.52;
            marker.position.x = (Math.random() - 0.5) * 8;
            marker.position.z = scanLine.position.z;
            marker.userData.isNotPickable = true;
            this.scene.add(marker);

            setTimeout(() => {
              this.scene.remove(marker);
              marker.geometry.dispose();
              marker.material.dispose();
            }, 2000);
          }
        }
      },
      {
        id: 'complete',
        duration: 1000,
        action: (t) => {
          scanLine.material.opacity = 0.6 * (1 - t);
          this.workerModel.position.lerpVectors(
            deckPosition.clone().add(new THREE.Vector3(0, 0.1, 4)),
            deckPosition.clone().add(new THREE.Vector3(0, 0.1, 6)),
            t
          );
        }
      }
    ];

    return this.playSequence(animationId, sequence, {
      ...options,
      onComplete: () => {
        this.scene.remove(scanLine);
        scanLine.geometry.dispose();
        scanLine.material.dispose();
        if (options.onComplete) options.onComplete();
      }
    });
  }

  async playSequence(animationId, sequence, options = {}) {
    if (this.isPlaying) {
      console.warn('已有动画正在播放');
      return;
    }

    this.isPlaying = true;
    this.currentAnimationId = animationId;

    if (this.onAnimationStart) {
      this.onAnimationStart(animationId);
    }

    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];

      if (this.onAnimationProgress) {
        this.onAnimationProgress(animationId, i, sequence.length, i / sequence.length);
      }

      await this.playStep(animationId, step, options);
    }

    this.isPlaying = false;
    this.currentAnimationId = null;

    this.hideAll();

    if (options.onComplete) {
      options.onComplete();
    }

    if (this.onAnimationComplete) {
      this.onAnimationComplete(animationId);
    }

    return animationId;
  }

  playStep(animationId, step, options) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const duration = step.duration;

      const animate = () => {
        if (this.currentAnimationId !== animationId) {
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const easeT = options.easing ? options.easing(t) : t;

        step.action(easeT, t);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  stop() {
    this.currentAnimationId = null;
    this.isPlaying = false;
    this.hideAll();
  }

  hideAll() {
    if (this.workerModel) {
      this.workerModel.visible = false;
    }
    this.toolModels.forEach(tool => {
      tool.visible = false;
    });
  }

  getAnimationTypes() {
    return [
      {
        id: 'bearing_replacement',
        name: '支座更换',
        description: '模拟支座更换的完整流程',
        icon: '🔧',
        duration: '10秒'
      },
      {
        id: 'guardrail_repair',
        name: '护栏维修',
        description: '模拟护栏修复焊接、维修流程',
        icon: '🛠️',
        duration: '8秒'
      },
      {
        id: 'deck_inspection',
        name: '桥面检测',
        description: '模拟桥面扫描检测流程',
        icon: '🔍',
        duration: '7秒'
      }
    ];
  }

  dispose() {
    this.stop();

    if (this.workerModel) {
      this.workerModel.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(this.workerModel);
    }

    this.toolModels.forEach(tool => {
      tool.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(tool);
    });

    this.toolModels.clear();
  }
}
