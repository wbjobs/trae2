import { Layer } from '../types'
import { SceneLoader } from './SceneLoader'
import { DataService } from '../services/DataService'

export class LayerManager {
  private layers: Map<string, Layer> = new Map()
  private sceneLoader: SceneLoader | null = null
  private dataService: DataService | null = null
  private onLayersChangeCallback: ((layers: Layer[]) => void) | null = null

  constructor(dataService?: DataService, sceneLoader?: SceneLoader) {
    this.dataService = dataService || null
    this.sceneLoader = sceneLoader || null
  }

  public setSceneLoader(sceneLoader: SceneLoader) {
    this.sceneLoader = sceneLoader
  }

  public setDataService(dataService: DataService) {
    this.dataService = dataService
  }

  public async loadLayers(): Promise<Layer[]> {
    if (!this.dataService) {
      return []
    }

    try {
      const layers = await this.dataService.getLayers()
      this.layers.clear()
      layers.forEach(layer => {
        this.layers.set(layer.id, layer)
      })
      this.notifyLayersChange()
      return layers
    } catch (error) {
      console.error('Failed to load layers:', error)
      return []
    }
  }

  public getLayers(): Layer[] {
    return Array.from(this.layers.values())
  }

  public getLayer(id: string): Layer | undefined {
    return this.layers.get(id)
  }

  public async setLayerVisibility(layerId: string, visible: boolean): Promise<void> {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.visible = visible

    if (this.sceneLoader) {
      this.sceneLoader.setLayerVisibility(layerId, visible)
    }

    if (this.dataService) {
      await this.dataService.updateLayer({ id: layerId, visible })
    }

    this.notifyLayersChange()
  }

  public async setLayerOpacity(layerId: string, opacity: number): Promise<void> {
    const layer = this.layers.get(layerId)
    if (!layer) return

    layer.opacity = Math.max(0, Math.min(1, opacity))

    if (this.sceneLoader) {
      this.sceneLoader.setLayerOpacity(layerId, layer.opacity)
    }

    if (this.dataService) {
      await this.dataService.updateLayer({ id: layerId, opacity: layer.opacity })
    }

    this.notifyLayersChange()
  }

  public async toggleLayer(layerId: string): Promise<void> {
    const layer = this.layers.get(layerId)
    if (layer) {
      await this.setLayerVisibility(layerId, !layer.visible)
    }
  }

  public async showAllLayers(): Promise<void> {
    const promises: Promise<void>[] = []
    this.layers.forEach((layer, id) => {
      if (!layer.visible) {
        promises.push(this.setLayerVisibility(id, true))
      }
    })
    await Promise.all(promises)
  }

  public async hideAllLayers(): Promise<void> {
    const promises: Promise<void>[] = []
    this.layers.forEach((layer, id) => {
      if (layer.visible) {
        promises.push(this.setLayerVisibility(id, false))
      }
    })
    await Promise.all(promises)
  }

  public async toggleLayerGroup(groupType: 'pipeline' | 'device'): Promise<void> {
    const groupLayers = this.getLayersByType(groupType)
    const allVisible = groupLayers.every(l => l.visible)
    
    const promises: Promise<void>[] = []
    groupLayers.forEach(layer => {
      promises.push(this.setLayerVisibility(layer.id, !allVisible))
    })
    await Promise.all(promises)
  }

  public getLayersByType(type: 'pipeline' | 'device' | 'terrain' | 'building'): Layer[] {
    return this.getLayers().filter(l => l.type === type)
  }

  public getVisibleLayers(): Layer[] {
    return this.getLayers().filter(l => l.visible)
  }

  public isLayerVisible(layerId: string): boolean {
    return this.layers.get(layerId)?.visible ?? false
  }

  public setOnLayersChangeCallback(callback: (layers: Layer[]) => void) {
    this.onLayersChangeCallback = callback
  }

  private notifyLayersChange() {
    if (this.onLayersChangeCallback) {
      this.onLayersChangeCallback(this.getLayers())
    }
  }

  public addLayer(layer: Layer): void {
    this.layers.set(layer.id, layer)
    this.notifyLayersChange()
  }

  public removeLayer(layerId: string): void {
    this.layers.delete(layerId)
    this.notifyLayersChange()
  }

  public async resetLayers(): Promise<void> {
    const promises: Promise<void>[] = []
    this.layers.forEach((layer, id) => {
      if (!layer.visible) {
        promises.push(this.setLayerVisibility(id, true))
      }
      if (layer.opacity !== 1) {
        promises.push(this.setLayerOpacity(id, 1))
      }
    })
    await Promise.all(promises)
  }

  public getLayerStats(): {
    total: number
    visible: number
    hidden: number
    pipelineLayers: number
    deviceLayers: number
  } {
    const layers = this.getLayers()
    return {
      total: layers.length,
      visible: layers.filter(l => l.visible).length,
      hidden: layers.filter(l => !l.visible).length,
      pipelineLayers: layers.filter(l => l.type === 'pipeline').length,
      deviceLayers: layers.filter(l => l.type === 'device').length
    }
  }
}
