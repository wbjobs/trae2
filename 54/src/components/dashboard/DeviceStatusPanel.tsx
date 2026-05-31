import { useDashboardStore } from '../../store/dashboardStore';
import { formatTime } from '../../utils/format';
import { Cpu, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const DeviceStatusPanel = () => {
  const { devices } = useDashboardStore();

  const statusStats = {
    normal: devices.filter((d) => d.status === 'normal').length,
    warning: devices.filter((d) => d.status === 'warning').length,
    error: devices.filter((d) => d.status === 'error').length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'normal':
        return 'border-green-500/30 bg-green-500/5';
      case 'warning':
        return 'border-yellow-500/30 bg-yellow-500/5';
      case 'error':
        return 'border-red-500/30 bg-red-500/5 animate-pulse';
      default:
        return 'border-green-500/30 bg-green-500/5';
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#00d4ff]" />
          <h3 className="text-white font-semibold">设备运行状态</h3>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[#8aa4c4]">正常 {statusStats.normal}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-[#8aa4c4]">警告 {statusStats.warning}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[#8aa4c4]">异常 {statusStats.error}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-5 gap-2">
          {devices.map((device) => (
            <div
              key={device.deviceId}
              className={`p-3 rounded-lg border ${getStatusBg(device.status)} transition-all hover:scale-105`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-white">{device.deviceId}</span>
                {getStatusIcon(device.status)}
              </div>
              <div className="text-[10px] text-[#5a7a9a]">
                <div>位置: ({device.location.x.toFixed(0)}, {device.location.y.toFixed(0)})</div>
                <div className="mt-1 font-mono">
                  {formatTime(device.lastUpdate)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {devices.length === 0 && (
          <div className="text-center py-8 text-[#5a7a9a]">
            <Cpu className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>暂无设备数据</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceStatusPanel;
