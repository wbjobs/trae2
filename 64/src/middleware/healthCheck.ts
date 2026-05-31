import { Request, Response } from 'express';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';
import { taskScheduler } from '../task/scheduler';
import { callbackScheduler } from '../callback/scheduler';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    responseTime?: number;
    details?: Record<string, any>;
  }[];
  system: {
    memory: {
      used: number;
      total: number;
      usagePercent: number;
    };
    cpu: {
      usagePercent: number;
    };
    uptime: number;
  };
}

const startTime = Date.now();

export const checkRedisHealth = async (): Promise<{ status: 'healthy' | 'unhealthy'; message?: string; responseTime?: number }> => {
  const start = Date.now();
  try {
    const client = redisClient.getClient();
    if (!client) {
      return { status: 'unhealthy', message: 'Redis client not initialized' };
    }

    await client.ping();
    const responseTime = Date.now() - start;
    
    return {
      status: 'healthy',
      responseTime,
    };
  } catch (err) {
    logger.error('Redis健康检查失败', { error: err });
    return {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

export const checkTaskSchedulerHealth = async (): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string; details?: Record<string, any> }> => {
  try {
    const stats = taskScheduler.getStats();
    
    if (!taskScheduler.isRunning()) {
      return {
        status: 'unhealthy',
        message: 'Task scheduler is not running',
        details: stats,
      };
    }

    if (stats.errorCount > 10) {
      return {
        status: 'degraded',
        message: 'High error count in task scheduler',
        details: stats,
      };
    }

    return {
      status: 'healthy',
      details: stats,
    };
  } catch (err) {
    logger.error('任务调度器健康检查失败', { error: err });
    return {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

export const checkCallbackSchedulerHealth = async (): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string; details?: Record<string, any> }> => {
  try {
    const stats = callbackScheduler.getStats();
    
    if (!callbackScheduler.isRunning()) {
      return {
        status: 'unhealthy',
        message: 'Callback scheduler is not running',
        details: stats,
      };
    }

    if (stats.failedDeliveries > 50) {
      return {
        status: 'degraded',
        message: 'High failed delivery count in callback scheduler',
        details: stats,
      };
    }

    return {
      status: 'healthy',
      details: stats,
    };
  } catch (err) {
    logger.error('回调调度器健康检查失败', { error: err });
    return {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

export const checkSystemHealth = (): { memory: { used: number; total: number; usagePercent: number }; cpu: { usagePercent: number }; uptime: number } => {
  const used = process.memoryUsage();
  const totalMemory = (used.heapTotal + used.external) / 1024 / 1024;
  const usedMemory = (used.heapUsed + used.external) / 1024 / 1024;
  
  return {
    memory: {
      used: Math.round(usedMemory * 100) / 100,
      total: Math.round(totalMemory * 100) / 100,
      usagePercent: Math.round((usedMemory / totalMemory) * 100 * 100) / 100,
    },
    cpu: {
      usagePercent: 0,
    },
    uptime: process.uptime(),
  };
};

export const performHealthCheck = async (): Promise<HealthCheckResult> => {
  const now = Date.now();
  const services = [];

  const redisHealth = await checkRedisHealth();
  services.push({
    name: 'redis',
    ...redisHealth,
  });

  const taskSchedulerHealth = await checkTaskSchedulerHealth();
  services.push({
    name: 'task_scheduler',
    ...taskSchedulerHealth,
  });

  const callbackSchedulerHealth = await checkCallbackSchedulerHealth();
  services.push({
    name: 'callback_scheduler',
    ...callbackSchedulerHealth,
  });

  const system = checkSystemHealth();

  const hasUnhealthy = services.some(s => s.status === 'unhealthy');
  const hasDegraded = services.some(s => s.status === 'degraded');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (hasUnhealthy) {
    overallStatus = 'unhealthy';
  } else if (hasDegraded) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    timestamp: now,
    uptime: now - startTime,
    services,
    system,
  };
};

export const healthCheckHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await performHealthCheck();
    
    const statusCode = result.status === 'healthy' ? 200 : (result.status === 'degraded' ? 200 : 503);
    
    res.status(statusCode).json(result);
  } catch (err) {
    logger.error('健康检查处理失败', { error: err });
    res.status(500).json({
      status: 'unhealthy',
      timestamp: Date.now(),
      message: err instanceof Error ? err.message : 'Health check failed',
    });
  }
};

export const livenessCheckHandler = (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'alive',
    timestamp: Date.now(),
    uptime: Date.now() - startTime,
  });
};

export const readinessCheckHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const redisHealth = await checkRedisHealth();
    
    if (redisHealth.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: Date.now(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: Date.now(),
        reason: 'Redis not available',
      });
    }
  } catch (err) {
    logger.error('就绪检查失败', { error: err });
    res.status(503).json({
      status: 'not_ready',
      timestamp: Date.now(),
      reason: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
