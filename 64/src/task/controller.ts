import { Request, Response } from 'express';
import Joi from 'joi';
import { taskService } from './service';
import { success, error, serverError } from '../utils/response';
import logger from '../utils/logger';
import { TaskQuery } from '../models/task';

const createTaskSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().max(500).optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').required(),
  scanMode: Joi.string().valid('PPI', 'RHI', 'VOL', 'SUR', 'MAN').required(),
  radarId: Joi.string().optional(),
  parameters: Joi.object({
    elevationAngles: Joi.array().items(Joi.number()).optional(),
    azimuthStart: Joi.number().optional(),
    azimuthEnd: Joi.number().optional(),
    azimuthStep: Joi.number().optional(),
    range: Joi.number().required(),
    resolution: Joi.number().required(),
    dataTypes: Joi.array()
      .items(Joi.string().valid('reflectivity', 'velocity', 'spectrum_width', 'differential_reflectivity', 'correlation_coefficient'))
      .required(),
    pulseWidth: Joi.number().optional(),
    prf: Joi.number().optional(),
    numberOfSamples: Joi.number().optional(),
  }).required(),
  callbackUrl: Joi.string().uri().optional(),
});

const updateTaskSchema = Joi.object({
  status: Joi.string().valid('pending', 'queued', 'assigned', 'running', 'paused', 'completed', 'failed', 'cancelled').optional(),
  progress: Joi.number().min(0).max(100).optional(),
  errorMessage: Joi.string().optional(),
});

export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = createTaskSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    if (!req.user) {
      error(res, 401, '未授权', 401);
      return;
    }

    const task = await taskService.createTask(req.body, req.user.userId);
    if (!task) {
      error(res, 500, '创建任务失败', 500);
      return;
    }

    success(res, task, '任务创建成功');
  } catch (err) {
    logger.error('创建任务异常', { error: err });
    serverError(res, '创建任务异常');
  }
};

export const queueTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await taskService.queueTask(id);

    if (!result) {
      error(res, 404, '任务不存在或入队失败', 404);
      return;
    }

    success(res, null, '任务已加入队列');
  } catch (err) {
    logger.error('任务入队异常', { error: err });
    serverError(res, '任务入队异常');
  }
};

export const getTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const task = await taskService.getTask(id);

    if (!task) {
      error(res, 404, '任务不存在', 404);
      return;
    }

    success(res, task);
  } catch (err) {
    logger.error('获取任务异常', { error: err });
    serverError(res, '获取任务异常');
  }
};

export const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error: validationError } = updateTaskSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    const task = await taskService.updateTask(id, req.body);
    if (!task) {
      error(res, 404, '任务不存在或更新失败', 404);
      return;
    }

    success(res, task, '任务更新成功');
  } catch (err) {
    logger.error('更新任务异常', { error: err });
    serverError(res, '更新任务异常');
  }
};

export const queryTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: TaskQuery = {
      status: req.query.status as any,
      radarId: req.query.radarId as string,
      priority: req.query.priority as any,
      createdBy: req.query.createdBy as string,
      startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const tasks = await taskService.queryTasks(query);
    success(res, {
      items: tasks,
      total: tasks.length,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    logger.error('查询任务列表异常', { error: err });
    serverError(res, '查询任务列表异常');
  }
};

export const cancelTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await taskService.cancelTask(id);

    if (!result) {
      error(res, 400, '任务取消失败，任务可能已处于终止状态', 400);
      return;
    }

    success(res, null, '任务已取消');
  } catch (err) {
    logger.error('取消任务异常', { error: err });
    serverError(res, '取消任务异常');
  }
};

export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await taskService.deleteTask(id);

    if (!result) {
      error(res, 404, '任务不存在或删除失败', 404);
      return;
    }

    success(res, null, '任务已删除');
  } catch (err) {
    logger.error('删除任务异常', { error: err });
    serverError(res, '删除任务异常');
  }
};

export const getTaskStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await taskService.getTaskStats();
    const queueLength = await taskService.getQueueLength();
    success(res, {
      statusStats: stats,
      queueLength,
    });
  } catch (err) {
    logger.error('获取任务统计异常', { error: err });
    serverError(res, '获取任务统计异常');
  }
};

export const getNextTask = async (_req: Request, res: Response): Promise<void> => {
  try {
    const task = await taskService.getNextTask();
    success(res, task);
  } catch (err) {
    logger.error('获取下一个任务异常', { error: err });
    serverError(res, '获取下一个任务异常');
  }
};
