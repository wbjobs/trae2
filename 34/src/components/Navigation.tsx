import { NavLink } from 'react-router-dom';
import { Train, Activity, PieChart, Flame, AlertTriangle } from 'lucide-react';

const navItems = [
  { path: '/', icon: Train, label: '总览' },
  { path: '/timeseries', icon: Activity, label: '时序分析' },
  { path: '/clustering', icon: PieChart, label: '聚类分析' },
  { path: '/heatmap', icon: Flame, label: '热力图' },
  { path: '/alerts', icon: AlertTriangle, label: '预警统计' },
];

export default function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50">
      <div className="max-w-screen-2xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Train className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">轨道交通客流分析平台</h1>
              <p className="text-xs text-slate-400">Metro Passenger Flow Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-400">系统状态</p>
              <p className="text-sm text-green-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                运行中
              </p>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
