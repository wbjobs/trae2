import { v4 as uuidv4 } from 'uuid';
import {
  RadarDevice,
  DeviceRegisterRequest,
  DeviceHeartbeatRequest,
  DeviceCommandRequest,
  DeviceCommandResponse,
  DeviceStatus,
  DeviceMetrics,
} from '../models/device';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';

const DEVICE_KEY_PREFIX = 'device:info:';
const DEVICE_INDEX_KEY = 'device:index';
const DEVICE_LOCK_PREFIX = 'device:lock:';
const DEVICE_RESERVATION_PREFIX = 'device:reservation:';
const DEVICE_LOAD_PREFIX = 'device:load:';
const DEVICE_HEARTBEAT_TIMEOUT = 60000;
const LOCK_TIMEOUT = 30000;
const RESERVATION_TIMEOUT = 120000;
const LOAD_WEIGHT_CPU = 0.4;
const LOAD_WEIGHT_MEMORY = 0.3;
const LOAD_WEIGHT_NETWORK = 0.2;
const LOAD_WEIGHT_TASKS = 0.1;
const LOAD_HISTORY_SIZE = 5;

interface DeviceLoad {
  deviceId: string;
  cpuScore: number;
  memoryScore: number;
  networkScore: number;
  taskScore: number;
  totalScore: number;
  calculatedAt: number;
}

interface LoadHistory {
  scores: number[];
  average: number;
}

class DeviceService {
  private loadHistory: Map<string, LoadHistory> = new Map();

