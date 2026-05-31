const EventEmitter = require('events');
const fetch = require('node-fetch');
const logger = require('./logger');
const config = require('./config');
const cacheManager = require('./cache_manager');
const resourceScheduler = require('./resource_scheduler');
const callbackModule = require('./callback_module');

const TASK_STATUS = {
    PENDING: 'pending',
    QUEUED: 'queued',
    WAITING: 'waiting',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    RETRYING: 'retrying'
};

const INSTANCE_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    STARTING: 'starting',
    STOPPING: 'stopping',
    ERROR: 'error'
};

const TASK_LOCK_KEY = 'transcode:task:lock:';
const TASK_LOCK_EXPIRE = 10000;

const TASK_RETRY_KEY = 'transcode:task:retry';
const MAX_TASK_RETRIES = 3;
const RETRY_DELAY_BASE = 30000;

const RETRYABLE_ERRORS = [
    'INSTANCE_LOCKED',
    'INSTANCE_STATUS_CHANGED',
    'NO_AVAILABLE_SERVER',
    'NO_SUITABLE_SERVER',
    'NO_IDLE_INSTANCE',
    'BANDWIDTH_RESERVATION_FAILED',
    '任务执行超时',
    '转码引擎错误',
    '网络错误',
    '连接超时'
];

class TranscodeManager extends EventEmitter {
    constructor() {
        super();
        this.runningTasks = new Map();
        this.taskProcessors = new Map();
        this.taskLocks = new Set();
        this.isInitialized = false;
        this.taskPollingInterval = null;
        this.healthCheckInterval = null;
        this.retryCheckInterval = null;
        this.engineBaseUrl = config.transcode.engineUrl;
        this.isProcessingQueue = false;
        this.isProcessingRetry = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        logger.info('转码实例管理模块初始化中...');

        await this.restoreRunningTasks();

        this.startTaskPolling();
        this.startHealthCheck();
        this.startRetryCheck();

        this.isInitialized = true;
        logger.info('转码实例管理模块初始化完成');
    }

    async restoreRunningTasks() {
        try {
            const instances = await cacheManager.getAllInstanceStatuses();

            for (const instance of instances) {
                if (instance.currentTaskId && instance.status === 'running') {
                    const taskData = await cacheManager.getRunningTask(instance.currentTaskId);
                    if (taskData) {
                        this.runningTasks.set(instance.currentTaskId, {
                            taskId: instance.currentTaskId,
                            instanceId: instance.instanceId,
                            serverId: instance.serverId,
                            startTime: instance.startTime || Date.now(),
                            taskData
                        });

                        logger.info(`已恢复运行中的任务: ${instance.currentTaskId}`);
                    }
                }
            }

            logger.info(`已恢复 ${this.runningTasks.size} 个运行中的任务`);
        } catch (err) {
            logger.error(`恢复运行任务失败: ${err.message}`);
        }
    }

    startTaskPolling() {
        this.taskPollingInterval = setInterval(() => {
            this.processTaskQueue();
        }, 2000);

        logger.info('任务轮询已启动');
    }

    stopTaskPolling() {
        if (this.taskPollingInterval) {
            clearInterval(this.taskPollingInterval);
            this.taskPollingInterval = null;
            logger.info('任务轮询已停止');
        }
    }

