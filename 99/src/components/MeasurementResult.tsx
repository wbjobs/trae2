import { useState } from 'react';
import { Ruler, Layers, Copy, Check, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useGeoStore } from '@/store';
import type { MeasurementResult as MeasurementResultType } from '@/types';

interface MeasurementResultCardProps {
  measurement: MeasurementResultType;
  index: number;
  onRemove: () => void;
}

function MeasurementResultCard({ measurement, index, onRemove }: MeasurementResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `${measurement.type === 'distance' ? '距离' : '厚度'}: ${measurement.value.toFixed(3)}m`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDistance = measurement.type === 'distance';

  return (
    <div className="bg-geo-dark-light rounded-lg border border-geo-border overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          {isDistance ? (
            <Ruler className="w-4 h-4 text-geo-blue" />
          ) : (
            <Layers className="w-4 h-4 text-geo-orange" />
          )}
          <span className="font-display font-medium text-sm text-geo-text">
            {isDistance ? '距离量测' : '厚度量测'} #{index + 1}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-geo-dark text-geo-text-muted hover:text-geo-orange transition-colors"
            title="复制"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-geo-green" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-red-900/30 text-geo-text-muted hover:text-red-400 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-geo-dark text-geo-text-muted hover:text-geo-text transition-colors"
            title={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-geo-border/50 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-geo-text-muted">总{isDistance ? '距离' : '厚度'}</span>
            <span className="font-mono font-semibold text-lg text-geo-orange">
              {measurement.value.toFixed(3)}
              <span className="text-sm text-geo-text-muted ml-1">m</span>
            </span>
          </div>

          {isDistance && measurement.horizontalDistance !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-geo-text-muted">水平距离</span>
              <span className="font-mono text-sm text-geo-blue">
                {measurement.horizontalDistance.toFixed(3)} m
              </span>
            </div>
          )}

          {isDistance && measurement.verticalDistance !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-geo-text-muted">垂直距离</span>
              <span className="font-mono text-sm text-geo-green">
                {measurement.verticalDistance.toFixed(3)} m
              </span>
            </div>
          )}

          {measurement.points.length > 0 && (
            <div className="mt-2 pt-2 border-t border-geo-border/50">
              <span className="text-xs text-geo-text-muted block mb-1">测量点坐标</span>
              <div className="space-y-1">
                {measurement.points.map((point, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono text-geo-text-muted">
                    <span className="text-geo-orange">P{i + 1}:</span>
                    <span>{point[0].toFixed(3)}, {point[1].toFixed(3)}, {point[2].toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeasurementResult() {
  const { measurements, removeMeasurement, clearMeasurements } = useGeoStore();
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-20 right-4 z-40 p-2 bg-geo-dark-light border border-geo-border rounded-lg hover:bg-geo-dark transition-colors"
        title="显示量测结果"
      >
        <Ruler className="w-5 h-5 text-geo-orange" />
      </button>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-40 w-72">
      <div className="bg-geo-dark rounded-xl border border-geo-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-geo-border bg-geo-dark-light">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-geo-orange" />
            <span className="font-display font-semibold text-geo-text">量测结果</span>
            {measurements.length > 0 && (
              <span className="px-1.5 py-0.5 bg-geo-orange text-white text-xs font-bold rounded">
                {measurements.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {measurements.length > 0 && (
              <button
                onClick={clearMeasurements}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
              >
                清空
              </button>
            )}
            <button
              onClick={() => setIsVisible(false)}
              className="p-1 rounded hover:bg-geo-dark text-geo-text-muted hover:text-geo-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto p-3 space-y-2">
          {measurements.length === 0 ? (
            <div className="text-center py-8 text-geo-text-muted">
              <Ruler className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无量测结果</p>
              <p className="text-xs mt-1">使用量测工具在场景中点击测量</p>
            </div>
          ) : (
            measurements.map((m, i) => (
              <MeasurementResultCard
                key={i}
                measurement={m}
                index={i}
                onRemove={() => removeMeasurement(i)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
