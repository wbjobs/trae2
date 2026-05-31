const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const logger = require('./logger');
const cacheManager = require('./cache_manager');
const streamValidator = require('./stream_validator');
const resourceScheduler = require('./resource_scheduler');
const callbackModule = require('./callback_module');
const transcodeManager = require('./transcode_manager');

const taskSchema = Joi.object({
    taskName: Joi.string().min(1).max(200).required(),
    sourceUrl: Joi.string().uri().required(),
    outputProfile: Joi.object({
        videoCodec: Joi.string().valid('h264', 'h265', 'av1', 'mpeg2').required(),
        audioCodec: Joi.string().valid('aac', 'mp3', 'ac3', 'opus').required(),
        resolution: Joi.object({
            width: Joi.number().integer().min(16).max(7680).required(),
            height: Joi.number().integer().min(16).max(4320).required()
        }).required(),
        videoBitrate: Joi.number().integer().min(100).max(50000).required(),
        audioBitrate: Joi.number().integer().min(16).max(1024).required(),
        frameRate: Joi.number().min(1).max(120).required(),
        format: Joi.string().valid('ts', 'rtmp', 'hls', 'dash', 'mp4').required()
    }).required(),
    priority: Joi.string().valid('high', 'normal', 'low').default('normal'),
    callbackUrl: Joi.string().uri().optional(),
    metadata: Joi.object().optional(),
    timeout: Joi.number().integer().min(60).max(86400).default(3600)
});

const taskQueueSchema = Joi.object({
    tasks: Joi.array().items(taskSchema).min(1).max(50).required()
});

const createResponse = (success, data = null, message = '', errorCode = null) => ({
    success,
    data,
    message,
    errorCode,
    timestamp: Date.now()
});

