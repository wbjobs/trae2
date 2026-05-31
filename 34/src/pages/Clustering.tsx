import { useEffect, useState } from 'react';
import { apiService } from '@/services/api';
import type { ClusterResult } from '@/types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const clusterColors = [
  '#06b6d4',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
];

export default function Clustering() {
  const [clusters, setClusters] = useState<{ clusterId: number; clusterName: string; stations: ClusterResult[] }[]>([]);
  const [results, setResults] = useState<ClusterResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  useEffect(() => {
    loadClusteringResults();
  }, []);

  const loadClusteringResults = async () => {
    try {
      const res = await apiService.getClusteringResults();
      if (res.success) {
        setClusters(res.data.clusters || []);
        setResults(res.data.results || []);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load clustering results:', error);
      setLoading(false);
    }
  };

  const getScatterData = () => {
    return results.map((result) => ({
      x: result.features[0] * 100,
      y: result.features[1] * 100,
      clusterId: result.clusterId,
      stationName: result.stationName,
      avgFlow: result.avgFlow,
    }));
  };

  if (loading) {
    return (
      <div className="pt-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">加载聚类数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 px-6 pb-8">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">客流聚类分析</h2>
          <p className="text-slate-400">基于时序特征对站点进行聚类，识别不同类型的客流模式</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">聚类分布散点图</h3>
              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="x"
                      name="平均客流指数"
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="y"
                      name="峰值客流指数"
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      formatter={(value: any, name: string) => [
                        value.toFixed(2),
                        name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px' }}
                      payload={clusters.map((cluster, index) => ({
                        value: cluster.clusterName,
                        type: 'circle',
                        color: clusterColors[index % clusterColors.length],
                      }))}
                    />
                    <Scatter data={getScatterData()}>
                      {getScatterData().map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={clusterColors[entry.clusterId % clusterColors.length]}
                          fillOpacity={selectedCluster === null || selectedCluster === entry.clusterId ? 0.8 : 0.2}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {clusters.map((cluster, index) => (
                <div
                  key={cluster.clusterId}
                  className={`bg-slate-900/50 rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedCluster === cluster.clusterId
                      ? 'border-cyan-500/50 ring-2 ring-cyan-500/30'
                      : 'border-slate-700/50 hover:border-slate-600'
                  }`}
                  onClick={() => setSelectedCluster(selectedCluster === cluster.clusterId ? null : cluster.clusterId)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: clusterColors[index % clusterColors.length] }}
                    />
                    <h4 className="font-semibold text-white">{cluster.clusterName}</h4>
                    <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      {cluster.stations.length} 个站点
                    </span>
                  </div>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {cluster.stations.slice(0, 6).map((station) => (
                      <div key={station.stationId} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{station.stationName}</span>
                        <span className="text-slate-500">{station.avgFlow.toLocaleString()}</span>
                      </div>
                    ))}
                    {cluster.stations.length > 6 && (
                      <p className="text-xs text-slate-500 text-center">
                        还有 {cluster.stations.length - 6} 个站点...
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-1">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">聚类统计</h3>
              <div className="space-y-4">
                {clusters.map((cluster, index) => {
                  const avgFlow = cluster.stations.reduce((sum, s) => sum + s.avgFlow, 0) / cluster.stations.length;
                  return (
                    <div key={cluster.clusterId} className="p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="font-medium text-sm"
                          style={{ color: clusterColors[index % clusterColors.length] }}
                        >
                          {cluster.clusterName}
                        </span>
                        <span className="text-xs text-slate-500">{cluster.stations.length} 站</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        平均客流: {Math.round(avgFlow).toLocaleString()}
                      </div>
                      <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(cluster.stations.length / results.length) * 100}%`,
                            backgroundColor: clusterColors[index % clusterColors.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-2">聚类说明</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 通勤核心站点：早晚高峰客流显著</li>
                  <li>• 商务中心站点：日间客流稳定</li>
                  <li>• 居住型站点：早高峰进站为主</li>
                  <li>• 旅游景点站点：周末客流高峰</li>
                  <li>• 郊区站点：客流相对较低</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
