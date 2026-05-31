window.App = (function () {
  const state = {
    removeLogListener: null,
    removeImportedListener: null,
    removeClearedListener: null,
    removeWatchStartedListener: null,
    removeWatchStoppedListener: null,
    autoRefreshTimer: null,
    importInProgress: false
  };

  function showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return iso; }
  }

  function renderLogs(logs) {
    const tbody = document.getElementById('log-tbody');
    const displayLogs = logs.slice(-200).reverse();
    const fragment = document.createDocumentFragment();
    displayLogs.forEach(log => {
      const tr = document.createElement('tr');
      if (log.anomalies) {
        tr.className = 'anomaly-row';
      }
      const anomalyIcon = log.anomalies
        ? `<span class="anomaly-icon" title="${log.anomalies.join(', ')}"></span>`
        : '';
      const anomalyTags = log.anomalies
        ? `<div class="anomaly-tags">${log.anomalies.map(a => `<span class="anomaly-tag">${a}</span>`).join('')}</div>`
        : '';
      const levelBadge = `<span class="badge badge-${log.level}">${log.level.toUpperCase()}</span>`;
      tr.innerHTML = `
        <td>${anomalyIcon}</td>
        <td>${log.id}</td>
        <td>${formatTime(log.timestamp)}</td>
        <td>${levelBadge}</td>
        <td>${log.module}</td>
        <td class="msg">
          ${escapeHtml(log.message)}
          ${anomalyTags}
        </td>
        <td>${log.source || '-'}</td>
      `;
      fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderStats(stats) {
    const container = document.getElementById('stats');
    const items = [
      { label: '总数', value: Store.state.filteredLogs.length, color: '', anomaly: false },
      { label: '异常', value: stats.anomalies, color: 'var(--error)', anomaly: true },
      { label: '错误', value: stats.error, color: 'var(--error)', anomaly: false },
      { label: '警告', value: stats.warn, color: 'var(--warn)', anomaly: false },
      { label: '信息', value: stats.info, color: 'var(--success)', anomaly: false },
      { label: '调试', value: stats.debug, color: 'var(--debug)', anomaly: false }
    ];
    container.innerHTML = items.map(item => `
      <div class="stat-card ${item.anomaly ? 'anomaly' : ''}">
        <div class="label">${item.label}</div>
        <div class="value" style="color:${item.color || 'inherit'}">${item.value}</div>
      </div>
    `).join('');
  }

  function renderWatchedFiles() {
    const container = document.getElementById('watched-files');
    FilterModule.renderWatchedFiles(container, Store.state.watchedFiles);
    container.querySelectorAll('[data-unwatch]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const filePath = e.target.dataset.unwatch;
        const ok = await window.logAPI.unwatchLog(filePath);
        if (ok) {
          Store.setWatchedFiles(Store.state.watchedFiles.filter(f => f !== filePath));
          renderWatchedFiles();
          showToast('已停止监控');
        }
      });
    });
  }

  function refreshAll() {
    const filtered = FilterModule.apply();
    renderLogs(filtered);
    const stats = FilterModule.computeStats(filtered);
    renderStats(stats);
    const chartCanvas = document.getElementById('main-chart');
    const type = document.getElementById('chart-type').value;
    const metric = document.getElementById('chart-metric').value;
    ChartModule.render(chartCanvas, filtered, type, metric);
    FilterModule.renderModuleSelect(document.getElementById('filter-module'));
    renderWatchedFiles();
  }

  async function loadAllLogs() {
    const logs = await window.logAPI.fetchLogs();
    Store.setLogs(logs);
    refreshAll();
  }

  async function loadWatchedFiles() {
    const files = await window.logAPI.getWatchedLogs();
    Store.setWatchedFiles(files);
    renderWatchedFiles();
  }

  function setupAutoRefresh() {
    clearInterval(state.autoRefreshTimer);
    const cfg = Store.state.config;
    if (!cfg || !cfg.ui || cfg.ui.autoRefresh === false) return;
    state.autoRefreshTimer = setInterval(() => {
      if (state.importInProgress) return;
      refreshAll();
    }, cfg.ui.refreshInterval || 1500);
  }

  function bindEvents() {
    document.getElementById('btn-import').addEventListener('click', async () => {
      state.importInProgress = true;
      try {
        const result = await window.logAPI.importLogs();
        if (result && !result.canceled) {
          showToast(`成功导入 ${result.count} 条日志`);
        }
      } finally {
        state.importInProgress = false;
      }
    });

    document.getElementById('btn-watch').addEventListener('click', async () => {
      const result = await window.logAPI.watchLogs();
      if (result && !result.canceled) {
        Store.setWatchedFiles(result.watched);
        renderWatchedFiles();
        showToast(`已监控 ${result.started} 个文件`);
      }
    });

    document.getElementById('btn-clear').addEventListener('click', async () => {
      await window.logAPI.clearLogs();
      Store.clearLogs();
      refreshAll();
      showToast('日志已清空');
    });

    document.getElementById('btn-refresh').addEventListener('click', async () => {
      await loadAllLogs();
      showToast('已刷新');
    });

    document.getElementById('btn-config').addEventListener('click', () => {
      ConfigModule.open();
    });

    document.getElementById('btn-apply-filter').addEventListener('click', () => {
      Store.setFilter({
        keyword: document.getElementById('filter-keyword').value.trim(),
        module: document.getElementById('filter-module').value,
        dateStart: document.getElementById('filter-date-start').value || null,
        dateEnd: document.getElementById('filter-date-end').value || null,
        onlyAnomalies: document.getElementById('filter-anomalies').checked
      });
      refreshAll();
    });

    document.getElementById('btn-reset-filter').addEventListener('click', () => {
      FilterModule.reset();
      FilterModule.renderLevelFilters(
        document.getElementById('filter-levels'),
        Store.state.filter.levels
      );
      document.getElementById('filter-keyword').value = '';
      document.getElementById('filter-module').value = '';
      document.getElementById('filter-date-start').value = '';
      document.getElementById('filter-date-end').value = '';
      document.getElementById('filter-anomalies').checked = false;
      refreshAll();
    });

    document.getElementById('chart-type').addEventListener('change', () => {
      refreshAll();
    });

    document.getElementById('chart-metric').addEventListener('change', () => {
      refreshAll();
    });

    Store.on('config:changed', () => {
      setupAutoRefresh();
    });
  }

  async function init() {
    ConfigModule.init();

    const cfg = await window.configAPI.get();
    Store.setConfig(cfg);
    ConfigModule.applyTheme(cfg.ui?.theme || 'dark');

    FilterModule.renderLevelFilters(
      document.getElementById('filter-levels'),
      Store.state.filter.levels
    );

    bindEvents();

    state.removeLogListener = window.logAPI.onNewLog((entry) => {
      if (!state.importInProgress) {
        Store.addLog(entry);
        refreshAll();
      }
    });

    state.removeImportedListener = window.logAPI.onLogsImported(async (info) => {
      await loadAllLogs();
      showToast(`已加载 ${info.count} 条日志${info.incremental ? '（增量）' : ''}`);
    });

    state.removeWatchStartedListener = window.logAPI.onWatchStarted(async (info) => {
      await loadWatchedFiles();
    });

    state.removeWatchStoppedListener = window.logAPI.onWatchStopped(async (info) => {
      await loadWatchedFiles();
    });

    state.removeClearedListener = window.logAPI.onLogsCleared(() => {
      Store.clearLogs();
      refreshAll();
    });

    await loadAllLogs();
    await loadWatchedFiles();
    setupAutoRefresh();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    showToast,
    refreshAll
  };
})();
