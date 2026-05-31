const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const GameLogic = require('./gameLogic');
const Protocol = require('../../shared/protocol');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../../client/web')));

app.get('/api/levels', (req, res) => {
  res.json({ levels: gameLogic.getLevelList() });
});

app.get('/api/saves', (req, res) => {
  const isCloud = req.query.cloud === 'true';
  const result = gameLogic.listSaves(isCloud);
  res.json(result);
});

app.post('/api/saves', (req, res) => {
  const { name, isCloud } = req.body;
  const result = gameLogic.createSave(name, isCloud);
  res.json(result);
});

app.delete('/api/saves/:id', (req, res) => {
  const isCloud = req.query.cloud === 'true';
  const result = gameLogic.deleteSave(req.params.id, isCloud);
  res.json(result);
});

app.post('/api/saves/:id/sync', (req, res) => {
  const { direction } = req.body;
  let result;
  if (direction === 'toCloud') {
    result = gameLogic.syncToCloud(req.params.id);
  } else {
    result = gameLogic.syncFromCloud(req.params.id);
  }
  res.json(result);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const gameLogic = new GameLogic();

function broadcastToAll(type, data, excludeId = null) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
      client.send(message);
    }
  });
}

gameLogic.setBroadcastCallback((type, data) => {
  broadcastToAll(type, data);
});

function sendToPlayer(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
  }
}

wss.on('connection', (ws) => {
  console.log('新客户端连接');

  ws.playerId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case Protocol.MSG_TYPES.PLAYER_JOIN:
          handlePlayerJoin(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PLAYER_LEAVE:
          handlePlayerLeave(ws);
          break;

        case Protocol.MSG_TYPES.PLAYER_ACTION:
          handlePlayerAction(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_GRAB:
          handlePartGrab(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_RELEASE:
          handlePartRelease(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_MOVE:
          handlePartMove(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_ROTATE:
          handlePartRotate(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_ASSEMBLE:
          handlePartAssemble(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PART_DISASSEMBLE:
          handlePartDisassemble(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.LEVEL_LOAD:
          handleLevelLoad(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.LEVEL_LIST:
          handleLevelList(ws);
          break;

        case Protocol.MSG_TYPES.SAVE_CREATE:
          handleSaveCreate(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.SAVE_LOAD:
          handleSaveLoad(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.SAVE_DELETE:
          handleSaveDelete(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.SAVE_LIST:
          handleSaveList(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.SCENE_SYNC:
          handleSceneSync(ws);
          break;

        case Protocol.MSG_TYPES.CHAT_MESSAGE:
          handleChatMessage(ws, msg.data);
          break;

        case Protocol.MSG_TYPES.PING:
          sendToPlayer(ws, Protocol.MSG_TYPES.PONG, { timestamp: Date.now() });
          break;

        default:
          console.log('未知消息类型:', msg.type);
      }
    } catch (error) {
      console.error('消息处理错误:', error);
      sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: error.message });
    }
  });

  ws.on('close', () => {
    if (ws.playerId) {
      console.log('玩家断开连接:', ws.playerId);
      gameLogic.handlePlayerLeave(ws.playerId);
      broadcastToAll(Protocol.MSG_TYPES.PLAYER_LEAVE, { playerId: ws.playerId });
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

function handlePlayerJoin(ws, data) {
  const playerName = data.name || '匿名玩家';
  const result = gameLogic.handlePlayerJoin(ws, playerName);
  ws.playerId = result.playerId;

  sendToPlayer(ws, Protocol.MSG_TYPES.SUCCESS, {
    message: '加入成功',
    playerId: result.playerId,
    player: result.player
  });

  broadcastToAll(Protocol.MSG_TYPES.PLAYER_JOIN, {
    player: result.player
  }, ws.playerId);
}

function handlePlayerLeave(ws) {
  if (ws.playerId) {
    gameLogic.handlePlayerLeave(ws.playerId);
    broadcastToAll(Protocol.MSG_TYPES.PLAYER_LEAVE, { playerId: ws.playerId });
  }
}

function handlePlayerAction(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, data.action, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handlePartGrab(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.GRAB, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handlePartRelease(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.RELEASE, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handlePartMove(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.MOVE, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handlePartRotate(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.ROTATE, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handlePartAssemble(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.ASSEMBLE, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  } else {
    const completion = gameLogic.checkCompletion();
    if (completion.complete) {
      broadcastToAll(Protocol.MSG_TYPES.LEVEL_COMPLETE, {
        levelId: gameLogic.getState().levelId,
        progress: completion
      });
    }
  }
}

function handlePartDisassemble(ws, data) {
  if (!ws.playerId) return;
  const result = gameLogic.handlePlayerAction(ws.playerId, Protocol.ACTIONS.DISASSEMBLE, data);
  if (!result.success) {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handleLevelLoad(ws, data) {
  const result = gameLogic.loadLevel(data.levelId);
  if (result.success) {
    broadcastToAll(Protocol.MSG_TYPES.LEVEL_LOAD, {
      level: result.level,
      state: result.state
    });
  } else {
    sendToPlayer(ws, Protocol.MSG_TYPES.ERROR, { message: result.error });
  }
}

function handleLevelList(ws) {
  const levels = gameLogic.getLevelList();
  sendToPlayer(ws, Protocol.MSG_TYPES.LEVEL_LIST, { levels });
}

function handleSaveCreate(ws, data) {
  const result = gameLogic.createSave(data.name, data.isCloud);
  sendToPlayer(ws, Protocol.MSG_TYPES.SAVE_DATA, result);
}

function handleSaveLoad(ws, data) {
  const result = gameLogic.loadSave(data.saveId, data.isCloud);
  if (result.success) {
    broadcastToAll(Protocol.MSG_TYPES.SCENE_STATE, { state: gameLogic.getState() });
  }
  sendToPlayer(ws, Protocol.MSG_TYPES.SAVE_DATA, result);
}

function handleSaveDelete(ws, data) {
  const result = gameLogic.deleteSave(data.saveId, data.isCloud);
  sendToPlayer(ws, Protocol.MSG_TYPES.SAVE_DATA, result);
}

function handleSaveList(ws, data) {
  const isCloud = data && data.isCloud;
  const result = gameLogic.listSaves(isCloud);
  sendToPlayer(ws, Protocol.MSG_TYPES.SAVE_DATA, result);
}

function handleSceneSync(ws) {
  sendToPlayer(ws, Protocol.MSG_TYPES.SCENE_STATE, { state: gameLogic.getState() });
}

function handleChatMessage(ws, data) {
  if (!ws.playerId) return;
  const player = gameLogic.syncManager.getPlayer(ws.playerId);
  broadcastToAll(Protocol.MSG_TYPES.CHAT_MESSAGE, {
    playerId: ws.playerId,
    playerName: player ? player.name : '未知',
    message: data.message
  });
}

server.listen(PORT, () => {
  console.log(`蒸汽机械联动结构拆装模拟游戏服务器启动`);
  console.log(`服务器运行在: http://localhost:${PORT}`);
  console.log(`WebSocket服务: ws://localhost:${PORT}`);
});
