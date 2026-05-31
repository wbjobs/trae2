const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CONFIG = require('../shared/config');
const PhysicsEngine = require('./physicsEngine');
const Utils = require('../shared/utils');

class GameServer {
  constructor() {
    this.port = CONFIG.NETWORK.PORT;
    this.physicsEngine = new PhysicsEngine();
    this.clients = new Map();
    this.server = null;
    this.wss = null;
    this.lastSyncTime = 0;
    this.isRunning = false;
  }

  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    
    return ips;
  }

  start() {
    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocket.Server({ server: this.server });
    
    this.wss.on('connection', (ws, req) => {
      this.handleClientConnection(ws, req);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      const localIPs = this.getLocalIPs();
      console.log('========================================');
      console.log('  深海探测模拟器服务端已启动');
      console.log('========================================');
      console.log(`  HTTP 服务器地址:`);
      console.log(`    本机访问: http://localhost:${this.port}`);
      if (localIPs.length > 0) {
        console.log(`    局域网访问:`);
        localIPs.forEach(ip => {
          console.log(`      http://${ip}:${this.port}`);
        });
      }
      console.log(`  WebSocket 服务器: ws://0.0.0.0:${this.port}`);
      console.log(`  支持最大客户端数: ${CONFIG.NETWORK.MAX_CLIENTS}`);
      console.log('========================================');
    });

    this.isRunning = true;
    this.gameLoop();
  }

  handleHttpRequest(req, res) {
    let url = req.url;
    if (url === '/') {
      url = '/index.html';
    }

    if (url === '/api/server-info') {
      const localIPs = this.getLocalIPs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        port: this.port,
        localIPs: localIPs,
        maxClients: CONFIG.NETWORK.MAX_CLIENTS,
        currentClients: this.clients.size
      }));
      return;
    }

    const filePath = path.join(__dirname, '..', 'client', url);
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (url.startsWith('/shared/')) {
          const sharedPath = path.join(__dirname, '..', url);
          fs.readFile(sharedPath, (err2, data2) => {
            if (err2) {
              res.writeHead(404);
              res.end('File not found');
            } else {
              const ext = path.extname(sharedPath);
              res.writeHead(200, { 'Content-Type': this.getContentType(ext) });
              res.end(data2);
            }
          });
        } else {
          res.writeHead(404);
          res.end('File not found');
        }
      } else {
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': this.getContentType(ext) });
        res.end(data);
      }
    });
  }

  getContentType(ext) {
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif'
    };
    return types[ext] || 'application/octet-stream';
  }

  handleClientConnection(ws, req) {
    const clientId = Utils.generateId();
    const clientIP = req.socket.remoteAddress || req.connection.remoteAddress;
    
    console.log(`客户端连接: ${clientId} (${clientIP}), 当前连接数: ${this.clients.size + 1}`);

    if (this.clients.size >= CONFIG.NETWORK.MAX_CLIENTS) {
      ws.send(JSON.stringify({
        type: 'error',
        message: '服务器已达到最大连接数'
      }));
      ws.close();
      return;
    }

    const client = {
      id: clientId,
      ws: ws,
      lastPing: Date.now(),
      vehicleId: null,
      ip: clientIP
    };

    this.clients.set(clientId, client);

    ws.on('message', (data) => {
      this.handleClientMessage(clientId, data);
    });

    ws.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    ws.on('error', (err) => {
      console.error(`客户端错误 ${clientId}:`, err);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      clientId: clientId,
      config: CONFIG,
      serverInfo: {
        localIPs: this.getLocalIPs(),
        currentClients: this.clients.size
      }
    }));
  }

  handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastPing = Date.now();

    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'join':
          this.handleJoinGame(clientId, message);
          break;
        case 'input':
          this.handleInput(clientId, message.input);
          break;
        case 'startMission':
          this.handleStartMission(clientId, message.missionId);
          break;
        case 'pong':
          client.lastPing = Date.now();
          break;
        case 'chat':
          this.handleChat(clientId, message.message);
          break;
        case 'getPlayers':
          this.sendPlayersList(clientId);
          break;
      }
    } catch (err) {
      console.error(`解析消息失败 ${clientId}:`, err);
    }
  }

  handleJoinGame(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const vehicleId = `vehicle_${clientId}`;
    client.vehicleId = vehicleId;

    const color = message.color || this.getRandomColor();
    const name = message.name || `玩家${clientId.substr(0, 4)}`;

    const vehicle = this.physicsEngine.addVehicle(vehicleId, {
      x: Utils.randomRange(-20, 20),
      y: -50,
      z: Utils.randomRange(-20, 20)
    });
    
    vehicle.color = color;
    vehicle.name = name;

    client.ws.send(JSON.stringify({
      type: 'joined',
      vehicleId: vehicleId,
      state: this.physicsEngine.getState()
    }));

    this.broadcast(JSON.stringify({
      type: 'playerJoined',
      player: {
        id: vehicleId,
        name: name,
        color: color
      }
    }));

    console.log(`玩家加入: ${name} (${clientId}) - IP: ${client.ip}`);
  }

  handleInput(clientId, input) {
    const client = this.clients.get(clientId);
    if (!client || !client.vehicleId) return;
    
    this.physicsEngine.setInput(client.vehicleId, input);
  }

  handleStartMission(clientId, missionId) {
    const client = this.clients.get(clientId);
    if (!client || !client.vehicleId) return;

    const mission = this.physicsEngine.startMission(client.vehicleId, missionId);
    
    if (mission) {
      client.ws.send(JSON.stringify({
        type: 'missionStarted',
        mission: mission
      }));
    }
  }

  handleChat(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const vehicle = this.physicsEngine.vehicles.get(client.vehicleId);
    const name = vehicle ? vehicle.name : '未知玩家';

    this.broadcast(JSON.stringify({
      type: 'chat',
      sender: name,
      message: message,
      timestamp: Date.now()
    }));
  }

  sendPlayersList(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const players = [];
    for (const [id, c] of this.clients) {
      const vehicle = this.physicsEngine.vehicles.get(c.vehicleId);
      if (vehicle) {
        players.push({
          id: c.vehicleId,
          name: vehicle.name,
          color: vehicle.color,
          isSelf: id === clientId
        });
      }
    }

    client.ws.send(JSON.stringify({
      type: 'playersList',
      players: players
    }));
  }

  handleClientDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.vehicleId) {
      this.physicsEngine.removeVehicle(client.vehicleId);
      
      this.broadcast(JSON.stringify({
        type: 'playerLeft',
        vehicleId: client.vehicleId
      }));
    }

    this.clients.delete(clientId);
    console.log(`客户端断开: ${clientId}, 当前连接数: ${this.clients.size}`);
  }

  gameLoop() {
    if (!this.isRunning) return;

    const state = this.physicsEngine.update();

    const now = Date.now();
    if (now - this.lastSyncTime >= CONFIG.NETWORK.SYNC_INTERVAL) {
      this.lastSyncTime = now;
      this.syncState(state);
      this.checkPingTimeout();
    }

    setTimeout(() => this.gameLoop(), 1000 / CONFIG.NETWORK.UPDATE_RATE);
  }

  syncState(state) {
    const stateMessage = JSON.stringify({
      type: 'state',
      state: state
    });

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(stateMessage);
      }
    }
  }

  checkPingTimeout() {
    const now = Date.now();
    for (const [clientId, client] of this.clients) {
      if (now - client.lastPing > CONFIG.NETWORK.PING_TIMEOUT) {
        console.log(`客户端超时断开: ${clientId}`);
        client.ws.close();
      } else {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }
    }
  }

  broadcast(message) {
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  getRandomColor() {
    const colors = ['#00ff88', '#00aaff', '#ffaa00', '#ff4444', '#aa44ff', '#44ffaa'];
    return colors[Utils.randomInt(0, colors.length - 1)];
  }

  stop() {
    this.isRunning = false;
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
    console.log('服务器已停止');
  }
}

const server = new GameServer();
server.start();

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.stop();
  process.exit(0);
});
