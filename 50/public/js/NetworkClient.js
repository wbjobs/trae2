class NetworkClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.playerId = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.serverAddress = null;
    this.discoveredServers = new Map();
    this.heartbeatInterval = null;
  }

  async discoverServers() {
    const servers = [];
    
    servers.push({
      name: '当前服务器',
      address: window.location.hostname,
      port: window.location.port || 80,
      isCurrent: true,
      ping: 0
    });

    try {
      const response = await fetch('/api/servers', {
        method: 'GET',
        timeout: 3000
      });
      
      if (response.ok) {
        const apiServers = await response.json();
        apiServers.forEach(server => {
          if (!servers.find(s => s.address === server.address)) {
            servers.push({
              ...server,
              isCurrent: server.address === window.location.hostname
            });
          }
        });
      }
    } catch (e) {
      console.log('获取服务器列表失败:', e);
    }

    const commonPorts = [3000, 3001, 8080, 8000];
    const localIP = window.location.hostname;
    
    if (localIP !== 'localhost' && localIP !== '127.0.0.1') {
      const ipParts = localIP.split('.');
      if (ipParts.length === 4) {
        const baseIP = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
        
        for (let i = 1; i <= 254; i++) {
          const testIP = `${baseIP}.${i}`;
          if (testIP !== localIP) {
            commonPorts.forEach(port => {
              this.pingServer(testIP, port).then(server => {
                if (server) {
                  const key = `${server.address}:${server.port}`;
                  if (!this.discoveredServers.has(key)) {
                    this.discoveredServers.set(key, server);
                    this.emit('server_found', server);
                  }
                }
              }).catch(() => {});
            });
          }
        }
      }
    }

    return servers;
  }

  async pingServer(address, port, timeout = 2000) {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`http://${address}:${port}/api/server-info`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const info = await response.json();
        const ping = Date.now() - startTime;
        
        return {
          name: info.name || `服务器 ${address}`,
          address: address,
          port: port,
          players: info.players || 0,
          status: info.status || 'online',
          ping: ping,
          version: info.version
        };
      }
    } catch (e) {
    }
    
    return null;
  }

  connect(address = null, port = null) {
    return new Promise((resolve, reject) => {
      let wsUrl;
      
      if (address && port) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${address}:${port}`;
        this.serverAddress = `${address}:${port}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}`;
        this.serverAddress = window.location.host;
      }
      
      console.log(`正在连接到服务器: ${wsUrl}`);
      
      try {
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket连接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('消息解析错误:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log(`WebSocket连接关闭 (代码: ${event.code})`);
          this.isConnected = false;
          this.stopHeartbeat();
          this.emit('disconnected', { code: event.code, reason: event.reason });
          
          if (!event.wasClean) {
            this.attemptReconnect();
          }
        };
      } catch (e) {
        console.error('连接失败:', e);
        reject(e);
      }
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (e) {
          console.error('心跳发送失败:', e);
        }
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.emit('reconnecting', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      
      setTimeout(() => {
        const [address, port] = this.serverAddress ? this.serverAddress.split(':') : [null, null];
        this.connect(address, parseInt(port)).catch(() => {});
      }, 2000 * this.reconnectAttempts);
    } else {
      console.log('已达到最大重连次数');
      this.emit('reconnect_failed');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'init':
        this.playerId = message.playerId;
        this.emit('init', message);
        break;
      case 'game_state':
        this.emit('game_state', message);
        break;
      case 'diagnose_result':
        this.emit('diagnose_result', message);
        break;
      case 'repair_success':
        this.emit('repair_success', message);
        break;
      case 'chat':
        this.emit('chat', message);
        break;
      case 'pong':
        this.emit('pong', message);
        break;
      case 'player_joined':
        this.emit('player_joined', message);
        break;
      case 'player_left':
        this.emit('player_left', message);
        break;
      case 'notification':
        this.emit('notification', message);
        break;
      default:
        this.emit(message.type, message);
    }
  }

  send(message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (e) {
        console.error('发送消息失败:', e);
        return false;
      }
    }
    return false;
  }

  diagnose(equipmentId) {
    return this.send({
      type: 'diagnose',
      equipmentId
    });
  }

  repair(equipmentId, faultType) {
    return this.send({
      type: 'repair',
      equipmentId,
      faultType
    });
  }

  sendChat(content) {
    return this.send({
      type: 'chat',
      content
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`事件监听器错误 (${event}):`, e);
        }
      });
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, '用户断开');
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      serverAddress: this.serverAddress,
      playerId: this.playerId,
      readyState: this.ws ? this.ws.readyState : 0
    };
  }
}
