class GameMain {
    constructor() {
        this.renderer = null;
        this.client = null;
        this.selectedColor = '#00ff88';
        this.isPlaying = false;
        this.showMissionPanel = false;
        this.showChatBox = false;
        this.showSettingsPanel = false;
        this.init();
    }

    init() {
        this.setupUI();
        this.setupEventListeners();
    }

    setupUI() {
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new RenderEngine(canvas, CONFIG);
        this.renderer.init();
        this.client = new GameClient(this.renderer);
        
        this.client.onStateChange = (state) => this.updateHUD(state);
        this.client.onConnected = () => this.onConnected();
        this.client.onDisconnected = () => this.onDisconnected();
        this.client.onChatMessage = (sender, message) => this.addChatMessage(sender, message);
        this.client.onMissionStarted = (mission) => this.onMissionStarted(mission);
        this.client.onScoreUpdate = (score) => this.updateScoreDisplay(score);
    }

    setupEventListeners() {
        document.getElementById('btnSinglePlayer').addEventListener('click', () => this.startSinglePlayer());
        
        document.getElementById('btnMultiplayer').addEventListener('click', () => {
            document.getElementById('multiplayerOptions').classList.toggle('hidden');
        });
        
        document.getElementById('btnJoinServer').addEventListener('click', () => this.joinMultiplayer());
        
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                this.selectedColor = option.dataset.color;
            });
        });
        
        document.getElementById('missionClose').addEventListener('click', () => {
            document.getElementById('missionPanel').classList.add('hidden');
            this.showMissionPanel = false;
        });
        
        document.getElementById('chatSend').addEventListener('click', () => this.sendChat());
        
        document.getElementById('btnReconnect').addEventListener('click', () => {
            document.getElementById('disconnectOverlay').classList.add('hidden');
            if (this.client.isSinglePlayer) {
                this.startSinglePlayer();
            } else {
                this.joinMultiplayer();
            }
        });
        
        document.getElementById('btnBackToMenu').addEventListener('click', () => {
            document.getElementById('disconnectOverlay').classList.add('hidden');
            this.backToMenu();
        });
        
        document.getElementById('settingsClose').addEventListener('click', () => {
            document.getElementById('settingsPanel').classList.add('hidden');
            this.showSettingsPanel = false;
        });
        
        document.querySelectorAll('.quality-option').forEach(option => {
            option.addEventListener('click', () => {
                const quality = option.dataset.quality;
                this.setQualityLevel(quality);
            });
        });
        
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        
        document.addEventListener('pointerlockchange', () => {
            this.client.isPointerLocked = document.pointerLockElement === this.renderer.canvas;
        });
        
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendChat();
            }
        });
    }

    handleKeyDown(e) {
        if (!this.isPlaying) return;
        
        if (e.code === 'Enter') {
            e.preventDefault();
            this.toggleChat();
            return;
        }
        
        if (this.showChatBox) return;
        
        if (e.code === 'KeyM') {
            e.preventDefault();
            this.toggleMissionPanel();
            return;
        }
        
        if (e.code === 'KeyO') {
            e.preventDefault();
            this.toggleSettingsPanel();
            return;
        }
        
        if (e.code === 'Escape') {
            e.preventDefault();
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            return;
        }
        
        this.client.handleKeyDown(e);
    }

    handleKeyUp(e) {
        if (!this.isPlaying) return;
        if (this.showChatBox) return;
        
        this.client.handleKeyUp(e);
    }

    handleMouseMove(e) {
        if (!this.isPlaying) return;
        this.client.handleMouseMove(e);
    }

    handleMouseDown(e) {
        if (!this.isPlaying) return;
        this.client.handleMouseDown(e);
    }

    async startSinglePlayer() {
        this.showLoading();
        
        try {
            await this.client.startSinglePlayer();
            document.getElementById('modeText').textContent = '单机模式';
        } catch (error) {
            console.error('启动单机模式失败:', error);
            alert('启动失败: ' + error.message);
        }
        
        this.hideLoading();
    }

    async joinMultiplayer() {
        const serverAddress = document.getElementById('serverAddress').value.trim();
        const playerName = document.getElementById('playerName').value.trim() || '深海探险家';
        
        if (!serverAddress) {
            alert('请输入服务器地址');
            return;
        }
        
        this.showLoading();
        
        try {
            await this.client.connect(serverAddress);
            this.client.joinGame(playerName, this.selectedColor);
            document.getElementById('modeText').textContent = '联机模式';
        } catch (error) {
            console.error('连接服务器失败:', error);
            alert('连接失败: ' + error.message);
            this.hideLoading();
        }
    }

    onConnected() {
        this.isPlaying = true;
        document.getElementById('startMenu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        
        if (!this.client.isSinglePlayer) {
            this.hideLoading();
        }
    }

    onDisconnected() {
        this.isPlaying = false;
        if (!document.getElementById('disconnectOverlay').classList.contains('hidden')) {
            return;
        }
        document.getElementById('disconnectOverlay').classList.remove('hidden');
    }

    backToMenu() {
        this.client.disconnect();
        this.isPlaying = false;
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('startMenu').classList.remove('hidden');
        document.getElementById('multiplayerOptions').classList.add('hidden');
    }

    updateHUD(state) {
        const myVehicle = this.client.getMyVehicle();
        if (!myVehicle) return;
        
        document.getElementById('healthBar').style.width = myVehicle.health + '%';
        document.getElementById('healthText').textContent = Math.round(myVehicle.health);
        
        document.getElementById('energyBar').style.width = (myVehicle.energy / CONFIG.VEHICLE.ENERGY_MAX * 100) + '%';
        document.getElementById('energyText').textContent = Math.round(myVehicle.energy);
        
        if (myVehicle.sensorData) {
            document.getElementById('depthText').textContent = Math.round(myVehicle.sensorData.depth) + ' m';
            document.getElementById('speedText').textContent = myVehicle.sensorData.speed.toFixed(1) + ' m/s';
            document.getElementById('pressureText').textContent = (myVehicle.sensorData.pressure / 1000).toFixed(1) + ' kPa';
            document.getElementById('temperatureText').textContent = myVehicle.sensorData.temperature.toFixed(1) + ' °C';
            document.getElementById('oxygenText').textContent = myVehicle.sensorData.oxygen.toFixed(2) + ' mg/L';
            document.getElementById('headingText').textContent = Math.round(myVehicle.sensorData.heading * 180 / Math.PI) + '°';
            
            this.updateSonarDisplay(myVehicle.sensorData);
            this.updateObstacleList(myVehicle.sensorData);
        }
        
        if (myVehicle.score) {
            this.updateScoreDisplay(myVehicle.score);
        }
        
        this.updateMissionList();
        this.updateMinimap(state);
        this.updateEnvironmentEffects(myVehicle);
        
        if (state.storyDialogue) {
            this.updateStoryDialogue(state.storyDialogue);
        }
    }
    
    updateEnvironmentEffects(vehicle) {
        const envEffects = vehicle.environmentEffects || { waterForce: { x: 0, y: 0, z: 0 }, temperature: 0, pressure: 0 };
        
        const flowStrength = Math.sqrt(
            envEffects.waterForce.x * envEffects.waterForce.x +
            envEffects.waterForce.y * envEffects.waterForce.y +
            envEffects.waterForce.z * envEffects.waterForce.z
        );
        
        const flowIndicator = document.getElementById('flowIndicator');
        if (flowIndicator) {
            if (flowStrength > 0.5) {
                flowIndicator.textContent = `洋流强度: ${flowStrength.toFixed(1)} m/s`;
                flowIndicator.style.color = flowStrength > 3 ? '#ff6644' : flowStrength > 1 ? '#ffaa44' : '#44ff88';
                flowIndicator.style.display = 'block';
            } else {
                flowIndicator.style.display = 'none';
            }
        }
    }
    
    updateScoreDisplay(score) {
        if (!score) return;
        
        document.getElementById('scoreText').textContent = Math.floor(score.score);
        document.getElementById('levelText').textContent = `Lv.${score.level}`;
        document.getElementById('expBar').style.width = score.expPercent + '%';
        document.getElementById('comboText').textContent = score.combo > 1 ? `x${score.combo}` : '';
        
        if (score.highScore) {
            document.getElementById('highScoreText').textContent = `最高: ${Math.floor(score.highScore)}`;
        }
        
        const achievementsContainer = document.getElementById('achievementsList');
        if (achievementsContainer && score.achievements) {
            achievementsContainer.innerHTML = '';
            for (const ach of score.achievements) {
                const item = document.createElement('div');
                item.className = 'achievement-item' + (ach.unlocked ? ' unlocked' : ' locked');
                item.innerHTML = `
                    <div class="achievement-name">${ach.name}</div>
                    <div class="achievement-desc">${ach.description}</div>
                `;
                achievementsContainer.appendChild(item);
            }
        }
    }

    updateSonarDisplay(sensorData) {
        const canvas = document.getElementById('sonarCanvas');
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 90;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'rgba(0, 170, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let r = 30; r <= radius; r += 30) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        const heading = sensorData.heading || 0;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
            ctx.stroke();
        }
        
        if (sensorData.sonar) {
            for (const ray of sensorData.sonar) {
                const angle = ray.angle + heading - Math.PI / 2;
                const dist = Math.min(ray.distance, CONFIG.SENSORS.SONAR_RANGE);
                const distRatio = dist / CONFIG.SENSORS.SONAR_RANGE;
                
                const endX = centerX + Math.cos(angle) * radius * distRatio;
                const endY = centerY + Math.sin(angle) * radius * distRatio;
                
                ctx.strokeStyle = ray.hit ? 'rgba(255, 68, 68, 0.8)' : 'rgba(0, 255, 170, 0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                if (ray.hit) {
                    ctx.fillStyle = '#ff4444';
                    ctx.beginPath();
                    ctx.arc(endX, endY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        ctx.fillStyle = '#00ffaa';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#00ffaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - 15);
        ctx.stroke();
    }

    updateObstacleList(sensorData) {
        const list = document.getElementById('obstacleList');
        list.innerHTML = '';
        
        if (!sensorData.obstacles || sensorData.obstacles.length === 0) {
            list.innerHTML = '<div style="color: #6688aa; font-size: 11px;">未检测到障碍物</div>';
            return;
        }
        
        const typeNames = {
            rock: '岩石',
            coral: '珊瑚',
            cave: '洞穴',
            thermal_vent: '热泉',
            plant: '海草',
            ridge: '海岭',
            wreck: '残骸'
        };
        
        for (let i = 0; i < Math.min(5, sensorData.obstacles.length); i++) {
            const obs = sensorData.obstacles[i];
            const item = document.createElement('div');
            item.className = 'obstacle-item';
            item.innerHTML = `
                <span class="obstacle-name">${typeNames[obs.type] || obs.type}</span>
                <span class="obstacle-dist">${Math.round(obs.distance)}m</span>
            `;
            list.appendChild(item);
        }
    }

    updateMissionList() {
        const activeMissions = this.client.getActiveMissions();
        const availableMissions = this.client.getAvailableMissions();
        
        const activeContainer = document.getElementById('activeMissions');
        const availableContainer = document.getElementById('availableMissions');
        
        activeContainer.innerHTML = '';
        availableContainer.innerHTML = '';
        
        for (const mission of activeMissions) {
            const item = this.createMissionElement(mission, false);
            activeContainer.appendChild(item);
        }
        
        for (const mission of availableMissions) {
            const item = this.createMissionElement(mission, true);
            availableContainer.appendChild(item);
        }
    }

    createMissionElement(mission, isAvailable) {
        const div = document.createElement('div');
        div.className = 'mission-item' + (isAvailable ? ' available' : '');
        
        let progressHtml = '';
        if (!isAvailable) {
            progressHtml = `
                <div class="mission-progress">
                    <div class="mission-progress-fill" style="width: ${mission.progress}%"></div>
                </div>
            `;
        }
        
        const buttonHtml = isAvailable 
            ? `<button class="mission-btn" onclick="game.startMission('${mission.id}')">接受任务</button>`
            : '';
        
        div.innerHTML = `
            <div class="mission-name">${mission.name}</div>
            <div class="mission-desc">${mission.description}</div>
            ${progressHtml}
            <div class="mission-reward">奖励: ${mission.reward} 积分</div>
            ${buttonHtml}
        `;
        
        return div;
    }

    startMission(missionId) {
        this.client.startMission(missionId);
    }

    onMissionStarted(mission) {
        this.showNotification(`任务已开始: ${mission.name}`);
        this.updateMissionList();
    }

    updateMinimap(state) {
        const canvas = document.getElementById('minimapCanvas');
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const scale = size / CONFIG.WORLD.SIZE;
        
        ctx.fillStyle = '#001122';
        ctx.fillRect(0, 0, size, size);
        
        ctx.strokeStyle = 'rgba(0, 170, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        
        ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
        for (const obs of state.world.obstacles) {
            const x = (obs.position.x + CONFIG.WORLD.SIZE / 2) * scale;
            const y = (obs.position.z + CONFIG.WORLD.SIZE / 2) * scale;
            const r = Math.max(2, obs.radius * scale);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = '#ffcc00';
        for (const sample of state.world.samples) {
            const x = (sample.position.x + CONFIG.WORLD.SIZE / 2) * scale;
            const y = (sample.position.z + CONFIG.WORLD.SIZE / 2) * scale;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        }
        
        for (const vehicle of state.vehicles) {
            const x = (vehicle.position.x + CONFIG.WORLD.SIZE / 2) * scale;
            const y = (vehicle.position.z + CONFIG.WORLD.SIZE / 2) * scale;
            
            if (vehicle.id === this.client.vehicleId) {
                ctx.fillStyle = '#00ff88';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x + Math.sin(vehicle.rotation.y) * 10,
                    y + Math.cos(vehicle.rotation.y) * 10
                );
                ctx.stroke();
            } else {
                ctx.fillStyle = '#00aaff';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    updateStoryDialogue(dialogue) {
        const speaker = document.querySelector('.dialogue-speaker');
        const text = document.querySelector('.dialogue-text');
        
        if (speaker.textContent !== dialogue.speaker || text.textContent !== dialogue.text) {
            speaker.textContent = dialogue.speaker;
            text.textContent = dialogue.text;
            
            const box = document.getElementById('storyDialogue');
            box.style.animation = 'none';
            box.offsetHeight;
            box.style.animation = 'fadeIn 0.5s ease';
        }
    }

    toggleMissionPanel() {
        this.showMissionPanel = !this.showMissionPanel;
        document.getElementById('missionPanel').classList.toggle('hidden', !this.showMissionPanel);
        if (this.showMissionPanel) {
            this.updateMissionList();
        }
    }

    toggleSettingsPanel() {
        this.showSettingsPanel = !this.showSettingsPanel;
        document.getElementById('settingsPanel').classList.toggle('hidden', !this.showSettingsPanel);
        if (this.showSettingsPanel) {
            this.updateQualityOptions();
        }
    }
    
    updateQualityOptions() {
        const currentQuality = this.renderer.getPerformanceOptimizer().getQuality();
        document.querySelectorAll('.quality-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.quality === currentQuality);
        });
        
        const fps = this.renderer.getPerformanceOptimizer().getCurrentFps();
        document.getElementById('fpsDisplay').textContent = `FPS: ${Math.round(fps)}`;
    }
    
    setQualityLevel(quality) {
        this.renderer.getPerformanceOptimizer().setQuality(quality);
        this.updateQualityOptions();
        this.showNotification(`画质已切换为: ${quality === 'low' ? '低' : quality === 'medium' ? '中' : '高'}`);
    }

    toggleChat() {
        this.showChatBox = !this.showChatBox;
        document.getElementById('chatBox').classList.toggle('hidden', !this.showChatBox);
        if (this.showChatBox) {
            document.getElementById('chatInput').focus();
        }
    }

    sendChat() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (message) {
            this.client.sendChat(message);
            input.value = '';
        }
    }

    addChatMessage(sender, message) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `<span class="chat-sender">${sender}:</span>${message}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 170, 255, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 2000;
            animation: fadeIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showLoading() {
        document.getElementById('loadingScreen').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingScreen').classList.add('hidden');
    }
}

const game = new GameMain();
