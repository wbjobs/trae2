const redis = require('redis');
const EventEmitter = require('events');
const logger = require('./logger');
const config = require('./config');

const PRIORITY_SCORES = {
    high: 3,
    normal: 2,
    low: 1
};

const TASK_RETRY_KEY = 'transcode:task:retry';
const TASK_RETRY_LIMIT = 3;
const TASK_RETRY_DELAY = 30000;

class CacheManager extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            const redisOptions = {
                host: config.redis.host,
                port: config.redis.port,
                db: config.redis.db,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        logger.error(`Redis连接被拒绝: ${options.error.message}`);
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        logger.error('Redis重试时间超过限制');
                        return new Error('Redis重试时间耗尽');
                    }
                    if (options.attempt > this.maxReconnectAttempts) {
                        logger.error(`Redis重试次数超过限制: ${options.attempt}`);
                        return undefined;
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            };

            if (config.redis.password) {
                redisOptions.password = config.redis.password;
            }

            this.client = redis.createClient(redisOptions);

            this.client.on('connect', () => {
                logger.info('Redis客户端已连接');
            });

            this.client.on('ready', () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                logger.info('Redis客户端就绪');
                this.emit('ready');
            });

            this.client.on('error', (err) => {
                this.isConnected = false;
                logger.error(`Redis客户端错误: ${err.message}`);
                this.emit('error', err);
            });

            this.client.on('end', () => {
                this.isConnected = false;
                logger.warn('Redis客户端连接关闭');
                this.emit('end');
            });

            this.client.on('reconnecting', () => {
                this.reconnectAttempts++;
                logger.warn(`Redis重连中... 第${this.reconnectAttempts}次`);
            });

            resolve();
        });
    }

    checkConnection() {
        if (!this.isConnected || !this.client) {
            throw new Error('Redis客户端未连接');
        }
    }

    async pushTask(taskData) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const priority = taskData.priority || 'normal';
            const key = `${config.cache.taskQueueKey}:${priority}`;
            const taskString = JSON.stringify(taskData);
            this.client.lpush(key, taskString, (err, result) => {
                if (err) {
                    logger.error(`任务入队失败: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`任务已入队: ${taskData.taskId}, 优先级: ${priority}, 队列长度: ${result}`);
                    this.emit('taskQueued', taskData);
                    resolve(result);
                }
            });
        });
    }

    async pushTaskWithPriority(taskData, sortKey = null) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const priority = taskData.priority || 'normal';
            const key = `${config.cache.taskQueueKey}:sorted:${priority}`;
            const score = sortKey || PRIORITY_SCORES[priority] * 1000000000000 + (999999999999 - Date.now());
            const taskString = JSON.stringify(taskData);
            
            this.client.zadd(key, score, taskString, (err, result) => {
                if (err) {
                    logger.error(`优先级任务入队失败: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`优先级任务已入队: ${taskData.taskId}, 分数: ${score}`);
                    this.emit('taskQueued', taskData);
                    resolve(result);
                }
            });
        });
    }

    async popTask(priority = 'normal') {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskQueueKey}:${priority}`;
            this.client.rpop(key, (err, result) => {
                if (err) {
                    logger.error(`任务出队失败: ${err.message}`);
                    reject(err);
                } else {
                    const task = result ? JSON.parse(result) : null;
                    if (task) {
                        logger.info(`任务已出队: ${task.taskId}`);
                    }
                    resolve(task);
                }
            });
        });
    }

    async popPriorityTask(priority = 'normal') {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskQueueKey}:sorted:${priority}`;
            this.client.zrevrange(key, 0, 0, (err, results) => {
                if (err) {
                    logger.error(`优先级任务出队失败: ${err.message}`);
                    reject(err);
                } else if (results && results.length > 0) {
                    const taskString = results[0];
                    this.client.zrem(key, taskString, (removeErr) => {
                        if (removeErr) {
                            logger.error(`移除优先级任务失败: ${removeErr.message}`);
                            reject(removeErr);
                        } else {
                            const task = JSON.parse(taskString);
                            logger.info(`优先级任务已出队: ${task.taskId}`);
                            resolve(task);
                        }
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    async getPriorityQueueLength(priority = 'normal') {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskQueueKey}:sorted:${priority}`;
            this.client.zcard(key, (err, length) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(length);
                }
            });
        });
    }

    async getQueueLength(priority = 'normal') {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskQueueKey}:${priority}`;
            this.client.llen(key, (err, length) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(length);
                }
            });
        });
    }

    async getAllQueueLengths() {
        const priorities = ['high', 'normal', 'low'];
        const lengths = {};

        for (const priority of priorities) {
            lengths[priority] = await this.getPriorityQueueLength(priority);
        }

        return lengths;
    }

    async setTaskRetry(taskId, retryData) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${TASK_RETRY_KEY}:${taskId}`;
            const data = {
                ...retryData,
                taskId,
                retryCount: retryData.retryCount || 0,
                maxRetries: retryData.maxRetries || TASK_RETRY_LIMIT,
                nextRetryTime: retryData.nextRetryTime || Date.now(),
                lastError: retryData.lastError || null,
                createTime: Date.now()
            };

            this.client.setex(key, 86400, JSON.stringify(data), (err) => {
                if (err) {
                    logger.error(`设置任务重试失败: ${taskId}, 错误: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`任务重试已记录: ${taskId}, 重试次数: ${data.retryCount}/${data.maxRetries}`);
                    resolve(true);
                }
            });
        });
    }

    async getTaskRetry(taskId) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${TASK_RETRY_KEY}:${taskId}`;
            this.client.get(key, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result ? JSON.parse(result) : null);
                }
            });
        });
    }

    async deleteTaskRetry(taskId) {
        this.checkConnection();
        return new Promise((resolve) => {
            const key = `${TASK_RETRY_KEY}:${taskId}`;
            this.client.del(key, (err) => {
                if (err) {
                    logger.error(`删除任务重试记录失败: ${taskId}, 错误: ${err.message}`);
                } else {
                    logger.info(`任务重试记录已删除: ${taskId}`);
                }
                resolve(true);
            });
        });
    }

    async getRetryableTasks() {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const pattern = `${TASK_RETRY_KEY}:*`;
            this.client.keys(pattern, (err, keys) => {
                if (err) {
                    reject(err);
                } else if (keys.length === 0) {
                    resolve([]);
                } else {
                    this.client.mget(keys, (mgetErr, results) => {
                        if (mgetErr) {
                            reject(mgetErr);
                        } else {
                            const now = Date.now();
                            const retryableTasks = results
                                .map(r => r ? JSON.parse(r) : null)
                                .filter(r => r && r.retryCount < r.maxRetries && r.nextRetryTime <= now);
                            resolve(retryableTasks);
                        }
                    });
                }
            });
        });
    }

    async setRunningTask(taskId, taskData) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskRunningKey}:${taskId}`;
            this.client.setex(key, 3600, JSON.stringify(taskData), (err) => {
                if (err) {
                    logger.error(`设置运行中任务失败: ${taskId}, 错误: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`任务已标记为运行中: ${taskId}`);
                    this.emit('taskRunning', taskId, taskData);
                    resolve(true);
                }
            });
        });
    }

    async getRunningTask(taskId) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskRunningKey}:${taskId}`;
            this.client.get(key, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result ? JSON.parse(result) : null);
                }
            });
        });
    }

    async removeRunningTask(taskId) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.taskRunningKey}:${taskId}`;
            this.client.del(key, (err) => {
                if (err) {
                    logger.error(`删除运行中任务失败: ${taskId}, 错误: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`运行中任务已移除: ${taskId}`);
                    resolve(true);
                }
            });
        });
    }

    async updateServerResource(serverId, resourceData) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.serverResourceKey}:${serverId}`;
            const data = {
                ...resourceData,
                lastUpdate: Date.now()
            };
            this.client.setex(key, 60, JSON.stringify(data), (err) => {
                if (err) {
                    logger.error(`更新服务器资源失败: ${serverId}, 错误: ${err.message}`);
                    reject(err);
                } else {
                    logger.debug(`服务器资源已更新: ${serverId}`);
                    this.emit('resourceUpdated', serverId, data);
                    resolve(true);
                }
            });
        });
    }

    async getServerResource(serverId) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.serverResourceKey}:${serverId}`;
            this.client.get(key, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result ? JSON.parse(result) : null);
                }
            });
        });
    }

    async getAllServerResources() {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const pattern = `${config.cache.serverResourceKey}:*`;
            this.client.keys(pattern, (err, keys) => {
                if (err) {
                    reject(err);
                } else if (keys.length === 0) {
                    resolve([]);
                } else {
                    this.client.mget(keys, (err, results) => {
                        if (err) {
                            reject(err);
                        } else {
                            const resources = results.map((r, i) => ({
                                serverId: keys[i].replace(`${config.cache.serverResourceKey}:`, ''),
                                ...JSON.parse(r)
                            }));
                            resolve(resources);
                        }
                    });
                }
            });
        });
    }

    async setInstanceStatus(instanceId, status) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.instanceStatusKey}:${instanceId}`;
            const statusData = {
                ...status,
                lastUpdate: Date.now()
            };
            this.client.setex(key, 300, JSON.stringify(statusData), (err) => {
                if (err) {
                    logger.error(`更新转码实例状态失败: ${instanceId}, 错误: ${err.message}`);
                    reject(err);
                } else {
                    logger.debug(`转码实例状态已更新: ${instanceId}, 状态: ${status.status}`);
                    this.emit('instanceStatusUpdated', instanceId, statusData);
                    resolve(true);
                }
            });
        });
    }

    async getInstanceStatus(instanceId) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const key = `${config.cache.instanceStatusKey}:${instanceId}`;
            this.client.get(key, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result ? JSON.parse(result) : null);
                }
            });
        });
    }

    async getAllInstanceStatuses() {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const pattern = `${config.cache.instanceStatusKey}:*`;
            this.client.keys(pattern, (err, keys) => {
                if (err) {
                    reject(err);
                } else if (keys.length === 0) {
                    resolve([]);
                } else {
                    this.client.mget(keys, (err, results) => {
                        if (err) {
                            reject(err);
                        } else {
                            const statuses = results.map((r, i) => ({
                                instanceId: keys[i].replace(`${config.cache.instanceStatusKey}:`, ''),
                                ...JSON.parse(r)
                            }));
                            resolve(statuses);
                        }
                    });
                }
            });
        });
    }

    async setCache(key, value, ttl = 3600) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const cacheValue = typeof value === 'object' ? JSON.stringify(value) : value;
            this.client.setex(key, ttl, cacheValue, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async getCache(key) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            this.client.get(key, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    if (!result) {
                        resolve(null);
                        return;
                    }
                    try {
                        resolve(JSON.parse(result));
                    } catch (e) {
                        resolve(result);
                    }
                }
            });
        });
    }

    async deleteCache(key) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            this.client.del(key, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async publish(channel, message) {
        this.checkConnection();
        return new Promise((resolve, reject) => {
            const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
            this.client.publish(channel, messageStr, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    async subscribe(channel, callback) {
        this.checkConnection();
        const subscriber = this.client.duplicate();
        subscriber.subscribe(channel);
        subscriber.on('message', (ch, message) => {
            try {
                const parsed = JSON.parse(message);
                callback(null, parsed, ch);
            } catch (e) {
                callback(null, message, ch);
            }
        });
        return subscriber;
    }

    async close() {
        return new Promise((resolve) => {
            if (this.client) {
                this.client.quit(() => {
                    this.isConnected = false;
                    logger.info('Redis客户端已关闭');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new CacheManager();
