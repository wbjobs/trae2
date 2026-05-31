const AlertPanel = {
  alerts: [],
  filters: {
    severity: '',
    status: ''
  },

  init() {
    this.bindFilters();
  },

  bindFilters() {
    document.getElementById('alertSeverityFilter').addEventListener('change', (e) => {
      this.filters.severity = e.target.value;
      this.renderTable();
    });

    document.getElementById('alertStatusFilter').addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.renderTable();
    });
  },

  updateAlerts(alerts) {
    this.alerts = alerts;
    this.renderRecent();
    this.renderTable();
  },

  getFilteredAlerts() {
    return this.alerts.filter(alert => {
      if (this.filters.severity && alert.severity !== this.filters.severity) return false;
      
      if (this.filters.status) {
        const status = this.getAlertStatus(alert);
        if (status !== this.filters.status) return false;
      }
      
      return true;
    });
  },

  getAlertStatus(alert) {
    if (alert.resolved) return 'resolved';
    if (alert.acknowledged) return 'acknowledged';
    return 'active';
  },

  getStatusText(status) {
    return {
      'active': '活动',
      'acknowledged': '已确认',
      'resolved': '已解决'
    }[status];
  },

  renderRecent() {
    const container = document.getElementById('recentAlerts');
    const recent = this.alerts.slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = '<p class="empty">暂无告警</p>';
      return;
    }

    container.innerHTML = recent.map(alert => `
      <div class="alert-item ${alert.severity}">
        <span class="alert-icon">${alert.severity === 'critical' ? '🚨' : '⚠️'}</span>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
        </div>
      </div>
    `).join('');
  },

  renderTable() {
    const tbody = document.getElementById('alertTableBody');
    const filtered = this.getFilteredAlerts();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无告警数据</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(alert => {
      const status = this.getAlertStatus(alert);
      return `
        <tr>
          <td>${new Date(alert.timestamp).toLocaleString()}</td>
          <td><span class="severity-badge ${alert.severity}">${alert.severity === 'critical' ? '严重' : '警告'}</span></td>
          <td>${alert.channelId}</td>
          <td>${alert.title}</td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${alert.description}</td>
          <td><span class="alert-status ${status}">${this.getStatusText(status)}</span></td>
          <td>
            ${status === 'active' ? `<button class="btn secondary" onclick="acknowledgeAlert('${alert.id}')">确认</button>` : ''}
            ${status === 'acknowledged' ? `<button class="btn" onclick="resolveAlert('${alert.id}')">解决</button>` : ''}
            ${status === 'resolved' ? '✓' : ''}
          </td>
        </tr>
      `;
    }).join('');
  },

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      this.renderRecent();
      this.renderTable();
      showToast('告警已确认', 'success');
    }
  },

  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.renderRecent();
      this.renderTable();
      showToast('告警已解决', 'success');
    }
  },

  markAllRead() {
    this.alerts.forEach(alert => {
      if (!alert.acknowledged && !alert.resolved) {
        alert.acknowledged = true;
        alert.acknowledgedAt = Date.now();
      }
    });
    this.renderRecent();
    this.renderTable();
    showToast('已确认全部告警', 'success');
  }
};

function acknowledgeAlert(alertId) {
  AlertPanel.acknowledgeAlert(alertId);
}

function resolveAlert(alertId) {
  AlertPanel.resolveAlert(alertId);
}

function markAllRead() {
  AlertPanel.markAllRead();
}
