import React from 'react';
import { RiskDashboard } from '../components/RiskDashboard.js';
import { AreaDeviceRanking } from '../components/AreaDeviceRanking.js';

const Risk: React.FC = () => {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">风险统计报表</h2>
          <p className="text-gray-400 text-sm mt-1">综合风险评估、趋势分析、区域风险排名与点位排名</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-gray-400">数据实时更新</span>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-8 min-h-0">
          <RiskDashboard />
        </div>
        <div className="col-span-4 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <AreaDeviceRanking />
        </div>
      </div>
    </div>
  );
};

export default Risk;
