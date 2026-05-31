import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Play, Users, Search, Plus, RefreshCw, Server, Crown } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useSocket } from '../hooks/useSocket';

interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  hostName: string;
}

export function MainMenu() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showRoomList, setShowRoomList] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const { setPlayerName: setStorePlayerName, setRoomId: setStoreRoomId, addNotification } = useGameStore();
  const { connect, emit, isConnected, rooms } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    setSocketConnected(isConnected);
  }, [isConnected]);

  const handleJoinGame = () => {
    if (!playerName.trim()) return;
    
    setIsConnecting(true);
    setStorePlayerName(playerName);
    setStoreRoomId(roomId);
    
    const socket = connect(roomId, playerName);
    
    if (socket) {
      socket.once('join_room_success', () => {
        setTimeout(() => {
          navigate('/game');
        }, 500);
      });

      socket.once('join_room_failed', (data: any) => {
        setIsConnecting(false);
        addNotification(data.message || '加入房间失败', 'error');
      });
    }
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    
    const newRoomId = roomId || `room_${Date.now().toString().slice(-6)}`;
    emit('create_room', {
      roomId: newRoomId,
      roomName: `${playerName}的房间`,
      playerName,
      maxPlayers: 8,
      isPrivate: false,
    });

    setTimeout(() => {
      setRoomId(newRoomId);
      handleJoinGame();
    }, 300);
  };

  const handleRefreshRooms = () => {
    setIsRefreshing(true);
    emit('get_room_list');
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  const handleJoinRoom = (room: RoomInfo) => {
    setRoomId(room.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0aDR2MWgtNHYtMXptLTYgMGg0djFoLTR2LTF6bTEyLTZoLTR2MWg0di0xem0tNiAwaC00djFoNHYtMXptLTYgMGgtNHYxaDR2LTF6bTEyLTZoLTR2MWg0di0xem0tNiAwaC00djFoNHYtMXptLTYgMGgtNHYxaDR2LTF6Ii8+PC9nPjwvZz48L3N2Zz4=')]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl p-8">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Cloud className="w-12 h-12 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">
              气象站运维
              <span className="block text-lg font-normal text-slate-400 mt-1">山地野外模拟仿真系统</span>
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              加入游戏
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  玩家昵称
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="输入你的昵称"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  房间 ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="输入房间 ID 或从右侧选择"
                    className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleJoinGame}
                  disabled={!playerName.trim() || isConnecting}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/25"
                >
                  <Play className="w-5 h-5" />
                  {isConnecting ? '连接中...' : '加入房间'}
                </button>

                <button
                  onClick={handleCreateRoom}
                  disabled={!playerName.trim()}
                  className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-green-500/25"
                >
                  <Plus className="w-5 h-5" />
                  创建房间
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  服务器状态
                </h3>
                <span className={`flex items-center gap-1.5 text-sm ${socketConnected ? 'text-green-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  {socketConnected ? '已连接' : '未连接'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-yellow-400" />
                局域网房间
              </h2>
              <button
                onClick={handleRefreshRooms}
                disabled={isRefreshing}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {rooms.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无可用房间</p>
                  <p className="text-sm mt-1">创建第一个房间开始游戏</p>
                </div>
              ) : (
                rooms.map((room) => (
                  <div
                    key={room.id}
                    onClick={() => handleJoinRoom(room)}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      roomId === room.id
                        ? 'bg-blue-900/40 border-2 border-blue-500'
                        : 'bg-slate-700/30 border border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{room.name}</span>
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className={`text-sm ${
                          room.playerCount >= room.maxPlayers ? 'text-red-400' : 'text-slate-300'
                        }`}>
                          {room.playerCount}/{room.maxPlayers}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-500" />
                        {room.hostName}
                      </span>
                      <span>·</span>
                      <span>ID: {room.id}</span>
                    </div>
                    {room.playerCount >= room.maxPlayers && (
                      <div className="mt-2 text-xs text-red-400">房间已满</div>
                    )}
                  </div>
                ))
              )}
            </div>

            {roomId && (
              <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
                <p className="text-sm text-blue-300">
                  已选择房间: <span className="font-mono">{roomId}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="bg-slate-800/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-1">🌦️</div>
            <div className="text-xs text-slate-400">天气模拟</div>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-1">🔧</div>
            <div className="text-xs text-slate-400">设备运维</div>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-1">👥</div>
            <div className="text-xs text-slate-400">多人协作</div>
          </div>
        </div>

        <div className="mt-8 text-center text-slate-500 text-xs">
          <p>模拟山地野外气象站设备运维场景 · 支持局域网多人联机协作</p>
          <p className="mt-1">确保防火墙允许端口 3002 的 TCP/UDP 连接</p>
        </div>
      </div>
    </div>
  );
}
