import React, { useState } from 'react';
import { ClusterVisualizer } from '../components/ClusterVisualizer.js';
import { AlertList } from '../components/AlertList.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { runClustering } from '../utils/api.js';

const Anomaly: React.FC = () => {
  const [isClustering, setIsClustering] = useState(false);
  const [clusterMessage, setClusterMessage] = useState('');
  const clusters = useSecurityStore(state => state.clusters);
  const alerts = useSecurityStore(state => state.alerts);

  const handleRunClustering = async () => {
    setIsClustering(true);
    setClusterMessage('');
    try {
      const result = await runClustering();
      setClusterMessage(`聚类完成: 发现 ${result.clusters.length} 个异常簇，生成 ${result.alertsCreated} 条告警`);
    } catch (err) {
      setClusterMessage('聚类分析失败，请稍后重试');
    } finally {
      setIsClustering(false);
    }
  };

  const pendingCount = alerts.filter(a => a.status === 'pending').length;
  const highCount = clusters.filter(c => c.severity === 'high').length;
  const mediumCount = clusters.filter(c => c.severity === 'medium').length;
  const lowCount = clusters.filter(c => c.severity === 'low').length;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">异常检测中心</h2>
          <p className="text-gray-400 text-sm mt-1">基于K-means的时空异常聚类分析与告警管理</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleRunClustering}
            disabled={isClustering}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-medium transition-all flex items-center gap-2"
          >
            {isClustering ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                分析中...
              </>
            ) : (
              <>
                <span>🔍</span>
                执行聚类分析
              </>
            )}
          </button>
        </div>
      </div>

      {clusterMessage && (
        <div className={`mb-4 p-3 rounded-lg ${clusterMessage.includes('失败') ? 'bg-red-900/30 border border-red-500/30 text-red-400' : 'bg-green-900/30 border border-green-500/30 text-green-400'}`}>
          {clusterMessage}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">待处理告警</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{pendingCount}</div>
          <div className="text-xs text-gray-500 mt-1">需要立即处置</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">高风险聚类</div>
          <div className="text-3xl font-bold text-red-500 mt-1">{highCount}</div>
          <div className="text-xs text-gray-500 mt-1">严重程度: 高</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">中风险聚类</div>
          <div className="text-3xl font-bold text-orange-400 mt-1">{mediumCount}</div>
          <div className="text-xs text-gray-500 mt-1">严重程度: 中</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">低风险聚类</div>
          <div className="text-3xl font-bold text-green-400 mt-1">{lowCount}</div>
          <div className="text-xs text-gray-500 mt-1">严重程度: 低</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-6 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <ClusterVisualizer />
        </div>
        <div className="col-span-6 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <AlertList showFilters />
        </div>
      </div>
    </div>
  );
};

export default Anomaly;
