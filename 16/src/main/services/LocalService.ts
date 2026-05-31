import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS, APP_EVENTS } from '../../shared/constants';
import { deviceManager } from './DeviceManager';
import { DriverAdapterFactory } from '../drivers/DriverAdapter';
import { configPersistence } from '../config/ConfigPersistenceService';
import { alertService, HardwareAlert } from './HardwareAlertService';
import { isMacOS } from '../utils/platform';

export class LocalService {
  private mainWindow: BrowserWindow | null = null;
  private driverAdapter = DriverAdapterFactory.getAdapter();

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  registerIPCHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.LIST_DEVICES, async () => {
      const result = deviceManager.listDevices();
      return result.ok ? result.data : [];
    });

    ipcMain.handle(IPC_CHANNELS.CONNECT, async (_event, deviceId: string) => {
      const result = await deviceManager.connect(deviceId);
      return result.ok ? result.data : { deviceId, connected: false, error: result.message };
    });

    ipcMain.handle(IPC_CHANNELS.DISCONNECT, async (_event, deviceId: string) => {
      const result = await deviceManager.disconnect(deviceId);
      return result.ok ? result.data : false;
    });

    ipcMain.handle(IPC_CHANNELS.GET_PARAMETERS, async (_event, deviceId: string) => {
      if (!deviceManager.isConnected(deviceId)) {
        await deviceManager.connect(deviceId);
      }

      const devicesResult = deviceManager.listDevices();
      if (!devicesResult.ok) return [];

      const device = devicesResult.data.find((d) => d.id === deviceId);
      if (!device) return [];

      return deviceManager.getParameterDefinitions(device);
    });

    ipcMain.handle(IPC_CHANNELS.READ_PARAMETER, async (_event, deviceId: string, paramId: string) => {
      const result = await deviceManager.readParameter(deviceId, paramId);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.data;
    });

    ipcMain.handle(
      IPC_CHANNELS.WRITE_PARAMETER,
      async (_event, deviceId: string, paramId: string, value: number | boolean | string) => {
        const result = await deviceManager.writeParameter(deviceId, paramId, value);
        if (!result.ok) {
          throw new Error(result.message);
        }
        this.broadcastParameterChanged(deviceId, result.data);
        return result.data;
      },
    );

    ipcMain.handle(IPC_CHANNELS.BATCH_READ, async (_event, deviceId: string, paramIds?: string[]) => {
      const result = await deviceManager.batchRead(deviceId, paramIds);
      return result.ok ? result.data : [];
    });

    ipcMain.handle(
      IPC_CHANNELS.BATCH_WRITE,
      async (_event, deviceId: string, values: Array<{ id: string; value: number | boolean | string }>) => {
        const result = await deviceManager.batchWrite(deviceId, values);
        if (result.ok) {
          for (const param of result.data) {
            this.broadcastParameterChanged(deviceId, param);
          }
        }
        return result.ok ? result.data : [];
      },
    );

    ipcMain.handle(IPC_CHANNELS.GET_DRIVER_STATUS, async (_event, deviceId: string) => {
      const devicesResult = deviceManager.listDevices();
      if (!devicesResult.ok) {
        return { deviceId, status: 'unknown', driverName: 'Unknown' };
      }

      const device = devicesResult.data.find((d) => d.id === deviceId);
      if (!device) {
        return { deviceId, status: 'unknown', driverName: 'Unknown' };
      }

      const result = await this.driverAdapter.detectDriver(device);
      return result.ok ? result.data : { deviceId, status: 'error', driverName: 'Unknown', message: result.message };
    });

    ipcMain.handle(IPC_CHANNELS.REFRESH_DRIVERS, async () => {
      const devicesResult = deviceManager.listDevices();
      if (!devicesResult.ok) return [];

      const results = [];
      for (const device of devicesResult.data) {
        const result = await this.driverAdapter.detectDriver(device);
        if (result.ok) {
          results.push(result.data);
        }
      }
      return results;
    });

    ipcMain.handle(IPC_CHANNELS.EXPORT_CONFIG, async (_event, deviceId: string, filePath?: string) => {
      if (!filePath) {
        const result = await dialog.showSaveDialog(this.mainWindow!, {
          title: '导出配置',
          defaultPath: 'device-config.json',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          throw new Error('Export cancelled');
        }
        filePath = result.filePath;
      }

      const result = deviceManager.exportConfig(deviceId, filePath);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.data;
    });

    ipcMain.handle(IPC_CHANNELS.IMPORT_CONFIG, async (_event, filePath?: string) => {
      if (!filePath) {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
          title: '导入配置',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('Import cancelled');
        }
        filePath = result.filePaths[0];
      }

      const result = deviceManager.importConfig(filePath);
      if (!result.ok) {
        throw new Error(result.message);
      }

      if (deviceManager.isConnected(result.data.deviceId)) {
        await deviceManager.batchWrite(
          result.data.deviceId,
          result.data.parameters.map((p) => ({ id: p.id, value: p.value })),
        );
      }

      return result.data;
    });

    ipcMain.handle(IPC_CHANNELS.GET_PRESETS, async (_event, deviceId: string) => {
      return deviceManager.getPresets(deviceId);
    });

    ipcMain.handle(IPC_CHANNELS.APPLY_PRESET, async (_event, deviceId: string, presetId: string) => {
      const result = await deviceManager.applyPreset(deviceId, presetId);
      if (!result.ok) {
        throw new Error(result.message);
      }

      for (const param of result.data) {
        this.broadcastParameterChanged(deviceId, param);
      }

      return result.data;
    });

    ipcMain.handle(
      IPC_CHANNELS.CREATE_PRESET,
      async (_event, deviceId: string, name: string, description: string) => {
        const result = await deviceManager.createPresetFromCurrent(deviceId, name, description);
        if (!result.ok) {
          throw new Error(result.message);
        }
        return result.data;
      },
    );

    ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_ALERTS, async () => {
      return alertService.getActiveAlerts();
    });

    ipcMain.handle(IPC_CHANNELS.DISMISS_ALERT, async (_event, alertId: string) => {
      return alertService.dismiss(alertId);
    });

    ipcMain.handle(IPC_CHANNELS.ACKNOWLEDGE_ALERT, async (_event, alertId: string) => {
      return alertService.acknowledge(alertId);
    });
  }

  private broadcastParameterChanged(deviceId: string, param: { id: string; value: number | boolean | string }): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.ON_PARAMETER_CHANGED, deviceId, {
        id: param.id,
        value: param.value,
        updatedAt: Date.now(),
      });
    }
  }

  private broadcastAlert(alert: HardwareAlert): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.ON_ALERT, alert);
    }
  }

  broadcastDeviceEvent(event: string, payload: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.ON_DEVICE_EVENT, event, payload);
    }
  }

  setupDeviceEventForwarding(): void {
    deviceManager.on(APP_EVENTS.DEVICE_CONNECTED, (device) => {
      this.broadcastDeviceEvent(APP_EVENTS.DEVICE_CONNECTED, device);
    });

    deviceManager.on(APP_EVENTS.DEVICE_DISCONNECTED, (payload) => {
      this.broadcastDeviceEvent(APP_EVENTS.DEVICE_DISCONNECTED, payload);
    });

    deviceManager.on(APP_EVENTS.DEVICE_ERROR, (payload) => {
      this.broadcastDeviceEvent(APP_EVENTS.DEVICE_ERROR, payload);
    });

    deviceManager.on('alert', (alert: HardwareAlert) => {
      this.broadcastAlert(alert);
    });

    alertService.on('alert', (alert: HardwareAlert) => {
      this.broadcastAlert(alert);
    });
  }

  getDiagnosticInfo(): Record<string, unknown> {
    return {
      platform: process.platform,
      platformVersion: process.version,
      isMacOS: isMacOS(),
      profilesDir: configPersistence.getProfilesDir(),
      connectedDevices: deviceManager.listDevices().ok
        ? deviceManager
            .listDevices()
            .data!.filter((d) => deviceManager.isConnected(d.id))
            .map((d) => d.id)
        : [],
      poolStats: deviceManager.getPoolStats(),
    };
  }

  async shutdown(): Promise<void> {
    await deviceManager.closeAll();
    await configPersistence.flushAll();
  }
}

export const localService = new LocalService();
