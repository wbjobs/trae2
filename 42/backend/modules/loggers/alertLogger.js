const path = require('path');
const coreLogger = require('./coreLogger');

const alertLogger = coreLogger.createLogger({
  name: 'alert',
  component: 'ALERT',
  logDir: path.join(coreLogger.baseDir, 'alerts'),
  level: 'warn',
  maxFileSize: 10485760,
  maxFiles: 30
});

alertLogger.logAlertGenerated = function(alert) {
  this.warn(`Alert generated: ${alert.id} [${alert.severity}] ${alert.type}`, {
    alert: {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      channelId: alert.channelId,
      message: alert.message,
      timestamp: alert.timestamp
    }
  });
};

alertLogger.logAlertAcknowledged = function(alertId, operator, reason) {
  this.info(`Alert acknowledged: ${alertId} by ${operator}`, {
    alertId,
    operator,
    reason,
    acknowledgedAt: Date.now()
  });
};

alertLogger.logAlertResolved = function(alertId, resolver, resolutionDetails) {
  this.info(`Alert resolved: ${alertId} by ${resolver}`, {
    alertId,
    resolver,
    resolutionDetails,
    resolvedAt: Date.now()
  });
};

alertLogger.logAlertSuppressed = function(alertId, reason, cooldownRemaining) {
  this.debug(`Alert suppressed: ${alertId}, reason: ${reason}, cooldown: ${cooldownRemaining}ms`, {
    alertId,
    reason,
    cooldownRemaining
  });
};

alertLogger.logRuleTriggered = function(ruleId, ruleName, context) {
  this.info(`Rule triggered: ${ruleId} (${ruleName})`, {
    ruleId,
    ruleName,
    context: {
      channelId: context.channelId,
      snr: context.snr,
      speed: context.speed,
      isHandoverZone: context.isHandoverZone
    },
    triggeredAt: Date.now()
  });
};

alertLogger.logAlertEscalation = function(alertId, fromLevel, toLevel, reason) {
  this.error(`Alert escalated: ${alertId} ${fromLevel} -> ${toLevel}`, {
    alertId,
    fromLevel,
    toLevel,
    reason,
    escalatedAt: Date.now()
  });
};

module.exports = alertLogger;
