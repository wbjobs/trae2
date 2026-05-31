import { Users, Trophy, Crown, Radio } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';

export function PlayerPanel() {
  const { gameState, playerId } = useGameStore();

  if (!gameState) return null;

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <Users className="w-5 h-5 text-green-400" />
        玩家列表
      </h3>

      <div className="space-y-2">
        {gameState.players.map(player => (
          <div 
            key={player.id} 
            className={`flex items-center justify-between p-2 rounded ${
              player.id === playerId ? 'bg-blue-900/30 border border-blue-500/50' : 'bg-slate-700/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {player.isHost && (
                <Crown className="w-4 h-4 text-yellow-400" />
              )}
              <span className="text-white text-sm">
                {player.name}
                {player.id === playerId && <span className="text-blue-400 ml-1">(你)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {player.score}
              </span>
              <div className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