router.post('/tasks', async (req, res) => {
    const startTime = Date.now();
    const requestId = uuidv4();

    logger.info(`收到转码任务请求, 请求ID: ${requestId}`);

    try {
        const { error, value } = taskSchema.validate(req.body, { abortEarly: false });
        if (error) {
            const errors = error.details.map(d => d.message);
            logger.warn(`任务参数校验失败: ${JSON.stringify(errors)}`);
            return res.status(400).json(createResponse(false, null, '参数校验失败', 'VALIDATION_ERROR')).end();
        }

        const taskId = uuidv4();
        const taskData = {
            taskId,
            requestId,
            taskName: value.taskName,
            sourceUrl: value.sourceUrl,
            outputProfile: value.outputProfile,
            priority: value.priority || 'normal',
            callbackUrl: value.callbackUrl || null,
            metadata: value.metadata || {},
            timeout: value.timeout || 3600,
            status: 'pending',
            createTime: Date.now(),
            startTime: null,
            endTime: null,
            assignedServer: null,
            assignedInstance: null,
            progress: 0,
            error: null
        };

        const validationResult = await streamValidator.validateStream(taskData.sourceUrl, {
            checkTimeout: 5000,
            maxBitrate: 50000,
            minBitrate: 100
        });

        if (!validationResult.valid) {
            taskData.status = 'rejected';
            taskData.error = validationResult.error;
            await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);

            logger.warn(`码流校验失败, 任务ID: ${taskId}, 原因: ${validationResult.error}`);
            return res.status(200).json(createResponse(false, {
                taskId,
                status: 'rejected',
                error: validationResult.error
            }, '码流校验失败', 'STREAM_VALIDATION_FAILED')).end();
        }

        taskData.streamInfo = validationResult.streamInfo;

        const schedulingResult = await resourceScheduler.allocateResource(taskData);

        if (schedulingResult.success) {
            taskData.assignedServer = schedulingResult.serverId;
            taskData.assignedInstance = schedulingResult.instanceId;
            taskData.status = 'queued';

            await cacheManager.pushTask(taskData);
            await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);

            logger.info(`任务已创建并分配资源, 任务ID: ${taskId}, 服务器: ${schedulingResult.serverId}, 实例: ${schedulingResult.instanceId}`);

            return res.status(200).json(createResponse(true, {
                taskId,
                status: 'queued',
                priority: taskData.priority,
                assignedServer: schedulingResult.serverId,
                assignedInstance: schedulingResult.instanceId,
                estimatedStartTime: Date.now() + 5000,
                queuePosition: schedulingResult.queuePosition
            }, '任务已创建并进入队列')).end();
        } else {
            taskData.status = 'waiting';
            await cacheManager.pushTask(taskData);
            await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);

            logger.info(`任务已创建但无可用资源, 任务ID: ${taskId}, 原因: ${schedulingResult.reason}`);

            return res.status(200).json(createResponse(true, {
                taskId,
                status: 'waiting',
                priority: taskData.priority,
                waitReason: schedulingResult.reason,
                estimatedWaitTime: schedulingResult.estimatedWaitTime
            }, '任务已创建，等待资源分配')).end();
        }
    } catch (err) {
        logger.error(`任务创建异常: ${err.message}`, { stack: err.stack });
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.post('/tasks/batch', async (req, res) => {
    const requestId = uuidv4();
    logger.info(`收到批量转码任务请求, 请求ID: ${requestId}`);

    try {
        const { error, value } = taskQueueSchema.validate(req.body, { abortEarly: false });
        if (error) {
            const errors = error.details.map(d => d.message);
            logger.warn(`批量任务参数校验失败: ${JSON.stringify(errors)}`);
            return res.status(400).json(createResponse(false, null, '参数校验失败', 'VALIDATION_ERROR')).end();
        }

        const taskIds = [];
        const failedTasks = [];

        for (const taskInput of value.tasks) {
            try {
                const taskId = uuidv4();
                const taskData = {
                    taskId,
                    requestId,
                    taskName: taskInput.taskName,
                    sourceUrl: taskInput.sourceUrl,
                    outputProfile: taskInput.outputProfile,
                    priority: taskInput.priority || 'normal',
                    callbackUrl: taskInput.callbackUrl || null,
                    metadata: taskInput.metadata || {},
                    timeout: taskInput.timeout || 3600,
                    status: 'pending',
                    createTime: Date.now(),
                    startTime: null,
                    endTime: null,
                    assignedServer: null,
                    assignedInstance: null,
                    progress: 0,
                    error: null
                };

                await cacheManager.pushTask(taskData);
                await cacheManager.setCache(`transcode:task:result:${taskId}`, taskData, 86400);
                taskIds.push(taskId);
            } catch (taskErr) {
                failedTasks.push({
                    taskName: taskInput.taskName,
                    error: taskErr.message
                });
            }
        }

        return res.status(200).json(createResponse(true, {
            requestId,
            totalTasks: value.tasks.length,
            createdTasks: taskIds.length,
            taskIds,
            failedTasks
        }, `批量任务提交完成，成功${taskIds.length}个，失败${failedTasks.length}个`)).end();
    } catch (err) {
        logger.error(`批量任务创建异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.get('/tasks/:taskId', async (req, res) => {
    const { taskId } = req.params;
    logger.info(`查询任务状态, 任务ID: ${taskId}`);

    try {
        const taskResult = await cacheManager.getCache(`transcode:task:result:${taskId}`);
        if (!taskResult) {
            return res.status(404).json(createResponse(false, null, '任务不存在', 'TASK_NOT_FOUND')).end();
        }

        return res.status(200).json(createResponse(true, taskResult, '查询成功')).end();
    } catch (err) {
        logger.error(`查询任务状态异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.get('/tasks', async (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    logger.info(`查询任务列表, 状态: ${status || 'all'}, 限制: ${limit}, 偏移: ${offset}`);

    try {
        const allTasks = [];
        const keys = [];

        await new Promise((resolve, reject) => {
            cacheManager.client.keys('transcode:task:result:*', (err, result) => {
                if (err) reject(err);
                else {
                    keys.push(...result);
                    resolve();
                }
            });
        });

        for (const key of keys.slice(offset, offset + parseInt(limit))) {
            const task = await cacheManager.getCache(key);
            if (task && (!status || task.status === status)) {
                allTasks.push(task);
            }
        }

        return res.status(200).json(createResponse(true, {
            total: allTasks.length,
            tasks: allTasks
        }, '查询成功')).end();
    } catch (err) {
        logger.error(`查询任务列表异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.delete('/tasks/:taskId', async (req, res) => {
    const { taskId } = req.params;
    logger.info(`取消任务, 任务ID: ${taskId}`);

    try {
        const taskResult = await cacheManager.getCache(`transcode:task:result:${taskId}`);
        if (!taskResult) {
            return res.status(404).json(createResponse(false, null, '任务不存在', 'TASK_NOT_FOUND')).end();
        }

        if (taskResult.status === 'running' || taskResult.status === 'queued' || taskResult.status === 'waiting') {
            const cancelled = await transcodeManager.cancelTask(taskId);
            if (!cancelled) {
                return res.status(409).json(createResponse(false, null, '任务正在处理中，请稍后重试', 'TASK_LOCKED')).end();
            }

            return res.status(200).json(createResponse(true, {
                taskId,
                status: 'cancelled'
            }, '任务已取消')).end();
        } else {
            return res.status(400).json(createResponse(false, null, `任务状态为${taskResult.status}，无法取消`, 'INVALID_STATUS')).end();
        }
    } catch (err) {
        logger.error(`取消任务异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.get('/tasks/:taskId/progress', async (req, res) => {
    const { taskId } = req.params;
    logger.info(`查询任务进度, 任务ID: ${taskId}`);

    try {
        const taskResult = await cacheManager.getCache(`transcode:task:result:${taskId}`);
        if (!taskResult) {
            return res.status(404).json(createResponse(false, null, '任务不存在', 'TASK_NOT_FOUND')).end();
        }

        return res.status(200).json(createResponse(true, {
            taskId,
            status: taskResult.status,
            progress: taskResult.progress || 0,
            startTime: taskResult.startTime,
            endTime: taskResult.endTime,
            estimatedRemaining: taskResult.status === 'running' ? Math.max(0, (taskResult.timeout || 3600) * 1000 - (Date.now() - (taskResult.startTime || Date.now()))) : null
        }, '查询成功')).end();
    } catch (err) {
        logger.error(`查询任务进度异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

router.get('/stats/overview', async (req, res) => {
    logger.info('查询系统概览统计');

    try {
        const servers = await cacheManager.getAllServerResources();
        const instances = await cacheManager.getAllInstanceStatuses();
        const highQueueLen = await cacheManager.getQueueLength('high');
        const normalQueueLen = await cacheManager.getQueueLength('normal');
        const lowQueueLen = await cacheManager.getQueueLength('low');

        const stats = {
            totalServers: servers.length,
            activeServers: servers.filter(s => s.status === 'online').length,
            totalInstances: instances.length,
            idleInstances: instances.filter(i => i.status === 'idle').length,
            runningInstances: instances.filter(i => i.status === 'running').length,
            taskQueues: {
                high: highQueueLen,
                normal: normalQueueLen,
                low: lowQueueLen
            },
            totalQueue: highQueueLen + normalQueueLen + lowQueueLen,
            lastUpdate: Date.now()
        };

        return res.status(200).json(createResponse(true, stats, '查询成功')).end();
    } catch (err) {
        logger.error(`查询统计异常: ${err.message}`);
        return res.status(500).json(createResponse(false, null, `服务器内部错误: ${err.message}`, 'INTERNAL_ERROR')).end();
    }
});

module.exports = router;
