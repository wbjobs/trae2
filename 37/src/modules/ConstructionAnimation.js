import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

class ConstructionAnimation {
  constructor(sceneLoader) {
    this.sceneLoader = sceneLoader;
    this.isPlaying = false;
    this.currentTime = 0;
    this.totalDuration = 100;
    this.speed = 1;
    this.animationQueue = [];
    this.animationMap = new Map();
    this.originalPositions = new Map();
    this.onTimeUpdate = null;
    this.onPhaseChange = null;
    this.phases = [
      { id: 'structure', name: '结构施工', start: 0, end: 25, color: '#64748b' },
      { id: 'hvac', name: '暖通安装', start: 25, end: 50, color: '#f97316' },
      { id: 'plumbing', name: '给排水', start: 40, end: 65, color: '#06b6d4' },
      { id: 'electrical', name: '电气布线', start: 50, end: 80, color: '#eab308' },
      { id: 'fire', name: '消防施工', start: 60, end: 95, color: '#ef4444' },
      { id: 'complete', name: '竣工验收', start: 95, end: 100, color: '#10b981' }
    ];
  }

  init(components) {
    this.animationMap.clear();
    this.originalPositions.clear();

    components.forEach(comp => {
      if (!comp.userData || !comp.userData.componentId) return;

      const system = comp.userData.system;
      const phase = this.getPhaseForSystem(system);
      
      const startTime = this.getComponentStartTime(comp, phase);
      const duration = 3 + Math.random() * 5;
      
      const originalPos = comp.position.clone();
      this.originalPositions.set(comp.userData.componentId, originalPos);

      const startPos = originalPos.clone();
      startPos.y -= 20 + Math.random() * 10;

      this.animationMap.set(comp.userData.componentId, {
        component: comp,
        phase: phase,
        startTime: startTime,
        duration: duration,
        startPos: startPos,
        endPos: originalPos,
        opacityStart: startTime,
        opacityDuration: duration * 0.5
      });

      comp.position.copy(startPos);
      comp.visible = false;
      comp.traverse(child => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.opacity = 0;
          child.material.transparent = true;
        }
      });
    });

    this.currentTime = 0;
    this.update(0);
  }

  getPhaseForSystem(system) {
    const phaseMap = {
      structure: 'structure',
      hvac: 'hvac',
      plumbing: 'plumbing',
      electrical: 'electrical',
      fire: 'fire'
    };
    return phaseMap[system] || 'complete';
  }

  getComponentStartTime(component, phaseId) {
    const phase = this.phases.find(p => p.id === phaseId);
    if (!phase) return 50;

    const layer = component.userData?.layer || '';
    let offset = 0;

    if (layer.includes('floor') || layer.includes('column')) {
      offset = 0;
    } else if (layer.includes('wall') || layer.includes('beam')) {
      offset = 0.15;
    } else if (layer.includes('duct') || layer.includes('pipe')) {
      offset = 0.2;
    } else if (layer.includes('equip') || layer.includes('panel')) {
      offset = 0.4;
    } else if (layer.includes('light') || layer.includes('fixture')) {
      offset = 0.6;
    } else {
      offset = Math.random() * 0.5;
    }

    return phase.start + (phase.end - phase.start) * offset;
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.animate();
  }

  pause() {
    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.update(0);
  }

  reset() {
    this.stop();
    this.animationMap.forEach((anim, id) => {
      anim.component.position.copy(anim.startPos);
      anim.component.visible = false;
      anim.component.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.opacity = 0;
        }
      });
    });
  }

  setTime(time) {
    this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
    this.update(this.currentTime);
    
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime);
    }

    this.checkPhaseChange();
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(5, speed));
  }

  getCurrentPhase() {
    for (let i = this.phases.length - 1; i >= 0; i--) {
      if (this.currentTime >= this.phases[i].start) {
        return this.phases[i];
      }
    }
    return this.phases[0];
  }

  checkPhaseChange() {
    const phase = this.getCurrentPhase();
    if (this.lastPhase !== phase.id && this.onPhaseChange) {
      this.onPhaseChange(phase);
      this.lastPhase = phase.id;
    }
  }

  animate() {
    if (!this.isPlaying) return;

    this.currentTime += this.speed * 0.1;
    
    if (this.currentTime >= this.totalDuration) {
      this.currentTime = this.totalDuration;
      this.isPlaying = false;
    }

    this.update(this.currentTime);
    
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime);
    }

    this.checkPhaseChange();

    if (this.isPlaying) {
      requestAnimationFrame(() => this.animate());
    }
  }

  update(time) {
    this.animationMap.forEach((anim) => {
      const { component, startTime, duration, startPos, endPos, opacityStart, opacityDuration } = anim;

      if (time < startTime) {
        component.visible = false;
        component.position.copy(startPos);
        component.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 0;
          }
        });
      } else if (time >= startTime && time < startTime + duration) {
        component.visible = true;
        
        const progress = (time - startTime) / duration;
        const easedProgress = this.easeInOutCubic(progress);
        
        component.position.lerpVectors(startPos, endPos, easedProgress);

        const opacityProgress = Math.max(0, (time - opacityStart) / opacityDuration);
        const opacity = Math.min(1, opacityProgress);
        
        component.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = opacity;
          }
        });
      } else {
        component.visible = true;
        component.position.copy(endPos);
        component.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 1;
            child.material.transparent = false;
          }
        });
      }
    });
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  jumpToPhase(phaseId) {
    const phase = this.phases.find(p => p.id === phaseId);
    if (phase) {
      this.setTime(phase.end);
    }
  }

  getProgress() {
    return this.currentTime / this.totalDuration;
  }

  getPhases() {
    return this.phases;
  }

  getPhaseProgress(phaseId) {
    const phase = this.phases.find(p => p.id === phaseId);
    if (!phase) return 0;
    
    if (this.currentTime < phase.start) return 0;
    if (this.currentTime >= phase.end) return 1;
    
    return (this.currentTime - phase.start) / (phase.end - phase.start);
  }

  dispose() {
    this.isPlaying = false;
    this.animationMap.clear();
    this.originalPositions.clear();
  }
}

export default ConstructionAnimation;
