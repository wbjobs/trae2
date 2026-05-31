import * as THREE from 'three'

export class LayerManager {
  constructor(scene) {
    this.scene = scene
    this.layers = new Map()
    this.layerOrder = []
  }

  addLayer(layerId, objects, options = {}) {
    if (this.layers.has(layerId)) {
      this.removeLayer(layerId)
    }

    const layer = {
      id: layerId,
      name: options.name || layerId,
      type: options.type || 'vector',
      visible: options.visible !== false,
      opacity: options.opacity !== undefined ? options.opacity : 1,
      objects: objects || [],
      style: options.style || {},
      metadata: options.metadata || {},
      zIndex: options.zIndex || this.layerOrder.length
    }

    objects.forEach(obj => {
      obj.userData.layerId = layerId
      obj.visible = layer.visible
      if (obj.material) {
        obj.userData.originalOpacity = obj.material.opacity
        obj.material.opacity = obj.userData.originalOpacity * layer.opacity
        obj.material.transparent = layer.opacity < 1 || obj.material.transparent
      }
    })

    objects.forEach(obj => {
      this.scene.add(obj)
    })

    this.layers.set(layerId, layer)
    this.layerOrder.push(layerId)
    this.sortLayers()

    return layer
  }

  removeLayer(layerId) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.objects.forEach(obj => {
      this.scene.remove(obj)
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })

