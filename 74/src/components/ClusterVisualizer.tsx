import React, { useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { formatTime } from '../utils/format.js';

interface ClusterVisualizerProps {
  className?: string;
}

export const ClusterVisualizer: React.FC<ClusterVisualizerProps> = ({ className }) => {
  const clusters = useSecurityStore(state => state.clusters);
  const alerts = useSecurityStore(state => state.alerts);
  const fetchClusters = useSecurityStore(state => state.fetchClusters);
  const fetchAlerts = useSecurityStore(state => state.fetchAlerts);
  const updateAlertStatus = useSecurityStore(state => state.updateAlertStatus);

  useEffect(() => {
    fetchClusters();
    fetchAlerts();

    const interval = setInterval(() => {
      fetchClusters();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchClusters, fetchAlerts]);

  const clusterOption = useMemo(() => {
    const severityColors: Record<string, string> = {
      high: '#ff4757',
      medium: '#ffa502',
      low: '#2ed573'
    };

    const typeIcons: Record<string, string> = {
      intrusion: '🛡️',
      crowd: '👥',
      fault: '⚙️',
      unknown: '❓'
    };

    const data = clusters.map(c => ({
      value: [c.center.lng, c.center.lat, c.pointCount],
      itemStyle: {
        color: severityColors[c.severity]
      },
      symbolSize: Math.min(c.pointCount * 3 + 20, 60),
      name: `${typeIcons[c.type]} ${c.area}`,
      clusterId: c.id,
      type: c.type,
      severity: c.severity,
      count: c.pointCount,
      time: formatTime(c.detectedAt)
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: '异常聚类分布',
        textStyle: {
          color: '#00d4ff',
          fontSize: 16,
          fontWeight: 'bold'
        },
        left: 10,
        top: 10
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(10, 22, 40, 0.95)',
        borderColor: '#00d4ff40',
        textStyle: {
          color: '#fff'
        },
        formatter: (params: any) => {
          const c = params.data;
          return `
            <div style="padding: 4px;">
              <div style="font-weight: bold; margin-bottom: 8px;">${c.name}</div>
              <div>类型: ${c.type === 'intrusion' ? '入侵检测' : c.type === 'crowd' ? '人群聚集' : c.type === 'fault' ? '设备故障' : '未知异常'}</div>
              <div>严重程度: ${c.severity === 'high' ? '<span style="color:#ff4757">高</span>' : c.severity === 'medium' ? '<span style="color:#ffa502">中</span>' : '<span style="color:#2ed573">低</span>'}</div>
              <div>异常点数: ${c.count}</div>
              <div>检测时间: ${c.time}</div>
            </div>
          `;
        }
      },
      grid: {
        left: 0,
        right: 0,
        top: 50,
        bottom: 0
      },
      xAxis: {
        type: 'value',
        min: 116.28,
        max: 116.50,
        show: false
      },
      yAxis: {
        type: 'value',
        min: 39.82,
        max: 40.02,
        show: false
      },
      series: [{
        type: 'scatter',
        data: data,
        emphasis: {
          scale: 1.2,
          itemStyle: {
            shadowBlur: 20,
            shadowColor: '#fff'
          }
        },
        label: {
          show: true,
          formatter: (params: any) => params.data.count.toString(),
          position: 'inside',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold'
        }
      }]
    };
  }, [clusters]);

  const handleAlertHandle = async (alertId: string) => {
    await updateAlertStatus(alertId, 'acknowledged');
  };

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      <div className="h-1/2 min-h-[280px] p-4">
        <ReactECharts
          option={clusterOption}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      <div className="h-1/2 flex-1 p-4 overflow-auto">
        <h3 className="text-cyan-400 text-sm font-bold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          实时告警列表
        </h3>
        <div className="space-y-2">
          {alerts.slice(0, 8).map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.severity === 'high'
                  ? 'bg-red-900/20 border-red-500/40'
                  : alert.severity === 'medium'
                    ? 'bg-orange-900/20 border-orange-500/40'
                    : 'bg-green-900/20 border-green-500/40'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    {alert.type === 'intrusion' ? '🚨 入侵检测' : alert.type === 'crowd' ? '👥 人群聚集' : '⚙️ 设备异常'}
                    <span className="text-gray-400 ml-2">- {alert.area}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatTime(alert.timestamp)} · 关联设备: {alert.deviceIds?.slice(0, 3).join(', ')}
                    {alert.deviceIds && alert.deviceIds.length > 3 ? `...(+${alert.deviceIds.length - 3})` : ''}
                  </div>
                </div>
                {alert.status === 'pending' && (
                  <button
                    onClick={() => handleAlertHandle(alert.id)}
                    className="ml-2 px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
                  >
                    处置
                  </button>
                )}
                {alert.status === 'acknowledged' && (
                  <span className="ml-2 px-3 py-1 text-xs bg-green-600/50 text-green-300 rounded">
                    已处置
                  </span>
                )}
              </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="text-center text-gray-500 py-8 text-sm">
              暂无告警信息
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterVisualizer;
