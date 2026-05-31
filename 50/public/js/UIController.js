class UIController {
  constructor(networkClient, renderer) {
    this.network = networkClient;
    this.renderer = renderer;
    this.currentEquipment = null;
    this.currentDiagnosticResult = null;
    
    this.initElements();
    this.initEventListeners();
    this.initNetworkListeners();
  }

  initElements() {
    this.elements = {
      gameTime: document.getElementById('game-time'),
      playerCount: document.getElementById('player-count'),
      totalScore: document.getElementById('total-score'),
      
      envTemperature: document.getElementById('env-temperature'),
      envHumidity: document.getElementById('env-humidity'),
      envWind: document.getElementById('env-wind'),
      envRain: document.getElementById('env-rain'),
      weatherLevel: document.getElementById('weather-level'),
      timeOfDay: document.getElementById('time-of-day'),
      
      equipmentList: document.getElementById('equipment-list'),
      
      pendingTasks: document.getElementById('pending-tasks'),
      completedTasks: document.getElementById('completed-tasks'),
      taskList: document.getElementById('task-list'),
      
      playersList: document.getElementById('players-list'),
      
      chatMessages: document.getElementById('chat-messages'),
      chatInput: document.getElementById('chat-input'),
      chatSend: document.getElementById('chat-send'),
      
      diagnosticModal: document.getElementById('diagnostic-modal'),
      modalTitle: document.getElementById('modal-title'),
      diagnosticEquipmentName: document.getElementById('diagnostic-equipment-name'),
      healthFill: document.getElementById('health-fill'),
      healthValue: document.getElementById('health-value'),
      faultsList: document.getElementById('faults-list'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      closeBtns: document.querySelectorAll('.close-btn'),
      
      connectionStatus: document.getElementById('connection-status'),
      connStatusText: document.getElementById('conn-status-text'),
      
      settingsBtn: document.getElementById('settings-btn'),
      settingsModal: document.getElementById('settings-modal'),
      qualitySelect: document.getElementById('quality-select'),
      currentQuality: document.getElementById('current-quality'),
      detectPerformance: document.getElementById('detect-performance'),
      applySettings: document.getElementById('apply-settings')
    };
  }

  initEventListeners() {
    this.elements.chatSend.addEventListener('click', () => this.sendChat());
    this.elements.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });

    this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.elements.closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModal();
        this.closeSettings();
      });
    });
    this.elements.diagnosticModal.addEventListener('click', (e) => {
      if (e.target === this.elements.diagnosticModal) {
        this.closeModal();
      }
    });

    this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) {
        this.closeSettings();
      }
    });
    
    this.elements.detectPerformance.addEventListener('click', () => this.detectPerformance());
    this.elements.applySettings.addEventListener('click', () => this.applySettings());

    this.updateQualityDisplay();
  }

  initNetworkListeners() {
    this.network.on('connected', () => {
      this.updateConnectionStatus(true);
    });

    this.network.on('disconnected', () => {
      this.updateConnectionStatus(false);
    });

    this.network.on('init', (data) => {
      this.renderer.createEquipment(data.equipment);
      this.updateUI(data);
    });

    this.network.on('game_state', (data) => {
      this.updateUI(data);
    });

    this.network.on('diagnose_result', (data) => {
      this.showDiagnosticResult(data);
    });

    this.network.on('repair_success', (data) => {
      this.showRepairSuccess(data);
    });

    this.network.on('chat', (data) => {
      this.addChatMessage(data);
    });
  }

  updateConnectionStatus(connected) {
    const indicator = this.elements.connectionStatus;
    indicator.classList.remove('connected', 'disconnected');
    
    if (connected) {
      indicator.classList.add('connected');
      this.elements.connStatusText.textContent = '✓ 已连接到服务器';
    } else {
      indicator.classList.add('disconnected');
      this.elements.connStatusText.textContent = '✗ 连接断开，正在重连...';
    }
  }

  updateUI(data) {
    this.updateGameStats(data);
    this.updateEnvironment(data.environment);
    this.updateEquipmentList(data.equipment);
    this.updateTaskList(data.tasks);
    this.updatePlayerList(data.players);
    
    this.renderer.updateEquipmentStatus(data.equipment);
    this.renderer.updateEnvironment(data.environment);
  }

  updateGameStats(data) {
    const minutes = Math.floor(data.gameTime / 60);
    const seconds = data.gameTime % 60;
    this.elements.gameTime.textContent = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    this.elements.playerCount.textContent = data.players ? data.players.length : 1;
    this.elements.totalScore.textContent = data.tasks ? data.tasks.totalScore || 0 : 0;
  }

  updateEnvironment(env) {
    this.elements.envTemperature.textContent = `${env.temperature}°C`;
    this.elements.envHumidity.textContent = `${env.humidity}%`;
    this.elements.envWind.textContent = `${env.windSpeed} m/s`;
    this.elements.envRain.textContent = `${env.rainIntensity}%`;

    const levelNames = ['正常', '轻微', '中等', '恶劣', '极端', '危险'];
    this.elements.weatherLevel.textContent = `天气等级: ${levelNames[env.weatherLevel] || '未知'}`;
    
    if (env.timeOfDay === 'night') {
      this.elements.timeOfDay.textContent = '🌙 夜晚';
    } else {
      this.elements.timeOfDay.textContent = '☀️ 白天';
    }
  }

  updateEquipmentList(equipmentList) {
    this.elements.equipmentList.innerHTML = '';
    
    equipmentList.forEach(eq => {
      const item = document.createElement('div');
      item.className = `equipment-item status-${eq.status}`;
      item.dataset.equipmentId = eq.id;
      
      const statusLabels = {
        normal: '正常',
        warning: '警告',
        danger: '危险',
        critical: '危急'
      };
      
      item.innerHTML = `
        <div class="equipment-header">
          <span class="equipment-name">${eq.name}</span>
          <span class="equipment-status">${statusLabels[eq.status] || eq.status}</span>
        </div>
        <div class="equipment-health-bar">
          <div class="equipment-health-fill" style="width: ${eq.health}%"></div>
        </div>
        <div class="durability-bar">
          <div class="durability-fill" style="width: ${eq.durability || 100}%"></div>
        </div>
        ${eq.efficiency !== undefined 
          ? `<div class="equipment-efficiency">效率: ${Math.round(eq.efficiency * 100)}%</div>`
          : ''
        }
        ${eq.faults && eq.faults.length > 0 
          ? `<div class="equipment-faults">故障: ${eq.faults.length} 个</div>`
          : ''
        }
      `;
      
      item.addEventListener('click', () => this.openEquipmentDetail(eq));
      this.elements.equipmentList.appendChild(item);
    });
  }

  updateTaskList(tasks) {
    if (!tasks) return;
    
    this.elements.pendingTasks.textContent = tasks.stats ? tasks.stats.pending : 0;
    this.elements.completedTasks.textContent = tasks.stats ? tasks.stats.completed : 0;
    
    this.elements.taskList.innerHTML = '';
    
    const activeTasks = tasks.active || [];
    activeTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = `task-item priority-${task.priority}`;
      
      item.innerHTML = `
        <div class="task-name">${task.name}</div>
        <div class="task-desc">${task.description}</div>
      `;
      
      this.elements.taskList.appendChild(item);
    });
    
    if (activeTasks.length === 0) {
      this.elements.taskList.innerHTML = '<div style="text-align: center; color: #4caf50; padding: 20px; font-size: 12px;">暂无待处理任务</div>';
    }
  }

  updatePlayerList(players) {
    if (!players) return;
    
    this.elements.playersList.innerHTML = '';
    
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((player, index) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      
      const medals = ['🥇', '🥈', '🥉'];
      const medal = medals[index] || `${index + 1}.`;
      
      item.innerHTML = `
        <span class="player-name">
          <span>${medal}</span>
          <span>${player.name}</span>
        </span>
        <span class="player-score">${player.score}</span>
      `;
      
      this.elements.playersList.appendChild(item);
    });
  }

  openEquipmentDetail(equipment) {
    this.currentEquipment = equipment;
    this.network.diagnose(equipment.id);
    
    this.elements.modalTitle.textContent = '设备诊断中...';
    this.elements.diagnosticEquipmentName.textContent = equipment.name;
    this.elements.healthFill.style.width = `${equipment.health}%`;
    this.elements.healthValue.textContent = `${equipment.health}%`;
    
    const durabilityFill = document.getElementById('durability-fill');
    const durabilityValue = document.getElementById('durability-value');
    if (durabilityFill && durabilityValue) {
      durabilityFill.style.width = `${equipment.durability || 100}%`;
      durabilityValue.textContent = `${equipment.durability || 100}%`;
    }
    
    this.elements.faultsList.innerHTML = '<div style="text-align: center; padding: 20px;">正在诊断...</div>';
    
    this.elements.diagnosticModal.classList.remove('hidden');
  }

  showDiagnosticResult(data) {
    if (data.equipmentId !== this.currentEquipment?.id) return;
    
    this.elements.modalTitle.textContent = '设备诊断报告';
    
    if (data.faults && data.faults.length > 0) {
      this.elements.faultsList.innerHTML = '';
      
      data.faults.forEach(fault => {
        const faultItem = document.createElement('div');
        faultItem.className = 'fault-item';
        
        faultItem.innerHTML = `
          <div class="fault-header">
            <span class="fault-name">⚠️ ${fault.name}</span>
            <button class="repair-btn" data-fault-type="${fault.type}">🔧 修复</button>
          </div>
          <div class="fault-symptoms">
            <strong>症状:</strong> ${fault.symptoms.join('、')}
          </div>
          <div class="fault-steps">
            <strong>修复步骤:</strong>
            <ol>
              ${fault.repairSteps.map(step => `<li>${step}</li>`).join('')}
            </ol>
          </div>
        `;
        
        const repairBtn = faultItem.querySelector('.repair-btn');
        repairBtn.addEventListener('click', () => {
          this.repairFault(data.equipmentId, fault.type);
        });
        
        this.elements.faultsList.appendChild(faultItem);
      });
    } else {
      this.elements.faultsList.innerHTML = '<div class="no-faults">✓ 设备运行正常，未检测到故障</div>';
    }
  }

  repairFault(equipmentId, faultType) {
    this.network.repair(equipmentId, faultType);
  }

  showRepairSuccess(data) {
    if (data.equipmentId === this.currentEquipment?.id) {
      const btn = document.querySelector(`.repair-btn[data-fault-type="${data.faultType}"]`);
      if (btn) {
        btn.textContent = '✓ 已修复';
        btn.disabled = true;
        btn.style.background = '#4caf50';
      }
    }
    
    this.showNotification(`修复成功! +${data.score} 分`);
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 120px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: rgba(76, 175, 80, 0.9);
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 2000;
      animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  closeModal() {
    this.elements.diagnosticModal.classList.add('hidden');
    this.currentEquipment = null;
  }

  sendChat() {
    const content = this.elements.chatInput.value.trim();
    if (content) {
      this.network.sendChat(content);
      this.elements.chatInput.value = '';
    }
  }

  addChatMessage(data) {
    const message = document.createElement('div');
    message.className = 'chat-message';
    message.innerHTML = `
      <span class="chat-sender">${data.playerId}:</span>
      <span>${data.content}</span>
    `;
    
    this.elements.chatMessages.appendChild(message);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  openSettings() {
    this.updateQualityDisplay();
    this.elements.settingsModal.classList.remove('hidden');
  }

  closeSettings() {
    this.elements.settingsModal.classList.add('hidden');
  }

  updateQualityDisplay() {
    const currentQuality = this.renderer.getCurrentQuality();
    this.elements.currentQuality.textContent = this.getQualityLabel(currentQuality);
    this.elements.qualitySelect.value = currentQuality;
  }

  getQualityLabel(quality) {
    const labels = {
      low: '低 (性能优先)',
      medium: '中 (平衡模式)',
      high: '高 (高质量)',
      ultra: '极致 (最佳画质)'
    };
    return labels[quality] || quality;
  }

  detectPerformance() {
    const detectedQuality = RenderConfig.detectPerformance();
    this.elements.qualitySelect.value = detectedQuality;
    this.elements.currentQuality.textContent = this.getQualityLabel(detectedQuality) + ' (自动检测)';
  }

  applySettings() {
    const selectedQuality = this.elements.qualitySelect.value;
    this.renderer.setQualityLevel(selectedQuality);
    this.updateQualityDisplay();
    this.showNotification(`渲染质量已设置为: ${this.getQualityLabel(selectedQuality)}`);
    this.closeSettings();
  }
}
