import { Request, Response } from 'express';
import Joi from 'joi';
import { deviceService } from './service';
import { success, error, serverError } from '../utils/response';
import logger from '../utils/logger';

const registerSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  type: Joi.string().valid('weather_radar', 'data_receiver', 'signal_processor').required(),
  ip: Joi.string().required(),
  port: Joi.number().optional(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    altitude: Joi.number().required(),
  }).required(),
  capabilities: Joi.object({
    maxRange: Joi.number().required(),
    supportedScanModes: Joi.array().items(Joi.string()).required(),
    supportedDataTypes: Joi.array().items(Joi.string()).required(),
    frequencyBand: Joi.string().optional(),
    antennaDiameter: Joi.number().optional(),
  }).required(),
});

const heartbeatSchema = Joi.object({
  deviceId: Joi.string().required(),
  status: Joi.string().valid('online', 'offline', 'busy', 'error', 'maintenance').required(),
  metrics: Joi.object({
    cpuUsage: Joi.number().min(0).max(100).optional(),
    memoryUsage: Joi.number().min(0).max(100).optional(),
    diskUsage: Joi.number().min(0).max(100).optional(),
    networkIn: Joi.number().optional(),
    networkOut: Joi.number().optional(),
    temperature: Joi.number().optional(),
    uptime: Joi.number().optional(),
  }).optional(),
  currentTaskId: Joi.string().optional(),
  errorMessage: Joi.string().optional(),
});

const commandSchema = Joi.object({
  deviceId: Joi.string().required(),
  command: Joi.string().valid('start_scan', 'stop_scan', 'reboot', 'calibrate', 'self_check').required(),
  parameters: Joi.object().optional(),
});

export const registerDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = registerSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    const device = await deviceService.registerDevice(req.body);
    if (!device) {
      error(res, 500, '设备注册失败', 500);
      return;
    }

    success(res, device, '设备注册成功');
  } catch (err) {
    logger.error('设备注册异常', { error: err });
    serverError(res, '设备注册异常');
  }
};

export const heartbeat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = heartbeatSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    const device = await deviceService.heartbeat(req.body);
    if (!device) {
      error(res, 404, '设备不存在', 404);
      return;
    }

    const commands = await deviceService.getPendingCommands(req.body.deviceId);

    success(res, {
      device,
      pendingCommands: commands,
    }, '心跳更新成功');
  } catch (err) {
    logger.error('设备心跳异常', { error: err });
    serverError(res, '设备心跳异常');
  }
};

export const getDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const device = await deviceService.getDevice(id);

    if (!device) {
      error(res, 404, '设备不存在', 404);
      return;
    }

    success(res, device);
  } catch (err) {
    logger.error('获取设备信息异常', { error: err });
    serverError(res, '获取设备信息异常');
  }
};

export const getAllDevices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await deviceService.getAllDevices();
    success(res, {
      items: devices,
      total: devices.length,
    });
  } catch (err) {
    logger.error('获取设备列表异常', { error: err });
    serverError(res, '获取设备列表异常');
  }
};

export const getOnlineDevices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await deviceService.getOnlineDevices();
    success(res, {
      items: devices,
      total: devices.length,
    });
  } catch (err) {
    logger.error('获取在线设备列表异常', { error: err });
    serverError(res, '获取在线设备列表异常');
  }
};

export const sendCommand = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = commandSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    const result = await deviceService.sendCommand(req.body);
    if (!result.success) {
      error(res, 400, result.message);
      return;
    }

    success(res, result, '命令已发送');
  } catch (err) {
    logger.error('发送设备命令异常', { error: err });
    serverError(res, '发送设备命令异常');
  }
};

export const deleteDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await deviceService.deleteDevice(id);

    if (!result) {
      error(res, 404, '设备不存在或删除失败', 404);
      return;
    }

    success(res, null, '设备已删除');
  } catch (err) {
    logger.error('删除设备异常', { error: err });
    serverError(res, '删除设备异常');
  }
};

export const getDeviceStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await deviceService.getDeviceStats();
    success(res, stats);
  } catch (err) {
    logger.error('获取设备统计异常', { error: err });
    serverError(res, '获取设备统计异常');
  }
};

export const assignTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId, taskId } = req.body;

    if (!deviceId || !taskId) {
      error(res, 400, 'deviceId 和 taskId 不能为空');
      return;
    }

    const device = await deviceService.assignTask(deviceId, taskId);
    if (!device) {
      error(res, 404, '设备不存在或分配失败', 404);
      return;
    }

    success(res, device, '任务分配成功');
  } catch (err) {
    logger.error('分配任务到设备异常', { error: err });
    serverError(res, '分配任务到设备异常');
  }
};

export const releaseTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      error(res, 400, 'deviceId 不能为空');
      return;
    }

    const device = await deviceService.releaseTask(deviceId);
    if (!device) {
      error(res, 404, '设备不存在或释放失败', 404);
      return;
    }

    success(res, device, '任务释放成功');
  } catch (err) {
    logger.error('释放设备任务异常', { error: err });
    serverError(res, '释放设备任务异常');
  }
};
