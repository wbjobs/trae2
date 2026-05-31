import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Droplets, Bell, Sun, Moon, User, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

const navItems = [
  { path: '/', label: '数据概览' },
  { path: '/multi-analysis', label: '多维分析' },
  { path: '/time-series', label: '时序趋势' },
  { path: '/spatial', label: '空间分布' },
  { path: '/reports', label: '报表中心' },
];

const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-[#1e3a5f] text-white flex items-center justify-between px-4 lg:px-6 fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-10 h-10 bg-[#2dd4bf] rounded-xl flex items-center justify-center">
            <Droplets className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-semibold hidden sm:block">
            湖泊水生态浮游生物监测分析系统
          </h1>
        </div>
      </div>

      <nav className="hidden md:flex items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              location.pathname === item.path
                ? 'bg-[#2dd4bf] text-white'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#f97316] rounded-full" />
        </button>
        <div className="w-9 h-9 bg-[#60a5fa] rounded-full flex items-center justify-center ml-2 cursor-pointer hover:opacity-90 transition-opacity">
          <User className="w-5 h-5 text-white" />
        </div>
      </div>
    </header>
  );
};

export default Header;
