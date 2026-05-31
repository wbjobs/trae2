const ChartManager = {
  charts: {},
  data: {
    snr: [],
    packetLoss: [],
    score: [],
    traffic: [],
    timestamps: []
  },
  maxDataPoints: 60,

  init() {
    this.createSnrChart();
    this.createPacketLossChart();
    this.createQualityPieChart();
    this.createTrafficChart();
    this.createScoreTrendChart();
    this.createProtocolCompareChart();
  },

  createSnrChart() {
    const ctx = document.getElementById('snrChart').getContext('2d');
    this.charts.snr = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'SNR (dB)',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            min: -10,
            max: 50,
            grid: { color: 'rgba(64, 156, 255, 0.1)' },
            ticks: { color: '#8892b0' }
          }
        }
      }
    });
  },

  createPacketLossChart() {
    const ctx = document.getElementById('packetLossChart').getContext('2d');
    this.charts.packetLoss = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '丢包率 (%)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 10,
            grid: { color: 'rgba(64, 156, 255, 0.1)' },
            ticks: { color: '#8892b0' }
          }
        }
      }
    });
  },

  createQualityPieChart() {
    const ctx = document.getElementById('qualityPieChart').getContext('2d');
    this.charts.qualityPie = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['优秀', '良好', '一般', '较差'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#8892b0', font: { size: 11 } }
          }
        }
      }
    });
  },

  createTrafficChart() {
    const ctx = document.getElementById('trafficChart').getContext('2d');
    this.charts.traffic = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: '信令数据包',
          data: [],
          backgroundColor: 'rgba(64, 156, 255, 0.6)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(64, 156, 255, 0.1)' },
            ticks: { color: '#8892b0' }
          }
        }
      }
    });
  },

  createScoreTrendChart() {
    const ctx = document.getElementById('scoreTrendChart').getContext('2d');
    this.charts.scoreTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '综合评分',
          data: [],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(64, 156, 255, 0.1)' },
            ticks: { color: '#8892b0' }
          }
        }
      }
    });
  },

  createProtocolCompareChart() {
    const ctx = document.getElementById('protocolCompareChart').getContext('2d');
    this.charts.protocolCompare = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['LTE-M', 'GSM-R', '5G-R', 'TETRA'],
        datasets: [{
          label: '平均信噪比',
          data: [0, 0, 0, 0],
          backgroundColor: 'rgba(64, 156, 255, 0.2)',
          borderColor: '#409cff',
          pointBackgroundColor: '#409cff'
        }, {
          label: '质量评分',
          data: [0, 0, 0, 0],
          backgroundColor: 'rgba(100, 255, 218, 0.2)',
          borderColor: '#64ffda',
          pointBackgroundColor: '#64ffda'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#8892b0', font: { size: 11 } }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(64, 156, 255, 0.1)' },
            pointLabels: { color: '#8892b0', font: { size: 10 } },
            ticks: { color: '#8892b0', backdropColor: 'transparent' }
          }
        }
      }
    });
  },

  updateSnrChart(snr) {
    const time = new Date().toLocaleTimeString();
    this.data.timestamps.push(time);
    this.data.snr.push(snr);

    if (this.data.timestamps.length > this.maxDataPoints) {
      this.data.timestamps.shift();
      this.data.snr.shift();
    }

    this.charts.snr.data.labels = this.data.timestamps;
    this.charts.snr.data.datasets[0].data = this.data.snr;
    this.charts.snr.update('none');
  },

  updatePacketLossChart(pl) {
    this.data.packetLoss.push(pl);
    if (this.data.packetLoss.length > this.maxDataPoints) {
      this.data.packetLoss.shift();
    }

    this.charts.packetLoss.data.labels = this.data.timestamps;
    this.charts.packetLoss.data.datasets[0].data = this.data.packetLoss;
    this.charts.packetLoss.update('none');
  },

  updateQualityPieChart(summary) {
    this.charts.qualityPie.data.datasets[0].data = [
      summary.excellent,
      summary.good,
      summary.fair,
      summary.poor
    ];
    this.charts.qualityPie.update();
  },

  updateTrafficChart(packets) {
    this.data.traffic.push(packets);
    if (this.data.traffic.length > this.maxDataPoints) {
      this.data.traffic.shift();
    }

    this.charts.traffic.data.labels = this.data.timestamps;
    this.charts.traffic.data.datasets[0].data = this.data.traffic;
    this.charts.traffic.update('none');
  },

  updateScoreTrendChart(score) {
    this.data.score.push(score);
    if (this.data.score.length > this.maxDataPoints) {
      this.data.score.shift();
    }

    this.charts.scoreTrend.data.labels = this.data.timestamps;
    this.charts.scoreTrend.data.datasets[0].data = this.data.score;
    this.charts.scoreTrend.update('none');
  },

  updateProtocolCompareChart(channels) {
    const protocolData = {};
    const protocols = ['LTE-M', 'GSM-R', '5G-R', 'TETRA'];
    
    protocols.forEach(p => {
      protocolData[p] = { snr: [], score: [], count: 0 };
    });

    channels.forEach(ch => {
      if (protocolData[ch.protocol] && ch.status === 'active') {
        protocolData[ch.protocol].snr.push(ch.snr);
        protocolData[ch.protocol].score.push(this.calculateQualityScore(ch));
        protocolData[ch.protocol].count++;
      }
    });

    const avgSnr = protocols.map(p => {
      const data = protocolData[p];
      return data.count > 0 ? data.snr.reduce((a, b) => a + b, 0) / data.count : 0;
    });

    const avgScore = protocols.map(p => {
      const data = protocolData[p];
      return data.count > 0 ? data.score.reduce((a, b) => a + b, 0) / data.count : 0;
    });

    this.charts.protocolCompare.data.datasets[0].data = avgSnr;
    this.charts.protocolCompare.data.datasets[1].data = avgScore;
    this.charts.protocolCompare.update();
  },

  calculateQualityScore(channel) {
    const snrScore = channel.snr >= 30 ? 100 : channel.snr >= 20 ? 80 : channel.snr >= 10 ? 60 : 40;
    const plScore = channel.packetLossRate <= 0.01 ? 100 : channel.packetLossRate <= 0.1 ? 80 : channel.packetLossRate <= 1 ? 60 : 40;
    return (snrScore + plScore) / 2;
  }
};
