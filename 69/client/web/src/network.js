class NetworkClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.serverUrl = null;
    this.serverTimeOffset = 0;
    this.lastPingTime = 0;
    this.latency = 0;
  }

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      try {
        this.serverUrl = serverUrl || `ws://${window.location.hostname}:3000`;
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('连接服务器成功');
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected', {});
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
          } catch (error) {
            console.error('消息解析错误:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('与服务器断开连接');
          this.connected = false;
          this.emit('disconnected', {});
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('连接错误:', error);
          this.emit('error', { error });
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect(this.serverUrl).catch(err => {
          console.error('重连失败:', err);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  handleMessage(msg) {
    const { type, data, timestamp } = msg;

    if (timestamp) {
      this.serverTimeOffset = timestamp - Date.now();
    }

    if (type === 'pong' && data?.timestamp) {
      this.latency = Date.now() - this.lastPingTime;
    }

    if (type === 'part_state' && data?.batch) {
      if (data.compressed && data.parts) {
        data.parts.forEach(part => {
          this.emit('part_state', { partId: part.id, part });
        });
      } else if (data.parts) {
        data.parts.forEach(part => {
          this.emit('part_state', { partId: part.id, part });
        });
      }
    } else if (type === 'part_state') {
      if (data.part) {
        this.emit('part_state', { partId: data.partId, part: data.part });
      }
    } else {
      this.emit(type, data);
    }

    this.emit('message', { type, data, timestamp });
  }

  send(type, data = {}) {
    if (!this.connected || !this.ws) {
      console.warn('未连接到服务器');
      return false;
    }

    const msg = JSON.stringify({ type, data });
    this.ws.send(msg);
    return true;
  }

  joinGame(playerName) {
    this.send('player_join', { name: playerName });
  }

  leaveGame() {
    this.send('player_leave', {});
  }

  grabPart(partId) {
    this.send('part_grab', { partId });
  }

  releasePart(partId) {
    this.send('part_release', { partId });
  }

  movePart(partId, position) {
    this.send('part_move', { partId, position });
  }

  rotatePart(partId, rotation) {
    this.send('part_rotate', { partId, rotation });
  }

  assemblePart(partId) {
    this.send('part_assemble', { partId });
  }

  disassemblePart(partId) {
    this.send('part_disassemble', { partId });
  }

  loadLevel(levelId) {
    this.send('level_load', { levelId });
  }

  getLevelList() {
    this.send('level_list', {});
  }

  createSave(name, isCloud = false) {
    this.send('save_create', { name, isCloud });
  }

  loadSave(saveId, isCloud = false) {
    this.send('save_load', { saveId, isCloud });
  }

  deleteSave(saveId, isCloud = false) {
    this.send('save_delete', { saveId, isCloud });
  }

  getSaveList(isCloud = false) {
    this.send('save_list', { isCloud });
  }

  syncSave(saveId, direction) {
    this.send('save_sync', { saveId, direction });
  }

  requestSync() {
    this.send('scene_sync', {});
  }

  sendChatMessage(message) {
    this.send('chat_message', { message });
  }

  ping() {
    this.send('ping', {});
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件处理错误 [${event}]:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.ws) {
      this.leaveGame();
      this.ws.close();
    }
  }
}

window.NetworkClient = NetworkClient;
