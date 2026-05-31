const dgram = require('dgram');
const os = require('os');

class ServiceDiscovery {
  constructor(port = 3000, broadcastPort = 3210) {
    this.serverPort = port;
    this.broadcastPort = broadcastPort;
    this.socket = null;
    this.broadcastInterval = null;
    this.serverName = `野外科考运维-${this.generateId()}`;
    this.gameInfo = {
      players: 0,
      status: 'waiting',
      map: '野外基地'
    };
  }

  generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
    try {
      this.socket = dgram.createSocket('udp4');
      
      this.socket.on('error', (err) => {
        console.log(`服务发现Socket错误: ${err.message}`);
      });

      this.socket.on('listening', () => {
        this.socket.setBroadcast(true);
        console.log(`服务发现已启动，端口: ${this.broadcastPort}`);
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const message = JSON.parse(msg.toString());
          
          if (message.type === 'discover') {
            this.respondToDiscovery(rinfo.address, rinfo.port);
          }
        } catch (e) {
        }
      });

      this.socket.bind(this.broadcastPort, '0.0.0.0', () => {
        this.startPeriodicBroadcast();
      });
      
      return true;
    } catch (e) {
      console.log('服务发现启动失败:', e.message);
      return false;
    }
  }

  startPeriodicBroadcast() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastPresence();
    }, 5000);
    
    this.broadcastPresence();
  }

  broadcastPresence() {
    const ips = this.getLocalIPs();
    
    ips.forEach(ip => {
      const message = Buffer.from(JSON.stringify({
        type: 'presence',
        serverName: this.serverName,
        serverId: this.generateId(),
        address: ip,
        port: this.serverPort,
        httpPort: this.serverPort,
        gameInfo: this.gameInfo,
        timestamp: Date.now()
      }));

      try {
        const broadcastAddr = this.getBroadcastAddress(ip);
        this.socket.send(message, 0, message.length, this.broadcastPort, broadcastAddr);
      } catch (e) {
      }
    });
  }

  getBroadcastAddress(ip) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    }
    return '255.255.255.255';
  }

  respondToDiscovery(targetAddress, targetPort) {
    const ips = this.getLocalIPs();
    
    ips.forEach(ip => {
      const message = Buffer.from(JSON.stringify({
        type: 'discovery_response',
        serverName: this.serverName,
        address: ip,
        port: this.serverPort,
        httpPort: this.serverPort,
        gameInfo: this.gameInfo,
        timestamp: Date.now()
      }));

      this.socket.send(message, 0, message.length, targetPort, targetAddress);
    });
  }

  updateGameInfo(info) {
    this.gameInfo = { ...this.gameInfo, ...info };
  }

  stop() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
      }
      this.socket = null;
    }
  }
}

module.exports = ServiceDiscovery;
