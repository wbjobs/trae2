const EventEmitter = require('events');
const logger = require('./logger');
const cacheManager = require('./cache_manager');

const SERVER_STATUS = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    MAINTENANCE: 'maintenance',
    OVERLOADED: 'overloaded'
};

const INSTANCE_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    STARTING: 'starting',
    STOPPING: 'stopping',
    ERROR: 'error'
};

const SCHEDULE_STRATEGIES = {
    ROUND_ROBIN: 'round_robin',
    LEAST_LOAD: 'least_load',
    LEAST_INSTANCE: 'least_instance',
    BANDWIDTH_FIRST: 'bandwidth_first'
};

const RESOURCE_LOCK_KEY = 'transcode:resource:lock:';
const LOCK_EXPIRE_MS = 5000;
const BANDWIDTH_RESERVATION_KEY = 'transcode:bandwidth:reservation:';

const LOAD_THRESHOLDS = {
    CPU_MAX: 90,
    MEMORY_MAX: 90,
    GPU_MAX: 95,
    BANDWIDTH_OVERHEAD: 1.2
};

const LARGE_STREAM_THRESHOLD = 20000;

class ResourceScheduler extends EventEmitter {
    constructor() {
        super();
        this.servers = new Map();
        this.instances = new Map();
        this.roundRobinIndex = 0;
        this.defaultStrategy = SCHEDULE_STRATEGIES.LEAST_LOAD;
        this.resourceCheckInterval = null;
        this.isInitialized = false;
        this.lockTimeout = LOCK_EXPIRE_MS;
        this.cachedBandwidth = new Map();
        this.bandwidthCacheTimeout = 5000;
        this.lastBandwidthUpdate = 0;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        logger.info('资源调度模块初始化中...');

        await this.loadServersFromCache();
        await this.loadInstancesFromCache();

        this.startResourceMonitor();

        this.isInitialized = true;
        logger.info('资源调度模块初始化完成');
    }

    async loadServersFromCache() {
        try {
            const cachedServers = await cacheManager.getAllServerResources();
            for (const server of cachedServers) {
                if (server.serverId) {
                    this.servers.set(server.serverId, server);
                }
            }
            logger.info(`从缓存加载了 ${this.servers.size} 个服务器资源`);
        } catch (err) {
            logger.error(`从缓存加载服务器资源失败: ${err.message}`);
        }
    }

    async loadInstancesFromCache() {
        try {
            const cachedInstances = await cacheManager.getAllInstanceStatuses();
            for (const instance of cachedInstances) {
                if (instance.instanceId) {
                    this.instances.set(instance.instanceId, instance);
                }
            }
            logger.info(`从缓存加载了 ${this.instances.size} 个转码实例状态`);
        } catch (err) {
            logger.error(`从缓存加载转码实例状态失败: ${err.message}`);
        }
    }

    startResourceMonitor() {
        this.resourceCheckInterval = setInterval(() => {
            this.checkServerHealth();
            this.checkInstanceStatus();
            this.refreshBandwidthCache();
        }, 10000);

        logger.info('资源监控已启动');
    }

    stopResourceMonitor() {
        if (this.resourceCheckInterval) {
            clearInterval(this.resourceCheckInterval);
            this.resourceCheckInterval = null;
            logger.info('资源监控已停止');
        }
    }

    async refreshBandwidthCache() {
        const now = Date.now();
        if (now - this.lastBandwidthUpdate < this.bandwidthCacheTimeout) {
            return;
        }

        for (const [serverId, server] of this.servers.entries()) {
            try {
                const availableBandwidth = await this.calculateAvailableBandwidth(server);
                this.cachedBandwidth.set(serverId, availableBandwidth);
            } catch (err) {
                logger.error(`刷新带宽缓存失败: ${serverId}, 错误: ${err.message}`);
            }
        }

        this.lastBandwidthUpdate = now;
        logger.debug('带宽缓存已刷新');
    }

