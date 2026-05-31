import { Device, FAULT_CONFIG, DEVICE_CONFIG } from '../../../shared/types';
import { useGameStore } from '../../store/gameStore';
import { useSocket } from '../../hooks/useSocket';
import { Activity, AlertTriangle, Wrench, CheckCircle, Thermometer, Shield, RefreshCw } from 'lucide-react';

export function DevicePanel() {
  const { gameState, selectedDevice, diagnosisResult, repairProgress, playerId } = useGameStore();
  const { emit } = useSocket();

  if (!selectedDevice) {
    return (
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 w-72">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          设备监控
        </h3>
        <p className="text-slate-400 text-sm">点击场景中的设备查看详情</p>
      </div>
    );
  }

  const deviceConfig = DEVICE_CONFIG[selectedDevice.type];
  const statusColors = {
    normal: 'text-green-400',
    warning: 'text-yellow-400',
    fault: 'text-red-400',
    repairing: 'text-blue-400',
  };

  const statusText = {
    normal: '正常',
    warning: '警告',
    fault: '故障',
    repairing: '维修中',
  };

  const handleDiagnose = () => {
    if (playerId) {
      emit('start_diagnosis', { deviceId: selectedDevice.id, playerId });
    }
  };

  const handleRepair = (faultIndex: number) => {
    if (playerId) {
      emit('perform_repair', { deviceId: selectedDevice.id, playerId, faultIndex });
    }
  };

  const handleMaintenance = (type: string) => {
    if (playerId) {
      emit('perform_maintenance', { deviceId: selectedDevice.id, playerId, maintenanceType: type });
    }
  };

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 w-80 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          {selectedDevice.name}
        </h3>
        <span className={`px-2 py-1 rounded text-sm font-medium ${statusColors[selectedDevice.status]} bg-slate-700`}>
          {statusText[selectedDevice.status]}
        </span>
      </div>

      <div className="space-y-3">
        <div className="bg-slate-700/50 rounded p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-xs flex items-center gap-1">
              <Shield className="w-3 h-3" />
              设备耐久度
            </span>
            <span className={`text-xs font-medium ${
              selectedDevice.durability > 60 ? 'text-green-400' :
              selectedDevice.durability > 30 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {selectedDevice.durability.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-600 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                selectedDevice.durability > 60 ? 'bg-green-500' :
                selectedDevice.durability > 30 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${selectedDevice.durability}%` }}
            />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            耐久度影响设备精度和故障概率
          </div>
        </div>

        <div className="bg-slate-700/50 rounded p-3">
          <div className="text-slate-400 text-xs mb-1">设备健康度</div>
          <div className="w-full bg-slate-600 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                selectedDevice.health > 60 ? 'bg-green-500' :
                selectedDevice.health > 30 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${selectedDevice.health}%` }}
            />
          </div>
          <div className="text-right text-xs text-slate-400 mt-1">{selectedDevice.health.toFixed(0)}%</div>
        </div>

        <div className="bg-slate-700/50 rounded p-3">
          <div className="text-slate-400 text-xs mb-1">当前读数</div>
          <div className="text-2xl font-bold text-white">
            {selectedDevice.value.toFixed(2)} 
            <span className="text-sm text-slate-400 ml-1">{deviceConfig.unit}</span>
          </div>
          {selectedDevice.durability < 80 && (
            <div className="text-xs text-yellow-400 mt-1">
              ⚠️ 耐久度较低，读数可能存在偏差
            </div>
          )}
        </div>

        <div className="bg-slate-700/50 rounded p-3">
          <div className="text-slate-400 text-xs mb-2">故障列表</div>
          {selectedDevice.faults.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              无故障
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDevice.faults.map((fault, index) => {
                const faultConfig = FAULT_CONFIG[fault];
                const isRepairing = repairProgress[selectedDevice.id] !== undefined;
                const progress = repairProgress[selectedDevice.id] || 0;

                return (
                  <div key={fault} className="bg-slate-600/50 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        {faultConfig.name}
                      </div>
                      {!isRepairing && (
                        <button
                          onClick={() => handleRepair(index)}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded text-xs text-white transition-colors"
                        >
                          <Wrench className="w-3 h-3" />
                          修复
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{faultConfig.description}</div>
                    {isRepairing && (
                      <div className="mt-2">
                        <div className="w-full bg-slate-500 rounded-full h-1.5">
                          <div 
                            className="h-1.5 rounded-full bg-blue-400 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-xs text-blue-400 mt-1">修复中... {progress}%</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-700/50 rounded p-3">
          <div className="text-slate-400 text-xs mb-2 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            快速维护
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleMaintenance('cleaning')}
              disabled={selectedDevice.status === 'repairing'}
              className="py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
            >
              🧹 清洁
            </button>
            <button
              onClick={() => handleMaintenance('lubrication')}
              disabled={selectedDevice.status === 'repairing'}
              className="py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
            >
              🛢️ 润滑
            </button>
            <button
              onClick={() => handleMaintenance('calibration')}
              disabled={selectedDevice.status === 'repairing'}
              className="py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
            >
              🎯 校准
            </button>
            <button
              onClick={() => handleMaintenance('inspection')}
              disabled={selectedDevice.status === 'repairing'}
              className="py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
            >
              🔍 检查
            </button>
          </div>
        </div>

        <button
          onClick={handleDiagnose}
          disabled={selectedDevice.status === 'repairing'}
          className="w-full py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Thermometer className="w-4 h-4" />
          诊断设备
        </button>

        {diagnosisResult && diagnosisResult.length > 0 && (
          <div className="bg-blue-900/30 border border-blue-500/50 rounded p-3">
            <div className="text-blue-400 text-sm font-medium mb-1">诊断结果</div>
            <div className="text-slate-300 text-xs">
              发现 {diagnosisResult.length} 个故障需要修复
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
