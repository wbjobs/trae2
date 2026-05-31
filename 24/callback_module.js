const EventEmitter = require('events');
const fetch = require('node-fetch');
const logger = require('./logger');
const config = require('./config');
const cacheManager = require('./cache_manager');

const CALLBACK_STATUS = {
    PENDING: 'pending',
    SENT: 'sent',
    FAILED: 'failed',
    ACKNOWLEDGED: 'acknowledged',
    EXHAUSTED: 'exhausted'
};

const CALLBACK_PERSIST_KEY = 'transcode:callback:persist';
const CALLBACK_INDEX_KEY = 'transcode:callback:index';

class CallbackModule extends EventEmitter {
    constructor() {
        super();
        this.callbackQueue = new Map();
        this.retryQueue = new Map();
        this.isInitialized = false;
        this.callbackTimeout = config.callback.timeout;
        this.retryCount = config.callback.retryCount;
        this.retryDelay = config.callback.retryDelay;
        this.retryInterval = null;
        this.persistenceInterval = null;
        this.maxRetryDelay = 300000;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        logger.info('结果回调模块初始化中...');

        await this.loadCallbackQueue();
        await this.recoverFromPersistence();

        this.startRetryProcess();
        this.startPersistenceProcess();

        this.isInitialized = true;
        logger.info('结果回调模块初始化完成');
    }

    async loadCallbackQueue() {
        try {
            const keys = await this.getCallbackCacheKeys();

            for (const key of keys) {
                const callbackData = await cacheManager.getCache(key);
                if (callbackData && callbackData.status === CALLBACK_STATUS.PENDING) {
                    this.callbackQueue.set(callbackData.callbackId, callbackData);
                }
            }

            logger.info(`已加载 ${this.callbackQueue.size} 个待处理回调`);
        } catch (err) {
            logger.error(`加载回调队列失败: ${err.message}`);
        }
    }

