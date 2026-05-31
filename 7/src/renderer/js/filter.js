window.FilterModule = (function () {
  function apply() {
    const { allLogs, filter } = Store.state;
    const { levels, module, keyword, dateStart, dateEnd, onlyAnomalies } = filter;

    const filtered = allLogs.filter(entry => {
      if (levels.length && !levels.includes(entry.level)) return false;
      if (module && entry.module !== module) return false;
      if (keyword && !entry.message.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (dateStart) {
        const t = new Date(entry.timestamp).getTime();
        if (t < new Date(dateStart).getTime()) return false;
      }
      if (dateEnd) {
        const t = new Date(entry.timestamp).getTime();
        if (t > new Date(dateEnd).getTime()) return false;
      }
      if (onlyAnomalies && !entry.anomalies) return false;
      return true;
    });

    Store.setFiltered(filtered);
    return filtered;
  }

  function reset() {
    Store.setFilter({
      levels: AppConstants.ALL_LEVELS.slice(),
      module: '',
      keyword: '',
      dateStart: null,
      dateEnd: null,
      onlyAnomalies: false
    });
  }

  function computeStats(logs) {
    const byLevel = { info: 0, warn: 0, error: 0, debug: 0 };
    let anomalyCount = 0;
    logs.forEach(l => {
      if (byLevel[l.level] != null) byLevel[l.level]++;
      if (l.anomalies) anomalyCount++;
    });
    return { ...byLevel, anomalies: anomalyCount };
  }

  function renderLevelFilters(container, levels) {
    container.innerHTML = '';
    AppConstants.ALL_LEVELS.forEach(level => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = level;
      checkbox.checked = levels.includes(level);
      checkbox.addEventListener('change', () => {
        const current = new Set(Store.state.filter.levels);
        if (checkbox.checked) current.add(level);
        else current.delete(level);
        Store.setFilter({ levels: Array.from(current) });
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + AppConstants.LEVEL_LABELS[level]));
      container.appendChild(label);
    });
  }

  function renderModuleSelect(selectEl) {
    const current = Store.state.filter.module;
    selectEl.innerHTML = '<option value="">全部</option>';
    Array.from(Store.state.modules).sort().forEach(mod => {
      const opt = document.createElement('option');
      opt.value = mod;
      opt.textContent = mod;
      if (mod === current) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function renderWatchedFiles(container, files) {
    if (files.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:12px">暂无监控文件</div>';
      return;
    }
    container.innerHTML = files.map(file => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:8px;" title="${file}">${file.split(/[/\\]/).pop()}</span>
        <button class="btn btn-small" data-unwatch="${file}" style="padding:2px 8px;font-size:11px;">停止</button>
      </div>
    `).join('');
  }

  return {
    apply,
    reset,
    computeStats,
    renderLevelFilters,
    renderModuleSelect,
    renderWatchedFiles
  };
})();
