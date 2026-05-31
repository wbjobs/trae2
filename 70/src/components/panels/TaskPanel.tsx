import { ClipboardList, Play, CheckCircle, Clock, Trophy } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useSocket } from '../../hooks/useSocket';

export function TaskPanel() {
  const { gameState, playerId } = useGameStore();
  const { emit } = useSocket();

  if (!gameState) return null;

  const availableTasks = gameState.tasks.filter(t => !t.completed && !t.assignedPlayerId);
  const myTasks = gameState.tasks.filter(t => t.assignedPlayerId === playerId && !t.completed);
  const completedTasks = gameState.tasks.filter(t => t.completed);

  const handleAcceptTask = (taskId: string) => {
    if (playerId) {
      emit('accept_task', { taskId, playerId });
    }
  };

  const handleCompleteTask = (taskId: string) => {
    if (playerId) {
      emit('complete_task', { taskId, playerId });
    }
  };

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 w-72 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-yellow-400" />
        任务中心
      </h3>

      {myTasks.length > 0 && (
        <div className="mb-4">
          <div className="text-slate-400 text-xs mb-2 flex items-center gap-1">
            <Play className="w-3 h-3" />
            进行中
          </div>
          <div className="space-y-2">
            {myTasks.map(task => (
              <div key={task.id} className="bg-blue-900/30 border border-blue-500/50 rounded p-2">
                <div className="text-white text-sm font-medium">{task.description}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-1 text-yellow-400 text-xs">
                    <Trophy className="w-3 h-3" />
                    +{task.reward}
                  </div>
                  <button
                    onClick={() => handleCompleteTask(task.id)}
                    className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-xs text-white transition-colors"
                  >
                    完成
                  </button>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-1 mt-2">
                  <div 
                    className="h-1 rounded-full bg-blue-400"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableTasks.length > 0 && (
        <div className="mb-4">
          <div className="text-slate-400 text-xs mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            可接取
          </div>
          <div className="space-y-2">
            {availableTasks.map(task => (
              <div key={task.id} className="bg-slate-700/50 rounded p-2">
                <div className="text-white text-sm">{task.description}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-1 text-yellow-400 text-xs">
                    <Trophy className="w-3 h-3" />
                    +{task.reward}
                  </div>
                  <button
                    onClick={() => handleAcceptTask(task.id)}
                    className="px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded text-xs text-white transition-colors"
                  >
                    接取
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completedTasks.length > 0 && (
        <div>
          <div className="text-slate-400 text-xs mb-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            已完成 ({completedTasks.length})
          </div>
          <div className="space-y-1">
            {completedTasks.slice(-3).reverse().map(task => (
              <div key={task.id} className="bg-green-900/30 rounded p-2 opacity-70">
                <div className="text-green-400 text-xs flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {task.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableTasks.length === 0 && myTasks.length === 0 && completedTasks.length === 0 && (
        <div className="text-slate-400 text-sm text-center py-4">
          暂无任务
        </div>
      )}
    </div>
  );
}
