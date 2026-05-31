import { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ArrowRightLeft,
  Copy,
  Check,
  Globe,
} from 'lucide-react';
import { transformCoordinate } from '@/utils/coordinateTransform';

type CRS = 'WGS84' | 'GCJ02' | 'BD09' | 'XIAN80' | 'BJ54';

const coordinateSystems: { id: CRS; name: string; description: string }[] = [
  { id: 'WGS84', name: 'WGS84', description: 'WGS84 大地坐标系' },
  { id: 'GCJ02', name: 'GCJ02', description: '国测局加密坐标系（火星坐标系）' },
  { id: 'BD09', name: 'BD09', description: '百度加密坐标系' },
  { id: 'XIAN80', name: 'XIAN80', description: '西安80坐标系' },
  { id: 'BJ54', name: 'BJ54', description: '北京54坐标系' },
];

export default function CoordinatePanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sourceCRS, setSourceCRS] = useState<CRS>('WGS84');
  const [targetCRS, setTargetCRS] = useState<CRS>('GCJ02');
  const [inputX, setInputX] = useState('');
  const [inputY, setInputY] = useState('');
  const [outputX, setOutputX] = useState('');
  const [outputY, setOutputY] = useState('');
  const [copied, setCopied] = useState(false);

  const handleTransform = () => {
    if (!inputX || !inputY) return;
    try {
      const x = parseFloat(inputX);
      const y = parseFloat(inputY);
      if (isNaN(x) || isNaN(y)) return;

      const result = transformCoordinate([x, y], sourceCRS, targetCRS);
      setOutputX(result[0].toFixed(7));
      setOutputY(result[1].toFixed(7));
    } catch (e) {
      console.error('坐标转换失败:', e);
    }
  };

  const handleSwap = () => {
    setSourceCRS(targetCRS);
    setTargetCRS(sourceCRS);
    setInputX(outputX);
    setInputY(outputY);
    setOutputX(inputX);
    setOutputY(inputY);
  };

  const handleCopy = () => {
    if (!outputX || !outputY) return;
    navigator.clipboard.writeText(`${outputX}, ${outputY}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseCurrent = () => {
    setInputX('116.39713');
    setInputY('39.90750');
  };

  return (
    <div className="bg-geo-dark border-t border-geo-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full h-9 flex items-center justify-between px-4 hover:bg-geo-dark-light transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-geo-blue" />
          <span className="font-display font-medium text-sm text-geo-text">坐标转换</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-geo-text-muted" />
        ) : (
          <ChevronUp className="w-4 h-4 text-geo-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-geo-border">
          <div className="flex items-center gap-6">
            <div className="flex-1 space-y-2">
              <label className="block text-xs text-geo-text-muted font-display uppercase">
                源坐标系
              </label>
              <select
                value={sourceCRS}
                onChange={(e) => setSourceCRS(e.target.value as CRS)}
                className="w-full h-9 bg-geo-dark-light border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
              >
                {coordinateSystems.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name} - {cs.description}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-geo-text-muted mb-1">X (经度)</label>
                  <input
                    type="number"
                    step="any"
                    value={inputX}
                    onChange={(e) => setInputX(e.target.value)}
                    placeholder="输入经度"
                    className="w-full h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-geo-text-muted mb-1">Y (纬度)</label>
                  <input
                    type="number"
                    step="any"
                    value={inputY}
                    onChange={(e) => setInputY(e.target.value)}
                    placeholder="输入纬度"
                    className="w-full h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleSwap}
                className="p-2 rounded-lg bg-geo-dark-light hover:bg-geo-orange text-geo-text-muted hover:text-white transition-colors"
                title="交换坐标系"
              >
                <ArrowRightLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleTransform}
                className="px-6 py-2 bg-geo-orange hover:bg-geo-orange-hover text-white rounded-lg font-medium text-sm transition-colors"
              >
                转换
              </button>
              <button
                onClick={handleUseCurrent}
                className="text-xs text-geo-blue hover:text-geo-orange transition-colors"
              >
                使用当前坐标
              </button>
            </div>

            <div className="flex-1 space-y-2">
              <label className="block text-xs text-geo-text-muted font-display uppercase">
                目标坐标系
              </label>
              <select
                value={targetCRS}
                onChange={(e) => setTargetCRS(e.target.value as CRS)}
                className="w-full h-9 bg-geo-dark-light border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
              >
                {coordinateSystems.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name} - {cs.description}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-geo-text-muted mb-1">X (经度)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={outputX}
                      placeholder="—"
                      className="flex-1 h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-orange font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-geo-text-muted mb-1">Y (纬度)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={outputY}
                      placeholder="—"
                      className="flex-1 h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-green font-mono"
                    />
                    <button
                      onClick={handleCopy}
                      disabled={!outputX || !outputY}
                      className="p-2 rounded-lg bg-geo-dark-light hover:bg-geo-dark text-geo-text-muted hover:text-geo-orange transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="复制结果"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-geo-green" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
