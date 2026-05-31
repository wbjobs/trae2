import React, { useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { AreaPrediction } from '../../shared/types.js';

const TREND_CONFIG = {
  rising: { color: '#ff4757', icon: '↑', label: '上升趋势' },
  stable: { color: '#ffa502', icon: '→', label: '保持稳定' },
  declining: { color: '#2ed573', icon: '↓', label: '下降趋势' }
};

export const RiskPrediction: React.FC = () => {
  const predictions = useSecurityStore(state => state.predictions);
  const fetchPredictions = useSecurityStore(state => state.fetchPredictions);
  const selectedArea = useSecurityStore(state => state.selectedArea);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 60000);
    return () => clearInterval(interval);
  }, [fetchPredictions, selectedArea]);

  const option = useMemo(() => {
    if (!predictions || predictions.length === 0) {
      return {
        backgroundColor: 'transparent',
        graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: '预测数据加载中...', fill: '#64748b', fontSize: 14 } }]
      };
    }

    const allSeries: any[] = [];
    const colors = ['#00d4ff', '#2ed573', '#ffa502', '#ff4757', '#a855f7'];

    predictions.forEach((pred: AreaPrediction, idx: number) => {
      const color = colors[idx % colors.length];
      const times = pred.predictions.map(p => new Date(p.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      const predValues = [pred.currentRisk, ...pred.predictions.map(p => p.predictedRisk)];
      const upperBound = [pred.currentRisk, ...pred.predictions.map(p => p.upperBound)];
      const lowerBound = [pred.currentRisk, ...pred.predictions.map(p => p.lowerBound)];
      const allTimes = ['当前', ...times];

      allSeries.push(
        {
          name: pred.areaName,
          type: 'line',
          data: predValues,
          smooth: true,
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          symbolSize: 4
        },
        {
          name: `${pred.areaName}-上界`,
          type: 'line',
          data: upperBound,
          lineStyle: { opacity: 0 },
          stack: `band_${idx}`,
          symbol: 'none'
        },
        {
          name: `${pred.areaName}-下界`,
          type: 'line',
          data: lowerBound.map((v, i) => upperBound[i] - v),
          lineStyle: { opacity: 0 },
          areaStyle: { color: `${color}15` },
          stack: `band_${idx}`,
          symbol: 'none'
        }
      );

      if (idx === 0) {
        return { allTimes };
      }
    });

    const firstPred = predictions[0];
    const times = ['当前', ...firstPred.predictions.map(p => new Date(p.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10, 22, 40, 0.95)',
        borderColor: '#00d4ff40',
        textStyle: { color: '#fff', fontSize: 12 }
      },
      legend: {
        data: predictions.map((p: AreaPrediction) => p.areaName),
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 30,
        right: 10,
        itemWidth: 12,
        itemHeight: 8
      },
      grid: { left: 40, right: 20, top: 60, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0, max: 100,
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e3a5f20', type: 'dashed' } }
      },
      graphic: [{
        type: 'text', left: 10, top: 5,
        style: { text: '安防态势短期预测', fill: '#00d4ff', fontSize: 14, fontWeight: 'bold' }
      }],
      series: allSeries
    };
  }, [predictions]);

  return (
    <div className="h-full flex flex-col">
      <ReactECharts option={option} style={{ height: '60%', width: '100%' }} opts={{ renderer: 'canvas' }} />

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="text-xs text-slate-400 mb-2 font-medium">区域趋势概览</div>
        <div className="space-y-2">
          {(predictions || []).map((pred: AreaPrediction) => {
            const cfg = TREND_CONFIG[pred.trend] || TREND_CONFIG.stable;
            return (
              <div key={pred.area} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-200 font-medium">{pred.areaName}</span>
                  <span className="text-xs" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">当前: <span className="text-white font-bold">{pred.currentRisk}</span></span>
                  <span className="text-xs text-slate-400">下一时: <span className="font-bold" style={{ color: cfg.color }}>{pred.nextHourRisk}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RiskPrediction;
