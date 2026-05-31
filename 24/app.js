const express = require('express');
const http = require('http');
const logger = require('./logger');
const config = require('./config');
const cacheManager = require('./cache_manager');
const resourceScheduler = require('./resource_scheduler');
const streamValidator = require('./stream_validator');
const transcodeManager = require('./transcode_manager');
const callbackModule = require('./callback_module');
const taskRouter = require('./task_router');

class BroadcastTranscodeScheduler {
    constructor() {
        this.app = null;
        this.server = null;
        this.isRunning = false;
        this.shutdownHandlers = [];
    }

    async initialize() {
        logger.info('='.repeat(60));
        logger.info('广电信号码流转码调度API服务启动中...');
        logger.info('='.repeat(60));

        logger.info('初始化缓存管理器...');
        await cacheManager.initialize();

        logger.info('初始化资源调度模块...');
        await resourceScheduler.initialize();

        logger.info('初始化转码实例管理模块...');
        await transcodeManager.initialize();

        logger.info('初始化结果回调模块...');
        await callbackModule.initialize();

        logger.info('注册模块事件监听器...');
        this.registerEventListeners();

        logger.info('创建Express应用...');
        this.app = express();

        logger.info('配置中间件...');
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        logger.info('配置请求日志...');
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path} - IP: ${req.ip}`);
            next();
        });

        logger.info('配置健康检查端点...');
        this.app.get('/health', this.healthCheck.bind(this));

        logger.info('配置API路由...');
        this.app.use('/api/v1', taskRouter);

        logger.info('配置错误处理...');
        this.app.use((err, req, res, next) => {
            logger.error(`未捕获的异常: ${err.message}`, { stack: err.stack });
            res.status(500).json({
                success: false,
                error: '服务器内部错误',
                message: err.message
            });
        });

        logger.info('配置404处理...');
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: '接口不存在',
                path: req.path
            });
        });

        logger.info('创建HTTP服务器...');
        this.server = http.createServer(this.app);

        logger.info('服务器初始化完成');
    }

    registerEventListeners() {
        resourceScheduler.on('serverRegistered', (serverId, server) => {
            logger.info(`事件: 服务器注册 - ${serverId}`);
        });

        resourceScheduler.on('serverRemoved', (serverId, reason) => {
            logger.info(`事件: 服务器移除 - ${serverId}, 原因: ${reason}`);
        });

        resourceScheduler.on('instanceRegistered', (instanceId, instance) => {
            logger.info(`事件: 转码实例注册 - ${instanceId}, 服务器: ${instance.serverId}`);
        });

        resourceScheduler.on('instanceRemoved', (instanceId, reason) => {
            logger.info(`事件: 转码实例移除 - ${instanceId}, 原因: ${reason}`);
        });

        resourceScheduler.on('instanceError', (instanceId, instance) => {
            logger.error(`事件: 转码实例错误 - ${instanceId}, 错误: ${instance.error}`);
        });

        transcodeManager.on('taskStarted', (taskId, taskData) => {
            logger.info(`事件: 任务启动 - ${taskId}`);
        });

        transcodeManager.on('taskCompleted', (taskId, taskData) => {
            logger.info(`事件: 任务完成 - ${taskId}, 输出: ${taskData.outputUrl || 'N/A'}`);
        });

        transcodeManager.on('taskFailed', (taskId, taskData) => {
            logger.error(`事件: 任务失败 - ${taskId}, 错误: ${taskData.error}`);
        });

        transcodeManager.on('taskCancelled', (taskId, taskData) => {
            logger.info(`事件: 任务取消 - ${taskId}`);
        });

        transcodeManager.on('taskTimeout', (taskId, taskData) => {
            logger.warn(`事件: 任务超时 - ${taskId}`);
        });

        callbackModule.on('callbackSent', (callbackId, record) => {
            logger.debug(`事件: 回调已发送 - ${callbackId}`);
        });

        callbackModule.on('callbackFailed', (callbackId, record) => {
            logger.warn(`事件: 回调失败 - ${callbackId}, 错误: ${record.error}`);
        });

        callbackModule.on('callbackAcknowledged', (callbackId, record) => {
            logger.debug(`事件: 回调已确认 - ${callbackId}`);
        });

        cacheManager.on('taskQueued', (taskData) => {
            logger.debug(`事件: 任务入队 - ${taskData.taskId}`);
        });

        cacheManager.on('taskRunning', (taskId, taskData) => {
            logger.debug(`事件: 任务运行 - ${taskId}`);
        });

        logger.info('事件监听器注册完成');
    }

    async healthCheck(req, res) {
        const healthStatus = {
            status: 'healthy',
            timestamp: Date.now(),
            services: {
                cache: cacheManager.isConnected ? 'connected' : 'disconnected',
                scheduler: resourceScheduler.isInitialized ? 'ready' : 'not_ready',
                transcode: transcodeManager.isInitialized ? 'ready' : 'not_ready',
                callback: callbackModule.isInitialized ? 'ready' : 'not_ready'
            },
            stats: {
                runningTasks: transcodeManager.getRunningTaskCount(),
                pendingCallbacks: callbackModule.getPendingCallbackCount()
            }
        };

        const allHealthy = Object.values(healthStatus.services).every(s => s === 'connected' || s === 'ready');

        if (!allHealthy) {
            healthStatus.status = 'degraded';
            return res.status(503).json(healthStatus).end();
        }

        res.status(200).json(healthStatus).end();
    }

    async start() {
        return new Promise((resolve, reject) => {
            const port = config.server.port;
            const host = config.server.host;

            this.server.listen(port, host, () => {
                this.isRunning = true;
                logger.info('='.repeat(60));
                logger.info(`广电信号码流转码调度API服务已启动`);
                logger.info(`服务地址: http://${host}:${port}`);
                logger.info(`健康检查: http://${host}:${port}/health`);
                logger.info(`API文档: http://${host}:${port}/api/v1`);
                logger.info('='.repeat(60));

