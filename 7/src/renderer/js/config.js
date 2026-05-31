window.ConfigModule = (function () {
  let modal, form, closeBtn, saveBtn, resetBtn;

  function init() {
    modal = document.getElementById('config-modal');
    closeBtn = document.getElementById('config-close');
    saveBtn = document.getElementById('cfg-save');
    resetBtn = document.getElementById('cfg-reset');

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    saveBtn.addEventListener('click', save);
    resetBtn.addEventListener('click', reset);
  }

  function open() {
    fillForm(Store.state.config);
    modal.classList.remove('hidden');
  }

  function close() {
    modal.classList.add('hidden');
  }

  function fillForm(cfg) {
    if (!cfg) return;
    document.getElementById('cfg-max-logs').value = cfg.maxLogs || 10000;
    document.getElementById('cfg-theme').value = cfg.ui?.theme || 'dark';
    document.getElementById('cfg-auto-refresh').checked = cfg.ui?.autoRefresh !== false;
    document.getElementById('cfg-refresh-interval').value = cfg.ui?.refreshInterval || 1500;
    document.getElementById('cfg-chart-type').value = cfg.ui?.chartType || 'bar';
  }

  async function save() {
    const partial = {
      maxLogs: parseInt(document.getElementById('cfg-max-logs').value, 10) || 10000,
      ui: {
        theme: document.getElementById('cfg-theme').value,
        autoRefresh: document.getElementById('cfg-auto-refresh').checked,
        refreshInterval: parseInt(document.getElementById('cfg-refresh-interval').value, 10) || 1500,
        chartType: document.getElementById('cfg-chart-type').value
      }
    };
    const cfg = await window.configAPI.save(partial);
    if (cfg) {
      Store.setConfig(cfg);
      applyTheme(cfg.ui.theme);
      close();
      window.App.showToast('配置已保存');
    }
  }

  async function reset() {
    const cfg = await window.configAPI.reset();
    if (cfg) {
      Store.setConfig(cfg);
      fillForm(cfg);
      applyTheme(cfg.ui.theme);
      window.App.showToast('已恢复默认配置');
    }
  }

  function applyTheme(theme) {
    if (theme === 'light') document.body.classList.add('theme-light');
    else document.body.classList.remove('theme-light');
  }

  return { init, open, close, applyTheme };
})();