    this.layers.delete(layerId)
    this.layerOrder = this.layerOrder.filter(id => id !== layerId)
  }

  getLayer(layerId) {
    return this.layers.get(layerId)
  }

  getAllLayers() {
    return this.layerOrder.map(id => this.layers.get(id)).filter(Boolean)
  }

  setLayerVisible(layerId, visible) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.visible = visible
    layer.objects.forEach(obj => {
      this.setObjectVisible(obj, visible)
    })
  }

  setObjectVisible(obj, visible) {
    obj.visible = visible
    if (obj.children && obj.children.length > 0) {
      obj.children.forEach(child => {
        this.setObjectVisible(child, visible)
      })
    }
  }

  toggleLayerVisible(layerId) {
    const layer = this.layers.get(layerId)
    if (layer) {
      this.setLayerVisible(layerId, !layer.visible)
      return layer.visible
    }
    return null
  }

  setLayerOpacity(layerId, opacity) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.opacity = Math.max(0, Math.min(1, opacity))
    layer.objects.forEach(obj => {
      this.setObjectOpacity(obj, layer.opacity)
    })
  }

  setObjectOpacity(obj, opacity) {
    if (obj.material) {
      const originalOpacity = obj.userData.originalOpacity !== undefined
        ? obj.userData.originalOpacity
        : 1

      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => {
          m.opacity = originalOpacity * opacity
          m.transparent = m.opacity < 1 || m.transparent
        })
      } else {
        obj.material.opacity = originalOpacity * opacity
        obj.material.transparent = obj.material.opacity < 1 || obj.material.transparent
      }
    }

    if (obj.children && obj.children.length > 0) {
      obj.children.forEach(child => {
        this.setObjectOpacity(child, opacity)
      })
    }
  }

  setLayerZIndex(layerId, zIndex) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.zIndex = zIndex
    this.sortLayers()
    this.updateLayerRenderOrder()
  }

  sortLayers() {
    this.layerOrder.sort((a, b) => {
      const la = this.layers.get(a)
      const lb = this.layers.get(b)
      return (la?.zIndex || 0) - (lb?.zIndex || 0)
    })
  }

  updateLayerRenderOrder() {
    this.layerOrder.forEach((layerId, index) => {
      const layer = this.layers.get(layerId)
      if (layer) {
        layer.objects.forEach(obj => {
          obj.renderOrder = index * 100
        })
      }
    })
  }

  showAllLayers() {
    this.layerOrder.forEach(layerId => {
      this.setLayerVisible(layerId, true)
    })
  }

  hideAllLayers() {
    this.layerOrder.forEach(layerId => {
      this.setLayerVisible(layerId, false)
    })
  }

  isolateLayer(layerId) {
    this.layerOrder.forEach(id => {
      this.setLayerVisible(id, id === layerId)
    })
  }

  addObjectToLayer(layerId, object) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    object.userData.layerId = layerId
    object.visible = layer.visible

    if (object.material) {
      object.userData.originalOpacity = object.material.opacity
      object.material.opacity = object.userData.originalOpacity * layer.opacity
      object.material.transparent = layer.opacity < 1 || object.material.transparent
    }

    layer.objects.push(object)
    this.scene.add(object)
  }

  removeObjectFromLayer(layerId, object) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    const index = layer.objects.indexOf(object)
    if (index > -1) {
      layer.objects.splice(index, 1)
      this.scene.remove(object)
    }
  }

  getLayerObjectCount(layerId) {
    const layer = this.layers.get(layerId)
    return layer ? layer.objects.length : 0
  }

  getTotalObjectCount() {
    let count = 0
    this.layers.forEach(layer => {
      count += layer.objects.length
    })
    return count
  }

  clearAll() {
    const layerIds = [...this.layerOrder]
    layerIds.forEach(layerId => {
      this.removeLayer(layerId)
    })
  }

  toJSON() {
    const result = {}
    this.layers.forEach((layer, layerId) => {
      result[layerId] = {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        objectCount: layer.objects.length,
        style: layer.style,
        metadata: layer.metadata
      }
    })
    return result
  }

  getLayerBounds(layerId) {
    const layer = this.layers.get(layerId)
    if (!layer || layer.objects.length === 0) return null

    const box = new THREE.Box3()
    layer.objects.forEach(obj => {
      box.expandByObject(obj)
    })

    if (box.isEmpty()) return null

    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
      center: {
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.y + box.max.y) / 2,
        z: (box.min.z + box.max.z) / 2
      }
    }
  }

  searchObjects(layerId, query) {
    const layer = this.layers.get(layerId)
    if (!layer) return []

    const results = []
    const queryLower = query.toLowerCase()

    layer.objects.forEach(obj => {
      const feature = obj.userData.feature
      if (feature) {
        const name = feature.name || ''
        const props = JSON.stringify(feature.properties || {})

        if (name.toLowerCase().includes(queryLower) ||
            props.toLowerCase().includes(queryLower)) {
          results.push({
            object: obj,
            feature: feature,
            layerId: layerId
          })
        }
      }
    })

    return results
  }

  getFeatureById(layerId, featureId) {
    const layer = this.layers.get(layerId)
    if (!layer) return null

    for (const obj of layer.objects) {
      if (obj.userData.featureId === featureId || obj.userData.feature?.id === featureId) {
        return obj
      }
    }
    return null
  }

  highlightFeature(layerId, featureId, highlightColor = 0xffff00) {
    const obj = this.getFeatureById(layerId, featureId)
    if (!obj) return

    this.resetHighlight(layerId)

    obj.traverse(child => {
      if (child.material) {
        child.userData.originalEmissive = child.material.emissive
          ? child.material.emissive.clone()
          : new THREE.Color(0x000000)
        child.userData.originalEmissiveIntensity = child.material.emissiveIntensity || 0

        child.material.emissive = new THREE.Color(highlightColor)
        child.material.emissiveIntensity = 0.5
      }
    })

    obj.userData.isHighlighted = true
  }

  resetHighlight(layerId) {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.objects.forEach(obj => {
      if (obj.userData.isHighlighted) {
        obj.traverse(child => {
          if (child.material && child.userData.originalEmissive) {
            child.material.emissive = child.userData.originalEmissive
            child.material.emissiveIntensity = child.userData.originalEmissiveIntensity
          }
        })
        obj.userData.isHighlighted = false
      }
    })
  }
}
