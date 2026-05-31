const http = require('http');
const path = require('path');
const fs = require('fs');
const { CONFIG } = require('./config');
const Logger = require('./logger');
const { ECUMessageReceiver } = require('./receiver');
const RuleFilter = require('./filter');
const ClusterManager = require('./cluster');
const { ThreadPool } = require('./threadpool');
const { TraceManager } = require('./tracing');

const logger = new Logger();
const traceManager = new TraceManager();
const threadPool = new ThreadPool({ workerCount: 4, maxQueueSize: 5000 });
const receiver = new ECUMessageReceiver(logger, threadPool, traceManager);
const filter = new RuleFilter(logger, threadPool);
const cluster = new ClusterManager(logger);

const clients = new Set();
const clientWsMap = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

receiver.on('message', msg => {
  const result = filter.process(msg);
  if (result.finalAction !== 'block') {
    cluster.broadcast('message', { id: msg.id, sid: msg.sid, data: msg.data });
  }
  for (const client of clients) {
    sendSSE(client, { type: 'filterResult', data: result });
  }
  for (const [id, ws] of clientWsMap.entries()) {
    try { ws.send(JSON.stringify({ type: 'filterResult', data: result })); }
    catch (e) { clientWsMap.delete(id); }
  }
});

receiver.on('clientConnected', info => {
  for (const client of clients) {
    sendSSE(client, { type: 'clientConnected', data: info });
  }
  for (const [id, ws] of clientWsMap.entries()) {
    try { ws.send(JSON.stringify({ type: 'clientConnected', data: info })); }
    catch (e) { clientWsMap.delete(id); }
  }
});

receiver.on('clientDisconnected', info => {
  for (const client of clients) {
    sendSSE(client, { type: 'clientDisconnected', data: info });
  }
});

cluster.on('nodeUpdate', node => {
  for (const client of clients) {
    sendSSE(client, { type: 'nodeUpdate', data: node });
  }
  for (const [id, ws] of clientWsMap.entries()) {
    try { ws.send(JSON.stringify({ type: 'nodeUpdate', data: node })); }
    catch (e) { clientWsMap.delete(id); }
  }
});

cluster.on('dataSynced', info => {
  for (const client of clients) {
    sendSSE(client, { type: 'dataSynced', data: info });
  }
});

cluster.on('filterRuleUpdate', rules => {
  filter.reloadRules();
  for (const client of clients) {
    sendSSE(client, { type: 'filterRuleUpdate', data: { updatedAt: new Date().toISOString(), count: rules.length } });
  }
});

filter.on('rulesUpdated', rules => {
  cluster.set('filterRules', rules, { sync: true });
  for (const client of clients) {
    sendSSE(client, { type: 'rulesUpdated', data: { count: rules.length } });
  }
});