                this.logSystemInfo();

                resolve();
            });

            this.server.on('error', (err) => {
                logger.error(`服务器启动失败: ${err.message}`);
                reject(err);
            });
        });
    }

    logSystemInfo() {
        const systemStats = resourceScheduler.getSystemStats();
        const callbackStats = callbackModule.getCallbackStats();

        logger.info('系统状态概览:');
        logger.info(`  服务器总数: ${systemStats.totalServers}`);
        logger.info(`  在线服务器: ${systemStats.activeServers}`);
        logger.info(`  转码实例总数: ${systemStats.totalInstances}`);
        logger.info(`  空闲实例: ${systemStats.idleInstances}`);
        logger.info(`  运行中实例: ${systemStats.runningInstances}`);
        logger.info(`  待处理回调: ${callbackStats.pending}`);
        logger.info(`  Node.js版本: ${process.version}`);
        logger.info(`  内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }

    async gracefulShutdown(signal) {
        logger.info(`接收到关闭信号: ${signal}`);
        logger.info('开始优雅关闭...');

        this.isRunning = false;

        if (this.server) {
            this.server.close(() => {
                logger.info('HTTP服务器已关闭');
            });
        }

        logger.info('关闭转码实例管理模块...');
        await transcodeManager.shutdown();

        logger.info('关闭资源调度模块...');
        await resourceScheduler.shutdown();

        logger.info('关闭结果回调模块...');
        await callbackModule.shutdown();

        logger.info('关闭缓存管理器...');
        await cacheManager.close();

        logger.info('服务已优雅关闭');
        process.exit(0);
    }

    registerShutdownHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

        for (const signal of signals) {
            process.on(signal, async () => {
                await this.gracefulShutdown(signal);
            });
        }

        process.on('uncaughtException', (err) => {
            logger.error(`未捕获的异常: ${err.message}`, { stack: err.stack });
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error(`未处理的Promise拒绝: ${reason}`);
        });
    }
}

async function main() {
    const scheduler = new BroadcastTranscodeScheduler();

    scheduler.registerShutdownHandlers();

    try {
        await scheduler.initialize();
        await scheduler.start();
    } catch (err) {
        logger.error(`服务启动失败: ${err.message}`, { stack: err.stack });
        process.exit(1);
    }
}

main();
