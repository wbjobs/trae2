const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const config = require('./config/config');
const logger = require('./backend/modules/logger');

const signalingService = require('./backend/services/signalingService');
const analysisService = require('./backend/services/analysisService');
const syncService = require('./backend/services/syncService');
const playbackService = require('./backend/services/playbackService');
const exportService = require('./backend/services/exportService');
const auditLogger = require('./backend/modules/auditLogger');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    system: config.system.name,
    version: config.system.version
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    signaling: config.signaling,
    analysis: config.analysis,
    playback: config.playback,
    export: config.export
  });
});

app.get('/api/nodes', async (req, res) => {
  try {
    const nodes = await syncService.getAllNodes();
    res.json({ success: true, nodes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/channels', async (req, res) => {
  try {
    const channels = await signalingService.getChannelStatus();
    res.json({ success: true, channels });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/channels/:channelId', async (req, res) => {
  try {
    const channel = signalingService.getChannelById(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }
    res.json({ success: true, channel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analysis/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const data = await analysisService.getRecentAnalysis(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const alerts = await analysisService.getAlerts(limit);
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/audit', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, category } = req.query;
    const logs = await auditLogger.queryLogs({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      category
    });
    res.json({ success: true, ...logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      signaling: signalingService.getStatistics(),
      sync: syncService.getSyncStats(),
      playback: playbackService.getStorageStats(),
      export: exportService.getExportStats(),
      logger: logger.getStats()
    };
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/playback/sessions', async (req, res) => {
  try {
    const { channelId, startTime, endTime } = req.query;
    const filters = {};
    if (channelId) filters.channelId = channelId;
    if (startTime) filters.startTime = parseInt(startTime);
    if (endTime) filters.endTime = parseInt(endTime);
    
    const sessions = await playbackService.getAllSessions(filters);
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/playback/sessions/:sessionId', async (req, res) => {
  try {
    const session = await playbackService.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/playback/sessions/:sessionId/play', async (req, res) => {
  try {
    const { speed = 1, realtime = false } = req.body;
    const data = await playbackService.playSession(req.params.sessionId, { speed, realtime });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/playback/record', async (req, res) => {
  try {
    const { channelId, duration = 60000 } = req.body;
    const result = await playbackService.recordChannelData(channelId, duration);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/playback/sessions/:sessionId', async (req, res) => {
  try {
    await playbackService.deleteSession(req.params.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/playback/sessions/:sessionId/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const content = await playbackService.exportSession(req.params.sessionId, format);
    const filename = `playback-${req.params.sessionId}.${format}`;
    
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports', async (req, res) => {
  try {
    const { status, format, startDate, endDate } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (format) filters.format = format;
    if (startDate) filters.startDate = parseInt(startDate);
    if (endDate) filters.endDate = parseInt(endDate);
    
    const history = await exportService.getExportHistory(filters);
    res.json({ success: true, exports: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/exports', async (req, res) => {
  try {
    const { events, options } = req.body;
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ success: false, error: 'Events array is required' });
    }
    const result = await exportService.exportEvents(events, options || {});
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/exports/batch', async (req, res) => {
  try {
    const { exports } = req.body;
    if (!exports || !Array.isArray(exports)) {
      return res.status(400).json({ success: false, error: 'Exports array is required' });
    }
    const results = await exportService.batchExport(exports);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports/download/:filename', (req, res) => {
  const filePath = path.join(exportService.exportDir, req.params.filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  });
});

app.delete('/api/exports/:filename', async (req, res) => {
  try {
    const deleted = await exportService.deleteExport(req.params.filename);
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports/stats', (req, res) => {
  res.json({ success: true, stats: exportService.getExportStats() });
});

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  auditLogger.log({
    category: 'SYSTEM',
    action: 'CLIENT_CONNECT',
    operator: socket.id,
    details: { clientId: socket.id }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

signalingService.on('signalingData', (data) => {
  io.emit('signalingData', data);
});

signalingService.on('channelUpdate', (data) => {
  io.emit('channelUpdate', data);
});

signalingService.on('packetLossDetected', (data) => {
  io.emit('packetLossDetected', data);
});

analysisService.on('analysisResult', (data) => {
  io.emit('analysisResult', data);
});

analysisService.on('anomalyDetected', (alert) => {
  io.emit('anomalyDetected', alert);
  logger.alert.logAlertGenerated(alert);
  auditLogger.log({
    category: 'ALERT',
    action: 'ANOMALY_DETECTED',
    operator: 'SYSTEM',
    details: alert
  });
});

syncService.on('nodeUpdate', (node) => {
  io.emit('nodeUpdate', node);
});

syncService.on('groundSync', (data) => {
  io.emit('groundSync', data);
  logger.sync.logGroundSync(data.count, data.type || 'FULL', 'success');
  auditLogger.log({
    category: 'SYNC',
    action: 'GROUND_SYNC',
    operator: 'SYSTEM',
    details: { records: data.count, timestamp: data.timestamp }
  });
});

playbackService.on('sessionRecorded', (data) => {
  io.emit('playbackSessionRecorded', data);
});

playbackService.on('playbackData', (data) => {
  io.emit(`playbackData:${data.sessionId}`, data);
});

playbackService.on('playbackCompleted', (data) => {
  io.emit(`playbackCompleted:${data.sessionId}`, data);
});

exportService.on('exportCompleted', (data) => {
  io.emit('exportCompleted', data);
});

exportService.on('exportFailed', (data) => {
  io.emit('exportFailed', data);
});

const startServices = async () => {
  try {
    logger.info('Starting Railway Communication Monitor System...');
    
    await signalingService.start();
    logger.info('Signaling service started');
    
    await analysisService.start(signalingService);
    logger.info('Analysis service started');
    
    await syncService.start();
    logger.info('Node sync service started');
    
    await playbackService.start();
    logger.info('Playback service started');
    
    await exportService.start();
    logger.info('Export service started');

    playbackService.setChannelProvider((channelId) => signalingService.getChannelById(channelId));
    
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`Main server running on http://${config.server.host}:${config.server.port}`);
      logger.info(`WebSocket server running on ws://${config.server.host}:${config.server.port}`);
    });

    auditLogger.log({
      category: 'SYSTEM',
      action: 'SYSTEM_START',
      operator: 'SYSTEM',
      details: { port: config.server.port, version: config.system.version }
    });
  } catch (error) {
    logger.error('Failed to start services:', error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  auditLogger.log({
    category: 'SYSTEM',
    action: 'SYSTEM_SHUTDOWN',
    operator: 'SYSTEM',
    details: { reason: 'SIGINT' }
  });

  await signalingService.stop();
  await analysisService.stop();
  await syncService.stop();
  await playbackService.stop();
  await exportService.stop();
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServices();
