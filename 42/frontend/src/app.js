const App = {
  socket: null,
  state: {
    connected: false,
    channels: [],
    nodes: [],
    alerts: [],
    latestAnalysis: null,
    channelStats: null,
    nodeStats: null,
    groundSyncStatus: null,
    packetCount: 0
  },

  init() {
    this.bindTabs();
    this.startClock();
    ChartManager.init();
    ChannelGrid.init();
    NodeGrid.init();
    AlertPanel.init();
    AuditPanel.init();
    this.connectWebSocket();
    this.loadInitialData();
  },

  bindTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
  },

  startClock() {
    const updateTime = () => {
      const now = new Date();
      document.getElementById('currentTime').textContent = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  connectWebSocket() {
    const socketUrl = window.location.origin;
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.state.connected = true;
      this.updateConnectionStatus(true);
      showToast('已连接到服务器', 'success');
    });

    this.socket.on('disconnect', () => {
      this.state.connected = false;
      this.updateConnectionStatus(false);
      showToast('与服务器断开连接', 'error');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.updateConnectionStatus(false);
    });

    this.socket.on('signalingData', (data) => {
      this.handleSignalingData(data);
    });

    this.socket.on('channelUpdate', (data) => {
      this.handleChannelUpdate(data);
    });

    this.socket.on('analysisResult', (data) => {
      this.handleAnalysisResult(data);
    });

    this.socket.on('anomalyDetected', (alert) => {
      this.handleAnomalyDetected(alert);
    });

    this.socket.on('nodeUpdate', (data) => {
      this.handleNodeUpdate(data);
    });

    this.socket.on('groundSync', (data) => {
      this.handleGroundSync(data);
    });
  },

  async loadInitialData() {
    try {
      const [channelsRes, nodesRes, alertsRes] = await Promise.all([
        api.getChannels(),
        api.getNodes(),
        api.getAlerts()
      ]);

      if (channelsRes.success) {
        this.state.channels = channelsRes.channels;
        ChannelGrid.updateChannels(channelsRes.channels);
        this.updateChannelStats();
        ChartManager.updateProtocolCompareChart(channelsRes.channels);
      }

      if (nodesRes.success) {
        this.state.nodes = nodesRes.nodes;
        NodeGrid.updateNodes(nodesRes.nodes);
        this.updateNodeStats();
      }

      if (alertsRes.success) {
        this.state.alerts = alertsRes.alerts;
        AlertPanel.updateAlerts(alertsRes.alerts);
        this.updateAlertStats();
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  },

  updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (connected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = '已连接';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = '已断开';
    }
  },

  handleSignalingData(data) {
    this.state.packetCount++;
    
    if (this.state.packetCount % 5 === 0) {
      ChartManager.updateTrafficChart(Math.floor(Math.random() * 50 + 10));
    }
  },

  handleChannelUpdate(channel) {
    const index = this.state.channels.findIndex(c => c.id === channel.id);
    if (index >= 0) {
      this.state.channels[index] = channel;
    } else {
      this.state.channels.push(channel);
    }

    ChannelGrid.updateChannels(this.state.channels);
    this.updateChannelStats();
    this.updateCharts();

    if (this.state.channels.length % 10 === 0) {
      ChartManager.updateProtocolCompareChart(this.state.channels);
    }
  },

  handleAnalysisResult(result) {
    this.state.latestAnalysis = result;
    this.state.channelStats = result.channelStats;
    
    this.updateOverview(result);
    this.updateAnalysisPanel(result);
    ChartManager.updateScoreTrendChart(result.overallScore);
  },

  handleAnomalyDetected(alert) {
    showToast('检测到信道异常', 'warning');
    
    alert.anomalies.forEach(anomaly => {
      const newAlert = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        timestamp: alert.timestamp,
        channelId: anomaly.channelId || 'Unknown',
        protocol: anomaly.protocol || 'Unknown',
        frequencyBand: anomaly.frequencyBand || 'Unknown',
        severity: anomaly.severity || 'warning',
        title: anomaly.type,
        description: anomaly.message,
        anomalies: [anomaly],
        qualityScore: alert.overallScore,
        snr: anomaly.value || 0,
        packetLossRate: 0,
        acknowledged: false,
        resolved: false
      };
      this.state.alerts.unshift(newAlert);
    });

    if (this.state.alerts.length > 500) {
      this.state.alerts = this.state.alerts.slice(0, 500);
    }

    AlertPanel.updateAlerts(this.state.alerts);
    this.updateAlertStats();
  },

  handleNodeUpdate(node) {
    const index = this.state.nodes.findIndex(n => n.id === node.id);
    if (index >= 0) {
      this.state.nodes[index] = node;
    } else {
      this.state.nodes.push(node);
    }

    NodeGrid.updateNodes(this.state.nodes);
    this.updateNodeStats();
  },

  handleGroundSync(data) {
    this.state.groundSyncStatus = data;
    this.updateGroundSyncStatus();
  },

  updateChannelStats() {
    const active = this.state.channels.filter(c => c.status === 'active').length;
    const total = this.state.channels.length;
    
    document.getElementById('activeChannels').textContent = active;
    document.getElementById('totalChannels').textContent = total;

    if (active > 0) {
      const avgSnr = this.state.channels
        .filter(c => c.status === 'active')
        .reduce((sum, c) => sum + c.snr, 0) / active;
      
      const avgPl = this.state.channels
        .filter(c => c.status === 'active')
        .reduce((sum, c) => sum + c.packetLossRate, 0) / active;

      document.getElementById('avgSnr').textContent = avgSnr.toFixed(1) + ' dB';
      document.getElementById('avgPacketLoss').textContent = avgPl.toFixed(2) + '%';

      const snrQuality = avgSnr >= 30 ? 'excellent' : avgSnr >= 20 ? 'good' : avgSnr >= 10 ? 'fair' : 'poor';
      const plQuality = avgPl <= 0.01 ? 'excellent' : avgPl <= 0.1 ? 'good' : avgPl <= 1 ? 'fair' : 'poor';

      const qualityTexts = { excellent: '优秀', good: '良好', fair: '一般', poor: '较差' };
      
      const snrEl = document.getElementById('snrQuality');
      const plEl = document.getElementById('packetLossQuality');
      
      snrEl.textContent = qualityTexts[snrQuality];
      snrEl.className = `stat-sub quality ${snrQuality}`;
      
      plEl.textContent = qualityTexts[plQuality];
      plEl.className = `stat-sub quality ${plQuality}`;
    }
  },

  updateNodeStats() {
    const online = this.state.nodes.filter(n => n.status === 'online').length;
    const total = this.state.nodes.length;
    
    document.getElementById('onlineNodes').textContent = online;
    document.getElementById('totalNodes').textContent = total;
  },

  updateAlertStats() {
    const active = this.state.alerts.filter(a => !a.resolved).length;
    const critical = this.state.alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
    
    document.getElementById('activeAlerts').textContent = active;
    document.getElementById('criticalAlerts').textContent = critical;
  },

  updateGroundSyncStatus() {
    if (!this.state.groundSyncStatus) return;

    const statusEl = document.getElementById('groundSyncStatus');
    const timeEl = document.getElementById('lastSyncTime');

    if (this.state.groundSyncStatus.status === 'success') {
      statusEl.textContent = '已同步';
      statusEl.style.color = '#10b981';
    } else {
      statusEl.textContent = '同步失败';
      statusEl.style.color = '#ef4444';
    }

    timeEl.textContent = new Date(this.state.groundSyncStatus.timestamp).toLocaleTimeString();
  },

  updateOverview(analysis) {
    const summary = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    };

    analysis.channelAnalysis.forEach(ch => {
      summary[ch.overallQuality]++;
    });

    ChartManager.updateQualityPieChart(summary);
  },

  updateCharts() {
    const activeChannels = this.state.channels.filter(c => c.status === 'active');
    if (activeChannels.length === 0) return;

    const avgSnr = activeChannels.reduce((sum, c) => sum + c.snr, 0) / activeChannels.length;
    const avgPl = activeChannels.reduce((sum, c) => sum + c.packetLossRate, 0) / activeChannels.length;

    ChartManager.updateSnrChart(avgSnr);
    ChartManager.updatePacketLossChart(avgPl);
  },

  updateAnalysisPanel(result) {
    const scoreCircle = document.getElementById('overallScore');
    const score = result.overallScore;
    
    let quality = 'fair';
    if (score >= 80) quality = 'excellent';
    else if (score >= 60) quality = 'good';
    else if (score >= 40) quality = 'fair';
    else quality = 'poor';

    scoreCircle.className = `score-circle ${quality}`;
    scoreCircle.querySelector('span').textContent = score;

    const recContainer = document.getElementById('recommendations');
    if (result.recommendations.length === 0) {
      recContainer.innerHTML = '<p class="empty">暂无建议</p>';
    } else {
      recContainer.innerHTML = result.recommendations.map(rec => `
        <div class="recommendation-item ${rec.priority}">
          <strong>${rec.type}:</strong> ${rec.message}
          ${rec.channels ? `<br><small>影响信道: ${rec.channels.join(', ')}</small>` : ''}
        </div>
      `).join('');
    }
  }
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
