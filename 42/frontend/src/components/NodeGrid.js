const NodeGrid = {
  nodes: [],

  init() {},

  updateNodes(nodes) {
    this.nodes = nodes;
    this.render();
    this.updateStatusBar();
  },

  updateStatusBar() {
    const online = this.nodes.filter(n => n.status === 'online').length;
    const offline = this.nodes.filter(n => n.status === 'offline').length;
    const timeout = this.nodes.filter(n => n.status === 'timeout').length;

    document.getElementById('nodeOnlineCount').textContent = online;
    document.getElementById('nodeOfflineCount').textContent = offline;
    document.getElementById('nodeTimeoutCount').textContent = timeout;
  },

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天${hours % 24}小时`;
    if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟`;
    return `${seconds}秒`;
  },

  getTypeText(type) {
    return {
      'HEAD_END': '车头',
      'MID_TRAIN': '车中',
      'TAIL_END': '车尾'
    }[type] || type;
  },

  render() {
    const grid = document.getElementById('nodeGrid');

    if (this.nodes.length === 0) {
      grid.innerHTML = '<p class="empty">暂无节点数据</p>';
      return;
    }

    grid.innerHTML = this.nodes.map(node => `
      <div class="node-card ${node.status}">
        <div class="node-header">
          <span class="node-name">${node.name}</span>
          <span class="node-type">${this.getTypeText(node.type)}</span>
        </div>
        <div class="node-metrics">
          <div class="node-metric">
            <div class="node-metric-label">CPU</div>
            <div class="node-metric-value" style="color: ${node.cpuUsage > 80 ? '#ef4444' : node.cpuUsage > 60 ? '#f59e0b' : '#10b981'}">${node.cpuUsage.toFixed(1)}%</div>
          </div>
          <div class="node-metric">
            <div class="node-metric-label">内存</div>
            <div class="node-metric-value" style="color: ${node.memoryUsage > 80 ? '#ef4444' : node.memoryUsage > 60 ? '#f59e0b' : '#10b981'}">${node.memoryUsage.toFixed(1)}%</div>
          </div>
          <div class="node-metric">
            <div class="node-metric-label">温度</div>
            <div class="node-metric-value" style="color: ${node.temperature > 70 ? '#ef4444' : node.temperature > 55 ? '#f59e0b' : '#10b981'}">${node.temperature.toFixed(1)}°C</div>
          </div>
        </div>
        <div class="node-location">
          <div>📍 位置: ${node.location.station} (${node.location.km.toFixed(2)} km)</div>
          <div>🚄 速度: ${node.location.speed.toFixed(0)} km/h</div>
          <div>⏱️ 运行时间: ${this.formatUptime(node.uptime)}</div>
          <div>📊 数据包: ${node.metrics.totalPackets.toLocaleString()}</div>
        </div>
      </div>
    `).join('');
  }
};
