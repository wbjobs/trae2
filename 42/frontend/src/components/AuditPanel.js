const AuditPanel = {
  logs: [],
  currentPage: 1,
  pageSize: 20,
  total: 0,
  filters: {
    category: '',
    keyword: ''
  },

  init() {
    this.bindFilters();
    this.loadLogs();
  },

  bindFilters() {
    document.getElementById('auditCategoryFilter').addEventListener('change', (e) => {
      this.filters.category = e.target.value;
      this.currentPage = 1;
      this.loadLogs();
    });

    document.getElementById('auditKeyword').addEventListener('input', (e) => {
      this.filters.keyword = e.target.value.toLowerCase();
      this.currentPage = 1;
      this.render();
    });
  },

  async loadLogs() {
    try {
      const response = await api.getAuditLogs(this.currentPage, this.pageSize, this.filters.category);
      if (response.success) {
        this.logs = response.records;
        this.total = response.total;
        this.render();
        this.renderStats();
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    }
  },

  getFilteredLogs() {
    if (!this.filters.keyword) return this.logs;
    
    return this.logs.filter(log => {
      const searchText = `${log.action} ${log.operator} ${JSON.stringify(log.details)}`.toLowerCase();
      return searchText.includes(this.filters.keyword);
    });
  },

  renderStats() {
    const container = document.getElementById('auditStats');
    const categoryStats = {
      SYSTEM: 0,
      USER: 0,
      CONFIG: 0,
      ANALYSIS: 0,
      SYNC: 0,
      ALERT: 0
    };

    this.logs.forEach(log => {
      if (categoryStats[log.category] !== undefined) {
        categoryStats[log.category]++;
      }
    });

    const categoryNames = {
      SYSTEM: '系统',
      USER: '用户',
      CONFIG: '配置',
      ANALYSIS: '分析',
      SYNC: '同步',
      ALERT: '告警'
    };

    container.innerHTML = Object.entries(categoryStats).map(([key, value]) => `
      <div class="audit-stat">
        <div class="audit-stat-label">${categoryNames[key]}</div>
        <div class="audit-stat-value">${value}</div>
      </div>
    `).join('');
  },

  render() {
    const tbody = document.getElementById('auditTableBody');
    const filtered = this.getFilteredLogs();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无日志数据</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(log => `
        <tr>
          <td>${new Date(log.timestamp).toLocaleString()}</td>
          <td><span class="category-badge ${log.category}">${log.category}</span></td>
          <td>${log.action}</td>
          <td>${log.operator}</td>
          <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis;">
            ${JSON.stringify(log.details)}
          </td>
        </tr>
      `).join('');
    }

    this.renderPagination();
  },

  renderPagination() {
    const container = document.getElementById('auditPagination');
    const totalPages = Math.ceil(this.total / this.pageSize);

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    
    html += `<button onclick="AuditPanel.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>首页</button>`;
    html += `<button onclick="AuditPanel.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>上一页</button>`;
    
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(totalPages, this.currentPage + 2);
    
    for (let i = start; i <= end; i++) {
      html += `<button class="${i === this.currentPage ? 'active' : ''}" onclick="AuditPanel.goToPage(${i})">${i}</button>`;
    }
    
    html += `<button onclick="AuditPanel.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;
    html += `<button onclick="AuditPanel.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>末页</button>`;

    container.innerHTML = html;
  },

  async goToPage(page) {
    this.currentPage = page;
    await this.loadLogs();
  },

  exportLogs() {
    const dataStr = JSON.stringify(this.logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('日志导出成功', 'success');
  }
};

function exportAuditLogs() {
  AuditPanel.exportLogs();
}
