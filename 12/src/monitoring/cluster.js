const config = require('../config');
const logger = require('../utils/logger');
const IORedis = require('ioredis');
const os = require('os');

const redisClient = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const instanceId = `${os.hostname()}_${process.pid}_${Date.now()}`;
const instanceKey = `cluster:instance:${instanceId}`;

const clusterMonitor = {
  instanceId,
  registered: false,
  lastHeartbeat: 0,

  async register() {
    const instanceInfo = {
      instanceId,
      hostname: os.hostname(),
      pid: process.pid,
      port: config.port,
      startedAt: Date.now(),
      nodeEnv: config.nodeEnv,
      type: this.getType()
    };

    await redisClient.hset(instanceKey, instanceInfo);
    await redisClient.expire(instanceKey, 60);
    await redisClient.sadd('cluster:instances', instanceId);

    this.registered = true;
    this.lastHeartbeat = Date.now();

    logger.info(`实例已注册到集群: ${instanceId}`, { type: this.getType() });
    return instanceInfo;
  },

  getType() {
    if (process.argv[1]?.includes('worker')) {
      return 'worker';
    }
    return 'api';
  },

  async heartbeat() {
    if (!this.registered) {
      await this.register();
      return;
    }

    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    await redisClient.hmset(instanceKey, {
      lastHeartbeat: Date.now(),
      memoryHeapUsed: memUsage.heapUsed,
      memoryRss: memUsage.rss,
      cpuUser: cpuUsage.user,
      cpuSystem: cpuUsage.system,
      uptime: process.uptime()
    });

    await redisClient.expire(instanceKey, 60);
    this.lastHeartbeat = Date.now();
  },

  async getInstances() {
    const instanceIds = await redisClient.smembers('cluster:instances');
    const instances = [];

    for (const id of instanceIds) {
      const info = await redisClient.hgetall(`cluster:instance:${id}`);
      if (info && Object.keys(info).length > 0) {
        instances.push({
          ...info,
          instanceId: id,
          isAlive: (Date.now() - parseInt(info.lastHeartbeat || 0, 10)) < 60000
        });
      } else {
        await redisClient.srem('cluster:instances', id);
      }
    }

    return instances;
  },

  async getStats() {
    const instances = await this.getInstances();
    const apiInstances = instances.filter(i => i.type === 'api' && i.isAlive);
    const workerInstances = instances.filter(i => i.type === 'worker' && i.isAlive);

    return {
      total: instances.length,
      alive: instances.filter(i => i.isAlive).length,
      apiCount: apiInstances.length,
      workerCount: workerInstances.length,
      instances
    };
  },

  async broadcastEvent(event, data) {
    const message = JSON.stringify({
      event,
      data,
      from: instanceId,
      timestamp: Date.now()
    });

    await redisClient.publish('cluster:events', message);
    logger.debug(`广播事件: ${event}`, { from: instanceId });
  },

  async sendAlertNotification(alert) {
    const notification = {
      type: 'alert',
      alert,
      from: instanceId,
      timestamp: Date.now()
    };

    await redisClient.publish('cluster:alerts', JSON.stringify(notification));
    logger.debug(`告警通知已发送`, { alertId: alert.alertId });
  },

  async sendSystemAlert(level, message, details = {}) {
    const alert = {
      alertId: `system_${instanceId}_${Date.now()}`,
      type: 'system',
      level,
      message,
      details: {
        ...details,
        instanceId,
        hostname: os.hostname(),
        pid: process.pid
      },
      timestamp: Date.now()
    };

    await redisClient.publish('cluster:alerts', JSON.stringify({
      type: 'system_alert',
      alert,
      from: instanceId,
      timestamp: Date.now()
    }));

    const levelMap = { info: 'info', warning: 'warn', critical: 'error', error: 'error' };
    logger[levelMap[level] || 'warn'](`系统告警: ${message}`, details);
  },

  startHeartbeat() {
    setInterval(async () => {
      try {
        await this.heartbeat();
      } catch (error) {
        logger.debug(`心跳更新失败: ${error.message}`);
      }
    }, 10000);

    logger.info('集群心跳已启动');
  },

  subscribeToEvents(callback) {
    const subscriber = new IORedis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db
    });

    subscriber.subscribe('cluster:events', 'cluster:alerts', (err) => {
      if (err) {
        logger.error(`订阅集群事件失败: ${err.message}`);
      } else {
        logger.info('已订阅集群事件通道');
      }
    });

    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (callback) {
          callback(channel, data);
        }
      } catch (error) {
        logger.debug(`事件消息解析失败: ${error.message}`);
      }
    });

    return subscriber;
  },

  async setConfig(key, value) {
    await redisClient.set(`cluster:config:${key}`, JSON.stringify(value));
    await this.broadcastEvent('config_updated', { key });
  },

  async getConfig(key, defaultValue = null) {
    const value = await redisClient.get(`cluster:config:${key}`);
    return value ? JSON.parse(value) : defaultValue;
  },

  async unregister() {
    await redisClient.srem('cluster:instances', instanceId);
    await redisClient.del(instanceKey);
    this.registered = false;
    logger.info(`实例已从集群注销: ${instanceId}`);
  }
};

module.exports = clusterMonitor;
