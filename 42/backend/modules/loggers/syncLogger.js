const path = require('path');
const coreLogger = require('./coreLogger');

const syncLogger = coreLogger.createLogger({
  name: 'sync',
  component: 'SYNC',
  logDir: path.join(coreLogger.baseDir, 'sync'),
  level: 'info',
  maxFileSize: 5242880,
  maxFiles: 15
});

syncLogger.logNodeSync = function(nodeId, syncType, status, duration) {
  this.info(`Node sync: ${nodeId} [${syncType}] ${status} (${duration?.toFixed(2)}ms)`, {
    nodeId,
    syncType,
    status,
    duration,
    timestamp: Date.now()
  });
};

syncLogger.logGroundSync = function(recordCount, syncType, status, details) {
  this.info(`Ground sync: ${recordCount} records [${syncType}] ${status}`, {
    recordCount,
    syncType,
    status,
    details,
    timestamp: Date.now()
  });
};

syncLogger.logSyncFailure = function(nodeId, error, retryCount) {
  this.error(`Sync failure: ${nodeId}, retry: ${retryCount}`, {
    nodeId,
    error: error.message || error,
    retryCount,
    failedAt: Date.now()
  });
};

syncLogger.logIncrementalSync = function(nodeId, changedFields, syncSize) {
  this.debug(`Incremental sync: ${nodeId}, fields: ${changedFields?.length}, size: ${syncSize}bytes`, {
    nodeId,
    changedFields,
    syncSize,
    timestamp: Date.now()
  });
};

syncLogger.logDeltaSync = function(nodeId, deltaSize, baseTimestamp) {
  this.debug(`Delta sync: ${nodeId}, delta: ${deltaSize}bytes, base: ${new Date(baseTimestamp).toISOString()}`, {
    nodeId,
    deltaSize,
    baseTimestamp,
    timestamp: Date.now()
  });
};

syncLogger.logSyncQueue = function(queueSize, processingCount) {
  this.debug(`Sync queue: ${queueSize} pending, ${processingCount} processing`, {
    queueSize,
    processingCount
  });
};

module.exports = syncLogger;