    async getCallbackCacheKeys() {
        return new Promise((resolve, reject) => {
            cacheManager.client.keys('transcode:callback:*', (err, keys) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(keys || []);
                }
            });
        });
    }

    async persistCallback(callbackRecord) {
        try {
            const persistData = {
                ...callbackRecord,
                persistedAt: Date.now()
            };
            await cacheManager.setCache(
                `${CALLBACK_PERSIST_KEY}:${callbackRecord.callbackId}`,
                persistData,
                86400 * 7
            );

            await new Promise((resolve, reject) => {
                cacheManager.client.zadd(CALLBACK_INDEX_KEY, Date.now(), callbackRecord.callbackId, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            return true;
        } catch (err) {
            logger.error(`回调持久化失败: ${callbackRecord.callbackId}, 错误: ${err.message}`);
            return false;
        }
    }

    async recoverFromPersistence() {
        try {
            const recoveredCount = 0;

            const callbackIds = await new Promise((resolve, reject) => {
                cacheManager.client.zrange(CALLBACK_INDEX_KEY, 0, -1, (err, result) => {
                    if (err) reject(err);
                    else resolve(result || []);
                });
            });

            for (const callbackId of callbackIds) {
                const persisted = await cacheManager.getCache(`${CALLBACK_PERSIST_KEY}:${callbackId}`);
                if (persisted) {
                    if (persisted.status === CALLBACK_STATUS.PENDING ||
                        persisted.status === CALLBACK_STATUS.FAILED) {

                        if (persisted.retryCount < persisted.maxRetries) {
                            persisted.nextRetryTime = Date.now() + 5000;
                            this.retryQueue.set(callbackId, persisted);
                            this.callbackQueue.set(callbackId, persisted);
                            logger.info(`已从持久化恢复回调: ${callbackId}`);
                        } else {
                            persisted.status = CALLBACK_STATUS.EXHAUSTED;
                            await this.saveCallbackRecord(persisted);
                            logger.warn(`回调重试已耗尽，标记为耗尽: ${callbackId}`);
                        }
                    }
                }
            }

            logger.info(`从持久化恢复了 ${this.retryQueue.size} 个待重试回调`);
        } catch (err) {
            logger.error(`从持久化恢复失败: ${err.message}`);
        }
    }

    startPersistenceProcess() {
        this.persistenceInterval = setInterval(() => {
            this.persistAllPendingCallbacks();
        }, 30000);

        logger.info('回调持久化进程已启动');
    }

    stopPersistenceProcess() {
        if (this.persistenceInterval) {
            clearInterval(this.persistenceInterval);
            this.persistenceInterval = null;
            logger.info('回调持久化进程已停止');
        }
    }

    async persistAllPendingCallbacks() {
        const pendingCallbacks = [];

        for (const record of this.callbackQueue.values()) {
            if (record.status === CALLBACK_STATUS.PENDING ||
                record.status === CALLBACK_STATUS.FAILED) {
                pendingCallbacks.push(record);
            }
        }

        for (const record of pendingCallbacks) {
            await this.persistCallback(record);
        }

        if (pendingCallbacks.length > 0) {
            logger.debug(`已持久化 ${pendingCallbacks.length} 个待处理回调`);
        }
    }

    startRetryProcess() {
        this.retryInterval = setInterval(() => {
            this.processRetryQueue();
        }, 5000);

        logger.info('回调重试进程已启动');
    }

    stopRetryProcess() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
            logger.info('回调重试进程已停止');
        }
    }

    async sendCallback(callbackUrl, callbackData) {
        const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const callbackRecord = {
            callbackId,
            callbackUrl,
            data: callbackData,
            status: CALLBACK_STATUS.PENDING,
            retryCount: 0,
            maxRetries: this.retryCount,
            createTime: Date.now(),
            lastSendTime: null,
            response: null,
            error: null
        };

        this.callbackQueue.set(callbackId, callbackRecord);
        await this.saveCallbackRecord(callbackRecord);
        await this.persistCallback(callbackRecord);

        logger.info(`发送回调: ${callbackId}, URL: ${callbackUrl}`);

        try {
            const result = await this.executeCallback(callbackRecord);
            callbackRecord.status = result.success ? CALLBACK_STATUS.SENT : CALLBACK_STATUS.FAILED;
            callbackRecord.lastSendTime = Date.now();
            callbackRecord.response = result.response;
            callbackRecord.error = result.error;

            if (!result.success && callbackRecord.retryCount < callbackRecord.maxRetries) {
                callbackRecord.status = CALLBACK_STATUS.PENDING;
                callbackRecord.retryCount++;
                const delay = Math.min(
                    this.retryDelay * Math.pow(2, callbackRecord.retryCount - 1),
                    this.maxRetryDelay
                );
                callbackRecord.nextRetryTime = Date.now() + delay;
                this.retryQueue.set(callbackId, callbackRecord);

                logger.warn(`回调失败，计划重试: ${callbackId}, 重试次数: ${callbackRecord.retryCount}/${callbackRecord.maxRetries}, 下次重试: ${delay}ms后`);
            } else if (!result.success && callbackRecord.retryCount >= callbackRecord.maxRetries) {
                callbackRecord.status = CALLBACK_STATUS.EXHAUSTED;
                logger.error(`回调重试已耗尽: ${callbackId}`);
                this.emit('callbackExhausted', callbackId, callbackRecord);
            }

            await this.saveCallbackRecord(callbackRecord);
            await this.persistCallback(callbackRecord);

            this.emit(result.success ? 'callbackSent' : 'callbackFailed', callbackId, callbackRecord);

            return {
                success: result.success,
                callbackId,
                status: callbackRecord.status
            };
        } catch (err) {
            callbackRecord.status = CALLBACK_STATUS.FAILED;
            callbackRecord.lastSendTime = Date.now();
            callbackRecord.error = err.message;

            if (callbackRecord.retryCount < callbackRecord.maxRetries) {
                callbackRecord.status = CALLBACK_STATUS.PENDING;
                callbackRecord.retryCount++;
                const delay = Math.min(
                    this.retryDelay * Math.pow(2, callbackRecord.retryCount - 1),
                    this.maxRetryDelay
                );
                callbackRecord.nextRetryTime = Date.now() + delay;
                this.retryQueue.set(callbackId, callbackRecord);
            } else {
                callbackRecord.status = CALLBACK_STATUS.EXHAUSTED;
                this.emit('callbackExhausted', callbackId, callbackRecord);
            }

            logger.error(`回调异常: ${callbackId}, 错误: ${err.message}, 状态: ${callbackRecord.status}`);

            await this.saveCallbackRecord(callbackRecord);
            await this.persistCallback(callbackRecord);

            this.emit('callbackError', callbackId, callbackRecord, err);

            return {
                success: false,
                callbackId,
                status: callbackRecord.status,
                error: err.message
            };
        }
    }

    async executeCallback(callbackRecord) {
        const { callbackUrl, data } = callbackRecord;

        const requestBody = {
            ...data,
            callbackId: callbackRecord.callbackId,
            timestamp: Date.now()
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.callbackTimeout);

        try {
            const response = await fetch(callbackUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Callback-ID': callbackRecord.callbackId,
                    'X-Timestamp': Date.now().toString()
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
                timeout: this.callbackTimeout
            });

            clearTimeout(timeoutId);

            const responseText = await response.text();
            let responseData;

            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                responseData = { raw: responseText };
            }

            if (response.ok) {
                logger.info(`回调成功: ${callbackRecord.callbackId}, 状态码: ${response.status}`);

                return {
                    success: true,
                    response: {
                        statusCode: response.status,
                        data: responseData
                    }
                };
            } else {
                logger.warn(`回调响应错误: ${callbackRecord.callbackId}, 状态码: ${response.status}, 响应: ${responseText}`);

                return {
                    success: false,
                    error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
                    response: {
                        statusCode: response.status,
                        data: responseData
                    }
                };
            }
        } catch (err) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                logger.warn(`回调超时: ${callbackRecord.callbackId}, 超时时间: ${this.callbackTimeout}ms`);

                return {
                    success: false,
                    error: `回调超时 (${this.callbackTimeout}ms)`
                };
            }

            logger.error(`回调网络错误: ${callbackRecord.callbackId}, 错误: ${err.message}`);

            return {
                success: false,
                error: `网络错误: ${err.message}`
            };
        }
    }

    async processRetryQueue() {
        const now = Date.now();
        const toRemove = [];

        for (const [callbackId, callbackRecord] of this.retryQueue.entries()) {
            if (!callbackRecord.nextRetryTime || now >= callbackRecord.nextRetryTime) {
                try {
                    const result = await this.executeCallback(callbackRecord);
                    callbackRecord.lastSendTime = Date.now();
                    callbackRecord.response = result.response;
                    callbackRecord.error = result.error;

                    if (result.success) {
                        callbackRecord.status = CALLBACK_STATUS.SENT;
                        toRemove.push(callbackId);

                        logger.info(`回调重试成功: ${callbackId}`);
                        this.emit('callbackRetrySuccess', callbackId, callbackRecord);
                    } else {
                        callbackRecord.retryCount++;

                        if (callbackRecord.retryCount >= callbackRecord.maxRetries) {
                            callbackRecord.status = CALLBACK_STATUS.EXHAUSTED;
                            toRemove.push(callbackId);

                            logger.error(`回调重试耗尽: ${callbackId}, 已重试 ${callbackRecord.retryCount} 次`);
                            this.emit('callbackRetryExhausted', callbackId, callbackRecord);
                        } else {
                            const delay = Math.min(
                                this.retryDelay * Math.pow(2, callbackRecord.retryCount - 1),
                                this.maxRetryDelay
                            );
                            callbackRecord.nextRetryTime = Date.now() + delay;

                            logger.warn(`回调重试失败: ${callbackId}, 已重试 ${callbackRecord.retryCount}/${callbackRecord.maxRetries} 次, 下次重试: ${delay}ms后`);
                        }
                    }

                    await this.saveCallbackRecord(callbackRecord);
                    await this.persistCallback(callbackRecord);
                } catch (err) {
                    logger.error(`回调重试异常: ${callbackId}, 错误: ${err.message}`);

                    callbackRecord.retryCount++;
                    if (callbackRecord.retryCount >= callbackRecord.maxRetries) {
                        callbackRecord.status = CALLBACK_STATUS.EXHAUSTED;
                        toRemove.push(callbackId);
                        this.emit('callbackRetryExhausted', callbackId, callbackRecord);
                    } else {
                        const delay = Math.min(
                            this.retryDelay * Math.pow(2, callbackRecord.retryCount - 1),
                            this.maxRetryDelay
                        );
                        callbackRecord.nextRetryTime = Date.now() + delay;
                    }

                    await this.saveCallbackRecord(callbackRecord);
                    await this.persistCallback(callbackRecord);
                }
            }
        }

        for (const callbackId of toRemove) {
            this.retryQueue.delete(callbackId);
        }
    }

    async saveCallbackRecord(callbackRecord) {
        const cacheKey = `transcode:callback:${callbackRecord.callbackId}`;
        const ttl = 86400;

        await cacheManager.setCache(cacheKey, callbackRecord, ttl);
    }

    async getCallbackRecord(callbackId) {
        const cacheKey = `transcode:callback:${callbackId}`;
        return await cacheManager.getCache(cacheKey);
    }

    async acknowledgeCallback(callbackId) {
        const callbackRecord = this.callbackQueue.get(callbackId);
        if (!callbackRecord) {
            const cached = await this.getCallbackRecord(callbackId);
            if (cached) {
                cached.status = CALLBACK_STATUS.ACKNOWLEDGED;
                await this.saveCallbackRecord(cached);
                this.callbackQueue.delete(callbackId);
                return true;
            }
            return false;
        }

        callbackRecord.status = CALLBACK_STATUS.ACKNOWLEDGED;
        await this.saveCallbackRecord(callbackRecord);

        this.callbackQueue.delete(callbackId);
        this.retryQueue.delete(callbackId);

        logger.info(`回调已确认: ${callbackId}`);
        this.emit('callbackAcknowledged', callbackId, callbackRecord);

        return true;
    }

    async resendCallback(callbackId) {
        const callbackRecord = this.callbackQueue.get(callbackId);
        if (!callbackRecord) {
            const cached = await this.getCallbackRecord(callbackId);
            if (cached) {
                return await this.sendCallback(cached.callbackUrl, cached.data);
            }
            return { success: false, error: '回调记录不存在' };
        }

        return await this.sendCallback(callbackRecord.callbackUrl, callbackRecord.data);
    }

    getPendingCallbackCount() {
        return this.callbackQueue.size + this.retryQueue.size;
    }

    getCallbackStats() {
        let pendingCount = 0;
        let sentCount = 0;
        let failedCount = 0;
        let acknowledgedCount = 0;
        let exhaustedCount = 0;

        for (const record of this.callbackQueue.values()) {
            switch (record.status) {
                case CALLBACK_STATUS.PENDING:
                    pendingCount++;
                    break;
                case CALLBACK_STATUS.SENT:
                    sentCount++;
                    break;
                case CALLBACK_STATUS.FAILED:
                    failedCount++;
                    break;
                case CALLBACK_STATUS.ACKNOWLEDGED:
                    acknowledgedCount++;
                    break;
                case CALLBACK_STATUS.EXHAUSTED:
                    exhaustedCount++;
                    break;
            }
        }

        return {
            pending: pendingCount,
            sent: sentCount,
            failed: failedCount,
            acknowledged: acknowledgedCount,
            exhausted: exhaustedCount,
            retrying: this.retryQueue.size,
            total: this.callbackQueue.size
        };
    }

    async cleanupOldCallbacks(maxAge = 86400000) {
        const now = Date.now();
        const toRemove = [];

        for (const [callbackId, callbackRecord] of this.callbackQueue.entries()) {
            const age = now - callbackRecord.createTime;
            if (age > maxAge) {
                toRemove.push(callbackId);
            }
        }

        for (const callbackId of toRemove) {
            this.callbackQueue.delete(callbackId);
            this.retryQueue.delete(callbackId);
        }

        if (toRemove.length > 0) {
            logger.info(`已清理 ${toRemove.length} 个过期回调记录`);
        }

        return toRemove.length;
    }

    async shutdown() {
        logger.info('结果回调模块关闭中...');

        this.stopRetryProcess();
        this.stopPersistenceProcess();

        for (const [callbackId, callbackRecord] of this.callbackQueue.entries()) {
            await this.saveCallbackRecord(callbackRecord);
            await this.persistCallback(callbackRecord);
        }

        this.callbackQueue.clear();
        this.retryQueue.clear();

        logger.info('结果回调模块已关闭');
    }
}

module.exports = new CallbackModule();
