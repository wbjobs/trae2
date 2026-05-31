class Game {
  constructor() {
    this.network = new NetworkClient();
    this.renderer = null;
    this.input = null;
    this.storage = new StorageManager();
    this.editor = null;
    this.editorActive = false;
    this.state = {
      connected: false,
      joined: false,
      playerId: null,
      playerName: '',
      currentLevel: null,
      sceneState: null,
      saves: [],
      levels: [],
      chatMessages: []
    };

    this.ui = {
      connectModal: document.getElementById('connect-modal'),
      gameContainer: document.getElementById('game-container'),
      playerNameInput: document.getElementById('player-name-input'),
      connectBtn: document.getElementById('connect-btn'),
      levelSelect: document.getElementById('level-select'),
      loadLevelBtn: document.getElementById('load-level-btn'),
      saveList: document.getElementById('save-list'),
      newSaveBtn: document.getElementById('new-save-btn'),
      chatInput: document.getElementById('chat-input'),
      chatSendBtn: document.getElementById('chat-send-btn'),
      chatMessages: document.getElementById('chat-messages'),
      playerList: document.getElementById('player-list'),
      statusBar: document.getElementById('status-bar'),
      progressBar: document.getElementById('progress-bar'),
      notification: document.getElementById('notification')
    };

    this.init();
  }

  init() {
    this.setupUI();
    this.setupNetwork();
    this.loadSettings();
  }

  setupUI() {
    if (this.ui.connectBtn) {
      this.ui.connectBtn.addEventListener('click', () => this.handleConnect());
    }

    if (this.ui.playerNameInput) {
      this.ui.playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleConnect();
      });
    }

    if (this.ui.loadLevelBtn) {
      this.ui.loadLevelBtn.addEventListener('click', () => this.handleLoadLevel());
    }

    if (this.ui.newSaveBtn) {
      this.ui.newSaveBtn.addEventListener('click', () => this.handleNewSave());
    }

    if (this.ui.chatSendBtn) {
      this.ui.chatSendBtn.addEventListener('click', () => this.handleChatSend());
    }

    if (this.ui.chatInput) {
      this.ui.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleChatSend();
      });
    }

    document.getElementById('btn-grab')?.addEventListener('click', () => {
      if (this.input?.selectedPartId) {
        if (this.input.grabbedPartId) {
          this.input.releasePart(this.input.grabbedPartId);
        } else {
          this.input.grabPart(this.input.selectedPartId);
        }
      }
    });

    document.getElementById('btn-assemble')?.addEventListener('click', () => {
      if (this.input?.grabbedPartId) {
        this.input.assemblePart();
      }
    });

    document.getElementById('btn-disassemble')?.addEventListener('click', () => {
      if (this.input?.selectedPartId) {
        this.input.disassemblePart(this.input.selectedPartId);
      }
    });

    document.getElementById('btn-rotate-mode')?.addEventListener('click', () => {
      if (this.input) {
        this.input.rotationMode = !this.input.rotationMode;
        this.input.updateUI();
      }
    });

    document.getElementById('btn-editor')?.addEventListener('click', () => {
      this.toggleEditor();
    });

    document.addEventListener('showNotification', (e) => {
      this.showNotification(e.detail.message, e.detail.type);
    });
  }

  setupNetwork() {
    this.network.on('connected', () => {
      this.state.connected = true;
      this.updateStatus('已连接到服务器');
    });

    this.network.on('disconnected', () => {
      this.state.connected = false;
      this.state.joined = false;
      this.updateStatus('与服务器断开连接');
      this.showNotification('连接已断开', 'error');
    });

    this.network.on('success', (data) => {
      if (data.playerId) {
        this.state.playerId = data.playerId;
        this.state.joined = true;
        this.showNotification(`欢迎, ${this.state.playerName}!`, 'success');
        this.hideConnectModal();
        this.network.getLevelList();
      }
    });

    this.network.on('error', (data) => {
      this.showNotification(data.message || '操作失败', 'error');
    });

    this.network.on('player_join', (data) => {
      if (data.player) {
        this.renderer?.addPlayer(data.player);
        this.updatePlayerList();
      }
    });

    this.network.on('player_leave', (data) => {
      if (data.playerId) {
        this.renderer?.removePlayer(data.playerId);
        this.updatePlayerList();
      }
    });

    this.network.on('scene_state', (data) => {
      if (data.state) {
        this.updateSceneState(data.state);
      }
    });

    this.network.on('part_state', (data) => {
      if (data.part) {
        this.renderer?.updatePart(data.part);
        this.updateProgress();
      }
    });

    this.network.on('level_load', (data) => {
      if (data.level && data.state) {
        this.state.currentLevel = data.level;
        this.updateSceneState(data.state);
        this.showNotification(`已加载关卡: ${data.level.name}`, 'success');
      }
    });

    this.network.on('level_complete', (data) => {
      this.showNotification('恭喜！关卡完成！', 'success');
      this.saveCompletedLevel(data.levelId, data.progress);
    });

    this.network.on('level_list', (data) => {
      if (data.levels) {
        this.state.levels = data.levels;
        this.updateLevelSelect();
      }
    });

    this.network.on('save_data', (data) => {
      if (data.saves) {
        this.state.saves = data.saves;
        this.updateSaveList();
      } else if (data.success) {
        this.showNotification(data.save ? `存档已保存: ${data.save.name}` : '操作成功', 'success');
        this.network.getSaveList(false);
      } else {
        this.showNotification(data.error || '操作失败', 'error');
      }
    });

    this.network.on('chat_message', (data) => {
      this.addChatMessage(data);
    });
  }

  async handleConnect() {
    const name = this.ui.playerNameInput?.value?.trim() || '匿名玩家';
    this.state.playerName = name;

    this.updateStatus('正在连接服务器...');

    try {
      const serverUrl = this.storage.loadSettings().serverUrl || null;
      await this.network.connect(serverUrl);
      this.network.joinGame(name);
      this.storage.savePlayerData({ name });
    } catch (error) {
      this.showNotification('连接服务器失败', 'error');
      this.updateStatus('连接失败');
    }
  }

  handleLoadLevel() {
    const levelId = this.ui.levelSelect?.value;
    if (levelId) {
      this.network.loadLevel(levelId);
      this.storage.saveRecentLevels(levelId);
    }
  }

  handleNewSave() {
    const name = prompt('输入存档名称:');
    if (name) {
      this.network.createSave(name, false);
    }
  }

  handleChatSend() {
    const input = this.ui.chatInput;
    if (!input) return;

    const message = input.value.trim();
    if (message) {
      this.network.sendChatMessage(message);
      input.value = '';
    }
  }

  initRenderer() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    this.renderer = new Renderer(canvas);
    this.renderer.init();

    this.input = new InputManager(this.renderer, this.network);
    this.input.onPartSelected = (partId) => {
      const partData = this.renderer.getPartData(partId);
      if (partData) {
        this.updatePartInfo(partData);
      }
    };
  }

  updateSceneState(state) {
    this.state.sceneState = state;

    if (!this.renderer) {
      this.initRenderer();
    }

    if (state.parts) {
      const existingPartIds = new Set(Object.keys(this.renderer.parts));
      const newParts = [];
      const updatedParts = [];

      state.parts.forEach(part => {
        if (existingPartIds.has(part.id)) {
          updatedParts.push(part);
        } else {
          newParts.push(part);
        }
      });

      if (newParts.length > 0) {
        this.renderer.addPartsBatch(newParts);
      }

      updatedParts.forEach(part => {
        this.renderer.updatePart(part);
      });
    }

    if (state.players) {
      Object.values(state.players).forEach(player => {
        if (!this.renderer.players[player.id]) {
          this.renderer.addPlayer(player);
        } else {
          this.renderer.updatePlayer(player);
        }
      });
      this.updatePlayerList();
    }

    this.updateProgress();
  }

  updatePlayerList() {
    if (!this.ui.playerList) return;

    const players = this.state.sceneState?.players || {};
    this.ui.playerList.innerHTML = Object.values(players)
      .map(player => `
        <div class="player-item">
          <div class="player-color" style="background: ${player.color}"></div>
          <span>${player.name}</span>
        </div>
      `)
      .join('');
  }

  updateLevelSelect() {
    if (!this.ui.levelSelect) return;

    const recentLevels = this.storage.loadRecentLevels();
    this.ui.levelSelect.innerHTML = this.state.levels
      .map(level => {
        const isRecent = recentLevels.includes(level.id);
        return `<option value="${level.id}" ${isRecent ? 'class="recent-level"' : ''}>
          ${level.name} (难度: ${level.difficulty})
        </option>`;
      })
      .join('');
  }

  updateSaveList() {
    if (!this.ui.saveList) return;

    this.ui.saveList.innerHTML = this.state.saves
      .map(save => `
        <div class="save-item">
          <div>
            <strong>${save.name}</strong>
            <small>${save.levelId}</small>
          </div>
          <div class="save-actions">
            <button onclick="game.loadSave('${save.id}')">加载</button>
            <button onclick="game.deleteSave('${save.id}')">删除</button>
          </div>
        </div>
      `)
      .join('');
  }

  updateProgress() {
    if (!this.state.sceneState?.parts || !this.ui.progressBar) return;

    const parts = this.state.sceneState.parts;
    const assembled = parts.filter(p => p.state === 'assembled').length;
    const total = parts.length;
    const progress = total > 0 ? (assembled / total) * 100 : 0;

    this.ui.progressBar.style.width = `${progress}%`;
    this.ui.progressBar.textContent = `${assembled}/${total} (${Math.round(progress)}%)`;
  }

  updatePartInfo(partData) {
    const infoEl = document.getElementById('part-info');
    if (!infoEl) return;

    infoEl.innerHTML = `
      <h4>${partData.name}</h4>
      <p>类型: ${partData.type}</p>
      <p>状态: ${this.getStateText(partData.state)}</p>
      <p>连接数: ${partData.connections?.length || 0}</p>
      ${partData.isKey ? '<p class="key-part">关键部件</p>' : ''}
    `;
  }

  addChatMessage(data) {
    if (!this.ui.chatMessages) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `
      <strong>${data.playerName}:</strong> ${data.message}
    `;
    this.ui.chatMessages.appendChild(msgEl);
    this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
  }

  updateStatus(message) {
    if (this.ui.statusBar) {
      this.ui.statusBar.textContent = message;
    }
  }

  showNotification(message, type = 'info') {
    if (!this.ui.notification) return;

    this.ui.notification.textContent = message;
    this.ui.notification.className = `notification show ${type}`;

    setTimeout(() => {
      this.ui.notification.className = 'notification';
    }, 3000);
  }

  hideConnectModal() {
    if (this.ui.connectModal) {
      this.ui.connectModal.style.display = 'none';
    }
    if (this.ui.gameContainer) {
      this.ui.gameContainer.style.display = 'flex';
    }
  }

  loadSettings() {
    const settings = this.storage.loadSettings();
    if (this.ui.playerNameInput && settings.playerName) {
      this.ui.playerNameInput.value = settings.playerName;
    }
  }

  saveSettings(settings) {
    this.storage.saveSettings(settings);
  }

  loadSave(saveId) {
    this.network.loadSave(saveId, false);
  }

  deleteSave(saveId) {
    if (confirm('确定要删除此存档吗？')) {
      this.network.deleteSave(saveId, false);
    }
  }

  saveCompletedLevel(levelId, progress) {
    this.storage.saveCompletedLevel(levelId, {
      progress: progress?.progress || 1,
      assembledCount: progress?.assembledCount || 0,
      totalCount: progress?.totalCount || 0
    });
  }

  getStateText(state) {
    const states = {
      'assembled': '已装配',
      'disassembled': '未装配',
      'grabbed': '抓取中',
      'snapped': '已吸附'
    };
    return states[state] || state;
  }

  toggleEditor() {
    if (!this.editor) {
      this.editor = new LevelEditor(this.network, this.storage);
    }

    this.editorActive = this.editor.toggle(this.renderer);

    const btn = document.getElementById('btn-editor');
    if (btn) {
      btn.style.background = this.editorActive
        ? 'rgba(255, 170, 0, 0.3)'
        : 'rgba(100, 200, 255, 0.2)';
      btn.style.borderColor = this.editorActive
        ? 'rgba(255, 170, 0, 0.5)'
        : 'rgba(100, 200, 255, 0.3)';
    }

    if (this.input) {
      this.input.enabled = !this.editorActive;
    }

    this.showNotification(
      this.editorActive ? '编辑器已开启' : '编辑器已关闭',
      this.editorActive ? 'success' : 'info'
    );
  }

  disconnect() {
    this.network.disconnect();
    if (this.storage.loadSettings().autoSave && this.state.sceneState) {
      this.storage.saveLocalGameState(this.state.sceneState);
    }
  }
}

window.addEventListener('load', () => {
  window.game = new Game();
});

window.addEventListener('beforeunload', () => {
  if (window.game) {
    window.game.disconnect();
  }
});
