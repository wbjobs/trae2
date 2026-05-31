const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const os = require('os');

const GameServer = require('./GameServer');
const ServiceDiscovery = require('./modules/ServiceDiscovery');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/api/server-info', (req, res) => {
  res.json({
    name: '野外科考设备运维模拟服务器',
    version: '1.0.0',
    port: PORT,
    players: gameServer.players ? gameServer.players.getPlayerCount() : 0,
    status: 'running'
  });
});

app.get('/api/servers', (req, res) => {
  const localIPs = getLocalIPs();
  const servers = localIPs.map(ip => ({
    name: '本地服务器',
    address: ip,
    port: PORT,
    players: gameServer.players ? gameServer.players.getPlayerCount() : 0,
    ping: 5
  }));
  res.json(servers);
});

app.use(express.static(path.join(__dirname, '../public')));
app.use('/client', express.static(path.join(__dirname, '../client')));

const gameServer = new GameServer(wss);

const serviceDiscovery = new ServiceDiscovery(PORT);
serviceDiscovery.start();

wss.on('connection', (ws, req) => {
  const clientIP = req.connection.remoteAddress;
  console.log(`玩家连接来自: ${clientIP}`);
  
  gameServer.handleConnection(ws);
  
  ws.on('close', () => {
    setTimeout(() => {
      if (gameServer.players) {
        serviceDiscovery.updateGameInfo({
          players: gameServer.players.getPlayerCount()
        });
      }
    }, 100);
  });
  
  setTimeout(() => {
    if (gameServer.players) {
      serviceDiscovery.updateGameInfo({
        players: gameServer.players.getPlayerCount(),
        status: 'playing'
      });
    }
  }, 500);
});

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('  野外科考设备运维模拟服务器已启动');
  console.log('========================================');
  console.log(`  本地访问: http://localhost:${PORT}`);
  
  const ips = getLocalIPs();
  ips.forEach(ip => {
    console.log(`  局域网: http://${ip}:${PORT}`);
  });
  
  console.log('========================================');
  console.log('  服务发现: 已启用 (UDP 3210)');
  console.log('  支持多人联机: 是');
  console.log('========================================');
});

function getLocalIPs() {
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

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  serviceDiscovery.stop();
  process.exit(0);
});
