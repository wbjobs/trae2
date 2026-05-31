class ServerSelector {
  constructor(networkClient) {
    this.networkClient = networkClient;
    this.servers = [];
    this.selectedServer = null;
    
    this.initElements();
    this.initEventListeners();
  }

  initElements() {
    this.elements = {
      modal: document.getElementById('server-select-modal'),
      gameContainer: document.getElementById('game-container'),
      serverList: document.getElementById('server-list'),
      refreshBtn: document.getElementById('refresh-servers'),
      manualIp: document.getElementById('manual-ip'),
      manualPort: document.getElementById('manual-port'),
      manualConnectBtn: document.getElementById('manual-connect-btn')
    };
  }

  initEventListeners() {
    this.elements.refreshBtn.addEventListener('click', () => this.refreshServers());
    
    this.elements.manualConnectBtn.addEventListener('click', () => {
      const ip = this.elements.manualIp.value.trim();
      const port = parseInt(this.elements.manualPort.value) || 3000;
      
      if (ip) {
        this.connectToServer(ip, port);
      } else {
        alert('请输入服务器IP地址');
      }
    });
    
    this.elements.manualIp.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.elements.manualConnectBtn.click();
      }
    });
    
    this.networkClient.on('server_found', (server) => {
      this.addServer(server);
    });
  }

  async refreshServers() {
    this.elements.serverList.innerHTML = `
      <div class="server-loading">
        <div class="loading-spinner"></div>
        <span>正在搜索局域网服务器...</span>
      </div>
    `;
    
    this.servers = [];
    
    try {
      const discoveredServers = await this.networkClient.discoverServers();
      
      discoveredServers.forEach(server => {
        this.addServer(server, false);
      });
      
      if (discoveredServers.length === 0) {
        setTimeout(() => {
          if (this.servers.length === 0) {
            this.showNoServers();
          }
        }, 3000);
      }
    } catch (e) {
      console.error('搜索服务器失败:', e);
      this.showNoServers();
    }
  }

  addServer(server, update = true) {
    const existingIndex = this.servers.findIndex(s => 
      s.address === server.address && s.port === server.port
    );
    
    if (existingIndex !== -1) {
      this.servers[existingIndex] = { ...this.servers[existingIndex], ...server };
    } else {
      this.servers.push(server);
    }
    
    if (update) {
      this.renderServerList();
    } else {
      this.renderServerList();
    }
  }

  showNoServers() {
    this.elements.serverList.innerHTML = `
      <div class="no-servers">
        <p>未发现局域网服务器</p>
        <p style="font-size: 11px; margin-top: 8px;">请确保服务器已启动并在同一网络内</p>
      </div>
    `;
  }

  renderServerList() {
    if (this.servers.length === 0) {
      return;
    }
    
    this.elements.serverList.innerHTML = '';
    
    this.servers.forEach((server, index) => {
      const item = document.createElement('div');
      item.className = 'server-item';
      
      const pingColor = server.ping < 50 ? '#4caf50' : server.ping < 100 ? '#ff9800' : '#f44336';
      
      item.innerHTML = `
        <div class="server-info">
          <div class="server-name">${server.name}</div>
          <div class="server-address">${server.address}:${server.port}</div>
        </div>
        <div class="server-stats">
          <div class="server-players">👥 ${server.players || 0} 人在线</div>
          <div class="server-ping" style="color: ${pingColor}">${server.ping}ms</div>
        </div>
      `;
      
      item.addEventListener('click', () => {
        this.connectToServer(server.address, server.port);
      });
      
      this.elements.serverList.appendChild(item);
    });
  }

  async connectToServer(address, port) {
    this.elements.serverList.innerHTML = `
      <div class="server-loading">
        <div class="loading-spinner"></div>
        <span>正在连接到 ${address}:${port}...</span>
      </div>
    `;
    
    try {
      await this.networkClient.connect(address, port);
      console.log('✓ 服务器连接成功');
      this.startGame();
    } catch (error) {
      console.error('✗ 服务器连接失败:', error);
      alert(`连接失败: ${error.message || '无法连接到服务器'}`);
      this.refreshServers();
    }
  }

  startGame() {
    this.elements.modal.style.display = 'none';
    this.elements.gameContainer.style.display = 'block';
    
    const canvas = document.getElementById('render-canvas');
    const renderer = new EquipmentRenderer(canvas);
    const uiController = new UIController(this.networkClient, renderer);
    
    window.addEventListener('beforeunload', () => {
      this.networkClient.disconnect();
      renderer.dispose();
    });
  }

  start() {
    this.refreshServers();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 野外科考设备运维模拟系统启动');

  const networkClient = new NetworkClient();
  const serverSelector = new ServerSelector(networkClient);
  
  serverSelector.start();
});
