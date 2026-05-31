const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const itemData = require('./modules/itemData');
const SceneSync = require('./modules/sceneSync');
const SaveManager = require('./modules/saveManager');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_INTERVAL = 30000;
const STATE_SYNC_THROTTLE = 50;

const sceneSync = new SceneSync();
const saveManager = new SaveManager();
const clients = new Map();
let clientIdCounter = 0;
let lastBroadcastTime = 0;
let pendingBroadcast = null;

sceneSync.subscribe((syncMsg) => {
  const now = Date.now();
  if (syncMsg.type === 'full') {
    broadcastFullState();
    return;
  }

  if (now - lastBroadcastTime < STATE_SYNC_THROTTLE) {
    if (!pendingBroadcast) {
      pendingBroadcast = { delta: {}, events: [] };
      setTimeout(() => {
        if (pendingBroadcast) {
          broadcastDelta(pendingBroadcast);
          pendingBroadcast = null;
        }
      }, STATE_SYNC_THROTTLE);
    }
    if (syncMsg.delta) {
      Object.assign(pendingBroadcast.delta, syncMsg.delta);
    }
    if (syncMsg.events) {
      pendingBroadcast.events.push(...syncMsg.events);
    }
    if (syncMsg.playerMoved) {
      pendingBroadcast.playerMoved = syncMsg.playerMoved;
    }
    if (syncMsg.crafted) {
      pendingBroadcast.crafted = syncMsg.crafted;
    }
  } else {
    lastBroadcastTime = now;
    broadcastDelta(syncMsg);
  }
});

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/client/client.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, clientTracking: true });

function broadcastFullState() {
  for (const [clientId, ws] of clients) {
    if (ws.readyState !== ws.OPEN) continue;
    const snap = sceneSync.getPlayerSnapshot(clientId);
    ws.send(JSON.stringify({
      type: 'stateUpdate',
      state: snap.global,
      self: snap.self,
      playerId: clientId,
      version: snap.version
    }));
  }
}

function broadcastDelta(syncMsg) {
  lastBroadcastTime = Date.now();
  for (const [clientId, ws] of clients) {
    if (ws.readyState !== ws.OPEN) continue;
    const snap = sceneSync.getPlayerSnapshot(clientId);
    ws.send(JSON.stringify({
      type: 'deltaUpdate',
      delta: syncMsg.delta || {},
      self: syncMsg.playerMoved && syncMsg.playerMoved.playerId === clientId
        ? { currentScene: syncMsg.playerMoved.sceneId }
        : undefined,
      events: syncMsg.events,
      crafted: syncMsg.crafted,
      version: snap.version
    }));
  }
}

