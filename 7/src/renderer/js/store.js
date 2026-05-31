window.Store = (function () {
  const state = {
    allLogs: [],
    filteredLogs: [],
    filter: {
      levels: ['info', 'warn', 'error', 'debug'],
      module: '',
      keyword: '',
      dateStart: null,
      dateEnd: null,
      onlyAnomalies: false
    },
    config: null,
    modules: new Set(),
    watchedFiles: []
  };

  const listeners = {};

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(cb => cb(payload));
  }

  function setLogs(logs) {
    state.allLogs = logs;
    logs.forEach(l => state.modules.add(l.module));
    emit('logs:updated', state.allLogs);
  }

  function addLog(entry) {
    state.allLogs.push(entry);
    state.modules.add(entry.module);
    emit('log:added', entry);
  }

  function clearLogs() {
    state.allLogs = [];
    state.modules.clear();
    emit('logs:cleared');
  }

  function setFiltered(logs) {
    state.filteredLogs = logs;
    emit('filtered:updated', state.filteredLogs);
  }

  function setFilter(partial) {
    Object.assign(state.filter, partial);
    emit('filter:changed', state.filter);
  }

  function setConfig(cfg) {
    state.config = cfg;
    emit('config:changed', state.config);
  }

  function setWatchedFiles(files) {
    state.watchedFiles = files;
    emit('watched:changed', state.watchedFiles);
  }

  return {
    state,
    on,
    setLogs,
    addLog,
    clearLogs,
    setFiltered,
    setFilter,
    setConfig,
    setWatchedFiles
  };
})();
