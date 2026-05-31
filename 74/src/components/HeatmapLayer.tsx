import React, { useEffect, useRef, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { HeatmapPoint } from '../../shared/types.js';

interface HeatmapLayerProps {
  className?: string;
  showDevicePoints?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  low: '#2ed573',
  medium: '#ffa502',
  high: '#ff4757'
};

const DEVICE_COLORS: Record<string, string> = {
  camera: '#00d4ff',
  access: '#2ed573',
  alarm: '#ff4757'
};

const EMPTY_OPTION = {
  backgroundColor: 'transparent',
  graphic: [{
    type: 'text',
    left: 'center',
    top: 'middle',
    style: {
      text: '态势图加载中...',
      fill: '#64748b',
      fontSize: 14
    }
  }]
};

export const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ className, showDevicePoints = true }) => {
  const chartRef = useRef<ReactECharts>(null);
  const [containerReady, setContainerReady] = useState(false);
  const heatmapData = useSecurityStore(state => state.heatmapData);
  const devices = useSecurityStore(state => state.devices);
  const fetchHeatmapData = useSecurityStore(state => state.fetchHeatmapData);
  const fetchDevices = useSecurityStore(state => state.fetchDevices);
  const clusters = useSecurityStore(state => state.clusters);
  const selectedTimeRange = useSecurityStore(state => state.selectedTimeRange);

  useEffect(() => {
    fetchHeatmapData();
    fetchDevices();

    const interval = setInterval(() => {
      fetchHeatmapData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchHeatmapData, fetchDevices, selectedTimeRange]);

  useEffect(() => {
    const timer = setTimeout(() => setContainerReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const option = useMemo(() => {
    if (!containerReady) return EMPTY_OPTION;

    const data: HeatmapPoint[] = heatmapData?.points || [];
    if (data.length === 0) return EMPTY_OPTION;

    const heatScatterData = data.map(p => ({
      value: [p.lng, p.lat, p.value],
      symbolSize: Math.max(8, Math.min(p.value / 3, 50)),
      itemStyle: {
        color: p.value > 60 ? '#ff475790' : p.value > 30 ? '#ffa50280' : '#00d4ff60',
        shadowBlur: p.value > 40 ? 20 : 10,
        shadowColor: p.value > 60 ? '#ff4757' : p.value > 30 ? '#ffa502' : '#00d4ff'
      }
    }));

    const effectData = data
      .filter(p => p.value > 50)
      .map(p => ({
        value: [p.lng, p.lat, p.value],
        symbolSize: Math.max(15, Math.min(p.value / 2, 60))
      }));

    const deviceData = (devices || []).map(d => ({
      value: [d.lng, d.lat],
      name: d.name,
      symbolSize: d.status === 'online' ? 14 : 8,
      itemStyle: {
        color: DEVICE_COLORS[d.type] || '#00d4ff',
        borderColor: '#ffffff40',
        borderWidth: 2,
        shadowBlur: 8,
        shadowColor: DEVICE_COLORS[d.type] || '#00d4ff'
      }
    }));

    const clusterData = (clusters || []).map(c => ({
      value: [c.center?.lng || 0, c.center?.lat || 0, c.pointCount || 0],
      symbolSize: Math.min((c.pointCount || 1) * 3 + 20, 55),
      itemStyle: {
        color: RISK_COLORS[c.severity] || '#ffa502',
        opacity: 0.85,
        shadowBlur: 15,
        shadowColor: RISK_COLORS[c.severity] || '#ffa502'
      }
    }));

    const clusterEffectData = (clusters || []).filter(c => c.severity === 'high').map(c => ({
      value: [c.center?.lng || 0, c.center?.lat || 0],
      symbolSize: Math.min((c.pointCount || 1) * 3 + 30, 60)
    }));

    const series: any[] = [
      {
        name: '热力分布',
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        data: heatScatterData,
        zlevel: 1,
        silent: true,
        animation: true
      }
    ];

    if (effectData.length > 0) {
      series.push({
        name: '高危区域',
        type: 'effectScatter',
        coordinateSystem: 'cartesian2d',
        data: effectData,
        zlevel: 2,
        rippleEffect: { brushType: 'stroke', scale: 3, period: 4 },
        itemStyle: { color: '#ff475780', shadowBlur: 20, shadowColor: '#ff4757' },
        silent: true
      });
    }

    if (showDevicePoints && deviceData.length > 0) {
      series.push({
        name: '设备点位',
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        data: deviceData,
        zlevel: 10,
        emphasis: { scale: 1.5, itemStyle: { borderColor: '#fff', borderWidth: 3 } }
      });
    }

    if (clusterData.length > 0) {
      series.push({
        name: '异常聚类',
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        data: clusterData,
        zlevel: 15,
        symbol: 'diamond',
        emphasis: { scale: 1.5 }
      });
    }

    if (clusterEffectData.length > 0) {
      series.push({
        name: '高危聚类',
        type: 'effectScatter',
        coordinateSystem: 'cartesian2d',
        data: clusterEffectData,
        zlevel: 16,
        symbol: 'diamond',
        rippleEffect: { brushType: 'stroke', scale: 4, period: 3 },
        itemStyle: { color: '#ff475760' },
        silent: true
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(10, 22, 40, 0.95)',
        borderColor: '#00d4ff40',
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          if (params.seriesName === '热力分布') {
            return `风险强度: ${(params.data?.value?.[2] ?? 0).toFixed(1)}`;
          }
          if (params.seriesName === '设备点位') {
            return `${params.data?.name || '-'}<br/>经度: ${(params.data?.value?.[0] ?? 0).toFixed(4)} 纬度: ${(params.data?.value?.[1] ?? 0).toFixed(4)}`;
          }
          if (params.seriesName === '异常聚类') {
            return `聚类点数: ${params.data?.value?.[2] || 0}`;
          }
          return params.seriesName || '-';
        }
      },
      grid: { left: 30, right: 30, top: 60, bottom: 30 },
      xAxis: {
        type: 'value',
        min: 116.28,
        max: 116.50,
        show: true,
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => v.toFixed(2) + '°E' },
        splitLine: { show: true, lineStyle: { color: '#1e3a5f20', type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        min: 39.82,
        max: 40.02,
        show: true,
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => v.toFixed(2) + '°N' },
        splitLine: { show: true, lineStyle: { color: '#1e3a5f20', type: 'dashed' } }
      },
      graphic: [
        {
          type: 'text',
          left: 30,
          top: 10,
          style: { text: '城市安防热力态势图', fill: '#00d4ff', fontSize: 16, fontWeight: 'bold' }
        },
        {
          type: 'text',
          right: 30,
          top: 10,
          style: {
            text: heatmapData?.updateTime ? new Date(heatmapData.updateTime).toLocaleString('zh-CN') : '-',
            fill: '#64748b',
            fontSize: 11
          }
        }
      ],
      series
    };
  }, [heatmapData, devices, clusters, showDevicePoints, containerReady]);

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        lazyUpdate={true}
      />

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-cyan-500/30">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
          <span className="text-[10px] text-gray-300">摄像头</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          <span className="text-[10px] text-gray-300">门禁</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
          <span className="text-[10px] text-gray-300">报警器</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></div>
          <span className="text-[10px] text-gray-300">异常聚类</span>
        </div>
      </div>
    </div>
  );
};

export default HeatmapLayer;
