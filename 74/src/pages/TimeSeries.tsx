import React, { useState, useMemo, useEffect } from 'react';
import { TimeSeriesChart } from '../components/TimeSeriesChart.js';
import { KpiCard } from '../components/KpiCard.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { Activity, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';

const TimeSeries: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const features = useSecurityStore(state => state.features);
  const devices = useSecurityStore(state => state.devices);
  const fetchFeatures = useSecurityStore(state => state.fetchFeatures);

  useEffect(() => {
    fetchFeatures();

    const interval = setInterval(() => {
      fetchFeatures();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchFeatures, selectedDevice]);

  const deviceOptions = useMemo(() => {
    return [
      { value: 'all', label: '全部设备' },
      ...devices.map(d => ({
        value: d.id,
        label: `${d.name} (${d.type})`
      }))
    ];
  }, [devices]);

  const latestFeatures = features.length > 0 ? features[features.length - 1] : null;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">时序分析面板</h2>
          <p className="text-gray-400 text-sm mt-1">多设备时序数据监控与特征提取分析</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-400">选择设备:</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500"
          >
            {deviceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="数据均值"
          value={latestFeatures?.mean?.toFixed(2) || '0.00'}
          color="cyan"
          icon={<Activity size={24} />}
        />
        <KpiCard
          title="标准差"
          value={latestFeatures?.std?.toFixed(2) || '0.00'}
          color="green"
          icon={<TrendingUp size={24} />}
        />
        <KpiCard
          title="峰值数量"
          value={latestFeatures?.peakCount || 0}
          color="yellow"
          icon={<AlertTriangle size={24} />}
        />
        <KpiCard
          title="波动率"
          value={`${((latestFeatures?.volatility || 0) * 100).toFixed(1)}%`}
          color="purple"
          icon={<BarChart3 size={24} />}
        />
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-8 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <TimeSeriesChart
            deviceId={selectedDevice === 'all' ? undefined : selectedDevice}
            title={selectedDevice === 'all' ? '全部设备时序数据' : `${devices.find(d => d.id === selectedDevice)?.name} 时序数据`}
          />
        </div>
        <div className="col-span-4 bg-slate-800/50 rounded-xl border border-slate-700 p-4 overflow-auto">
          <h3 className="text-cyan-400 text-sm font-bold mb-4">特征提取详情</h3>
          {latestFeatures && (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-2">统计特征</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">均值</div>
                    <div className="text-white font-medium">{latestFeatures.mean?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">标准差</div>
                    <div className="text-white font-medium">{latestFeatures.std?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">最小值</div>
                    <div className="text-white font-medium">{latestFeatures.min?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">最大值</div>
                    <div className="text-white font-medium">{latestFeatures.max?.toFixed(3)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-2">分位数分析</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Q1</div>
                    <div className="text-white font-medium">{latestFeatures.q1?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">中位数</div>
                    <div className="text-white font-medium">{latestFeatures.median?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Q3</div>
                    <div className="text-white font-medium">{latestFeatures.q3?.toFixed(3)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-2">高级特征</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">RMS</div>
                    <div className="text-white font-medium">{latestFeatures.rms?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">波动率</div>
                    <div className="text-white font-medium">{(latestFeatures.volatility * 100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">峰值数</div>
                    <div className="text-white font-medium">{latestFeatures.peakCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">趋势</div>
                    <div className={`font-medium ${latestFeatures.trend > 0 ? 'text-green-400' : latestFeatures.trend < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {latestFeatures.trend > 0 ? '上升' : latestFeatures.trend < 0 ? '下降' : '平稳'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-500 text-center pt-2">
                特征更新时间: {latestFeatures ? new Date(latestFeatures.timestamp).toLocaleString('zh-CN') : '-'}
              </div>
            </div>
          )}
          {!latestFeatures && (
            <div className="text-center text-gray-500 py-12">
              暂无特征数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeSeries;
