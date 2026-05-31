import { useState } from 'react';
import { Construction, ChevronDown, Database, User, LogOut } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';
import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const { bridges, currentBridge, selectBridge } = useBridgeStore();
  const [showBridgeMenu, setShowBridgeMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();

  const handleSelectBridge = async (bridge: typeof bridges[0]) => {
    await selectBridge(bridge);
    setShowBridgeMenu(false);
  };

  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 h-14 flex items-center justify-between px-4 z-20">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Construction className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              桥梁智能检测平台
            </h1>
            <p className="text-xs text-slate-500 -mt-0.5">3D Inspection System</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            三维工作台
          </Link>
          <Link
            to="/data-management"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/data-management'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            数据管理
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowBridgeMenu(!showBridgeMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Database className="w-4 h-4 text-sky-400" />
            <span className="text-sm text-slate-200">
              {currentBridge?.name || '选择桥梁'}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBridgeMenu ? 'rotate-180' : ''}`} />
          </button>

          {showBridgeMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
              {bridges.map((bridge) => (
                <button
                  key={bridge.id}
                  onClick={() => handleSelectBridge(bridge)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors ${
                    currentBridge?.id === bridge.id ? 'bg-slate-700/50' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-slate-100">{bridge.name}</p>
                  <p className="text-xs text-slate-400 truncate">{bridge.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-700" />

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-200">工程师</p>
              <p className="text-xs text-slate-500">检测工程师</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
              <button className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm text-slate-200">
                <User className="w-4 h-4" />
                个人设置
              </button>
              <button className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm text-red-400">
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
