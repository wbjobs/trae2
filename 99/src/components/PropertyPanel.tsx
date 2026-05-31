import { useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  X,
  CircleDot,
  Layers,
  Pin,
} from 'lucide-react';
import { useGeoStore } from '@/store';
import type { Borehole, GeoLayer, Annotation, BoreholeLayer } from '@/types';

export default function PropertyPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { selectedFeature, setSelectedFeature } = useGeoStore();

  const renderFeatureIcon = () => {
    if (!selectedFeature) return null;
    switch (selectedFeature.type) {
      case 'borehole':
        return <CircleDot className="w-5 h-5 text-geo-orange" />;
      case 'layer':
        return <Layers className="w-5 h-5 text-geo-blue" />;
      case 'annotation':
        return <Pin className="w-5 h-5 text-geo-green" />;
    }
  };

  const getFeatureTitle = () => {
    if (!selectedFeature) return null;
    switch (selectedFeature.type) {
      case 'borehole':
        return (selectedFeature.data as Borehole).name;
      case 'layer':
        return (selectedFeature.data as GeoLayer).name;
      case 'annotation':
        return (selectedFeature.data as Annotation).name;
    }
  };

  const renderBoreholeProperties = (borehole: Borehole) => (
    <div className="space-y-4">
      <div className="bg-geo-dark-light rounded-lg p-3">
        <h4 className="font-display font-semibold text-geo-orange mb-2 text-sm">基本信息</h4>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-geo-border">
              <td className="py-1.5 text-geo-text-muted w-24">钻孔编号</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.name}</td>
            </tr>
            <tr className="border-b border-geo-border">
              <td className="py-1.5 text-geo-text-muted">经度</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.longitude.toFixed(5)}</td>
            </tr>
            <tr className="border-b border-geo-border">
              <td className="py-1.5 text-geo-text-muted">纬度</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.latitude.toFixed(5)}</td>
            </tr>
            <tr className="border-b border-geo-border">
              <td className="py-1.5 text-geo-text-muted">高程</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.elevation.toFixed(2)} m</td>
            </tr>
            <tr className="border-b border-geo-border">
              <td className="py-1.5 text-geo-text-muted">孔深</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.depth.toFixed(2)} m</td>
            </tr>
            <tr>
              <td className="py-1.5 text-geo-text-muted">坐标系</td>
              <td className="py-1.5 text-geo-text font-mono">{borehole.coordinateSystem}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-geo-dark-light rounded-lg p-3">
        <h4 className="font-display font-semibold text-geo-orange mb-2 text-sm">地层分层</h4>
        <div className="space-y-2">
          {borehole.layers.map((layer: BoreholeLayer) => (
            <div
              key={layer.id}
              className="flex items-center gap-3 p-2 bg-geo-dark rounded-lg"
            >
              <div
                className="w-3 h-12 rounded"
                style={{ backgroundColor: layer.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-geo-text text-sm truncate">
                    {layer.layerName}
                  </span>
                  <span className="text-xs text-geo-text-muted font-mono">
                    {layer.topDepth} - {layer.bottomDepth}m
                  </span>
                </div>
                <div className="text-xs text-geo-text-muted mt-0.5">
                  厚度: {(layer.bottomDepth - layer.topDepth).toFixed(2)}m
                </div>
                <div className="text-xs text-geo-text-muted truncate">
                  {layer.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLayerProperties = (layer: GeoLayer) => (
    <div className="bg-geo-dark-light rounded-lg p-3">
      <h4 className="font-display font-semibold text-geo-blue mb-2 text-sm">图层属性</h4>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted w-24">图层名称</td>
            <td className="py-1.5 text-geo-text">{layer.name}</td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">类型</td>
            <td className="py-1.5 text-geo-text">{layer.type}</td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">透明度</td>
            <td className="py-1.5 text-geo-text">{(layer.opacity * 100).toFixed(0)}%</td>
          </tr>
          {Object.entries(layer.properties).map(([key, value]) => (
            <tr key={key} className="border-b border-geo-border last:border-0">
              <td className="py-1.5 text-geo-text-muted capitalize">{key}</td>
              <td className="py-1.5 text-geo-text">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderAnnotationProperties = (annotation: Annotation) => (
    <div className="bg-geo-dark-light rounded-lg p-3">
      <h4 className="font-display font-semibold text-geo-green mb-2 text-sm">标注属性</h4>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted w-24">名称</td>
            <td className="py-1.5 text-geo-text">{annotation.name}</td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">类型</td>
            <td className="py-1.5 text-geo-text">{annotation.type}</td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">描述</td>
            <td className="py-1.5 text-geo-text">{annotation.description}</td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">坐标</td>
            <td className="py-1.5 text-geo-text font-mono text-xs">
              {annotation.position.map((p) => p.toFixed(3)).join(', ')}
            </td>
          </tr>
          <tr className="border-b border-geo-border">
            <td className="py-1.5 text-geo-text-muted">颜色</td>
            <td className="py-1.5 flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border border-geo-border"
                style={{ backgroundColor: annotation.color }}
              />
              <span className="font-mono text-xs">{annotation.color}</span>
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-geo-text-muted">创建时间</td>
            <td className="py-1.5 text-geo-text text-xs">
              {new Date(annotation.createdAt).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderContent = () => {
    if (!selectedFeature) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-geo-text-muted p-6">
          <Layers className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm text-center">
            选择钻孔、地层或标注以查看详细属性
          </p>
        </div>
      );
    }

    switch (selectedFeature.type) {
      case 'borehole':
        return renderBoreholeProperties(selectedFeature.data as Borehole);
      case 'layer':
        return renderLayerProperties(selectedFeature.data as GeoLayer);
      case 'annotation':
        return renderAnnotationProperties(selectedFeature.data as Annotation);
      default:
        return null;
    }
  };

  return (
    <div
      className={`flex flex-col bg-geo-dark border-l border-geo-border transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-72'
      }`}
    >
      <div className="flex items-center justify-between h-12 px-3 border-b border-geo-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {renderFeatureIcon()}
            <span className="font-display font-semibold text-geo-text truncate">
              {getFeatureTitle() || '属性面板'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {!isCollapsed && selectedFeature && (
            <button
              onClick={() => setSelectedFeature(null)}
              className="p-1 rounded hover:bg-geo-dark-light text-geo-text-muted hover:text-geo-text transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded hover:bg-geo-dark-light text-geo-text-muted hover:text-geo-text transition-colors"
          >
            {isCollapsed ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3">{renderContent()}</div>
      )}
    </div>
  );
}
