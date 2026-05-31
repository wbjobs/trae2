import TerrainRenderer from './renderer/TerrainRenderer.js';
import GameClient from './network/GameClient.js';

class TerrainSandbox {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.renderer = new TerrainRenderer(this.container);
    this.client = new GameClient();
    
    this.fpsCounter = 0;
    this.lastFpsTime = Date.now();
    this.animationId = null;
    
    this.currentDisaster = null;
    this.snapshots = [];
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.animate();
  }

  setupEventListeners() {
    document.getElementById('connect-btn').addEventListener('click', () => this.connectToServer());

    document.querySelectorAll('.section-title').forEach(title => {
      title.addEventListener('click', () => {
        title.parentElement.classList.toggle('collapsed');
      });
    });

    this.setupSimulationControls();
    this.setupWaterControls();
    this.setupWindControls();
    this.setupTerrainControls();
    this.setupPresetButtons();
    this.setupSaveControls();
    this.setupSnapshotControls();
    this.setupDisasterControls();
    this.setupPerformanceControls();

    this.client.on('connected', (data) => this.onConnected(data));
    this.client.on('disconnected', () => this.onDisconnected());
    this.client.on('terrainFull', (data) => this.onTerrainFull(data));
    this.client.on('terrainUpdate', (data) => this.onTerrainUpdate(data));
    this.client.on('terrainRegenerated', () => this.onTerrainRegenerated());
    this.client.on('playerJoined', (player) => this.onPlayerJoined(player));
    this.client.on('playerLeft', (playerId) => this.onPlayerLeft(playerId));
    this.client.on('playerList', (players) => this.onPlayerList(players));
    this.client.on('playerMove', (data) => this.onPlayerMove(data));
    this.client.on('configUpdate', (config) => this.onConfigUpdate(config));
    this.client.on('saveList', (data) => this.onSaveList(data));
    this.client.on('snapshotList', (data) => this.onSnapshotList(data));
    this.client.on('snapshotCreated', (data) => this.onSnapshotCreated(data));
    this.client.on('snapshotRestored', (data) => this.onSnapshotRestored(data));
    this.client.on('snapshotDeleted', (data) => this.onSnapshotDeleted(data));
    this.client.on('disasterEvent', (data) => this.onDisasterEvent(data));
    this.client.on('latencyUpdate', (data) => this.onLatencyUpdate(data));
  }

  setupSimulationControls() {
    const toggle = document.getElementById('simulation-toggle');
    toggle.addEventListener('change', (e) => {
      this.client.toggleSimulation(e.target.checked);
    });

    const speedSlider = document.getElementById('simulation-speed');
    speedSlider.addEventListener('input', (e) => {
      document.getElementById('speed-value').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });
    speedSlider.addEventListener('change', (e) => {
      this.client.setSimulationSpeed(parseFloat(e.target.value));
    });
  }

  setupWaterControls() {
    document.getElementById('water-enabled').addEventListener('change', (e) => {
      this.client.updateConfig({ waterErosion: { enabled: e.target.checked } });
    });

    const rainSlider = document.getElementById('rain-rate');
    rainSlider.addEventListener('input', (e) => {
      document.getElementById('rain-value').textContent = parseFloat(e.target.value).toFixed(1);
    });
    rainSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ waterErosion: { rainRate: parseFloat(e.target.value) } });
    });

    const erosionSlider = document.getElementById('water-erosion');
    erosionSlider.addEventListener('input', (e) => {
      document.getElementById('water-erosion-value').textContent = parseFloat(e.target.value).toFixed(2);
    });
    erosionSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ waterErosion: { erosionStrength: parseFloat(e.target.value) } });
    });

    const depositionSlider = document.getElementById('deposition-rate');
    depositionSlider.addEventListener('input', (e) => {
      document.getElementById('deposition-value').textContent = parseFloat(e.target.value).toFixed(2);
    });
    depositionSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ waterErosion: { depositionRate: parseFloat(e.target.value) } });
    });
  }

  setupWindControls() {
    document.getElementById('wind-enabled').addEventListener('change', (e) => {
      this.client.updateConfig({ windErosion: { enabled: e.target.checked } });
    });

    const strengthSlider = document.getElementById('wind-strength');
    strengthSlider.addEventListener('input', (e) => {
      document.getElementById('wind-strength-value').textContent = parseFloat(e.target.value).toFixed(1);
    });
    strengthSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ windErosion: { windStrength: parseFloat(e.target.value) } });
    });

    const directionSlider = document.getElementById('wind-direction');
    directionSlider.addEventListener('input', (e) => {
      document.getElementById('wind-direction-value').textContent = e.target.value + '°';
    });
    directionSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ windErosion: { windDirection: parseInt(e.target.value) } });
    });

    const abrasionSlider = document.getElementById('abrasion-rate');
    abrasionSlider.addEventListener('input', (e) => {
      document.getElementById('abrasion-value').textContent = parseFloat(e.target.value).toFixed(2);
    });
    abrasionSlider.addEventListener('change', (e) => {
      this.client.updateConfig({ windErosion: { abrasionRate: parseFloat(e.target.value) } });
    });
  }

  setupTerrainControls() {
    const sizeSlider = document.getElementById('terrain-size');
    sizeSlider.addEventListener('input', (e) => {
      document.getElementById('terrain-size-value').textContent = e.target.value;
    });

    const heightSlider = document.getElementById('height-multiplier');
    heightSlider.addEventListener('input', (e) => {
      document.getElementById('height-multiplier-value').textContent = e.target.value;
    });

    document.getElementById('regenerate-terrain').addEventListener('click', () => {
      const config = {
        size: parseInt(document.getElementById('terrain-size').value),
        heightMultiplier: parseInt(document.getElementById('height-multiplier').value),
        seed: parseInt(document.getElementById('terrain-seed').value)
      };
      this.client.regenerateTerrain(config);
    });
  }

  setupPresetButtons() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        this.client.applyPreset(preset);
      });
    });
  }

  setupSaveControls() {
    document.getElementById('save-game').addEventListener('click', () => {
      const saveName = document.getElementById('save-name').value.trim();
      if (saveName) {
        this.client.saveGame(saveName);
      }
    });

    document.getElementById('refresh-saves').addEventListener('click', () => {
      this.client.listSaves();
    });
  }

  setupSnapshotControls() {
    document.getElementById('create-snapshot').addEventListener('click', () => {
      const name = document.getElementById('snapshot-name').value.trim() || `Snapshot_${new Date().toLocaleTimeString()}`;
      const desc = document.getElementById('snapshot-desc').value.trim();
      this.client.createSnapshot(name, desc);
    });

    document.getElementById('refresh-snapshots').addEventListener('click', () => {
      this.client.listSnapshots();
    });

    document.getElementById('toggle-auto-snapshot').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      document.getElementById('auto-snapshot-interval').disabled = !enabled;
      if (enabled) {
        const interval = parseInt(document.getElementById('auto-snapshot-interval').value) * 1000;
        console.log('Auto snapshot enabled, interval:', interval);
      }
    });

    const intervalSlider = document.getElementById('auto-snapshot-interval');
    intervalSlider.addEventListener('input', (e) => {
      document.getElementById('auto-interval-value').textContent = e.target.value;
    });
  }

  setupDisasterControls() {
    document.querySelectorAll('.disaster-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.disaster;
        const intensity = parseFloat(document.getElementById('disaster-intensity').value);
        this.client.triggerDisaster(type, { intensity });
      });
    });

    document.getElementById('stop-disaster').addEventListener('click', () => {
      this.client.stopDisaster();
    });

    document.getElementById('disasters-enabled').addEventListener('change', (e) => {
      this.client.toggleDisasters(e.target.checked);
    });

    const intensitySlider = document.getElementById('disaster-intensity');
    intensitySlider.addEventListener('input', (e) => {
      document.getElementById('disaster-intensity-value').textContent = parseFloat(e.target.value).toFixed(1);
    });
  }

  setupPerformanceControls() {
    const qualitySelect = document.getElementById('render-quality');
    qualitySelect.addEventListener('change', (e) => {
      this.renderer.setQuality(e.target.value);
    });

    const interpToggle = document.getElementById('position-interpolation');
    interpToggle.addEventListener('change', (e) => {
      this.client.setInterpolation(e.target.checked, 100);
    });

    const shadowsToggle = document.getElementById('shadows-enabled');
    shadowsToggle.addEventListener('change', (e) => {
      this.renderer.setShadowsEnabled(e.target.checked);
    });

    const waterAnimToggle = document.getElementById('water-animation');
    waterAnimToggle.addEventListener('change', (e) => {
      this.renderer.setWaterAnimationEnabled(e.target.checked);
    });
  }

  async connectToServer() {
    const serverAddress = document.getElementById('server-address').value.trim();
    const playerName = document.getElementById('player-name').value.trim() || '探索者';
    const statusElement = document.getElementById('connection-status');

    try {
      statusElement.textContent = '正在连接...';
      statusElement.style.color = '#4ECDC4';
      
      await this.client.connect(serverAddress, playerName);
    } catch (error) {
      statusElement.textContent = '连接失败: ' + error.message;
      statusElement.style.color = '#FF6B6B';
    }
  }

  onConnected(data) {
    document.getElementById('connection-overlay').classList.add('hidden');
    document.getElementById('connection-modal').classList.add('hidden');
    document.getElementById('ui-panel').classList.remove('hidden');
    
    document.getElementById('connection-dot').classList.remove('disconnected');
    document.getElementById('connection-dot').classList.add('connected');
    document.getElementById('connection-text').textContent = '已连接 - ' + data.playerId.substr(0, 8);

    this.client.listSaves();
    this.client.listSnapshots();
  }

  onDisconnected() {
    document.getElementById('connection-dot').classList.remove('connected');
    document.getElementById('connection-dot').classList.add('disconnected');
    document.getElementById('connection-text').textContent = '连接断开';
  }

  onTerrainFull(data) {
    const size = data.size;
    const heightMap = [];
    
    for (let y = 0; y < size; y++) {
      heightMap[y] = [];
      for (let x = 0; x < size; x++) {
        heightMap[y][x] = data.heightMap[y * size + x];
      }
    }

    this.renderer.createTerrain(size, heightMap);
  }

  onTerrainUpdate(data) {
    if (data.type === 'partial') {
      this.renderer.updateTerrainPartial(data.changes);
    }
  }

  onTerrainRegenerated() {
    this.client.requestTerrain();
  }

  onPlayerJoined(player) {
    this.renderer.addPlayer(player);
    this.updatePlayersList();
  }

  onPlayerLeft(playerId) {
    this.renderer.removePlayer(playerId);
    this.updatePlayersList();
  }

  onPlayerList(players) {
    for (const player of players) {
      this.renderer.addPlayer(player);
    }
    this.updatePlayersList();
  }

  onPlayerMove(data) {
    const interpolatedPos = this.client.getInterpolatedPosition(data.id);
    if (interpolatedPos) {
      this.renderer.updatePlayerPosition(data.id, interpolatedPos);
    } else {
      this.renderer.updatePlayerPosition(data.id, data.position);
    }
  }

  onConfigUpdate(config) {
    if (config.waterErosion) {
      document.getElementById('water-enabled').checked = config.waterErosion.enabled;
      document.getElementById('rain-rate').value = config.waterErosion.rainRate;
      document.getElementById('rain-value').textContent = config.waterErosion.rainRate.toFixed(1);
      document.getElementById('water-erosion').value = config.waterErosion.erosionStrength;
      document.getElementById('water-erosion-value').textContent = config.waterErosion.erosionStrength.toFixed(2);
      document.getElementById('deposition-rate').value = config.waterErosion.depositionRate;
      document.getElementById('deposition-value').textContent = config.waterErosion.depositionRate.toFixed(2);
    }
    
    if (config.windErosion) {
      document.getElementById('wind-enabled').checked = config.windErosion.enabled;
      document.getElementById('wind-strength').value = config.windErosion.windStrength;
      document.getElementById('wind-strength-value').textContent = config.windErosion.windStrength.toFixed(1);
      document.getElementById('wind-direction').value = config.windErosion.windDirection;
      document.getElementById('wind-direction-value').textContent = config.windErosion.windDirection + '°';
      document.getElementById('abrasion-rate').value = config.windErosion.abrasionRate;
      document.getElementById('abrasion-value').textContent = config.windErosion.abrasionRate.toFixed(2);
    }
  }

  onSaveList(data) {
    const saveList = document.getElementById('save-list');
    saveList.innerHTML = '';

    const allSaves = [
      ...data.local.map(s => ({ ...s, type: 'local' })),
      ...data.cloud.map(s => ({ ...s, type: 'cloud' }))
    ];

    if (allSaves.length === 0) {
      saveList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 11px;">暂无存档</div>';
      return;
    }

    for (const save of allSaves) {
      const div = document.createElement('div');
      div.className = 'save-item';
      div.innerHTML = `
        <div><strong>${save.id}</strong></div>
        <div style="color: rgba(255,255,255,0.6);">${save.time} (${save.type === 'local' ? '本地' : '云端'})</div>
        <div class="save-actions">
          <button class="btn btn-secondary btn-small" data-load="${save.id}">加载</button>
          ${save.type === 'local' ? `<button class="btn btn-secondary btn-small" data-sync="${save.id}">同步云端</button>` : ''}
          <button class="btn btn-secondary btn-small" data-delete="${save.id}">删除</button>
        </div>
      `;
      saveList.appendChild(div);
    }

    saveList.querySelectorAll('[data-load]').forEach(btn => {
      btn.addEventListener('click', () => this.client.loadGame(btn.dataset.load));
    });

    saveList.querySelectorAll('[data-sync]').forEach(btn => {
      btn.addEventListener('click', () => this.client.syncToCloud(btn.dataset.sync));
    });

    saveList.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.client.deleteSave(btn.dataset.delete);
        setTimeout(() => this.client.listSaves(), 100);
      });
    });
  }

  onSnapshotList(snapshots) {
    this.snapshots = snapshots;
    const snapshotList = document.getElementById('snapshot-list');
    snapshotList.innerHTML = '';

    if (snapshots.length === 0) {
      snapshotList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 11px;">暂无快照</div>';
      return;
    }

    for (const snap of snapshots) {
      const div = document.createElement('div');
      div.className = 'save-item';
      div.innerHTML = `
        <div><strong>${snap.name}</strong></div>
        <div style="color: rgba(255,255,255,0.6); font-size: 10px;">${snap.time} | 压缩: ${Math.round(snap.compressionRatio * 100)}%</div>
        ${snap.description ? `<div style="color: rgba(255,255,255,0.4); font-size: 10px;">${snap.description}</div>` : ''}
        <div class="save-actions">
          <button class="btn btn-secondary btn-small" data-restore="${snap.id}">恢复</button>
          <button class="btn btn-secondary btn-small" data-delete-snap="${snap.id}">删除</button>
        </div>
      `;
      snapshotList.appendChild(div);
    }

    snapshotList.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('确定要恢复到此快照吗？当前地形将被覆盖。')) {
          this.client.restoreSnapshot(btn.dataset.restore);
        }
      });
    });

    snapshotList.querySelectorAll('[data-delete-snap]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.client.deleteSnapshot(btn.dataset.deleteSnap);
        setTimeout(() => this.client.listSnapshots(), 100);
      });
    });
  }

  onSnapshotCreated(data) {
    console.log('Snapshot created:', data);
    this.client.listSnapshots();
    document.getElementById('snapshot-name').value = '';
    document.getElementById('snapshot-desc').value = '';
  }

  onSnapshotRestored(data) {
    console.log('Snapshot restored:', data);
    alert('快照恢复成功！');
  }

  onSnapshotDeleted(data) {
    this.client.listSnapshots();
  }

  onDisasterEvent(data) {
    const statusEl = document.getElementById('disaster-status');
    
    if (data.type === 'start' || data.type === 'active') {
      this.currentDisaster = data.disaster;
      const disasterNames = {
        earthquake: '地震',
        flood: '洪水',
        volcano: '火山爆发',
        meteor: '陨石撞击'
      };
      statusEl.innerHTML = `<span style="color: #FF6B6B;">⚡ ${disasterNames[data.disaster.type] || data.disaster.type} 进行中...</span>`;
      document.getElementById('stop-disaster').disabled = false;
    } else if (data.type === 'end' || data.type === 'stop') {
      this.currentDisaster = null;
      statusEl.innerHTML = '<span style="color: #4ECDC4;">✓ 无灾害</span>';
      document.getElementById('stop-disaster').disabled = true;
    } else if (data.type === 'toggled') {
      statusEl.innerHTML = data.enabled ? '<span style="color: #4ECDC4;">✓ 随机灾害已启用</span>' : '<span style="color: #999;">✗ 随机灾害已禁用</span>';
    }
  }

  onLatencyUpdate(data) {
    const latencyEl = document.getElementById('latency-display');
    if (latencyEl) {
      latencyEl.textContent = data.latency + 'ms';
      if (data.latency < 100) {
        latencyEl.style.color = '#4ECDC4';
      } else if (data.latency < 200) {
        latencyEl.style.color = '#FFEAA7';
      } else {
        latencyEl.style.color = '#FF6B6B';
      }
    }
  }

  updatePlayersList() {
    const playersList = document.getElementById('players-list');
    const players = this.client.getPlayers();
    
    playersList.innerHTML = players.map(player => `
      <div class="player-item">
        <div class="player-color" style="background: ${player.color}"></div>
        <span>${player.name}</span>
      </div>
    `).join('');
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    if (this.client.useInterpolation) {
      this.client.interpolatePlayerPositions();
    }
    
    this.renderer.render();
    
    this.fpsCounter++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 1000) {
      document.getElementById('fps-counter').textContent = this.fpsCounter;
      this.fpsCounter = 0;
      this.lastFpsTime = now;
    }
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.client.disconnect();
    this.renderer.destroy();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new TerrainSandbox();
});
