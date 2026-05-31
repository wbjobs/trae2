import * as THREE from 'three';

class LayerManager {
  constructor(sceneLoader) {
    this.sceneLoader = sceneLoader;
    this.layers = new Map();
    this.layerVisibility = new Map();
    this.layerOpacity = new Map();
    this.onLayerChange = null;
  }

  init(layersData) {
    this.layers.clear();
    this.layerVisibility.clear();
    this.layerOpacity.clear();

    for (const [system, systemLayers] of Object.entries(layersData)) {
      systemLayers.forEach(layer => {
        this.layers.set(layer.id, {
          ...layer,
          system: system,
          componentCount: 0
        });
        this.layerVisibility.set(layer.id, true);
        this.layerOpacity.set(layer.id, 1);
      });
    }
  }

  addComponentToLayer(component, layerId) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.componentCount++;
    }
  }

  getLayer(layerId) {
    return this.layers.get(layerId);
  }

  getLayersBySystem(system) {
    return Array.from(this.layers.values()).filter(l => l.system === system);
  }

  getAllLayers() {
    return Array.from(this.layers.values());
  }

  getSystems() {
    const systems = new Set();
    this.layers.forEach(layer => systems.add(layer.system));
    return Array.from(systems);
  }

  setLayerVisibility(layerId, visible) {
    this.layerVisibility.set(layerId, visible);
    this.sceneLoader.setLayerVisibility(layerId, visible);

    if (this.onLayerChange) {
      this.onLayerChange(layerId, { visible });
    }
  }

  getLayerVisibility(layerId) {
    return this.layerVisibility.get(layerId) ?? true;
  }

  setSystemVisibility(system, visible) {
    const systemLayers = this.getLayersBySystem(system);
    systemLayers.forEach(layer => {
      this.setLayerVisibility(layer.id, visible);
    });
  }

  setLayerOpacity(layerId, opacity) {
    this.layerOpacity.set(layerId, opacity);
    
    this.sceneLoader.components.forEach(mesh => {
      if (mesh.userData.layer === layerId) {
        mesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = opacity;
            child.material.transparent = opacity < 1;
          }
        });
      }
    });

    if (this.onLayerChange) {
      this.onLayerChange(layerId, { opacity });
    }
  }

  getLayerOpacity(layerId) {
    return this.layerOpacity.get(layerId) ?? 1;
  }

  isolateLayer(layerId) {
    this.layers.forEach((_, id) => {
      this.setLayerVisibility(id, id === layerId);
    });
  }

  showAllLayers() {
    this.layers.forEach((_, id) => {
      this.setLayerVisibility(id, true);
    });
  }

  hideAllLayers() {
    this.layers.forEach((_, id) => {
      this.setLayerVisibility(id, false);
    });
  }

  toggleLayer(layerId) {
    const current = this.getLayerVisibility(layerId);
    this.setLayerVisibility(layerId, !current);
  }

  getVisibleComponents() {
    return this.sceneLoader.components.filter(comp => {
      const layerId = comp.userData.layer;
      return this.layerVisibility.get(layerId) ?? true;
    });
  }

  getLayerColor(layerId) {
    const layer = this.layers.get(layerId);
    return layer ? layer.color : '#ffffff';
  }

  getLayerComponentCount(layerId) {
    const layer = this.layers.get(layerId);
    return layer ? layer.componentCount : 0;
  }

  getSystemComponentCount(system) {
    const systemLayers = this.getLayersBySystem(system);
    return systemLayers.reduce((sum, layer) => sum + layer.componentCount, 0);
  }

  getTotalComponentCount() {
    let total = 0;
    this.layers.forEach(layer => {
      total += layer.componentCount;
    });
    return total;
  }

  setLayerColor(layerId, color) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.color = color;
      
      this.sceneLoader.components.forEach(mesh => {
        if (mesh.userData.layer === layerId) {
          mesh.traverse(child => {
            if (child.isMesh && child.material) {
              child.material.color.set(color);
            }
          });
        }
      });
    }
  }

  reset() {
    this.layers.clear();
    this.layerVisibility.clear();
    this.layerOpacity.clear();
  }
}

export default LayerManager;