  async acquireDeviceLock(deviceId: string, timeout = LOCK_TIMEOUT): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      
      const lockKey = `${DEVICE_LOCK_PREFIX}${deviceId}`;
      const result = await client.set(lockKey, '1', 'PX', timeout, 'NX');
      return result === 'OK';
    } catch (err) {
      logger.error('获取设备锁失败', { deviceId, error: err });
      return false;
    }
  }

  async releaseDeviceLock(deviceId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;
      
      const lockKey = `${DEVICE_LOCK_PREFIX}${deviceId}`;
      await client.del(lockKey);
    } catch (err) {
      logger.error('释放设备锁失败', { deviceId, error: err });
    }
  }

  async reserveDevice(deviceId: string, taskId: string, timeout = RESERVATION_TIMEOUT): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      
      const reservationKey = `${DEVICE_RESERVATION_PREFIX}${deviceId}`;
      const existingReservation = await client.get(reservationKey);
      
      if (existingReservation) {
        const reservation = JSON.parse(existingReservation);
        if (reservation.taskId !== taskId) {
          logger.warn('设备已被其他任务预占', { deviceId, existingTaskId: reservation.taskId });
          return false;
        }
      }

      await client.set(
        reservationKey,
        JSON.stringify({ taskId, reservedAt: Date.now() }),
        'PX',
        timeout
      );
      
      logger.debug('设备预占成功', { deviceId, taskId });
      return true;
    } catch (err) {
      logger.error('预占设备失败', { deviceId, taskId, error: err });
      return false;
    }
  }

  async releaseDeviceReservation(deviceId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;
      
      const reservationKey = `${DEVICE_RESERVATION_PREFIX}${deviceId}`;
      await client.del(reservationKey);
      logger.debug('设备预占已释放', { deviceId });
    } catch (err) {
      logger.error('释放设备预占失败', { deviceId, error: err });
    }
  }

  async getDeviceReservation(deviceId: string): Promise<{ taskId: string; reservedAt: number } | null> {
    try {
      const client = redisClient.getClient();
      if (!client) return null;
      
      const reservationKey = `${DEVICE_RESERVATION_PREFIX}${deviceId}`;
      const reservationStr = await client.get(reservationKey);
      return reservationStr ? JSON.parse(reservationStr) : null;
    } catch (err) {
      logger.error('获取设备预占信息失败', { deviceId, error: err });
      return null;
    }
  }

  private calculateDeviceLoad(device: RadarDevice, currentTaskCount: number): DeviceLoad {
    const metrics = device.metrics || {} as DeviceMetrics;
    
    const cpuUsage = metrics.cpuUsage ?? 0;
    const memoryUsage = metrics.memoryUsage ?? 0;
    const networkUsage = metrics.networkUsage ?? 0;
    const taskLoad = Math.min(currentTaskCount / 5, 1) * 100;

    const cpuScore = cpuUsage * LOAD_WEIGHT_CPU;
    const memoryScore = memoryUsage * LOAD_WEIGHT_MEMORY;
    const networkScore = networkUsage * LOAD_WEIGHT_NETWORK;
    const taskScore = taskLoad * LOAD_WEIGHT_TASKS;

    const totalScore = cpuScore + memoryScore + networkScore + taskScore;

    this.updateLoadHistory(device.id, totalScore);

    return {
      deviceId: device.id,
      cpuScore,
      memoryScore,
      networkScore,
      taskScore,
      totalScore,
      calculatedAt: Date.now(),
    };
  }

  private updateLoadHistory(deviceId: string, score: number): void {
    let history = this.loadHistory.get(deviceId);
    if (!history) {
      history = { scores: [], average: 0 };
    }

    history.scores.push(score);
    if (history.scores.length > LOAD_HISTORY_SIZE) {
      history.scores.shift();
    }

    history.average = history.scores.reduce((a, b) => a + b, 0) / history.scores.length;
    this.loadHistory.set(deviceId, history);
  }

  getAverageLoad(deviceId: string): number {
    const history = this.loadHistory.get(deviceId);
    return history?.average ?? 0;
  }

  async getDeviceLoad(deviceId: string): Promise<DeviceLoad | null> {
    try {
      const device = await this.getDevice(deviceId);
      if (!device) return null;

      const client = redisClient.getClient();
      let currentTaskCount = 0;
      if (client) {
        const taskKey = `${DEVICE_LOAD_PREFIX}${deviceId}:tasks`;
        const taskCountStr = await client.get(taskKey);
        currentTaskCount = taskCountStr ? parseInt(taskCountStr) : 0;
      }

      return this.calculateDeviceLoad(device, currentTaskCount);
    } catch (err) {
      logger.error('获取设备负载失败', { deviceId, error: err });
      return null;
    }
  }

  async getAllDeviceLoads(): Promise<DeviceLoad[]> {
    try {
      const devices = await this.getAllDevices();
      const loads: DeviceLoad[] = [];

      for (const device of devices) {
        if (device.status !== 'offline') {
          const client = redisClient.getClient();
          let currentTaskCount = 0;
          if (client) {
            const taskKey = `${DEVICE_LOAD_PREFIX}${device.id}:tasks`;
            const taskCountStr = await client.get(taskKey);
            currentTaskCount = taskCountStr ? parseInt(taskCountStr) : 0;
          }
          loads.push(this.calculateDeviceLoad(device, currentTaskCount));
        }
      }

      loads.sort((a, b) => a.totalScore - b.totalScore);
      return loads;
    } catch (err) {
      logger.error('获取所有设备负载失败', { error: err });
      return [];
    }
  }

  async incrementDeviceTaskCount(deviceId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;

      const taskKey = `${DEVICE_LOAD_PREFIX}${deviceId}:tasks`;
      await client.incr(taskKey);
      await client.expire(taskKey, 3600);
    } catch (err) {
      logger.error('增加设备任务计数失败', { deviceId, error: err });
    }
  }

  async decrementDeviceTaskCount(deviceId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;

      const taskKey = `${DEVICE_LOAD_PREFIX}${deviceId}:tasks`;
      await client.decr(taskKey);
    } catch (err) {
      logger.error('减少设备任务计数失败', { deviceId, error: err });
    }
  }

  async selectDeviceByLoad(taskRequirements: { 
    supportedScanMode?: string; 
    supportedDataType?: string;
    preferredDeviceId?: string;
    maxLoadThreshold?: number;
  }): Promise<RadarDevice | null> {
    try {
      const availableDevices = await this.getAvailableDevices(taskRequirements);
      
      if (availableDevices.length === 0) {
        logger.warn('没有可用设备满足任务要求');
        return null;
      }

      if (taskRequirements.preferredDeviceId) {
        const preferredDevice = availableDevices.find(d => d.id === taskRequirements.preferredDeviceId);
        if (preferredDevice) {
          const load = await this.getDeviceLoad(preferredDevice.id);
          if (!load || load.totalScore < (taskRequirements.maxLoadThreshold ?? 80)) {
            logger.info('选择首选设备', { deviceId: preferredDevice.id });
            return preferredDevice;
          }
          logger.info('首选设备负载过高，选择其他设备', { deviceId: preferredDevice.id, load: load?.totalScore });
        }
      }

      const deviceLoads = await Promise.all(
        availableDevices.map(async (device) => {
          const load = await this.getDeviceLoad(device.id);
          return { device, load };
        })
      );

      const validLoads = deviceLoads.filter(
        ({ load }) => load && load.totalScore < (taskRequirements.maxLoadThreshold ?? 80)
      );

      if (validLoads.length === 0) {
        logger.warn('所有设备负载都超过阈值');
        return null;
      }

      validLoads.sort((a, b) => {
        if (!a.load || !b.load) return 0;
        return a.load.totalScore - b.load.totalScore;
      });

      const selectedDevice = validLoads[0].device;
      logger.info('根据负载选择设备', { 
        deviceId: selectedDevice.id, 
        load: validLoads[0].load?.totalScore 
      });
      
      return selectedDevice;
    } catch (err) {
      logger.error('按负载选择设备失败', { error: err });
      return null;
    }
  }

  async registerDevice(request: DeviceRegisterRequest): Promise<RadarDevice | null> {
    try {
      const locked = await this.acquireDeviceLock(request.id, 5000);
      if (!locked) {
        logger.warn('设备正在被处理，跳过注册', { deviceId: request.id });
        return null;
      }

      try {
        const now = Date.now();
        const device: RadarDevice = {
          ...request,
          status: 'online',
          lastHeartbeat: now,
          createdAt: now,
          updatedAt: now,
        };

        const deviceKey = `${DEVICE_KEY_PREFIX}${device.id}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        const client = redisClient.getClient();
        if (client) {
          await client.sadd(DEVICE_INDEX_KEY, device.id);
        }

        logger.info('设备注册成功', { deviceId: device.id, deviceName: device.name, ip: device.ip });
        return device;
      } finally {
        await this.releaseDeviceLock(request.id);
      }
    } catch (err) {
      logger.error('设备注册失败', { error: err, request });
      return null;
    }
  }

  async getDevice(deviceId: string): Promise<RadarDevice | null> {
    try {
      const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
      const deviceStr = await redisClient.get(deviceKey);
      if (!deviceStr) return null;

      const device = JSON.parse(deviceStr) as RadarDevice;

      if (Date.now() - device.lastHeartbeat > DEVICE_HEARTBEAT_TIMEOUT && device.status === 'online') {
        device.status = 'offline';
        await redisClient.set(deviceKey, JSON.stringify(device));
        logger.warn('设备心跳超时，状态已更新为离线', { deviceId });
      }

      return device;
    } catch (err) {
      logger.error('获取设备信息失败', { deviceId, error: err });
      return null;
    }
  }

  async heartbeat(request: DeviceHeartbeatRequest): Promise<RadarDevice | null> {
    try {
      const locked = await this.acquireDeviceLock(request.deviceId, 5000);
      if (!locked) {
        logger.warn('设备正在被处理，跳过心跳更新', { deviceId: request.deviceId });
        return null;
      }

      try {
        const device = await this.getDevice(request.deviceId);
        if (!device) {
          logger.warn('心跳设备不存在', { deviceId: request.deviceId });
          return null;
        }

        const oldStatus = device.status;
        device.status = request.status;
        device.lastHeartbeat = Date.now();
        device.updatedAt = Date.now();
        device.currentTaskId = request.currentTaskId;
        device.errorMessage = request.errorMessage;
        device.metrics = request.metrics;

        const deviceKey = `${DEVICE_KEY_PREFIX}${request.deviceId}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        if (oldStatus !== request.status) {
          logger.info('设备状态变更', {
            deviceId: request.deviceId,
            oldStatus,
            newStatus: request.status,
          });
        }

        logger.debug('设备心跳更新', { deviceId: request.deviceId, status: request.status });
        return device;
      } finally {
        await this.releaseDeviceLock(request.deviceId);
      }
    } catch (err) {
      logger.error('设备心跳处理失败', { error: err, request });
      return null;
    }
  }

  async getAllDevices(): Promise<RadarDevice[]> {
    try {
      const client = redisClient.getClient();
      if (!client) return [];

      const deviceIds = await client.smembers(DEVICE_INDEX_KEY);
      const devices: RadarDevice[] = [];

      for (const deviceId of deviceIds) {
        const device = await this.getDevice(deviceId);
        if (device) {
          devices.push(device);
        }
      }

      return devices;
    } catch (err) {
      logger.error('获取设备列表失败', { error: err });
      return [];
    }
  }

  async getOnlineDevices(): Promise<RadarDevice[]> {
    try {
      const devices = await this.getAllDevices();
      return devices.filter((d) => d.status === 'online' || d.status === 'busy');
    } catch (err) {
      logger.error('获取在线设备列表失败', { error: err });
      return [];
    }
  }

  async getAvailableDevices(taskRequirements?: { supportedScanMode?: string; supportedDataType?: string }): Promise<RadarDevice[]> {
    try {
      const devices = await this.getOnlineDevices();
      return devices.filter((d) => {
        if (d.status !== 'online') return false;
        if (d.currentTaskId) return false;
        
        if (taskRequirements?.supportedScanMode) {
          if (!d.capabilities.supportedScanModes.includes(taskRequirements.supportedScanMode)) {
            return false;
          }
        }
        
        if (taskRequirements?.supportedDataType) {
          if (!d.capabilities.supportedDataTypes.includes(taskRequirements.supportedDataType)) {
            return false;
          }
        }
        
        return true;
      });
    } catch (err) {
      logger.error('获取可用设备列表失败', { error: err });
      return [];
    }
  }

  async updateDeviceStatus(deviceId: string, status: DeviceStatus, errorMessage?: string): Promise<RadarDevice | null> {
    try {
      const locked = await this.acquireDeviceLock(deviceId);
      if (!locked) {
        logger.warn('设备正在被处理，无法更新状态', { deviceId });
        return null;
      }

      try {
        const device = await this.getDevice(deviceId);
        if (!device) return null;

        const oldStatus = device.status;
        device.status = status;
        device.updatedAt = Date.now();
        if (errorMessage) {
          device.errorMessage = errorMessage;
        }

        const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        logger.info('设备状态更新', { deviceId, oldStatus, newStatus: status });
        return device;
      } finally {
        await this.releaseDeviceLock(deviceId);
      }
    } catch (err) {
      logger.error('更新设备状态失败', { deviceId, error: err });
      return null;
    }
  }

  async sendCommand(request: DeviceCommandRequest): Promise<DeviceCommandResponse> {
    try {
      const device = await this.getDevice(request.deviceId);
      if (!device) {
        return {
          success: false,
          message: '设备不存在',
          commandId: uuidv4(),
          timestamp: Date.now(),
        };
      }

      if (device.status === 'offline') {
        return {
          success: false,
          message: '设备离线，无法发送命令',
          commandId: uuidv4(),
          timestamp: Date.now(),
        };
      }

      const commandKey = `device:command:${request.deviceId}:${uuidv4()}`;
      await redisClient.set(
        commandKey,
        JSON.stringify({
          command: request.command,
          parameters: request.parameters,
          sentAt: Date.now(),
        }),
        300,
      );

      logger.info('设备命令已发送', {
        deviceId: request.deviceId,
        command: request.command,
      });

      return {
        success: true,
        message: `命令 ${request.command} 已发送到设备`,
        commandId: commandKey.split(':').pop() || '',
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error('发送设备命令失败', { error: err, request });
      return {
        success: false,
        message: '发送命令失败',
        commandId: uuidv4(),
        timestamp: Date.now(),
      };
    }
  }

  async getPendingCommands(deviceId: string, maxCommands = 10): Promise<Array<{ command: string; parameters: Record<string, any>; sentAt: number }>> {
    try {
      const client = redisClient.getClient();
      if (!client) return [];

      const pattern = `device:command:${deviceId}:*`;
      const keys = await client.keys(pattern);
      const commands: Array<{ command: string; parameters: Record<string, any>; sentAt: number }> = [];

      for (let i = 0; i < Math.min(keys.length, maxCommands); i++) {
        const commandStr = await client.get(keys[i]);
        if (commandStr) {
          commands.push(JSON.parse(commandStr));
          await client.del(keys[i]);
        }
      }

      return commands;
    } catch (err) {
      logger.error('获取待处理命令失败', { deviceId, error: err });
      return [];
    }
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    try {
      const locked = await this.acquireDeviceLock(deviceId);
      if (!locked) {
        logger.warn('设备正在被处理，无法删除', { deviceId });
        return false;
      }

      try {
        const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
        await redisClient.del(deviceKey);

        const client = redisClient.getClient();
        if (client) {
          await client.srem(DEVICE_INDEX_KEY, deviceId);
          await client.del(`${DEVICE_LOAD_PREFIX}${deviceId}:tasks`);
        }

        await this.releaseDeviceReservation(deviceId);

        this.loadHistory.delete(deviceId);

        logger.info('设备已删除', { deviceId });
        return true;
      } finally {
        await this.releaseDeviceLock(deviceId);
      }
    } catch (err) {
      logger.error('删除设备失败', { deviceId, error: err });
      return false;
    }
  }

  async getDeviceStats(): Promise<{ 
    total: number; 
    online: number; 
    offline: number; 
    busy: number; 
    error: number; 
    maintenance: number; 
    available: number;
    averageLoad: number;
    overloadedDevices: string[];
  }> {
    try {
      const devices = await this.getAllDevices();
      const stats = {
        total: devices.length,
        online: 0,
        offline: 0,
        busy: 0,
        error: 0,
        maintenance: 0,
        available: 0,
        averageLoad: 0,
        overloadedDevices: [] as string[],
      };

      const loads = await this.getAllDeviceLoads();
      const loadMap = new Map(loads.map(l => [l.deviceId, l.totalScore]));
      
      if (loads.length > 0) {
        stats.averageLoad = loads.reduce((sum, l) => sum + l.totalScore, 0) / loads.length;
        stats.overloadedDevices = loads.filter(l => l.totalScore > 80).map(l => l.deviceId);
      }

      for (const device of devices) {
        if (device.status === 'online') {
          stats.online++;
          if (!device.currentTaskId) {
            stats.available++;
          }
        }
        else if (device.status === 'offline') stats.offline++;
        else if (device.status === 'busy') stats.busy++;
        else if (device.status === 'error') stats.error++;
        else if (device.status === 'maintenance') stats.maintenance++;
      }

      return stats;
    } catch (err) {
      logger.error('获取设备统计失败', { error: err });
      return {
        total: 0,
        online: 0,
        offline: 0,
        busy: 0,
        error: 0,
        maintenance: 0,
        available: 0,
        averageLoad: 0,
        overloadedDevices: [],
      };
    }
  }

  async assignTask(deviceId: string, taskId: string): Promise<RadarDevice | null> {
    try {
      const locked = await this.acquireDeviceLock(deviceId);
      if (!locked) {
        logger.warn('设备正在被处理，无法分配任务', { deviceId, taskId });
        return null;
      }

      try {
        const device = await this.getDevice(deviceId);
        if (!device) return null;

        if (device.status !== 'online') {
          logger.warn('设备状态不在线，无法分配任务', { deviceId, status: device.status });
          return null;
        }

        if (device.currentTaskId) {
          logger.warn('设备已有正在执行的任务', { deviceId, currentTaskId: device.currentTaskId });
          return null;
        }

        const reserved = await this.reserveDevice(deviceId, taskId);
        if (!reserved) {
          logger.warn('无法预占设备', { deviceId, taskId });
          return null;
        }

        device.currentTaskId = taskId;
        device.status = 'busy';
        device.updatedAt = Date.now();

        const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        await this.incrementDeviceTaskCount(deviceId);

        logger.info('设备已分配任务', { deviceId, taskId });
        return device;
      } finally {
        await this.releaseDeviceLock(deviceId);
      }
    } catch (err) {
      logger.error('分配任务到设备失败', { deviceId, taskId, error: err });
      return null;
    }
  }

  async releaseTask(deviceId: string, taskId?: string): Promise<RadarDevice | null> {
    try {
      const locked = await this.acquireDeviceLock(deviceId);
      if (!locked) {
        logger.warn('设备正在被处理，无法释放任务', { deviceId });
        return null;
      }

      try {
        const device = await this.getDevice(deviceId);
        if (!device) return null;

        if (taskId && device.currentTaskId !== taskId) {
          logger.warn('任务ID不匹配，无法释放', { deviceId, expectedTaskId: taskId, actualTaskId: device.currentTaskId });
          return null;
        }

        device.currentTaskId = undefined;
        device.status = 'online';
        device.updatedAt = Date.now();

        const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        await this.releaseDeviceReservation(deviceId);
        await this.decrementDeviceTaskCount(deviceId);

        logger.info('设备已释放任务', { deviceId, taskId: device.currentTaskId });
        return device;
      } finally {
        await this.releaseDeviceLock(deviceId);
      }
    } catch (err) {
      logger.error('释放设备任务失败', { deviceId, error: err });
      return null;
    }
  }

  async selectDeviceForTask(taskRequirements: { 
    supportedScanMode?: string; 
    supportedDataType?: string; 
    preferredDeviceId?: string;
    useLoadBalancing?: boolean;
    maxLoadThreshold?: number;
  }): Promise<RadarDevice | null> {
    try {
      if (taskRequirements.useLoadBalancing !== false) {
        const device = await this.selectDeviceByLoad(taskRequirements);
        if (device) {
          return device;
        }
      }

      const availableDevices = await this.getAvailableDevices(taskRequirements);
      
      if (availableDevices.length === 0) {
        logger.warn('没有可用设备满足任务要求');
        return null;
      }

      if (taskRequirements.preferredDeviceId) {
        const preferredDevice = availableDevices.find(d => d.id === taskRequirements.preferredDeviceId);
        if (preferredDevice) {
          return preferredDevice;
        }
      }

      availableDevices.sort((a, b) => {
        const loadA = this.getAverageLoad(a.id);
        const loadB = this.getAverageLoad(b.id);
        return loadA - loadB;
      });

      return availableDevices[0];
    } catch (err) {
      logger.error('选择设备失败', { error: err });
      return null;
    }
  }

  async gracefulDegradation(deviceId: string, reason: string): Promise<boolean> {
    try {
      const locked = await this.acquireDeviceLock(deviceId);
      if (!locked) {
        return false;
      }

      try {
        const device = await this.getDevice(deviceId);
        if (!device) return false;

        if (device.currentTaskId) {
          logger.warn('设备降级：正在进行任务优雅终止', { deviceId, currentTaskId: device.currentTaskId });
        }

        device.status = 'maintenance';
        device.errorMessage = reason;
        device.updatedAt = Date.now();

        const deviceKey = `${DEVICE_KEY_PREFIX}${deviceId}`;
        await redisClient.set(deviceKey, JSON.stringify(device));

        logger.info('设备已优雅降级', { deviceId, reason });
        return true;
      } finally {
        await this.releaseDeviceLock(deviceId);
      }
    } catch (err) {
      logger.error('设备优雅降级失败', { deviceId, error: err });
      return false;
    }
  }

  async getDevicePerformanceTrend(deviceId: string): Promise<{ current: number; average: number; trend: 'improving' | 'degrading' | 'stable' }> {
    try {
      const load = await this.getDeviceLoad(deviceId);
      if (!load) {
        return { current: 0, average: 0, trend: 'stable' };
      }

      const history = this.loadHistory.get(deviceId);
      const current = load.totalScore;
      const average = history?.average ?? current;

      let trend: 'improving' | 'degrading' | 'stable' = 'stable';
      if (history && history.scores.length >= 2) {
        const recent = history.scores.slice(-3);
        const trendValue = recent[recent.length - 1] - recent[0];
        if (trendValue > 5) trend = 'degrading';
        else if (trendValue < -5) trend = 'improving';
      }

      return { current, average, trend };
    } catch (err) {
      logger.error('获取设备性能趋势失败', { deviceId, error: err });
      return { current: 0, average: 0, trend: 'stable' };
    }
  }
}

export const deviceService = new DeviceService();