function broadcast(message, exceptId) {
  const data = JSON.stringify(message);
  for (const [id, ws] of clients) {
    if (id === exceptId) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function sendToClient(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function handleMessage(ws, rawMessage) {
  let msg;
  try {
    msg = JSON.parse(rawMessage);
  } catch (e) {
    sendToClient(ws, { type: 'error', error: '无效的消息格式' });
    return;
  }

  const clientId = ws._clientId;
  if (!clientId) {
    sendToClient(ws, { type: 'error', error: '未注册的客户端' });
    return;
  }

  switch (msg.type) {
    case 'ping':
      sendToClient(ws, { type: 'pong', t: Date.now() });
      break;

    case 'getState': {
      const snap = sceneSync.getPlayerSnapshot(clientId);
      sendToClient(ws, {
        type: 'stateUpdate',
        state: snap.global,
        self: snap.self,
        playerId: clientId,
        version: snap.version,
        itemData: {
          items: itemData.items,
          recipes: itemData.recipes,
          scenes: itemData.scenes
        }
      });
      break;
    }

    case 'requestHint': {
      if (!msg.itemId) break;
      const hint = sceneSync.getHint(clientId, msg.itemId);
      if (hint) {
        sendToClient(ws, { type: 'hint', itemId: msg.itemId, hint });
      } else {
        sendToClient(ws, { type: 'hint', itemId: msg.itemId, hint: null });
      }
      break;
    }

    case 'pickUp': {
      if (!msg.itemId) {
        sendToClient(ws, { type: 'pickUpFailed', reason: '缺少 itemId' });
        break;
      }
      const result = sceneSync.pickUpItem(clientId, msg.itemId);
      if (result.success) {
        sendToClient(ws, { type: 'pickUpSuccess', itemId: msg.itemId, item: result.item, events: result.events });
        broadcast({ type: 'itemPicked', itemId: msg.itemId, by: clientId }, clientId);
      } else {
        sendToClient(ws, { type: 'pickUpFailed', reason: result.reason, itemId: msg.itemId });
      }
      break;
    }

    case 'moveTo': {
      if (!msg.sceneId) {
        sendToClient(ws, { type: 'moveFailed', reason: '缺少 sceneId' });
        break;
      }
      const result = sceneSync.moveToScene(clientId, msg.sceneId);
      if (result.success) {
        sendToClient(ws, { type: 'moveSuccess', sceneId: msg.sceneId, scene: result.scene });
      } else {
        sendToClient(ws, { type: 'moveFailed', reason: result.reason, sceneId: msg.sceneId });
      }
      break;
    }

    case 'craft': {
      if (!Array.isArray(msg.ingredients) || msg.ingredients.length < 2) {
        sendToClient(ws, { type: 'craftFailed', reason: '至少需要两种物品' });
        break;
      }
      const result = sceneSync.craftItems(msg.ingredients);
      if (result.success) {
        broadcast({
          type: 'craftSuccess',
          ingredients: msg.ingredients,
          result: result.result.id,
          resultName: result.result.name,
          by: clientId,
          events: result.events
        });
      } else {
        sendToClient(ws, { type: 'craftFailed', reason: result.reason });
      }
      break;
    }

    case 'saveGame': {
      if (!msg.slotId) {
        sendToClient(ws, { type: 'saveResult', success: false, error: '缺少存档名称' });
        break;
      }
      const mode = msg.mode || 'both';
      const fullSnap = sceneSync.getSnapshot();
      const result = saveManager.save(msg.slotId, fullSnap, { mode });
      sendToClient(ws, { type: 'saveResult', ...result, slotId: msg.slotId });
      break;
    }

    case 'loadGame': {
      if (!msg.slotId) {
        sendToClient(ws, { type: 'loadFailed', reason: '缺少存档名称' });
        break;
      }
      const prefer = msg.prefer || 'local';
      const result = saveManager.load(msg.slotId, { prefer });
      if (result.success) {
        sceneSync.loadState(result.data);
        broadcast({ type: 'gameLoaded', slotId: msg.slotId, by: clientId });
      } else {
        sendToClient(ws, { type: 'loadFailed', reason: result.error, slotId: msg.slotId });
      }
      break;
    }

    case 'listSaves': {
      const localSaves = saveManager.listLocalSaves();
      const cloudSaves = saveManager.listCloudSaves();
      sendToClient(ws, {
        type: 'saveList',
        local: localSaves.success ? localSaves.saves : [],
        cloud: cloudSaves.success ? cloudSaves.saves : []
      });
      break;
    }

    case 'deleteSave': {
      if (!msg.slotId) break;
      const local = saveManager.deleteLocalSave(msg.slotId);
      const cloud = saveManager.deleteCloudSave(msg.slotId);
      sendToClient(ws, {
        type: 'deleteResult',
        slotId: msg.slotId,
        local,
        cloud
      });
      break;
    }

    case 'resetGame': {
      sceneSync.reset();
      broadcast({ type: 'gameReset', by: clientId });
      break;
    }

    case 'chat': {
      if (msg.text) {
        broadcast({
          type: 'chat',
          from: clientId,
          text: String(msg.text).slice(0, 200),
          timestamp: Date.now()
        });
      }
      break;
    }

    case 'syncCloud': {
      if (msg.slotId && msg.direction) {
        let syncResult;
        if (msg.direction === 'localToCloud') {
          syncResult = saveManager.syncLocalToCloud(msg.slotId);
        } else {
          syncResult = saveManager.syncCloudToLocal(msg.slotId);
        }
        sendToClient(ws, { type: 'syncResult', ...syncResult, slotId: msg.slotId });
      }
      break;
    }

    default:
      sendToClient(ws, { type: 'error', error: `未知消息类型: ${msg.type}` });
  }
}

function setupHeartbeat(ws, clientId) {
  ws._lastPong = Date.now();
  ws._heartbeat = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(ws._heartbeat);
      return;
    }
    if (Date.now() - ws._lastPong > HEARTBEAT_INTERVAL * 2) {
      console.log(`[心跳] 客户端 ${clientId} 超时，断开连接`);
      ws.terminate();
      return;
    }
    sendToClient(ws, { type: 'ping', t: Date.now() });
  }, HEARTBEAT_INTERVAL);
}

