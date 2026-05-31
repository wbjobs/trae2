import React from 'react'
import { Layer } from '../types'

interface LayerPanelProps {
  layers: Layer[]
  onToggleLayer: (layerId: string) => void
  onOpacityChange: (layerId: string, opacity: number) => void
  onShowAll: () => void
  onHideAll: () => void
  onReset: () => void
}

const typeConfig: Record<string, { label: string; icon: string; color: string }> = {
  pipeline: { label: '管线图层', icon: '━', color: '#3b82f6' },
  device: { label: '设备图层', icon: '⚙️', color: '#22c55e' },
  terrain: { label: '地形图层', icon: '🏔️', color: '#84cc16' },
  building: { label: '建筑图层', icon: '🏢', color: '#f59e0b' }
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  onToggleLayer,
  onOpacityChange,
  onShowAll,
  onHideAll,
  onReset
}) => {
  const pipelineLayers = layers.filter(l => l.type === 'pipeline')
  const deviceLayers = layers.filter(l => l.type === 'device')
  const otherLayers = layers.filter(l => l.type !== 'pipeline' && l.type !== 'device')

  return (
    <div className="layer-panel">
      <div className="panel-header">
        <h3>图层管理</h3>
        <div className="panel-actions">
          <button className="action-btn" onClick={onShowAll} title="显示全部">
            👁️
          </button>
          <button className="action-btn" onClick={onHideAll} title="隐藏全部">
            🙈
          </button>
          <button className="action-btn" onClick={onReset} title="重置">
            🔄
          </button>
        </div>
      </div>

      <div className="panel-content">
        {pipelineLayers.length > 0 && (
          <div className="layer-group">
            <div className="group-header">
              <span className="group-icon" style={{ color: typeConfig.pipeline.color }}>
                {typeConfig.pipeline.icon}
              </span>
              <span className="group-label">{typeConfig.pipeline.label}</span>
              <span className="group-count">{pipelineLayers.filter(l => l.visible).length}/{pipelineLayers.length}</span>
            </div>
            <div className="layer-list">
              {pipelineLayers.map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  onToggle={() => onToggleLayer(layer.id)}
                  onOpacityChange={(opacity) => onOpacityChange(layer.id, opacity)}
                />
              ))}
            </div>
          </div>
        )}

        {deviceLayers.length > 0 && (
          <div className="layer-group">
            <div className="group-header">
              <span className="group-icon" style={{ color: typeConfig.device.color }}>
                {typeConfig.device.icon}
              </span>
              <span className="group-label">{typeConfig.device.label}</span>
              <span className="group-count">{deviceLayers.filter(l => l.visible).length}/{deviceLayers.length}</span>
            </div>
            <div className="layer-list">
              {deviceLayers.map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  onToggle={() => onToggleLayer(layer.id)}
                  onOpacityChange={(opacity) => onOpacityChange(layer.id, opacity)}
                />
              ))}
            </div>
          </div>
        )}

        {otherLayers.length > 0 && (
          <div className="layer-group">
            <div className="group-header">
              <span className="group-icon">📁</span>
              <span className="group-label">其他图层</span>
              <span className="group-count">{otherLayers.filter(l => l.visible).length}/{otherLayers.length}</span>
            </div>
            <div className="layer-list">
              {otherLayers.map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  onToggle={() => onToggleLayer(layer.id)}
                  onOpacityChange={(opacity) => onOpacityChange(layer.id, opacity)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface LayerItemProps {
  layer: Layer
  onToggle: () => void
  onOpacityChange: (opacity: number) => void
}

const LayerItem: React.FC<LayerItemProps> = ({ layer, onToggle, onOpacityChange }) => {
  return (
    <div className={`layer-item ${!layer.visible ? 'hidden' : ''}`}>
      <div className="layer-item-header">
        <button
          className={`visibility-btn ${layer.visible ? 'visible' : 'hidden'}`}
          onClick={onToggle}
          title={layer.visible ? '隐藏' : '显示'}
        >
          {layer.visible ? '👁️' : '🙈'}
        </button>
        <span className="layer-name">{layer.name}</span>
      </div>
      {layer.visible && layer.opacity < 1 && (
        <div className="layer-opacity">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={layer.opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="opacity-slider"
          />
          <span className="opacity-value">{Math.round(layer.opacity * 100)}%</span>
        </div>
      )}
    </div>
  )
}
