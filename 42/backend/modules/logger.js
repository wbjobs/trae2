const coreLogger = require('./loggers/coreLogger');
const channelLogger = require('./loggers/channelLogger');
const alertLogger = require('./loggers/alertLogger');
const syncLogger = require('./loggers/syncLogger');

const defaultLogger = coreLogger.createLogger({
  name: 'default',
  component: 'SYSTEM'
});

defaultLogger.stream = {
  write: function(message, encoding) {
    defaultLogger.info(message.trim());
  }
};

defaultLogger.core = coreLogger;
defaultLogger.channel = channelLogger;
defaultLogger.alert = alertLogger;
defaultLogger.sync = syncLogger;

defaultLogger.getStats = function() {
  return {
    core: coreLogger.getStats(),
    components: ['channel', 'alert', 'sync']
  };
};

module.exports = defaultLogger;
