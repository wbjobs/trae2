const path = require('path');
const coreLogger = require('./coreLogger');

const channelLogger = coreLogger.createLogger({
  name: 'channel',
  component: 'CHANNEL',
  logDir: path.join(coreLogger.baseDir, 'channels'),
  level: 'debug',
  maxFileSize: 20971520,
  maxFiles: 20
});

channelLogger.logChannelMetrics = function(channelId, metrics) {
  this.info(`Channel ${channelId} metrics: SNR=${metrics.snr?.toFixed(2)}dB, RSSI=${metrics.rssi?.toFixed(2)}, Loss=${(metrics.packetLossRate * 100).toFixed(2)}%`, {
    channelId,
    metrics: {
      snr: metrics.snr,
      rssi: metrics.rssi,
      packetLossRate: metrics.packetLossRate,
      latency: metrics.latency,
      jitter: metrics.jitter
    }
  });
};

channelLogger.logChannelStatusChange = function(channelId, oldStatus, newStatus, reason) {
  this.warn(`Channel ${channelId} status changed: ${oldStatus} -> ${newStatus}`, {
    channelId,
    oldStatus,
    newStatus,
    reason,
    timestamp: Date.now()
  });
};

channelLogger.logChannelAnomaly = function(channelId, anomaly) {
  this.error(`Channel ${channelId} anomaly detected: ${anomaly.type}`, {
    channelId,
    anomaly: {
      type: anomaly.type,
      severity: anomaly.severity,
      threshold: anomaly.threshold,
      actual: anomaly.actual,
      message: anomaly.message
    }
  });
};

channelLogger.logChannelHandover = function(channelId, fromBs, toBs, status) {
  this.info(`Channel ${channelId} handover: ${fromBs} -> ${toBs} [${status}]`, {
    channelId,
    fromBs,
    toBs,
    status,
    timestamp: Date.now()
  });
};

channelLogger.logPacketLoss = function(channelId, lostPackets, totalPackets, lossRate) {
  this.warn(`Channel ${channelId} packet loss: ${lostPackets}/${totalPackets} (${(lossRate * 100).toFixed(2)}%)`, {
    channelId,
    lostPackets,
    totalPackets,
    lossRate
  });
};

channelLogger.logSignalQuality = function(channelId, quality, trend) {
  this.debug(`Channel ${channelId} signal quality: ${quality}, trend: ${trend}`, {
    channelId,
    quality,
    trend
  });
};

module.exports = channelLogger;
