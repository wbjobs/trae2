import { v4 as uuidv4 } from 'uuid';
import { ScanTask, TaskCreateRequest, TaskUpdateRequest, TaskQuery, TaskStatus, Priority, TaskTrace, TaskPriorityUpdateRequest, TaskTraceResult } from '../models/task';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';

const TASK_KEY_PREFIX = 'task:info:';
const TASK_QUEUE_KEY = 'task:queue';
const TASK_INDEX_KEY = 'task:index';
const TASK_LOCK_PREFIX = 'task:lock:';
const TASK_RUNNING_SET = 'task:running';
const TASK_TTL = 60 * 60 * 24 * 30;
const LOCK_TIMEOUT = 30000;
const MAX_QUEUE_LENGTH = 10000;
const MAX_CONCURRENT_TASKS = 50;
const DEFAULT_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_MAX_RETRY = 3;
const TASK_HEARTBEAT_TIMEOUT = 120000;

const priorityWeight: Record<Priority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

const priorityOrder: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

class TaskService {
  private processingTasks: Set<string> = new Set();

  async acquireLock(taskId: string, timeout = LOCK_TIMEOUT): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      
      const lockKey = `${TASK_LOCK_PREFIX}${taskId}`;
      const result = await client.set(lockKey, '1', 'PX', timeout, 'NX');
      return result === 'OK';
    } catch (err) {
      logger.error('获取任务锁失败', { taskId, error: err });
      return false;
    }
  }

  async releaseLock(taskId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;
      
      const lockKey = `${TASK_LOCK_PREFIX}${taskId}`;
      await client.del(lockKey);
    } catch (err) {
      logger.error('释放任务锁失败', { taskId, error: err });
    }
  }

  async getRunningTaskCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;
      return await client.scard(TASK_RUNNING_SET);
    } catch (err) {
      logger.error('获取运行中任务数量失败', { error: err });
      return 0;
    }
  }

  async addRunningTask(taskId: string): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      await client.sadd(TASK_RUNNING_SET, taskId);
      return true;
    } catch (err) {
      logger.error('添加运行中任务失败', { taskId, error: err });
      return false;
    }
  }

  async removeRunningTask(taskId: string): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      await client.srem(TASK_RUNNING_SET, taskId);
      return true;
    } catch (err) {
      logger.error('移除运行中任务失败', { taskId, error: err });
      return false;
    }
  }

  private addTrace(task: ScanTask, status: TaskStatus, details?: Record<string, any>): void {
    const trace: TaskTrace = {
      status,
      timestamp: Date.now(),
      details,
    };
    if (!task.traces) {
      task.traces = [];
    }
    task.traces.push(trace);
    
    if (task.traces.length > 100) {
      task.traces = task.traces.slice(-100);
    }
  }

  async createTask(request: TaskCreateRequest, createdBy: string): Promise<ScanTask | null> {
    try {
      const queueLength = await this.getQueueLength();
      if (queueLength >= MAX_QUEUE_LENGTH) {
        logger.error('任务队列已满，拒绝创建新任务', { queueLength, maxLength: MAX_QUEUE_LENGTH });
        return null;
      }

      const now = Date.now();
      const task: ScanTask = {
        id: uuidv4(),
        name: request.name,
        description: request.description,
        priority: request.priority,
        originalPriority: request.priority,
        status: 'pending',
        scanMode: request.scanMode,
        radarId: request.radarId,
        parameters: request.parameters,
        callbackUrl: request.callbackUrl,
        createdBy,
        createdAt: now,
        progress: 0,
        retryCount: 0,
        maxRetryCount: request.maxRetryCount ?? DEFAULT_MAX_RETRY,
        timeout: request.timeout ?? DEFAULT_TIMEOUT,
        deadline: now + (request.timeout ?? DEFAULT_TIMEOUT),
        traces: [],
        parentTaskId: request.parentTaskId,
        childTaskIds: [],
      };

      this.addTrace(task, 'pending', { createdBy, request: { name: request.name, scanMode: request.scanMode } });

      const taskKey = `${TASK_KEY_PREFIX}${task.id}`;
      const taskStr = JSON.stringify(task);

      await redisClient.set(taskKey, taskStr, TASK_TTL);
      await redisClient.lpush(TASK_INDEX_KEY, task.id);

      if (request.parentTaskId) {
        const parentTask = await this.getTask(request.parentTaskId);
        if (parentTask) {
          if (!parentTask.childTaskIds) {
            parentTask.childTaskIds = [];
          }
          parentTask.childTaskIds.push(task.id);
          await redisClient.set(`${TASK_KEY_PREFIX}${parentTask.id}`, JSON.stringify(parentTask), TASK_TTL);
        }
      }

      logger.info('扫描任务创建成功', {
        taskId: task.id,
        taskName: task.name,
        priority: task.priority,
        createdBy,
        parentTaskId: task.parentTaskId,
      });

      return task;
    } catch (err) {
      logger.error('创建扫描任务失败', { error: err, request, createdBy });
      return null;
    }
  }

  async updateTaskPriority(taskId: string, request: TaskPriorityUpdateRequest, updatedBy: string): Promise<ScanTask | null> {
    try {
      const locked = await this.acquireLock(taskId);
      if (!locked) {
        logger.warn('任务正在被处理，无法更新优先级', { taskId });
        return null;
      }

      try {
        const task = await this.getTask(taskId);
        if (!task) return null;

        const oldPriority = task.priority;
        task.priority = request.priority;

        this.addTrace(task, task.status, { 
          priorityChange: { from: oldPriority, to: request.priority },
          reason: request.reason,
          updatedBy,
        });

        const taskKey = `${TASK_KEY_PREFIX}${taskId}`;
        await redisClient.set(taskKey, JSON.stringify(task), TASK_TTL);

        if (task.status === 'queued') {
          await this.requeueTask(taskId);
        }

        logger.info('任务优先级已更新', { taskId, oldPriority, newPriority: request.priority, reason: request.reason });
        return task;
      } finally {
        await this.releaseLock(taskId);
      }
    } catch (err) {
      logger.error('更新任务优先级失败', { taskId, error: err });
      return null;
    }
  }

  private async requeueTask(taskId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;

      const task = await this.getTask(taskId);
      if (!task) return;

      const queueItems = await client.zrange(TASK_QUEUE_KEY, 0, -1);
      for (const itemStr of queueItems) {
        const item = JSON.parse(itemStr);
        if (item.taskId === taskId) {
          await client.zrem(TASK_QUEUE_KEY, itemStr);
          break;
        }
      }

      const queueItem = {
        taskId,
        priority: priorityWeight[task.priority],
        queuedAt: task.queuedAt || Date.now(),
      };

      await client.zadd(
        TASK_QUEUE_KEY, 
        queueItem.priority * 1000000000000 + (Date.now() - queueItem.queuedAt), 
        JSON.stringify(queueItem)
      );
    } catch (err) {
      logger.error('重新入队任务失败', { taskId, error: err });
    }
  }

  async queueTask(taskId: string): Promise<boolean> {
    try {
      const locked = await this.acquireLock(taskId, 5000);
      if (!locked) {
        logger.warn('任务正在被处理，跳过入队', { taskId });
        return false;
      }

      try {
        const task = await this.getTask(taskId);
        if (!task) return false;

        if (task.status !== 'pending') {
          logger.warn('任务状态不是pending，无法入队', { taskId, status: task.status });
          return false;
        }

        const queueLength = await this.getQueueLength();
        if (queueLength >= MAX_QUEUE_LENGTH) {
          logger.error('任务队列已满，无法入队', { taskId, queueLength });
          return false;
        }

        task.status = 'queued';
        task.queuedAt = Date.now();
        this.addTrace(task, 'queued', { queueLength: queueLength + 1 });
        await this.saveTask(task);

        const queueItem = {
          taskId,
          priority: priorityWeight[task.priority],
          queuedAt: task.queuedAt,
        };

        const client = redisClient.getClient();
        if (client) {
          await client.zadd(TASK_QUEUE_KEY, queueItem.priority * 1000000000000 + (Date.now() - queueItem.queuedAt), JSON.stringify(queueItem));
        }

        logger.info('任务已加入队列', { taskId, priority: task.priority, queueLength: queueLength + 1 });
        return true;
      } finally {
        await this.releaseLock(taskId);
      }
    } catch (err) {
      logger.error('任务入队失败', { taskId, error: err });
      return false;
    }
  }

  async getTask(taskId: string): Promise<ScanTask | null> {
    try {
      const taskKey = `${TASK_KEY_PREFIX}${taskId}`;
      const taskStr = await redisClient.get(taskKey);
      if (!taskStr) return null;
      return JSON.parse(taskStr) as ScanTask;
    } catch (err) {
      logger.error('获取任务信息失败', { taskId, error: err });
      return null;
    }
  }

  private async saveTask(task: ScanTask): Promise<void> {
    const taskKey = `${TASK_KEY_PREFIX}${task.id}`;
    await redisClient.set(taskKey, JSON.stringify(task), TASK_TTL);
  }

  async updateTask(taskId: string, update: TaskUpdateRequest): Promise<ScanTask | null> {
    try {
      const locked = await this.acquireLock(taskId);
      if (!locked) {
        logger.warn('任务正在被处理，跳过更新', { taskId });
        return null;
      }

      try {
        const task = await this.getTask(taskId);
        if (!task) return null;

        if (task.status === update.status && update.progress === undefined) {
          return task;
        }

        const oldStatus = task.status;
        const updatedTask: ScanTask = { ...task, ...update };

        if (update.status === 'running' && !task.startedAt) {
          updatedTask.startedAt = Date.now();
          updatedTask.lastHeartbeat = Date.now();
          await this.addRunningTask(taskId);
          this.addTrace(updatedTask, 'running', { radarId: updatedTask.radarId });
        }
        if (update.status === 'completed' && !task.completedAt) {
          updatedTask.completedAt = Date.now();
          await this.removeRunningTask(taskId);
          this.processingTasks.delete(taskId);
          this.addTrace(updatedTask, 'completed', { 
            executionTime: updatedTask.completedAt - (updatedTask.startedAt || updatedTask.createdAt),
            progress: update.progress ?? 100,
          });
        }
        if (update.status === 'failed' && !task.failedAt) {
          updatedTask.failedAt = Date.now();
          await this.removeRunningTask(taskId);
          this.processingTasks.delete(taskId);
          this.addTrace(updatedTask, 'failed', { 
            error: update.errorMessage,
            errorCode: update.errorCode,
            executionTime: updatedTask.failedAt - (updatedTask.startedAt || updatedTask.createdAt),
          });
        }
        if (update.status === 'cancelled') {
          await this.removeRunningTask(taskId);
          this.processingTasks.delete(taskId);
          this.addTrace(updatedTask, 'cancelled', { reason: update.errorMessage || '手动取消' });
        }

        updatedTask.progress = update.progress !== undefined ? update.progress : task.progress;
        updatedTask.errorMessage = update.errorMessage || task.errorMessage;
        updatedTask.errorStack = update.errorStack || task.errorStack;
        updatedTask.errorCode = update.errorCode || task.errorCode;

        await this.saveTask(updatedTask);

        logger.info('任务状态更新', {
          taskId,
          oldStatus,
          newStatus: updatedTask.status,
          progress: updatedTask.progress,
        });

        return updatedTask;
      } finally {
        await this.releaseLock(taskId);
      }
    } catch (err) {
      logger.error('更新任务失败', { taskId, error: err });
      return null;
    }
  }

  async heartbeatTask(taskId: string): Promise<boolean> {
    try {
      const task = await this.getTask(taskId);
      if (!task) return false;

      if (task.status !== 'running') {
        logger.warn('任务不在运行状态，无法更新心跳', { taskId, status: task.status });
        return false;
      }

      task.lastHeartbeat = Date.now();
      await this.saveTask(task);
      
      logger.debug('任务心跳已更新', { taskId });
      return true;
    } catch (err) {
      logger.error('更新任务心跳失败', { taskId, error: err });
      return false;
    }
  }

  async checkTaskTimeout(): Promise<string[]> {
    try {
      const timedOutTasks: string[] = [];
      const client = redisClient.getClient();
      if (!client) return timedOutTasks;

      const taskIds = await client.smembers(TASK_RUNNING_SET);
      const now = Date.now();

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (!task) continue;

        const shouldTimeout = task.deadline && now > task.deadline;
        const heartbeatExpired = task.lastHeartbeat && (now - task.lastHeartbeat) > TASK_HEARTBEAT_TIMEOUT;

        if (shouldTimeout || heartbeatExpired) {
          logger.warn('任务超时', { 
            taskId, 
            reason: shouldTimeout ? '任务超时' : '心跳丢失',
            deadline: task.deadline,
            lastHeartbeat: task.lastHeartbeat,
          });

          await this.handleTaskTimeout(taskId, shouldTimeout ? '任务超时' : '任务心跳丢失');
          timedOutTasks.push(taskId);
        }
      }

      return timedOutTasks;
    } catch (err) {
      logger.error('检查任务超时失败', { error: err });
      return [];
    }
  }

  async handleTaskTimeout(taskId: string, reason: string): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) return;

      if (task.retryCount < task.maxRetryCount) {
        task.retryCount++;
        task.status = 'pending';
        task.startedAt = undefined;
        task.lastHeartbeat = undefined;
        task.deadline = Date.now() + (task.timeout || DEFAULT_TIMEOUT);
        
        this.addTrace(task, 'pending', { 
          timeoutRecovered: true,
          retryCount: task.retryCount,
          reason,
        });

        await this.saveTask(task);
        await this.removeRunningTask(taskId);
        
        logger.info('任务超时重试', { taskId, retryCount: task.retryCount, maxRetryCount: task.maxRetryCount });
        await this.queueTask(taskId);
      } else {
        task.status = 'failed';
        task.failedAt = Date.now();
        task.errorMessage = reason;
        task.errorCode = 'TASK_TIMEOUT';
        
        this.addTrace(task, 'failed', { 
          timeout: true,
          retryCount: task.retryCount,
          reason,
        });

        await this.saveTask(task);
        await this.removeRunningTask(taskId);
        this.processingTasks.delete(taskId);
        
        logger.error('任务超时且重试次数已用尽', { taskId, retryCount: task.retryCount });
      }
    } catch (err) {
      logger.error('处理任务超时失败', { taskId, error: err });
    }
  }

  async queryTasks(query: TaskQuery): Promise<ScanTask[]> {
    try {
      const results: ScanTask[] = [];
      const limit = Math.min(query.limit || 100, 500);
      const offset = query.offset || 0;

      const client = redisClient.getClient();
      if (!client) return [];

      const taskIds = await client.lrange(TASK_INDEX_KEY, offset, offset + limit - 1);

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (!task) continue;

        let match = true;

        if (query.status && task.status !== query.status) match = false;
        if (query.radarId && task.radarId !== query.radarId) match = false;
        if (query.priority && task.priority !== query.priority) match = false;
        if (query.createdBy && task.createdBy !== query.createdBy) match = false;
        if (query.startTime && task.createdAt < query.startTime) match = false;
        if (query.endTime && task.createdAt > query.endTime) match = false;

        if (match) {
          results.push(task);
        }
      }

      return results;
    } catch (err) {
      logger.error('查询任务列表失败', { query, error: err });
      return [];
    }
  }

  async getTaskTrace(taskId: string): Promise<TaskTraceResult | null> {
    try {
      const task = await this.getTask(taskId);
      if (!task) return null;

      const result: TaskTraceResult = {
        taskId: task.id,
        taskName: task.name,
        status: task.status,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        failedAt: task.failedAt,
        traces: task.traces || [],
        errorMessage: task.errorMessage,
        errorCode: task.errorCode,
        retryCount: task.retryCount,
        parentTaskId: task.parentTaskId,
        childTaskIds: task.childTaskIds,
      };

      if (task.completedAt) {
        result.executionTime = task.completedAt - (task.startedAt || task.createdAt);
      } else if (task.failedAt) {
        result.executionTime = task.failedAt - (task.startedAt || task.createdAt);
      }

      return result;
    } catch (err) {
      logger.error('获取任务追踪失败', { taskId, error: err });
      return null;
    }
  }

  async getTaskChain(taskId: string): Promise<TaskTraceResult[]> {
    try {
      const chain: TaskTraceResult[] = [];
      const visited = new Set<string>();

      const getChainRecursive = async (id: string): Promise<void> => {
        if (visited.has(id)) return;
        visited.add(id);

        const trace = await this.getTaskTrace(id);
        if (trace) {
          chain.push(trace);

          if (trace.childTaskIds) {
            for (const childId of trace.childTaskIds) {
              await getChainRecursive(childId);
            }
          }
        }
      };

      await getChainRecursive(taskId);
      return chain;
    } catch (err) {
      logger.error('获取任务链路失败', { taskId, error: err });
      return [];
    }
  }

  async cancelTask(taskId: string, reason?: string): Promise<boolean> {
    try {
      const locked = await this.acquireLock(taskId);
      if (!locked) {
        logger.warn('任务正在被处理，无法取消', { taskId });
        return false;
      }

      try {
        const task = await this.getTask(taskId);
        if (!task) return false;

        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
          logger.warn('任务已处于终止状态，无法取消', { taskId, status: task.status });
          return false;
        }

        await this.updateTask(taskId, { status: 'cancelled', errorMessage: reason || '手动取消' });
        await this.removeRunningTask(taskId);
        this.processingTasks.delete(taskId);
        
        logger.info('任务已取消', { taskId, reason });
        return true;
      } finally {
        await this.releaseLock(taskId);
      }
    } catch (err) {
      logger.error('取消任务失败', { taskId, error: err });
      return false;
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const taskKey = `${TASK_KEY_PREFIX}${taskId}`;
      await redisClient.del(taskKey);
      await this.removeRunningTask(taskId);
      this.processingTasks.delete(taskId);
      logger.info('任务已删除', { taskId });
      return true;
    } catch (err) {
      logger.error('删除任务失败', { taskId, error: err });
      return false;
    }
  }

  async getNextTask(): Promise<ScanTask | null> {
    try {
      const runningCount = await this.getRunningTaskCount();
      if (runningCount >= MAX_CONCURRENT_TASKS) {
        logger.debug('并发任务数已达上限，跳过任务分配', { runningCount, max: MAX_CONCURRENT_TASKS });
        return null;
      }

      const client = redisClient.getClient();
      if (!client) return null;

      const queueItems = await client.zrevrange(TASK_QUEUE_KEY, 0, 0);
      if (!queueItems || queueItems.length === 0) return null;

      const queueItem = JSON.parse(queueItems[0]);
      
      if (this.processingTasks.has(queueItem.taskId)) {
        logger.debug('任务正在处理中，跳过', { taskId: queueItem.taskId });
        return null;
      }

      const task = await this.getTask(queueItem.taskId);
      if (!task) {
        logger.warn('队列中的任务不存在，移除', { taskId: queueItem.taskId });
        await client.zrem(TASK_QUEUE_KEY, queueItems[0]);
        return null;
      }

      if (task.status !== 'queued') {
        logger.warn('任务状态不是queued，从队列移除', { taskId: queueItem.taskId, status: task.status });
        await client.zrem(TASK_QUEUE_KEY, queueItems[0]);
        return null;
      }

      this.processingTasks.add(queueItem.taskId);
      await client.zrem(TASK_QUEUE_KEY, queueItems[0]);

      return task;
    } catch (err) {
      logger.error('获取下一个任务失败', { error: err });
      return null;
    }
  }

  async getQueueLength(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;
      return await client.zcard(TASK_QUEUE_KEY);
    } catch (err) {
      logger.error('获取队列长度失败', { error: err });
      return 0;
    }
  }

  async getTaskStats(): Promise<Record<TaskStatus, number>> {
    try {
      const stats: Record<TaskStatus, number> = {
        pending: 0,
        queued: 0,
        assigned: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      const client = redisClient.getClient();
      if (!client) return stats;

      const taskIds = await client.lrange(TASK_INDEX_KEY, 0, 10000);

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (task && stats[task.status] !== undefined) {
          stats[task.status]++;
        }
      }

      return stats;
    } catch (err) {
      logger.error('获取任务统计失败', { error: err });
      return {
        pending: 0,
        queued: 0,
        assigned: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };
    }
  }

  async assignTaskToRadar(taskId: string, radarId: string): Promise<ScanTask | null> {
    try {
      const locked = await this.acquireLock(taskId);
      if (!locked) {
        logger.warn('任务正在被处理，无法分配', { taskId });
        return null;
      }

      try {
        const task = await this.getTask(taskId);
        if (!task) return null;

        if (task.status !== 'queued' && task.status !== 'assigned') {
          logger.warn('任务状态不允许分配', { taskId, status: task.status });
          return null;
        }

        task.radarId = radarId;
        task.assignedAt = Date.now();
        task.status = 'assigned';
        this.addTrace(task, 'assigned', { radarId });

        await this.saveTask(task);

        logger.info('任务已分配到雷达设备', { taskId, radarId });
        return task;
      } finally {
        await this.releaseLock(taskId);
      }
    } catch (err) {
      logger.error('分配任务到雷达失败', { taskId, radarId, error: err });
      return null;
    }
  }

  clearProcessingTask(taskId: string): void {
    this.processingTasks.delete(taskId);
  }

  getProcessingTaskCount(): number {
    return this.processingTasks.size;
  }

  async retryTask(taskId: string): Promise<ScanTask | null> {
    try {
      const task = await this.getTask(taskId);
      if (!task) return null;

      if (task.status !== 'failed') {
        logger.warn('只有失败的任务才能重试', { taskId, status: task.status });
        return null;
      }

      task.retryCount++;
      task.status = 'pending';
      task.failedAt = undefined;
      task.startedAt = undefined;
      task.lastHeartbeat = undefined;
      task.errorMessage = undefined;
      task.errorStack = undefined;
      task.errorCode = undefined;
      task.progress = 0;
      task.deadline = Date.now() + (task.timeout || DEFAULT_TIMEOUT);

      this.addTrace(task, 'pending', { 
        manualRetry: true,
        retryCount: task.retryCount,
      });

      await this.saveTask(task);
      
      logger.info('任务已手动重试', { taskId, retryCount: task.retryCount });
      await this.queueTask(taskId);
      
      return task;
    } catch (err) {
      logger.error('重试任务失败', { taskId, error: err });
      return null;
    }
  }
}

export const taskService = new TaskService();
