import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameScene } from '../components/three/GameScene';
import { DevicePanel } from '../components/panels/DevicePanel';
import { WeatherPanel } from '../components/panels/WeatherPanel';
import { TaskPanel } from '../components/panels/TaskPanel';
import { PlayerPanel } from '../components/panels/PlayerPanel';
import { NotificationToast } from '../components/ui/Notification';
import { PerformanceSettings } from '../components/game/PerformanceSettings';
import { useGameStore } from '../store/gameStore';
import { LogOut } from 'lucide-react';

export function GamePage() {
  const { gameState, playerName, resetGame } = useGameStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!playerName) {
      navigate('/');
    }
  }, [playerName, navigate]);

  const handleLogout = () => {
    resetGame();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-900 relative">
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-3">
        <WeatherPanel />
        <PlayerPanel />
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col gap-3">
        <TaskPanel />
      </div>

      <div className="absolute bottom-4 left-4 z-20">
        <DevicePanel />
      </div>

      <PerformanceSettings />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg px-6 py-2 flex items-center gap-4">
          <span className="text-white font-medium">气象站运维模拟</span>
          {gameState && (
            <span className="text-slate-400 text-sm">
              在线玩家: {gameState.players.length}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      </div>

      <div className="w-full h-screen">
        <GameScene />
      </div>

      <div className="absolute bottom-4 right-4 z-20 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-slate-400">
        <p>🖱️ 左键拖动旋转视角</p>
        <p>🔍 滚轮缩放</p>
        <p>📍 点击设备查看详情</p>
        <p>⚙️ 右上角调整性能设置</p>
      </div>

      <NotificationToast />
    </div>
  );
}