wss.on('connection', (ws) => {
  clientIdCounter++;
  const clientId = `player_${clientIdCounter}`;
  ws._clientId = clientId;
  clients.set(clientId, ws);

  sceneSync._ensurePlayer(clientId);
  setupHeartbeat(ws, clientId);

  console.log(`[${new Date().toISOString()}] 客户端 ${clientId} 已连接，当前在线: ${clients.size}`);

  const snap = sceneSync.getPlayerSnapshot(clientId);
  sendToClient(ws, {
    type: 'welcome',
    clientId,
    state: snap.global,
    self: snap.self,
    version: snap.version,
    itemData: {
      items: itemData.items,
      recipes: itemData.recipes,
      scenes: itemData.scenes
    },
    playerCount: clients.size,
    heartbeatInterval: HEARTBEAT_INTERVAL
  });

  broadcast({ type: 'playerJoined', clientId, playerCount: clients.size }, clientId);

  ws.on('message', (raw) => {
    try {
      const str = raw.toString();
      const msg = JSON.parse(str);
      if (msg.type === 'pong') {
        ws._lastPong = Date.now();
        return;
      }
      handleMessage(ws, str);
    } catch (err) {
      console.error(`[消息处理错误] ${clientId}:`, err.message);
    }
  });

  ws.on('close', () => {
    if (ws._heartbeat) clearInterval(ws._heartbeat);
    clients.delete(clientId);
    sceneSync.removePlayer(clientId);
    console.log(`[${new Date().toISOString()}] 客户端 ${clientId} 已断开，当前在线: ${clients.size}`);
    broadcast({ type: 'playerLeft', clientId, playerCount: clients.size });
  });

  ws.on('error', (err) => {
    if (ws._heartbeat) clearInterval(ws._heartbeat);
    console.error(`[${new Date().toISOString()}] 客户端 ${clientId} 错误:`, err.message);
    clients.delete(clientId);
    sceneSync.removePlayer(clientId);
  });
});

server.listen(PORT, HOST, () => {
  console.log('============================================');
  console.log('  秘境探索 - 道具交互解谜游戏服务已启动');
  console.log('============================================');
  console.log(`  服务器地址: http://${HOST}:${PORT}`);
  console.log(`  WebSocket:   ws://${HOST}:${PORT}`);
  console.log(`  本地访问:    http://localhost:${PORT}`);
  console.log('--------------------------------------------');
  console.log(`  游戏场景: ${Object.keys(itemData.scenes).length} 个`);
  console.log(`  可拾取道具: ${Object.values(itemData.items).filter(i => !i.crafted).length} 件`);
  console.log(`  合成配方:   ${itemData.recipes.length} 个`);
  console.log(`  事件触发器: ${itemData.getAllEvents().length} 个`);
  console.log('--------------------------------------------');
  console.log(`  心跳间隔:   ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log(`  同步节流:   ${STATE_SYNC_THROTTLE}ms`);
  console.log(`  存档目录:   ${path.resolve(saveManager.saveDir)}`);
  console.log('============================================');
});

process.on('SIGINT', () => {
  console.log('\n[服务器] 正在关闭...');
  for (const [, ws] of clients) {
    if (ws._heartbeat) clearInterval(ws._heartbeat);
    ws.close();
  }
  wss.close();
  server.close(() => process.exit(0));
});