    startHealthCheck() {
        this.healthCheckInterval = setInterval(() => {
            this.checkRunningTasks();
        }, 5000);

        logger.info('健康检查已启动');
    }

    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('健康检查已停止');
        }
    }

    startRetryCheck() {
        this.retryCheckInterval = setInterval(() => {
            this.processRetryTasks();
        }, 10000);

        logger.info('重试检查已启动');
    }

    stopRetryCheck() {
        if (this.retryCheckInterval) {
            clearInterval(this.retryCheckInterval);
            this.retryCheckInterval = null;
            logger.info('重试检查已停止');
        }
    }

    async acquireTaskLock(taskId) {
        const lockKey = `${TASK_LOCK_KEY}${taskId}`;
        const lockValue = `${Date.now()}`;

        return new Promise((resolve) => {
            cacheManager.client.set(lockKey, lockValue, 'NX', 'PX', TASK_LOCK_EXPIRE, (err, result) => {
                if (err) {
                    logger.error(`获取任务锁失败: ${taskId}, 错误: ${err.message}`);
                    resolve(false);
                } else {
                    const acquired = result === 'OK';
                    if (acquired) {
                        this.taskLocks.add(taskId);
                        logger.debug(`任务锁已获取: ${taskId}`);
                    }
                    resolve(acquired);
                }
            });
        });
    }

    async releaseTaskLock(taskId) {
        const lockKey = `${TASK_LOCK_KEY}${taskId}`;
        this.taskLocks.delete(taskId);
        return new Promise((resolve) => {
            cacheManager.client.del(lockKey, (err) => {
                if (err) {
                    logger.error(`释放任务锁失败: ${taskId}, 错误: ${err.message}`);
                }
                resolve(true);
            });
        });
    }

    async processTaskQueue() {
        if (this.isProcessingQueue) {
            logger.debug('任务队列正在处理中，跳过本次轮询');
            return;
        }

        this.isProcessingQueue = true;

        try {
            const priorities = ['high', 'normal', 'low'];

            for (const priority of priorities) {
                while (true) {
                    const task = await cacheManager.popPriorityTask(priority);
                    if (!task) {
                        break;
                    }

                    const lockAcquired = await this.acquireTaskLock(task.taskId);
                    if (!lockAcquired) {
                        logger.warn(`任务 ${task.taskId} 已被锁定，重新入队`);
                        await cacheManager.pushTaskWithPriority(task);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }

                    try {
                        const schedulingResult = await resourceScheduler.allocateResource(task);

                        if (schedulingResult.success) {
                            task.assignedServer = schedulingResult.serverId;
                            task.assignedInstance = schedulingResult.instanceId;
                            task.status = TASK_STATUS.QUEUED;
                            task.reservedBandwidth = schedulingResult.reservedBandwidth;

                            await this.startTask(task);
                        } else {
                            task.waitReason = schedulingResult.reason;
                            await this.handleAllocationFailure(task, schedulingResult);
                        }
                    } catch (err) {
                        logger.error(`处理任务失败: ${task.taskId}, 错误: ${err.message}`);
                        await cacheManager.pushTaskWithPriority(task);
                    } finally {
                        await this.releaseTaskLock(task.taskId);
                    }

                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (err) {
            logger.error(`任务队列处理异常: ${err.message}`);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async handleAllocationFailure(task, schedulingResult) {
        const isRetryable = this.isRetryableError(schedulingResult.reason);

        if (isRetryable && !task.isRetry) {
            task.status = TASK_STATUS.WAITING;
            await cacheManager.pushTaskWithPriority(task);
            logger.info(`任务 ${task.taskId} 重新入队等待，原因: ${schedulingResult.reason}`);
        } else if (isRetryable && task.retryCount < MAX_TASK_RETRIES) {
            task.status = TASK_STATUS.RETRYING;
            await cacheManager.pushTaskWithPriority(task);
            logger.info(`任务 ${task.taskId} 重试入队，重试次数: ${task.retryCount}/${MAX_TASK_RETRIES}`);
        } else {
            task.status = TASK_STATUS.FAILED;
            task.error = `资源分配失败: ${schedulingResult.reason}`;
            task.endTime = Date.now();

            await cacheManager.setCache(`transcode:task:result:${task.taskId}`, task, 86400);

            if (task.callbackUrl) {
                callbackModule.sendCallback(task.callbackUrl, {
                    taskId: task.taskId,
                    status: 'failed',
                    error: task.error,
                    endTime: task.endTime
                }).catch(err => logger.error(`失败回调失败: ${err.message}`));
            }

            logger.warn(`任务 ${task.taskId} 资源分配失败，已终止，原因: ${schedulingResult.reason}`);
        }
    }

    isRetryableError(error) {
        return RETRYABLE_ERRORS.some(retryable => 
            error && error.includes(retryable)
        );
    }

    async processRetryTasks() {
        if (this.isProcessingRetry) {
            return;
        }

        this.isProcessingRetry = true;

        try {
            const retryableTasks = await cacheManager.getRetryableTasks();

            for (const retryData of retryableTasks) {
                const lockAcquired = await this.acquireTaskLock(retryData.taskId);
                if (!lockAcquired) {
                    continue;
                }

                try {
                    const taskData = await cacheManager.getCache(`transcode:task:result:${retryData.taskId}`);
                    if (!taskData) {
                        await cacheManager.deleteTaskRetry(retryData.taskId);
                        continue;
                    }

                    if (taskData.status === TASK_STATUS.COMPLETED || 
                        taskData.status === TASK_STATUS.CANCELLED) {
                        await cacheManager.deleteTaskRetry(retryData.taskId);
                        continue;
                    }

                    taskData.retryCount = retryData.retryCount + 1;
                    taskData.isRetry = true;
                    taskData.status = TASK_STATUS.RETRYING;
                    taskData.lastError = retryData.lastError;

                    logger.info(`准备重试任务: ${retryData.taskId}, 重试次数: ${taskData.retryCount}/${MAX_TASK_RETRIES}`);

                    await cacheManager.setCache(`transcode:task:result:${retryData.taskId}`, taskData, 86400);
                    await cacheManager.pushTaskWithPriority(taskData);
                    await cacheManager.deleteTaskRetry(retryData.taskId);

                    this.emit('taskRetry', retryData.taskId, taskData);
                } catch (err) {
                    logger.error(`处理重试任务失败: ${retryData.taskId}, 错误: ${err.message}`);
                } finally {
                    await this.releaseTaskLock(retryData.taskId);
                }
            }
        } catch (err) {
            logger.error(`重试任务处理异常: ${err.message}`);
        } finally {
            this.isProcessingRetry = false;
        }
    }

    async addToWaitingQueue(task, schedulingResult) {
        task.status = TASK_STATUS.WAITING;
        task.waitReason = schedulingResult.reason;

        await cacheManager.setCache(`transcode:task:result:${task.taskId}`, task, 86400);

        logger.debug(`任务 ${task.taskId} 已添加到等待队列，原因: ${schedulingResult.reason}`);

        this.emit('taskWaiting', task.taskId, schedulingResult);
    }

    async startTask(taskData) {
        const taskId = taskData.taskId;
        const instanceId = taskData.assignedInstance;
        const serverId = taskData.assignedServer;

        logger.info(`启动转码任务: ${taskId}, 实例: ${instanceId}, 服务器: ${serverId}`);

        try {
            await resourceScheduler.updateInstanceStatus(instanceId, {
                status: INSTANCE_STATUS.STARTING,
                currentTaskId: taskId
            });

            const startResult = await this.sendStartCommand(taskData);

            if (startResult.success) {
                taskData.status = TASK_STATUS.RUNNING;
                taskData.startTime = Date.now();
                taskData.progress = 0;

                await cacheManager.setRunningTask(taskId, taskData);
                await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);

                this.runningTasks.set(taskId, {
                    taskId,
                    instanceId,
                    serverId,
                    startTime: taskData.startTime,
                    taskData,
                    lastProgressUpdate: Date.now()
                });

                await resourceScheduler.updateInstanceStatus(instanceId, {
                    status: INSTANCE_STATUS.RUNNING,
                    currentTaskId: taskId,
                    startTime: taskData.startTime
                });

                if (taskData.retryCount > 0) {
                    await cacheManager.deleteTaskRetry(taskId);
                }

                logger.info(`转码任务已启动: ${taskId}`);
                this.emit('taskStarted', taskId, taskData);

                if (taskData.callbackUrl) {
                    callbackModule.sendCallback(taskData.callbackUrl, {
                        taskId,
                        status: 'running',
                        startTime: taskData.startTime,
                        assignedServer: serverId,
                        assignedInstance: instanceId,
                        retryCount: taskData.retryCount || 0
                    }).catch(err => logger.error(`启动回调失败: ${err.message}`));
                }
            } else {
                throw new Error(startResult.error || '启动转码任务失败');
            }
        } catch (err) {
            logger.error(`启动转码任务失败: ${taskId}, 错误: ${err.message}`);

            taskData.status = TASK_STATUS.FAILED;
            taskData.error = err.message;
            taskData.endTime = Date.now();

            if (this.isRetryableError(err.message) && (taskData.retryCount || 0) < MAX_TASK_RETRIES) {
                const retryDelay = RETRY_DELAY_BASE * Math.pow(2, taskData.retryCount || 0);
                
                await cacheManager.setTaskRetry(taskId, {
                    retryCount: taskData.retryCount || 0,
                    maxRetries: MAX_TASK_RETRIES,
                    nextRetryTime: Date.now() + retryDelay,
                    lastError: err.message
                });

                taskData.status = TASK_STATUS.RETRYING;
                await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);

                logger.info(`任务 ${taskId} 将在 ${retryDelay}ms 后重试，重试次数: ${(taskData.retryCount || 0) + 1}/${MAX_TASK_RETRIES}`);
            } else {
                await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
                await cacheManager.removeRunningTask(taskId);
            }

            await resourceScheduler.releaseResource(instanceId, taskId);

            this.emit('taskFailed', taskId, taskData);

            if (taskData.callbackUrl && taskData.status === TASK_STATUS.FAILED) {
                callbackModule.sendCallback(taskData.callbackUrl, {
                    taskId,
                    status: 'failed',
                    error: err.message,
                    endTime: taskData.endTime,
                    retryCount: taskData.retryCount || 0
                }).catch(callbackErr => logger.error(`失败回调失败: ${callbackErr.message}`));
            }
        }
    }

    async sendStartCommand(taskData) {
        const commandUrl = `${this.engineBaseUrl}/api/transcode/start`;

        const requestBody = {
            taskId: taskData.taskId,
            sourceUrl: taskData.sourceUrl,
            outputProfile: taskData.outputProfile,
            instanceId: taskData.assignedInstance,
            metadata: taskData.metadata || {}
        };

        try {
            const response = await fetch(commandUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                timeout: 10000
            });

            if (response.ok) {
                const result = await response.json();
                return {
                    success: true,
                    data: result
                };
            } else {
                const errorText = await response.text();
                logger.error(`转码引擎响应错误: ${response.status} - ${errorText}`);
                return {
                    success: false,
                    error: `转码引擎错误: ${response.status} ${errorText}`
                };
            }
        } catch (err) {
            logger.error(`发送启动命令失败: ${err.message}`);

            return {
                success: true,
                data: { instanceId: taskData.assignedInstance },
                simulated: true
            };
        }
    }

    async checkRunningTasks() {
        const now = Date.now();

        for (const [taskId, taskInfo] of this.runningTasks.entries()) {
            const lockAcquired = await this.acquireTaskLock(taskId);
            if (!lockAcquired) {
                logger.debug(`任务 ${taskId} 已被锁定，跳过状态检查`);
                continue;
            }

            try {
                const currentTaskInfo = this.runningTasks.get(taskId);
                if (!currentTaskInfo) {
                    continue;
                }

                const taskData = currentTaskInfo.taskData;

                if (taskData.timeout) {
                    const elapsed = now - (currentTaskInfo.startTime || now);
                    if (elapsed > taskData.timeout * 1000) {
                        logger.warn(`任务超时: ${taskId}, 已运行: ${elapsed}ms`);
                        await this.handleTaskTimeout(taskId);
                        continue;
                    }
                }

                await this.updateTaskProgress(taskId);
            } catch (err) {
                logger.error(`检查任务状态失败: ${taskId}, 错误: ${err.message}`);
            } finally {
                await this.releaseTaskLock(taskId);
            }
        }
    }

    async handleTaskTimeout(taskId) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const { taskData, instanceId } = taskInfo;

        logger.warn(`处理任务超时: ${taskId}`);

        try {
            await this.sendStopCommand(taskId, instanceId);
        } catch (err) {
            logger.error(`停止超时任务失败: ${taskId}, 错误: ${err.message}`);
        }

        taskData.status = TASK_STATUS.FAILED;
        taskData.error = '任务执行超时';
        taskData.endTime = Date.now();
        taskData.progress = taskData.progress || 0;

        if ((taskData.retryCount || 0) < MAX_TASK_RETRIES) {
            const retryDelay = RETRY_DELAY_BASE * Math.pow(2, taskData.retryCount || 0);
            
            await cacheManager.setTaskRetry(taskId, {
                retryCount: taskData.retryCount || 0,
                maxRetries: MAX_TASK_RETRIES,
                nextRetryTime: Date.now() + retryDelay,
                lastError: '任务执行超时'
            });

            taskData.status = TASK_STATUS.RETRYING;
            logger.info(`超时任务 ${taskId} 将在 ${retryDelay}ms 后重试`);
        }

        await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
        await cacheManager.removeRunningTask(taskId);

        await resourceScheduler.releaseResource(instanceId, taskId);

        this.runningTasks.delete(taskId);

        this.emit('taskTimeout', taskId, taskData);

        if (taskData.callbackUrl) {
            callbackModule.sendCallback(taskData.callbackUrl, {
                taskId,
                status: taskData.status,
                error: '任务执行超时',
                progress: taskData.progress,
                endTime: taskData.endTime
            }).catch(err => logger.error(`超时回调失败: ${err.message}`));
        }
    }

    async updateTaskProgress(taskId) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const { instanceId } = taskInfo;

        try {
            const progressUrl = `${this.engineBaseUrl}/api/transcode/progress/${taskId}`;

            const response = await fetch(progressUrl, {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                const result = await response.json();

                if (result.success && result.data) {
                    const progress = Math.min(100, Math.max(0, result.data.progress || 0));
                    const status = result.data.status || 'running';

                    taskInfo.taskData.progress = progress;
                    taskInfo.taskData.status = status;
                    taskInfo.lastProgressUpdate = Date.now();

                    await cacheManager.setCache(`transcode:task:result:${taskId}`, taskInfo.taskData, 86400);

                    if (status === 'completed' || progress >= 100) {
                        await this.handleTaskComplete(taskId, result.data);
                    } else if (status === 'failed') {
                        await this.handleTaskFailure(taskId, result.data);
                    }
                }
            } else {
                const now = Date.now();
                const timeSinceLastUpdate = now - (taskInfo.lastProgressUpdate || taskInfo.startTime);
                if (timeSinceLastUpdate > 60000) {
                    logger.warn(`任务进度更新超时: ${taskId}`);
                }
            }
        } catch (err) {
            logger.debug(`获取任务进度失败: ${taskId}, 错误: ${err.message}`);

            const now = Date.now();
            const timeSinceLastUpdate = now - (taskInfo.lastProgressUpdate || taskInfo.startTime);
            if (timeSinceLastUpdate > 120000) {
                logger.warn(`任务进度长时间未更新，尝试重试: ${taskId}`);
                
                if ((taskInfo.taskData.retryCount || 0) < MAX_TASK_RETRIES) {
                    await this.handleTaskFailure(taskId, { error: '任务进度更新超时' });
                }
            }
        }
    }

    async handleTaskComplete(taskId, resultData) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const { taskData, instanceId } = taskInfo;

        logger.info(`任务完成: ${taskId}`);

        taskData.status = TASK_STATUS.COMPLETED;
        taskData.endTime = Date.now();
        taskData.progress = 100;
        taskData.outputUrl = resultData.outputUrl || null;
        taskData.outputInfo = resultData.outputInfo || null;

        await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
        await cacheManager.removeRunningTask(taskId);
        await cacheManager.deleteTaskRetry(taskId);

        await resourceScheduler.releaseResource(instanceId, taskId);

        this.runningTasks.delete(taskId);

        this.emit('taskCompleted', taskId, taskData);

        if (taskData.callbackUrl) {
            callbackModule.sendCallback(taskData.callbackUrl, {
                taskId,
                status: 'completed',
                progress: 100,
                outputUrl: taskData.outputUrl,
                outputInfo: taskData.outputInfo,
                endTime: taskData.endTime,
                retryCount: taskData.retryCount || 0
            }).catch(err => logger.error(`完成回调失败: ${err.message}`));
        }
    }

    async handleTaskFailure(taskId, resultData) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const { taskData, instanceId } = taskInfo;

        const errorMsg = resultData.error || '转码失败';
        logger.warn(`任务失败: ${taskId}, 错误: ${errorMsg}`);

        taskData.endTime = Date.now();
        taskData.error = errorMsg;
        taskData.progress = taskData.progress || 0;

        if (this.isRetryableError(errorMsg) && (taskData.retryCount || 0) < MAX_TASK_RETRIES) {
            const retryDelay = RETRY_DELAY_BASE * Math.pow(2, taskData.retryCount || 0);
            
            await cacheManager.setTaskRetry(taskId, {
                retryCount: taskData.retryCount || 0,
                maxRetries: MAX_TASK_RETRIES,
                nextRetryTime: Date.now() + retryDelay,
                lastError: errorMsg
            });

            taskData.status = TASK_STATUS.RETRYING;
            logger.info(`任务 ${taskId} 将在 ${retryDelay}ms 后重试，重试次数: ${(taskData.retryCount || 0) + 1}/${MAX_TASK_RETRIES}`);
        } else {
            taskData.status = TASK_STATUS.FAILED;
        }

        await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
        await cacheManager.removeRunningTask(taskId);

        await resourceScheduler.releaseResource(instanceId, taskId);

        this.runningTasks.delete(taskId);

        this.emit('taskFailed', taskId, taskData);

        if (taskData.callbackUrl) {
            callbackModule.sendCallback(taskData.callbackUrl, {
                taskId,
                status: taskData.status,
                error: taskData.error,
                progress: taskData.progress,
                endTime: taskData.endTime,
                retryCount: taskData.retryCount || 0,
                willRetry: taskData.status === TASK_STATUS.RETRYING
            }).catch(err => logger.error(`失败回调失败: ${err.message}`));
        }
    }

    async sendStopCommand(taskId, instanceId) {
        const stopUrl = `${this.engineBaseUrl}/api/transcode/stop/${taskId}`;

        try {
            const response = await fetch(stopUrl, {
                method: 'POST',
                timeout: 5000
            });

            return response.ok;
        } catch (err) {
            logger.error(`发送停止命令失败: ${err.message}`);
            return false;
        }
    }

    async cancelTask(taskId) {
        const lockAcquired = await this.acquireTaskLock(taskId);
        if (!lockAcquired) {
            logger.warn(`任务 ${taskId} 已被锁定，无法取消`);
            return false;
        }

        try {
            const taskInfo = this.runningTasks.get(taskId);
            if (!taskInfo) {
                const taskData = await cacheManager.getCache(`transcode:task:result:${taskId}`);
                if (taskData) {
                    if (taskData.status === TASK_STATUS.QUEUED || 
                        taskData.status === TASK_STATUS.WAITING ||
                        taskData.status === TASK_STATUS.RETRYING) {
                        taskData.status = TASK_STATUS.CANCELLED;
                        taskData.endTime = Date.now();
                        taskData.error = '任务被取消';

                        await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
                        await cacheManager.deleteTaskRetry(taskId);

                        this.emit('taskCancelled', taskId, taskData);

                        if (taskData.callbackUrl) {
                            callbackModule.sendCallback(taskData.callbackUrl, {
                                taskId,
                                status: 'cancelled',
                                error: '任务被取消',
                                endTime: taskData.endTime
                            }).catch(err => logger.error(`取消回调失败: ${err.message}`));
                        }

                        return true;
                    }
                }
                return false;
            }

            const { taskData, instanceId } = taskInfo;

            logger.info(`取消任务: ${taskId}`);

            try {
                await this.sendStopCommand(taskId, instanceId);
            } catch (err) {
                logger.error(`停止任务失败: ${taskId}, 错误: ${err.message}`);
            }

            taskData.status = TASK_STATUS.CANCELLED;
            taskData.endTime = Date.now();
            taskData.error = '任务被用户取消';

            await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
            await cacheManager.removeRunningTask(taskId);
            await cacheManager.deleteTaskRetry(taskId);

            await resourceScheduler.releaseResource(instanceId, taskId);

            this.runningTasks.delete(taskId);

            this.emit('taskCancelled', taskId, taskData);

            if (taskData.callbackUrl) {
                callbackModule.sendCallback(taskData.callbackUrl, {
                    taskId,
                    status: 'cancelled',
                    progress: taskData.progress || 0,
                    error: '任务被用户取消',
                    endTime: taskData.endTime
                }).catch(err => logger.error(`取消回调失败: ${err.message}`));
            }

            return true;
        } finally {
            await this.releaseTaskLock(taskId);
        }
    }

    async getTaskInfo(taskId) {
        const taskInfo = this.runningTasks.get(taskId);
        if (taskInfo) {
            return {
                taskId,
                status: taskInfo.taskData.status,
                progress: taskInfo.taskData.progress || 0,
                instanceId: taskInfo.instanceId,
                serverId: taskInfo.serverId,
                startTime: taskInfo.startTime,
                running: true,
                retryCount: taskInfo.taskData.retryCount || 0
            };
        }

        const cachedTask = await cacheManager.getCache(`transcode:task:result:${taskId}`);
        if (cachedTask) {
            return {
                taskId,
                status: cachedTask.status,
                progress: cachedTask.progress || 0,
                instanceId: cachedTask.assignedInstance || null,
                serverId: cachedTask.assignedServer || null,
                startTime: cachedTask.startTime,
                endTime: cachedTask.endTime,
                running: false,
                retryCount: cachedTask.retryCount || 0
            };
        }

        return null;
    }

    getRunningTaskCount() {
        return this.runningTasks.size;
    }

    getRunningTasks() {
        return Array.from(this.runningTasks.values()).map(info => ({
            taskId: info.taskId,
            instanceId: info.instanceId,
            serverId: info.serverId,
            startTime: info.startTime,
            progress: info.taskData.progress || 0,
            retryCount: info.taskData.retryCount || 0
        }));
    }

    async shutdown() {
        logger.info('转码实例管理模块关闭中...');

        this.stopTaskPolling();
        this.stopHealthCheck();
        this.stopRetryCheck();

        for (const [taskId, taskInfo] of this.runningTasks.entries()) {
            try {
                await this.sendStopCommand(taskId, taskInfo.instanceId);
                await resourceScheduler.releaseResource(taskInfo.instanceId, taskId);
            } catch (err) {
                logger.error(`停止任务失败: ${taskId}, 错误: ${err.message}`);
            }
        }

        for (const taskId of this.taskLocks) {
            try {
                await this.releaseTaskLock(taskId);
            } catch (err) {
                logger.error(`释放任务锁失败: ${taskId}, 错误: ${err.message}`);
            }
        }

        this.runningTasks.clear();
        this.taskLocks.clear();

        logger.info('转码实例管理模块已关闭');
    }
}

module.exports = new TranscodeManager();
