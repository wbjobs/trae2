import React from 'react';
import { LayoutDashboard, Activity, AlertTriangle, BarChart3 } from 'lucide-react';

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const navItems = [
  { id: 'dashboard', label: '实时监控大屏', icon: LayoutDashboard },
  { id: 'timeseries', label: '时序分析面板', icon: Activity },
  { id: 'anomaly', label: '异常检测中心', icon: AlertTriangle },
  { id: 'risk', label: '风险统计报表', icon: BarChart3 }
];

export const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange }) => {
  return (
    <nav className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-cyan-500/30 flex items-center justify-between px-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <span className="text-white font-bold text-lg">城</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-wider">
            城市综合安防点位运行时序分析可视化平台
          </h1>
          <p className="text-xs text-cyan-400/80">
            Urban Security Time-Series Analysis Platform
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`relative px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all duration-300 ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={18} />
              <span className="text-sm font-medium">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs text-gray-400">当前时间</div>
          <div className="text-sm text-cyan-400 font-mono">
            {new Date().toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
        </div>
        <div className="w-px h-10 bg-slate-700"></div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs text-green-400">系统运行正常</span>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
