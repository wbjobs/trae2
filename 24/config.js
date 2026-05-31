const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const logDir = path.resolve(process.env.LOG_DIR || './logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const config = {
    server: {
        port: parseInt(process.env.SERVER_PORT || '8080'),
        host: process.env.SERVER_HOST || '0.0.0.0',
        env: process.env.NODE_ENV || 'production'
    },
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || null,
        db: parseInt(process.env.REDIS_DB || '0')
    },
    transcode: {
        engineUrl: process.env.TRANSCODE_ENGINE_URL || 'http://127.0.0.1:9000',
        healthCheckInterval: parseInt(process.env.TRANSCODE_HEALTH_CHECK_INTERVAL || '30000')
    },
    callback: {
        timeout: parseInt(process.env.CALLBACK_TIMEOUT || '10000'),
        retryCount: parseInt(process.env.CALLBACK_RETRY_COUNT || '3'),
        retryDelay: parseInt(process.env.CALLBACK_RETRY_DELAY || '5000')
    },
    cache: {
        taskQueueKey: process.env.TASK_QUEUE_KEY || 'transcode:task:queue',
        taskRunningKey: process.env.TASK_RUNNING_KEY || 'transcode:task:running',
        serverResourceKey: process.env.SERVER_RESOURCE_KEY || 'transcode:server:resource',
        instanceStatusKey: process.env.INSTANCE_STATUS_KEY || 'transcode:instance:status'
    },
    stream: {
        checkTimeout: parseInt(process.env.STREAM_CHECK_TIMEOUT || '5000'),
        maxBitrate: parseInt(process.env.STREAM_MAX_BITRATE || '50000'),
        minBitrate: parseInt(process.env.STREAM_MIN_BITRATE || '100')
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: logDir
    }
};

module.exports = config;
