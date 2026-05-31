import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Map,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: '数据概览' },
  { path: '/multi-analysis', icon: BarChart3, label: '多维数据分析' },
  { path: '/time-series', icon: TrendingUp, label: '时序趋势分析' },
  { path: '/spatial', icon: Map, label: '空间分布分析' },
  { path: '/reports', icon: FileText, label: '报表中心' },
];

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, mobileOpen, onMobileClose }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-16 h-[calc(100vh-64px)] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-40 transition-all duration-300 flex flex-col',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-[#2dd4bf]/10 text-[#2dd4bf]'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 flex-shrink-0',
                    isActive ? 'text-[#2dd4bf]' : 'text-gray-500 dark:text-gray-400 group-hover:text-[#2dd4bf]'
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-gray-200 dark:border-gray-800 hidden lg:block">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