async function handleApiRequest(req, res, urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  const resource = parts[0] || '';
  const id = parts[1] || null;
  const action = parts[2] || null;

  if (resource === 'api') {
    const apiResource = parts[1] || '';
    const apiId = parts[2] || null;
    const apiAction = parts[3] || null;
    try {
      switch (apiResource) {
        case 'messages': {
          if (req.method === 'GET') {
            const limit = parseInt(new URL(req.url, `http://${req.headers.host}`).searchParams.get('limit')) || 50;
            return sendJson(res, 200, { messages: receiver.getMessages(limit) });
          }
          if (req.method === 'POST' && apiId === 'inject') {
            const body = await parseBody(req);
            const result = await receiver.injectTestMessage(body.data);
            return sendJson(res, 200, { success: true, message: result });
          }
          if (req.method === 'DELETE' && apiId === 'clear') {
            receiver.clearBuffer();
            return sendJson(res, 200, { success: true });
          }
          break;
        }
        case 'rules': {
          if (req.method === 'GET') {
            if (apiId === 'export') {
              const format = new URL(req.url, `http://${req.headers.host}`).searchParams.get('format') || 'json';
              const data = filter.exportRules(format);
              if (format === 'csv') {
                res.writeHead(200, {
                  'Content-Type': 'text/csv; charset=utf-8',
                  'Content-Disposition': 'attachment; filename="rules.csv"',
                });
                res.end(data);
                return;
              }
              return sendJson(res, 200, { rules: JSON.parse(data) });
            }
            if (apiId && apiId !== 'reload' && apiId !== 'import' && apiId !== 'export' && apiId !== 'batch-delete' && apiId !== 'batch-toggle') {
              const rule = filter.getRule(apiId);
              if (rule) return sendJson(res, 200, { rule });
              return sendJson(res, 404, { error: 'Rule not found' });
            }
            return sendJson(res, 200, { rules: filter.getRules() });
          }
          if (req.method === 'POST' && apiId === 'reload') {
            filter.reloadRules();
            return sendJson(res, 200, { success: true, count: filter.getRules().length });
          }
          if (req.method === 'POST' && apiId === 'import') {
            const body = await parseBody(req);
            const format = body.format || 'json';
            const result = filter.importRules(body.rules || body.data, format);
            return sendJson(res, 200, { success: true, result });
          }
          if (req.method === 'POST' && apiId === 'batch-delete') {
            const body = await parseBody(req);
            const result = filter.deleteRules(body.ids || []);
            return sendJson(res, 200, { success: true, result });
          }
          if (req.method === 'POST' && apiId === 'batch-toggle') {
            const body = await parseBody(req);
            const result = filter.toggleRules(body.ids || [], body.enabled);
            return sendJson(res, 200, { success: true, result });
          }
          if (req.method === 'POST' && apiId && apiAction === 'toggle') {
            const body = await parseBody(req);
            const updated = filter.toggleRule(apiId, body.enabled);
            if (updated) return sendJson(res, 200, { rule: updated });
            return sendJson(res, 404, { error: 'Rule not found' });
          }
          if (req.method === 'POST') {
            const body = await parseBody(req);
            const rule = filter.addRule(body);
            return sendJson(res, 201, { rule });
          }
          if (req.method === 'PUT' && apiId) {
            const body = await parseBody(req);
            const updated = filter.updateRule(apiId, body);
            if (updated) return sendJson(res, 200, { rule: updated });
            return sendJson(res, 404, { error: 'Rule not found' });
          }
          if (req.method === 'DELETE' && apiId) {
            const deleted = filter.deleteRule(apiId);
            if (deleted) return sendJson(res, 200, { success: true });
            return sendJson(res, 404, { error: 'Rule not found' });
          }
          break;
        }
        case 'cluster': {
          if (req.method === 'GET') {
            if (apiId === 'nodes') return sendJson(res, 200, { nodes: cluster.getNodes() });
            if (apiId === 'stats') return sendJson(res, 200, { stats: cluster.getStats() });
            return sendJson(res, 200, { status: cluster.getNodes() });
          }
          if (req.method === 'POST' && apiId === 'broadcast') {
            const body = await parseBody(req);
            cluster.broadcast('api_message', body);
            return sendJson(res, 200, { success: true });
          }
          break;
        }
        case 'logs': {
          if (req.method === 'GET') {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const level = urlObj.searchParams.get('level') || 'info';
            const limit = parseInt(urlObj.searchParams.get('limit')) || 100;
            if (apiId === 'audit') {
              const module = urlObj.searchParams.get('module');
              return sendJson(res, 200, { logs: logger.getAuditLogs({ module, limit }) });
            }
            return sendJson(res, 200, { logs: logger.queryLogs(level, limit) });
          }
          break;
        }
        case 'traces': {
          if (req.method === 'GET') {
            if (apiId) {
              const trace = traceManager.getTrace(apiId);
              if (trace) return sendJson(res, 200, { trace });
              return sendJson(res, 404, { error: 'Trace not found' });
            }
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const limit = parseInt(urlObj.searchParams.get('limit')) || 50;
            return sendJson(res, 200, { traces: traceManager.getRecentTraces(limit) });
          }
          break;
        }
        case 'status': {
          if (req.method === 'GET') {
            return sendJson(res, 200, {
              receiver: receiver.getStats(),
              filter: filter.getStats(),
              cluster: cluster.getStats(),
              threadPool: threadPool.getStats(),
              traceManager: traceManager.getStats(),
              logStats: logger.getLogStats(),
              nodeId: CONFIG.cluster.nodeId,
              uptime: process.uptime(),
              timestamp: new Date().toISOString(),
              ecuInterfaces: CONFIG.ecu.interfaces,
            });
          }
          break;
        }
        default:
          return sendJson(res, 404, { error: 'Unknown API route' });
      }
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }
  return sendJson(res, 404, { error: 'Not found' });
}

function handleRequest(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = urlObj.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (urlPath === '/' || urlPath === '/index.html') {
    return serveStaticFile(path.join(__dirname, '..', 'frontend', 'index.html'), res);
  }
  if (urlPath.startsWith('/frontend/')) {
    const relative = urlPath.replace('/frontend/', '');
    const filePath = path.join(__dirname, '..', 'frontend', relative);
    return serveStaticFile(filePath, res);
  }
  if (urlPath === '/styles.css') {
    return serveStaticFile(path.join(__dirname, '..', 'frontend', 'styles.css'), res);
  }
  if (urlPath === '/app.js') {
    return serveStaticFile(path.join(__dirname, '..', 'frontend', 'app.js'), res);
  }
  if (urlPath === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    clients.add(res);
    sendSSE(res, { type: 'connected', data: { nodeId: CONFIG.cluster.nodeId, timestamp: new Date().toISOString() } });
    req.on('close', () => clients.delete(res));
    return;
  }
  if (urlPath.startsWith('/api/')) {
    return handleApiRequest(req, res, urlPath);
  }
  serveStaticFile(path.join(__dirname, '..', 'frontend', 'index.html'), res);
}

function handleWebSocketUpgrade(req, socket, head) {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nWebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n');
  const clientId = 'ws-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  clientWsMap.set(clientId, socket);
  socket.send = function(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    const frame = Buffer.alloc(2 + msg.length);
    frame[0] = 0x81;
    frame[1] = msg.length;
    frame.write(msg, 2);
    this.write(frame);
  };
  socket.on('close', () => clientWsMap.delete(clientId));
  socket.on('error', () => clientWsMap.delete(clientId));
  socket.on('data', data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } else if (msg.type === 'subscribe') {
        socket.send(JSON.stringify({ type: 'subscribed', channels: msg.channels || [] }));
      }
    } catch (e) {}
  });
  logger.info('Server', `WebSocket client connected: ${clientId}`);
}

const server = http.createServer(handleRequest);
server.on('upgrade', handleWebSocketUpgrade);

function startAll() {
  receiver.start();
  cluster.init();
  server.listen(CONFIG.server.httpPort, CONFIG.server.host, () => {
    logger.info('Server', `HTTP server listening on http://${CONFIG.server.host}:${CONFIG.server.httpPort}`);
    logger.audit('Server', 'Service cluster started', {
      nodeId: CONFIG.cluster.nodeId,
      httpPort: CONFIG.server.httpPort,
      ecuUdpPort: CONFIG.ecu.udpPort,
      ecuTcpPort: CONFIG.ecu.tcpPort,
    });
  });
}

process.on('SIGINT', async () => {
  logger.audit('Server', 'Service shutting down', { nodeId: CONFIG.cluster.nodeId });
  receiver.stop();
  cluster.shutdown();
  await threadPool.shutdown();
  server.close();
  logger.close();
  process.exit(0);
});

process.on('uncaughtException', err => {
  logger.error('Server', 'Uncaught exception', { error: err.message, stack: err.stack });
});

startAll();
