import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  DeviceDescriptor,
  ConnectionState,
  ParameterDefinition,
  ParameterValue,
  DriverInfo,
} from '../shared/types';
import { createTunerAPI, PresetTemplate, HardwareAlert } from '../shared/api';
import DeviceList from './components/DeviceList';
import ParameterPanel from './components/ParameterPanel';
import DriverStatus from './components/DriverStatus';
import Toast from './components/Toast';
import Modal from './components/Modal';
import PresetPanel from './components/PresetPanel';
import AlertCenter from './components/AlertCenter';
import CreatePresetModal from './components/CreatePresetModal';
import './styles.css';
import './styles-enhanced.css';

type TabType = 'parameters' | 'presets' | 'drivers' | 'alerts';

export default function App() {
  const api = useMemo(() => {
    try {
      return createTunerAPI();
    } catch {
      return null;
    }
  }, []);

  const [devices, setDevices] = useState<DeviceDescriptor[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDescriptor | null>(null);
  const [connectionStates, setConnectionStates] = useState<Map<string, ConnectionState>>(new Map());
  const [parameters, setParameters] = useState<ParameterDefinition[]>([]);
  const [parameterValues, setParameterValues] = useState<Map<string, ParameterValue>>(new Map());
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [presets, setPresets] = useState<PresetTemplate[]>([]);
  const [alerts, setAlerts] = useState<HardwareAlert[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('parameters');
  const [loading, setLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showCreatePresetModal, setShowCreatePresetModal] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error'; message: string }>>([]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (!api) return;
    api.listDevices().then((devs) => {
      setDevices(devs);
      if (devs.length > 0) {
        setSelectedDevice(devs[0]);
      }
    });
    api.getActiveAlerts().then((a) => setAlerts(a));
  }, [api]);

  useEffect(() => {
    if (!api || !selectedDevice) return;

    setLoading(true);
    Promise.all([
      api.getParameters(selectedDevice.id),
      api.getDriverStatus(selectedDevice.id),
      api.getPresets(selectedDevice.id),
    ])
      .then(([params, driver, presetList]) => {
        setParameters(params);
        setDriverInfo(driver);
        setPresets(presetList);
        return api.batchRead(
          selectedDevice.id,
          params.map((p) => p.id),
        );
      })
      .then((values) => {
        const valueMap = new Map<string, ParameterValue>();
        for (const v of values) {
          valueMap.set(v.id, v);
        }
        setParameterValues(valueMap);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api, selectedDevice]);

  useEffect(() => {
    if (!api) return;

    const unsubscribe = api.onParameterChanged((deviceId, param) => {
      if (selectedDevice?.id === deviceId) {
        setParameterValues((prev) => {
          const next = new Map(prev);
          next.set(param.id, param);
          return next;
        });
      }
    });

    return unsubscribe;
  }, [api, selectedDevice]);

  useEffect(() => {
    if (!api) return;

    const unsubscribe = api.onAlert((alert) => {
      setAlerts((prev) => {
        const filtered = prev.filter((a) => a.id !== alert.id);
        return [alert, ...filtered];
      });

      if (alert.severity === 'critical' || alert.severity === 'error') {
        setShowAlertModal(true);
      }
    });

    return unsubscribe;
  }, [api]);

  const handleConnect = useCallback(async () => {
    if (!api || !selectedDevice) return;

    try {
      const state = await api.connect(selectedDevice.id);
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.set(selectedDevice.id, state);
        return next;
      });

      if (state.connected) {
        showToast('success', `已连接到 ${selectedDevice.name}`);
        const values = await api.batchRead(
          selectedDevice.id,
          parameters.map((p) => p.id),
        );
        const valueMap = new Map<string, ParameterValue>();
        for (const v of values) {
          valueMap.set(v.id, v);
        }
        setParameterValues(valueMap);
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '连接失败');
    }
  }, [api, selectedDevice, parameters, showToast]);

  const handleDisconnect = useCallback(async () => {
    if (!api || !selectedDevice) return;

    try {
      await api.disconnect(selectedDevice.id);
      setConnectionStates((prev) => {
        const next = new Map(prev);
        next.delete(selectedDevice.id);
        return next;
      });
      showToast('success', `已断开 ${selectedDevice.name}`);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '断开失败');
    }
  }, [api, selectedDevice, showToast]);

  const handleParameterChange = useCallback(
    async (paramId: string, value: number | boolean | string) => {
      if (!api || !selectedDevice) return;

      try {
        const result = await api.writeParameter(selectedDevice.id, paramId, value);
        setParameterValues((prev) => {
          const next = new Map(prev);
          next.set(paramId, result);
          return next;
        });
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : '写入失败');
      }
    },
    [api, selectedDevice, showToast],
  );

  const handleRefreshDriver = useCallback(async () => {
    if (!api || !selectedDevice) return;

    try {
      const info = await api.getDriverStatus(selectedDevice.id);
      setDriverInfo(info);
      showToast('success', '驱动状态已刷新');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '刷新失败');
    }
  }, [api, selectedDevice, showToast]);

  const handleExport = useCallback(async () => {
    if (!api || !selectedDevice) return;

    try {
      await api.exportConfig(selectedDevice.id);
      showToast('success', '配置已导出');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '导出失败');
    }
  }, [api, selectedDevice, showToast]);

  const handleImport = useCallback(async () => {
    if (!api) return;

    try {
      const profile = await api.importConfig();
      showToast('success', `配置已导入 (${Object.keys(profile.parameters).length} 个参数)`);
      if (selectedDevice?.id === profile.deviceId) {
        const valueMap = new Map<string, ParameterValue>();
        for (const v of Object.values(profile.parameters)) {
          valueMap.set(v.id, v);
        }
        setParameterValues(valueMap);
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '导入失败');
    }
  }, [api, selectedDevice, showToast]);

  const handleApplyPreset = useCallback(
    async (presetId: string) => {
      if (!api || !selectedDevice) return;

      try {
        const results = await api.applyPreset(selectedDevice.id, presetId);
        for (const param of results) {
          setParameterValues((prev) => {
            const next = new Map(prev);
            next.set(param.id, param);
            return next;
          });
        }
        const preset = presets.find((p) => p.id === presetId);
        showToast('success', `已应用预设: ${preset?.name}`);
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : '应用预设失败');
      }
    },
    [api, selectedDevice, presets, showToast],
  );

  const handleCreatePreset = useCallback(
    async (name: string, description: string) => {
      if (!api || !selectedDevice) return;

      try {
        const newPreset = await api.createPreset(selectedDevice.id, name, description);
        setPresets((prev) => [...prev, newPreset]);
        showToast('success', `已创建预设: ${name}`);
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : '创建预设失败');
      }
    },
    [api, selectedDevice, showToast],
  );

  const handleDismissAlert = useCallback(
    async (alertId: string) => {
      if (!api) return;
      await api.dismissAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    },
    [api],
  );

  const isConnected = selectedDevice ? connectionStates.get(selectedDevice.id)?.connected ?? false : false;

  const criticalAlertCount = alerts.filter((a) => a.severity === 'critical' || a.severity === 'error').length;
  const warningAlertCount = alerts.filter((a) => a.severity === 'warning').length;

  const connectedDevices = devices.filter((d) => connectionStates.get(d.id)?.connected);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1>
            Hardware <span>Tuner</span>
          </h1>
          <span className="platform-badge">
            {navigator.platform.includes('Mac') ? 'macOS' : 'Windows'} 外设调校客户端
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {connectedDevices.length > 0 && (
            <span className="status-badge success">
              {connectedDevices.length} 设备已连接
            </span>
          )}
          <button
            className="header-alert-btn"
            onClick={() => setShowAlertModal(true)}
          >
            <span>🔔</span>
            {criticalAlertCount > 0 && (
              <span className="header-alert-count">{criticalAlertCount}</span>
            )}
            {criticalAlertCount === 0 && warningAlertCount > 0 && (
              <span className="header-alert-count warning">{warningAlertCount}</span>
            )}
          </button>
        </div>
      </header>

      {connectedDevices.length > 1 && (
        <div className="multi-device-bar">
          {connectedDevices.map((device) => (
            <div
              key={device.id}
              className={`multi-device-tab ${selectedDevice?.id === device.id ? 'active' : ''}`}
              onClick={() => setSelectedDevice(device)}
            >
              <span className="multi-device-tab-icon">
                {device.category === 'keyboard' ? '⌨️' : device.category === 'mouse' ? '🖱️' : '🔧'}
              </span>
              <span className="multi-device-tab-name">{device.name}</span>
              <span className="multi-device-tab-status connected" />
            </div>
          ))}
        </div>
      )}

      <div className="app-main">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>设备列表</h3>
            <DeviceList
              devices={devices}
              selectedDevice={selectedDevice}
              connectionStates={connectionStates}
              onSelect={setSelectedDevice}
            />
          </div>
        </aside>

        <main className="main-content">
          {selectedDevice ? (
            <>
              <div className="content-header">
                <div className="content-title">
                  <span className="device-icon" style={{ background: 'var(--bg-tertiary)' }}>
                    {selectedDevice.category === 'keyboard' ? '⌨️' : selectedDevice.category === 'mouse' ? '🖱️' : '🔧'}
                  </span>
                  <div>
                    <h2>{selectedDevice.name}</h2>
                    <div className="device-meta">
                      {selectedDevice.vendor} • {selectedDevice.transport.toUpperCase()}
                    </div>
                  </div>
                  {isConnected && (
                    <span className="status-badge success">已连接</span>
                  )}
                </div>
                <div className="content-actions">
                  {isConnected ? (
                    <button className="btn btn-secondary" onClick={handleDisconnect}>
                      断开连接
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={handleConnect}>
                      连接设备
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={handleImport}>
                    导入配置
                  </button>
                  <button className="btn btn-secondary" onClick={handleExport} disabled={!isConnected}>
                    导出配置
                  </button>
                </div>
              </div>

              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'parameters' ? 'active' : ''}`}
                  onClick={() => setActiveTab('parameters')}
                >
                  ⚙️ 参数调校
                </button>
                <button
                  className={`tab ${activeTab === 'presets' ? 'active' : ''}`}
                  onClick={() => setActiveTab('presets')}
                >
                  📋 预设模板
                </button>
                <button
                  className={`tab ${activeTab === 'drivers' ? 'active' : ''}`}
                  onClick={() => setActiveTab('drivers')}
                >
                  🔌 驱动状态
                </button>
                <button
                  className={`tab ${activeTab === 'alerts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('alerts')}
                >
                  🚨 异常提醒
                  {alerts.length > 0 && (
                    <span className="tab-badge">{alerts.length}</span>
                  )}
                </button>
              </div>

              <div className="tab-content">
                {loading ? (
                  <div className="empty-state">
                    <div className="loading-spinner" />
                    <p>加载中...</p>
                  </div>
                ) : (
                  <>
                    {activeTab === 'parameters' && (
                      <ParameterPanel
                        parameters={parameters}
                        values={parameterValues}
                        disabled={!isConnected}
                        onChange={handleParameterChange}
                      />
                    )}

                    {activeTab === 'presets' && (
                      <PresetPanel
                        presets={presets}
                        disabled={!isConnected}
                        onApply={handleApplyPreset}
                        onCreateNew={() => setShowCreatePresetModal(true)}
                      />
                    )}

                    {activeTab === 'drivers' && driverInfo && (
                      <DriverStatus
                        driverInfo={driverInfo}
                        onRefresh={handleRefreshDriver}
                      />
                    )}

                    {activeTab === 'alerts' && (
                      <AlertCenter
                        alerts={alerts}
                        onDismiss={handleDismissAlert}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="content-body">
              <div className="empty-state">
                <div className="empty-state-icon">🎛️</div>
                <h3>选择一个设备</h3>
                <p>从左侧列表选择外设开始配置参数</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {showAlertModal && (
        <Modal
          title="🔔 异常提醒中心"
          onClose={() => setShowAlertModal(false)}
          width="600px"
        >
          <AlertCenter
            alerts={alerts}
            onDismiss={handleDismissAlert}
          />
        </Modal>
      )}

      {showCreatePresetModal && (
        <CreatePresetModal
          onClose={() => setShowCreatePresetModal(false)}
          onCreate={handleCreatePreset}
        />
      )}

      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast key={toast.id} type={toast.type} message={toast.message} />
        ))}
      </div>
    </div>
  );
}