    async calculateAvailableBandwidth(server) {
        const maxBandwidth = server.networkBandwidth || 1000000;
        const reservationKey = `${BANDWIDTH_RESERVATION_KEY}${server.serverId}`;

        try {
            const reservations = await cacheManager.getCache(reservationKey) || [];
            const reservedBandwidth = reservations.reduce((sum, r) => sum + r.bandwidth, 0);
            return Math.max(0, maxBandwidth - reservedBandwidth);
        } catch (err) {
            logger.error(`计算可用带宽失败: ${err.message}`);
            return maxBandwidth;
        }
    }

    async checkServerHealth() {
        const now = Date.now();
        const staleThreshold = 60000;

        for (const [serverId, server] of this.servers.entries()) {
            if (server.lastUpdate && (now - server.lastUpdate) > staleThreshold) {
                logger.warn(`服务器 ${serverId} 心跳超时，标记为离线`);
                server.status = SERVER_STATUS.OFFLINE;
                this.servers.set(serverId, server);
                this.cachedBandwidth.delete(serverId);

                this.handleOfflineServerInstances(serverId);
            }
        }
    }

    handleOfflineServerInstances(serverId) {
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.serverId === serverId && instance.status === INSTANCE_STATUS.RUNNING) {
                instance.status = INSTANCE_STATUS.ERROR;
                instance.error = '服务器离线';
                this.instances.set(instanceId, instance);
                this.emit('instanceError', instanceId, instance);
            }
        }
    }

    async checkInstanceStatus() {
        const now = Date.now();
        const staleThreshold = 30000;

        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.lastUpdate && (now - instance.lastUpdate) > staleThreshold) {
                if (instance.status === INSTANCE_STATUS.RUNNING) {
                    logger.warn(`转码实例 ${instanceId} 状态超时，标记为错误`);
                    instance.status = INSTANCE_STATUS.ERROR;
                    instance.error = '实例状态超时';
                    this.instances.set(instanceId, instance);
                    this.emit('instanceError', instanceId, instance);
                }
            }
        }
    }

    calculateRequiredBandwidth(taskData) {
        if (!taskData.outputProfile) {
            return 5000;
        }

        const videoBitrate = taskData.outputProfile.videoBitrate || 5000;
        const audioBitrate = taskData.outputProfile.audioBitrate || 128;

        return Math.ceil((videoBitrate + audioBitrate) * BANDWIDTH_OVERHEAD);
    }

    isServerCapable(server, requiredBandwidth, taskData) {
        if (server.status !== SERVER_STATUS.ONLINE) {
            return { capable: false, reason: 'SERVER_OFFLINE' };
        }

        if (taskData.outputProfile && server.capabilities) {
            const videoCodec = taskData.outputProfile.videoCodec;
            if (!server.capabilities.includes(videoCodec)) {
                return { capable: false, reason: 'CODEC_NOT_SUPPORTED' };
            }
        }

        if (server.cpuUsage >= LOAD_THRESHOLDS.CPU_MAX) {
            return { capable: false, reason: 'CPU_OVERLOADED' };
        }

        if (server.memoryUsage >= LOAD_THRESHOLDS.MEMORY_MAX) {
            return { capable: false, reason: 'MEMORY_OVERLOADED' };
        }

        if (server.gpuUsage >= LOAD_THRESHOLDS.GPU_MAX) {
            return { capable: false, reason: 'GPU_OVERLOADED' };
        }

        if (server.currentInstances >= server.maxInstances) {
            return { capable: false, reason: 'MAX_INSTANCES_REACHED' };
        }

        const availableBandwidth = this.cachedBandwidth.get(server.serverId) || 0;
        if (availableBandwidth < requiredBandwidth) {
            return { capable: false, reason: 'INSUFFICIENT_BANDWIDTH' };
        }

        return { capable: true, availableBandwidth };
    }

    async registerServer(serverInfo) {
        const serverId = serverInfo.serverId;

        const server = {
            serverId,
            name: serverInfo.name || serverId,
            ip: serverInfo.ip || '',
            port: serverInfo.port || 9000,
            maxInstances: serverInfo.maxInstances || 4,
            currentInstances: serverInfo.currentInstances || 0,
            cpuUsage: serverInfo.cpuUsage || 0,
            memoryUsage: serverInfo.memoryUsage || 0,
            gpuUsage: serverInfo.gpuUsage || 0,
            networkBandwidth: serverInfo.networkBandwidth || 0,
            status: serverInfo.status || SERVER_STATUS.ONLINE,
            capabilities: serverInfo.capabilities || ['h264', 'h265'],
            lastUpdate: Date.now(),
            metadata: serverInfo.metadata || {}
        };

        this.servers.set(serverId, server);
        this.cachedBandwidth.set(serverId, server.networkBandwidth || 0);

        await cacheManager.updateServerResource(serverId, this.serializeServer(server));

        logger.info(`服务器已注册: ${serverId}, 名称: ${server.name}, IP: ${server.ip}`);
        this.emit('serverRegistered', serverId, server);

        return server;
    }

    serializeServer(server) {
        return {
            name: server.name,
            ip: server.ip,
            port: server.port,
            maxInstances: server.maxInstances,
            currentInstances: server.currentInstances,
            cpuUsage: server.cpuUsage,
            memoryUsage: server.memoryUsage,
            gpuUsage: server.gpuUsage,
            networkBandwidth: server.networkBandwidth,
            status: server.status,
            capabilities: server.capabilities,
            metadata: server.metadata
        };
    }

    async updateServerStatus(serverId, statusData) {
        let server = this.servers.get(serverId);

        if (!server) {
            logger.warn(`服务器未注册，尝试自动注册: ${serverId}`);
            server = await this.registerServer({
                serverId,
                ...statusData
            });
            return server;
        }

        server = {
            ...server,
            ...statusData,
            lastUpdate: Date.now()
        };

        if (statusData.status !== undefined) {
            server.status = statusData.status;
        }

        this.servers.set(serverId, server);

        await cacheManager.updateServerResource(serverId, this.serializeServer(server));

        logger.debug(`服务器状态已更新: ${serverId}, CPU: ${server.cpuUsage}%, 内存: ${server.memoryUsage}%, 实例数: ${server.currentInstances}`);

        return server;
    }

    async removeServer(serverId, reason = '') {
        if (!this.servers.has(serverId)) {
            logger.warn(`服务器不存在: ${serverId}`);
            return false;
        }

        this.servers.delete(serverId);
        this.cachedBandwidth.delete(serverId);

        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.serverId === serverId) {
                this.instances.delete(instanceId);
            }
        }

        logger.info(`服务器已移除: ${serverId}, 原因: ${reason}`);
        this.emit('serverRemoved', serverId, reason);

        return true;
    }

    async registerInstance(instanceInfo) {
        const instanceId = instanceInfo.instanceId;

        const instance = {
            instanceId,
            serverId: instanceInfo.serverId,
            name: instanceInfo.name || instanceId,
            type: instanceInfo.type || 'cpu',
            supportedCodecs: instanceInfo.supportedCodecs || ['h264'],
            status: instanceInfo.status || INSTANCE_STATUS.IDLE,
            currentTaskId: null,
            startTime: null,
            lastUpdate: Date.now(),
            error: null,
            metadata: instanceInfo.metadata || {}
        };

        this.instances.set(instanceId, instance);

        await cacheManager.setInstanceStatus(instanceId, {
            serverId: instance.serverId,
            name: instance.name,
            type: instance.type,
            supportedCodecs: instance.supportedCodecs,
            status: instance.status,
            currentTaskId: null,
            startTime: null,
            error: null
        });

        const server = this.servers.get(instance.serverId);
        if (server) {
            server.currentInstances = (server.currentInstances || 0) + 1;
            this.servers.set(instance.serverId, server);
            await cacheManager.updateServerResource(instance.serverId, this.serializeServer(server));
        }

        logger.info(`转码实例已注册: ${instanceId}, 服务器: ${instance.serverId}, 类型: ${instance.type}`);
        this.emit('instanceRegistered', instanceId, instance);

        return instance;
    }

    async updateInstanceStatus(instanceId, statusData) {
        let instance = this.instances.get(instanceId);

        if (!instance) {
            logger.warn(`转码实例未注册: ${instanceId}`);
            return null;
        }

        const previousStatus = instance.status;

        instance = {
            ...instance,
            ...statusData,
            lastUpdate: Date.now()
        };

        if (statusData.status !== undefined) {
            instance.status = statusData.status;

            if (statusData.status === INSTANCE_STATUS.RUNNING && statusData.currentTaskId) {
                instance.startTime = Date.now();
            }

            if (statusData.status === INSTANCE_STATUS.IDLE) {
                instance.currentTaskId = null;
                instance.startTime = null;
                instance.error = null;
            }
        }

        this.instances.set(instanceId, instance);

        await cacheManager.setInstanceStatus(instanceId, {
            serverId: instance.serverId,
            name: instance.name,
            type: instance.type,
            supportedCodecs: instance.supportedCodecs,
            status: instance.status,
            currentTaskId: instance.currentTaskId,
            startTime: instance.startTime,
            error: instance.error
        });

        if (previousStatus !== instance.status) {
            logger.info(`转码实例状态变更: ${instanceId}, ${previousStatus} -> ${instance.status}`);
            this.emit('instanceStatusChanged', instanceId, previousStatus, instance.status);
        }

        return instance;
    }

    async removeInstance(instanceId, reason = '') {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            logger.warn(`转码实例不存在: ${instanceId}`);
            return false;
        }

        this.instances.delete(instanceId);

        const server = this.servers.get(instance.serverId);
        if (server && server.currentInstances > 0) {
            server.currentInstances--;
            this.servers.set(instance.serverId, server);
            await cacheManager.updateServerResource(instance.serverId, this.serializeServer(server));
        }

        logger.info(`转码实例已移除: ${instanceId}, 原因: ${reason}`);
        this.emit('instanceRemoved', instanceId, reason);

        return true;
    }

    async acquireInstanceLock(instanceId, taskId) {
        const lockKey = `${RESOURCE_LOCK_KEY}${instanceId}`;
        const lockValue = `${taskId}:${Date.now()}`;

        return new Promise((resolve) => {
            cacheManager.client.set(lockKey, lockValue, 'NX', 'PX', this.lockTimeout, (err, result) => {
                if (err) {
                    logger.error(`获取实例锁失败: ${instanceId}, 错误: ${err.message}`);
                    resolve(false);
                } else {
                    const acquired = result === 'OK';
                    if (acquired) {
                        logger.debug(`实例锁已获取: ${instanceId}, 任务: ${taskId}`);
                    } else {
                        logger.debug(`实例锁获取失败，已被占用: ${instanceId}`);
                    }
                    resolve(acquired);
                }
            });
        });
    }

    async releaseInstanceLock(instanceId) {
        const lockKey = `${RESOURCE_LOCK_KEY}${instanceId}`;
        return new Promise((resolve) => {
            cacheManager.client.del(lockKey, (err) => {
                if (err) {
                    logger.error(`释放实例锁失败: ${instanceId}, 错误: ${err.message}`);
                }
                resolve(true);
            });
        });
    }

    async reserveBandwidth(serverId, taskId, requiredBandwidth) {
        const reservationKey = `${BANDWIDTH_RESERVATION_KEY}${serverId}`;
        const reservation = {
            taskId,
            bandwidth: requiredBandwidth,
            timestamp: Date.now()
        };

        try {
            const currentReservations = await cacheManager.getCache(reservationKey) || [];
            currentReservations.push(reservation);
            await cacheManager.setCache(reservationKey, currentReservations, 3600);

            const currentReserved = currentReservations.reduce((sum, r) => sum + r.bandwidth, 0);
            const server = this.servers.get(serverId);
            if (server) {
                this.cachedBandwidth.set(serverId, Math.max(0, (server.networkBandwidth || 0) - currentReserved));
            }

            logger.debug(`带宽已预留: 服务器 ${serverId}, 任务 ${taskId}, 带宽 ${requiredBandwidth}kbps`);
            return true;
        } catch (err) {
            logger.error(`带宽预留失败: ${err.message}`);
            return false;
        }
    }

    async releaseBandwidthReservation(serverId, taskId) {
        const reservationKey = `${BANDWIDTH_RESERVATION_KEY}${serverId}`;
        try {
            const currentReservations = await cacheManager.getCache(reservationKey) || [];
            const filtered = currentReservations.filter(r => r.taskId !== taskId);
            await cacheManager.setCache(reservationKey, filtered, 3600);

            const remainingReserved = filtered.reduce((sum, r) => sum + r.bandwidth, 0);
            const server = this.servers.get(serverId);
            if (server) {
                this.cachedBandwidth.set(serverId, Math.max(0, (server.networkBandwidth || 0) - remainingReserved));
            }

            logger.debug(`带宽预留已释放: 服务器 ${serverId}, 任务 ${taskId}`);
            return true;
        } catch (err) {
            logger.error(`释放带宽预留失败: ${err.message}`);
            return false;
        }
    }

    async getAvailableServers(taskData) {
        const servers = [];
        const requiredBandwidth = this.calculateRequiredBandwidth(taskData);

        for (const [serverId, server] of this.servers.entries()) {
            const capabilityCheck = this.isServerCapable(server, requiredBandwidth, taskData);

            if (!capabilityCheck.capable) {
                logger.debug(`服务器 ${serverId} 不满足条件: ${capabilityCheck.reason}`);
                continue;
            }

            servers.push({
                ...server,
                availableBandwidth: capabilityCheck.availableBandwidth,
                requiredBandwidth
            });
        }

        return servers;
    }

    selectServer(servers, strategy, requiredBandwidth = 0) {
        if (servers.length === 0) {
            return null;
        }

        if (requiredBandwidth > LARGE_STREAM_THRESHOLD) {
            logger.info(`大码流任务检测，采用带宽优先调度策略，需要 ${requiredBandwidth}kbps`);
            return this.bandwidthFirstSelect(servers);
        }

        switch (strategy) {
            case SCHEDULE_STRATEGIES.ROUND_ROBIN:
                return this.roundRobinSelect(servers);

            case SCHEDULE_STRATEGIES.LEAST_INSTANCE:
                return this.leastInstanceSelect(servers);

            case SCHEDULE_STRATEGIES.BANDWIDTH_FIRST:
                return this.bandwidthFirstSelect(servers);

            case SCHEDULE_STRATEGIES.LEAST_LOAD:
            default:
                return this.leastLoadSelect(servers);
        }
    }

    determineStrategy(taskData) {
        if (taskData.priority === 'high') {
            return SCHEDULE_STRATEGIES.LEAST_LOAD;
        }

        const requiredBandwidth = this.calculateRequiredBandwidth(taskData);
        if (requiredBandwidth > LARGE_STREAM_THRESHOLD) {
            return SCHEDULE_STRATEGIES.BANDWIDTH_FIRST;
        }

        return this.defaultStrategy;
    }

    async allocateResource(taskData) {
        const strategy = this.determineStrategy(taskData);
        const requiredBandwidth = this.calculateRequiredBandwidth(taskData);

        logger.info(`开始资源分配, 任务ID: ${taskData.taskId}, 策略: ${strategy}, 需求带宽: ${requiredBandwidth}kbps`);

        const availableServers = await this.getAvailableServers(taskData);

        if (availableServers.length === 0) {
            logger.warn(`无可用服务器, 任务ID: ${taskData.taskId}`);
            return {
                success: false,
                reason: 'NO_AVAILABLE_SERVER',
                estimatedWaitTime: this.calculateWaitTime(),
                requiredBandwidth
            };
        }

        const selectedServer = this.selectServer(availableServers, strategy, requiredBandwidth);

        if (!selectedServer) {
            logger.warn(`无法选择合适的服务器, 任务ID: ${taskData.taskId}`);
            return {
                success: false,
                reason: 'NO_SUITABLE_SERVER',
                estimatedWaitTime: this.calculateWaitTime(),
                requiredBandwidth
            };
        }

        const availableInstance = this.findAvailableInstance(selectedServer.serverId, taskData);

        if (!availableInstance) {
            const estimatedWait = this.calculateInstanceWaitTime(selectedServer);
            logger.warn(`服务器 ${selectedServer.serverId} 无空闲实例, 预计等待: ${estimatedWait}ms`);

            return {
                success: false,
                reason: 'NO_IDLE_INSTANCE',
                estimatedWaitTime: estimatedWait,
                queuePosition: this.calculateQueuePosition()
            };
        }

        const lockAcquired = await this.acquireInstanceLock(availableInstance.instanceId, taskData.taskId);
        if (!lockAcquired) {
            logger.warn(`实例 ${availableInstance.instanceId} 锁获取失败，资源可能被其他任务抢占`);
            return {
                success: false,
                reason: 'INSTANCE_LOCKED',
                estimatedWaitTime: 5000
            };
        }

        try {
            const instance = this.instances.get(availableInstance.instanceId);
            if (!instance || instance.status !== INSTANCE_STATUS.IDLE) {
                logger.warn(`实例状态已变更，取消分配: ${availableInstance.instanceId}`);
                await this.releaseInstanceLock(availableInstance.instanceId);
                return {
                    success: false,
                    reason: 'INSTANCE_STATUS_CHANGED',
                    estimatedWaitTime: 3000
                };
            }

            const bandwidthReserved = await this.reserveBandwidth(
                selectedServer.serverId,
                taskData.taskId,
                requiredBandwidth
            );

            if (!bandwidthReserved) {
                logger.warn(`带宽预留失败，取消分配: ${selectedServer.serverId}`);
                await this.releaseInstanceLock(availableInstance.instanceId);
                return {
                    success: false,
                    reason: 'BANDWIDTH_RESERVATION_FAILED',
                    estimatedWaitTime: 5000
                };
            }

            await this.updateInstanceStatus(availableInstance.instanceId, {
                status: INSTANCE_STATUS.STARTING,
                currentTaskId: taskData.taskId,
                reservedBandwidth: requiredBandwidth
            });

            logger.info(`资源分配成功, 任务ID: ${taskData.taskId}, 服务器: ${selectedServer.serverId}, 实例: ${availableInstance.instanceId}, 预留带宽: ${requiredBandwidth}kbps`);

            return {
                success: true,
                serverId: selectedServer.serverId,
                instanceId: availableInstance.instanceId,
                queuePosition: 0,
                reservedBandwidth: requiredBandwidth
            };
        } catch (err) {
            logger.error(`资源分配异常: ${err.message}`);
            await this.releaseInstanceLock(availableInstance.instanceId);
            await this.releaseBandwidthReservation(selectedServer.serverId, taskData.taskId);
            throw err;
        }
    }

    roundRobinSelect(servers) {
        const server = servers[this.roundRobinIndex % servers.length];
        this.roundRobinIndex++;
        return server;
    }

    leastLoadSelect(servers) {
        return servers.reduce((best, current) => {
            const bestLoad = this.calculateServerLoad(best);
            const currentLoad = this.calculateServerLoad(current);
            return currentLoad < bestLoad ? current : best;
        });
    }

    calculateServerLoad(server) {
        const cpuWeight = 0.4;
        const memoryWeight = 0.3;
        const gpuWeight = 0.3;

        return (server.cpuUsage || 0) * cpuWeight +
               (server.memoryUsage || 0) * memoryWeight +
               (server.gpuUsage || 0) * gpuWeight;
    }

    leastInstanceSelect(servers) {
        return servers.reduce((best, current) => {
            return (current.currentInstances || 0) < (best.currentInstances || 0) ? current : best;
        });
    }

    bandwidthFirstSelect(servers) {
        return servers.reduce((best, current) => {
            return (current.availableBandwidth || 0) > (best.availableBandwidth || 0) ? current : best;
        });
    }

    findAvailableInstance(serverId, taskData) {
        const serverInstances = [];

        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.serverId !== serverId) {
                continue;
            }

            if (instance.status !== INSTANCE_STATUS.IDLE) {
                continue;
            }

            if (taskData.outputProfile && instance.supportedCodecs) {
                const videoCodec = taskData.outputProfile.videoCodec;
                if (!instance.supportedCodecs.includes(videoCodec)) {
                    continue;
                }
            }

            serverInstances.push(instance);
        }

        return serverInstances.length > 0 ? serverInstances[0] : null;
    }

    calculateWaitTime() {
        const queueLength = this.getTotalQueueLength();
        const availableInstances = this.getAvailableInstanceCount();

        if (availableInstances === 0) {
            return Math.max(queueLength * 30000, 60000);
        }

        return Math.ceil((queueLength / availableInstances) * 30000);
    }

    calculateInstanceWaitTime(server) {
        const runningCount = this.getServerRunningInstanceCount(server.serverId);
        return runningCount * 15000;
    }

    calculateQueuePosition() {
        let total = 0;
        for (const [serverId, server] of this.servers.entries()) {
            total += Math.max(0, (server.currentInstances || 0) - (server.maxInstances || 0));
        }
        return total;
    }

    getTotalQueueLength() {
        let total = 0;
        for (const [serverId, server] of this.servers.entries()) {
            if (server.status === SERVER_STATUS.ONLINE) {
                total += Math.max(0, (server.currentInstances || 0) - (server.maxInstances || 0));
            }
        }
        return total;
    }

    getAvailableInstanceCount() {
        let count = 0;
        for (const [serverId, server] of this.servers.entries()) {
            if (server.status === SERVER_STATUS.ONLINE) {
                count += Math.max(0, (server.maxInstances || 0) - (server.currentInstances || 0));
            }
        }
        return count;
    }

    getServerRunningInstanceCount(serverId) {
        let count = 0;
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.serverId === serverId && instance.status === INSTANCE_STATUS.RUNNING) {
                count++;
            }
        }
        return count;
    }

    async releaseResource(instanceId, taskId = null) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return false;
        }

        if (taskId) {
            await this.releaseBandwidthReservation(instance.serverId, taskId);
        }

        await this.updateInstanceStatus(instanceId, {
            status: INSTANCE_STATUS.IDLE,
            currentTaskId: null,
            startTime: null,
            error: null,
            reservedBandwidth: null
        });

        await this.releaseInstanceLock(instanceId);

        logger.info(`资源已释放, 实例: ${instanceId}, 服务器: ${instance.serverId}, 任务: ${taskId || 'N/A'}`);

        return true;
    }

    getServerInfo(serverId) {
        return this.servers.get(serverId) || null;
    }

    getAllServers() {
        return Array.from(this.servers.values());
    }

    getInstanceInfo(instanceId) {
        return this.instances.get(instanceId) || null;
    }

    getAllInstances() {
        return Array.from(this.instances.values());
    }

    getInstancesByServer(serverId) {
        const instances = [];
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.serverId === serverId) {
                instances.push(instance);
            }
        }
        return instances;
    }

    getSystemStats() {
        const servers = this.getAllServers();
        const instances = this.getAllInstances();

        return {
            totalServers: servers.length,
            activeServers: servers.filter(s => s.status === SERVER_STATUS.ONLINE).length,
            totalInstances: instances.length,
            idleInstances: instances.filter(i => i.status === INSTANCE_STATUS.IDLE).length,
            runningInstances: instances.filter(i => i.status === INSTANCE_STATUS.RUNNING).length,
            averageCpuUsage: this.calculateAverage(servers, 'cpuUsage'),
            averageMemoryUsage: this.calculateAverage(servers, 'memoryUsage'),
            averageGpuUsage: this.calculateAverage(servers, 'gpuUsage'),
            totalAvailableBandwidth: Array.from(this.cachedBandwidth.values()).reduce((sum, bw) => sum + bw, 0),
            lastUpdate: Date.now()
        };
    }

    calculateAverage(items, property) {
        if (items.length === 0) return 0;
        return items.reduce((sum, item) => sum + (item[property] || 0), 0) / items.length;
    }

    async shutdown() {
        this.stopResourceMonitor();
        this.cachedBandwidth.clear();
        logger.info('资源调度模块已关闭');
    }
}

module.exports = new ResourceScheduler();
