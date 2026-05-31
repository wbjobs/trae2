const ChannelGrid = {
  channels: [],
  filters: {
    protocol: '',
    quality: '',
    search: ''
  },

  init() {
    this.bindFilters();
  },

  bindFilters() {
    document.getElementById('protocolFilter').addEventListener('change', (e) => {
      this.filters.protocol = e.target.value;
      this.render();
    });

    document.getElementById('qualityFilter').addEventListener('change', (e) => {
      this.filters.quality = e.target.value;
      this.render();
    });

    document.getElementById('channelSearch').addEventListener('input', (e) => {
      this.filters.search = e.target.value.toLowerCase();
      this.render();
    });
  },

  updateChannels(channels) {
    this.channels = channels;
    this.render();
  },

  getFilteredChannels() {
    return this.channels.filter(ch => {
      if (this.filters.protocol && ch.protocol !== this.filters.protocol) return false;
      
      if (this.filters.quality) {
        const quality = this.getQuality(ch);
        if (quality !== this.filters.quality) return false;
      }

      if (this.filters.search) {
        const searchText = `${ch.id} ${ch.protocol} ${ch.frequencyBand}`.toLowerCase();
        if (!searchText.includes(this.filters.search)) return false;
      }

      return true;
    });
  },

  getQuality(channel) {
    if (channel.status !== 'active') return 'inactive';
    if (channel.snr >= 30) return 'excellent';
    if (channel.snr >= 20) return 'good';
    if (channel.snr >= 10) return 'fair';
    return 'poor';
  },

  getQualityClass(channel) {
    return this.getQuality(channel);
  },

  getSnrClass(snr) {
    if (snr >= 30) return 'good';
    if (snr >= 20) return 'good';
    if (snr >= 10) return 'warning';
    return 'danger';
  },

  getPacketLossClass(pl) {
    if (pl <= 0.01) return 'good';
    if (pl <= 0.1) return 'good';
    if (pl <= 1) return 'warning';
    return 'danger';
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  },

  render() {
    const grid = document.getElementById('channelGrid');
    const filtered = this.getFilteredChannels();

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty">没有匹配的信道</p>';
      return;
    }

    grid.innerHTML = filtered.map(ch => {
      const quality = this.getQuality(ch);
      const qualityText = {
        excellent: '优秀',
        good: '良好',
        fair: '一般',
        poor: '较差',
        inactive: '未激活'
      }[quality];

      return `
        <div class="channel-card ${this.getQualityClass(ch)}">
          <div class="channel-header">
            <span class="channel-id">${ch.id}</span>
            <span class="channel-protocol">${ch.protocol}</span>
          </div>
          <div class="channel-metrics">
            <div class="metric">
              <div class="metric-label">信噪比</div>
              <div class="metric-value ${this.getSnrClass(ch.snr)}">${ch.snr.toFixed(1)} dB</div>
            </div>
            <div class="metric">
              <div class="metric-label">丢包率</div>
              <div class="metric-value ${this.getPacketLossClass(ch.packetLossRate)}">${ch.packetLossRate.toFixed(2)}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">延迟</div>
              <div class="metric-value">${ch.latency.toFixed(0)} ms</div>
            </div>
            <div class="metric">
              <div class="metric-label">抖动</div>
              <div class="metric-value">${ch.jitter.toFixed(0)} ms</div>
            </div>
          </div>
          <div class="channel-status">
            <span class="status-badge ${ch.status}">${ch.status === 'active' ? '活动' : '未激活'}</span>
            <span class="update-time">更新于 ${this.formatTime(ch.lastUpdate)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
};
