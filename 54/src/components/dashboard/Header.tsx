import { useEffect, useState } from 'react';
import { Activity, Clock, Maximize2 } from 'lucide-react';

const Header = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="h-16 bg-gradient-to-r from-[#0a1628] via-[#0d1f3c] to-[#0a1628] border-b border-[#00d4ff]/30 flex items-center justify-between px-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#0066ff] flex items-center justify-center shadow-lg shadow-[#00d4ff]/30">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-wider">
            城市地下综合管廊运行状态时序分析平台
          </h1>
          <p className="text-xs text-[#00d4ff]/70">
            Urban Underground Utility Tunnel Monitoring System
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-[#00d4ff]">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-lg">
            {currentTime.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-sm">系统运行中</span>
          </span>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#00d4ff] transition-colors"
          title="全屏"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Header;
