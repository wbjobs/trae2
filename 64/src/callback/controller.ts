import { Request, Response } from 'express';
import Joi from 'joi';
import { callbackService } from './service';
import { success, error, serverError } from '../utils/response';
import logger from '../utils/logger';

const subscriptionSchema = Joi.object({
  url: Joi.string().uri().required(),
  eventTypes: Joi.array()
    .items(Joi.string().valid('task_status_changed', 'data_received', 'device_status_changed', 'system_alert'))
    .required(),
  taskId: Joi.string().optional(),
  deviceId: Joi.string().optional(),
  secret: Joi.string().optional(),
});

export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = subscriptionSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    if (!req.user) {
      error(res, 401, '未授权', 401);
      return;
    }

    const subscription = await callbackService.createSubscription(req.body, req.user.userId);
    if (!subscription) {
      error(res, 500, '创建订阅失败', 500);
      return;
    }

    success(res, subscription, '订阅创建成功');
  } catch (err) {
    logger.error('创建订阅异常', { error: err });
    serverError(res, '创建订阅异常');
  }
};

export const getSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const subscription = await callbackService.getSubscription(id);

    if (!subscription) {
      error(res, 404, '订阅不存在', 404);
      return;
    }

    success(res, subscription);
  } catch (err) {
    logger.error('获取订阅信息异常', { error: err });
    serverError(res, '获取订阅信息异常');
  }
};

export const deleteSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await callbackService.deleteSubscription(id);

    if (!result) {
      error(res, 404, '订阅不存在或删除失败', 404);
      return;
    }

    success(res, null, '订阅已删除');
  } catch (err) {
    logger.error('删除订阅异常', { error: err });
    serverError(res, '删除订阅异常');
  }
};

export const getAllSubscriptions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const subscriptions = await callbackService.getAllSubscriptions();
    success(res, {
      items: subscriptions,
      total: subscriptions.length,
    });
  } catch (err) {
    logger.error('获取订阅列表异常', { error: err });
    serverError(res, '获取订阅列表异常');
  }
};

export const triggerTestEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventType, payload, taskId, deviceId } = req.body;

    if (!eventType) {
      error(res, 400, 'eventType 不能为空');
      return;
    }

    const event = await callbackService.createEvent(eventType, payload || {}, taskId, deviceId);
    if (!event) {
      error(res, 500, '创建测试事件失败', 500);
      return;
    }

    success(res, event, '测试事件已触发');
  } catch (err) {
    logger.error('触发测试事件异常', { error: err });
    serverError(res, '触发测试事件异常');
  }
};

export const processQueue = async (_req: Request, res: Response): Promise<void> => {
  try {
    await callbackService.processEventQueue();
    success(res, null, '事件队列处理已触发');
  } catch (err) {
    logger.error('手动处理事件队列异常', { error: err });
    serverError(res, '处理事件队列异常');
  }
};

export const retryFailed = async (_req: Request, res: Response): Promise<void> => {
  try {
    await callbackService.retryFailedDeliveries();
    success(res, null, '失败回调重试已触发');
  } catch (err) {
    logger.error('手动重试失败回调异常', { error: err });
    serverError(res, '重试失败回调异常');
  }
};
