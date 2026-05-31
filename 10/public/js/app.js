class App {
    constructor() {
        this.socket = null;
        this.sceneManager = null;
        this.webrtcManager = null;
        this.operationManager = null;
        this.userId = null;
        this.roomId = null;
        this.isJoined = false;
        this.latencies = [];

        this.init();
    }

    init() {
        this.setupLoginForm();
        this.generateRandomRoomId();
    }

    generateRandomRoomId() {
        const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('roomId').value = randomId;
    }

    setupLoginForm() {
        const joinBtn = document.getElementById('joinBtn');
        const usernameInput = document.getElementById('username');
        const roomIdInput = document.getElementById('roomId');

        joinBtn.addEventListener('click', () => this.joinRoom());
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    joinRoom() {
        const username = document.getElementById('username').value.trim();
        const roomId = document.getElementById('roomId').value.trim();
        const loginStatus = document.getElementById('loginStatus');

        if (!username) {
            loginStatus.textContent = '请输入用户名';
            loginStatus.style.color = '#ff6b81';
            return;
        }

        if (!roomId) {
            loginStatus.textContent = '请输入房间ID';
            loginStatus.style.color = '#ff6b81';
            return;
        }

        this.userId = username;
        this.roomId = roomId;

        loginStatus.textContent = '正在连接服务器...';
        loginStatus.style.color = '#00ff88';

        this.connect();
    }

    connect() {
        const socketUrl = window.location.origin;
        this.socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        this.isFirstConnect = true;

        this.socket.on('connect', () => {
            this.updateSocketStatus('connected');
            
            if (this.isFirstConnect) {
                this.isFirstConnect = false;
                document.getElementById('syncOverlay').classList.remove('hidden');
                this.socket.emit('join-room', {
                    roomId: this.roomId,
                    userId: this.userId,
                    lastKnownVersion: 0,
                    isReconnect: false
                });

                this.showEditor();
                this.initEditor();
            } else {
                console.log('Socket reconnected, will trigger sync via OperationManager');
            }
        });

        this.socket.on('disconnect', (reason) => {
            this.updateSocketStatus('disconnected');
            console.log('Socket disconnected:', reason);
            if (this.operationManager) {
                this.addSystemMessage('连接已断开，正在尝试重连...');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`Socket reconnected after ${attemptNumber} attempts`);
            this.updateSocketStatus('connected');
        });

        this.socket.on('reconnecting', (attemptNumber) => {
            console.log(`Attempting to reconnect (${attemptNumber})...`);
        });

        this.socket.on('connect_error', (error) => {
            const loginStatus = document.getElementById('loginStatus');
            if (loginStatus && this.isFirstConnect) {
                loginStatus.textContent = '连接失败，请刷新页面重试';
                loginStatus.style.color = '#ff6b81';
            }
            console.error('Socket connect error:', error);
        });

        this.socket.on('peer-joined', ({ userId }) => {
            this.addSystemMessage(`用户 ${userId} 加入了房间`);
            this.updatePeersCount();
        });

        this.socket.on('peer-left', ({ userId }) => {
            this.addSystemMessage(`用户 ${userId} 离开了房间`);
            this.updatePeersCount();
        });

        this.socket.on('existing-peers', ({ peers }) => {
            this.updatePeersCount();
        });
    }

    showEditor() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('editor-screen').classList.remove('hidden');
        
        document.getElementById('currentRoomId').textContent = this.roomId;
        document.getElementById('currentUserId').textContent = this.userId;
    }

    initEditor() {
        this.sceneManager = new SceneManager('threeCanvas');
        this.webrtcManager = new WebRTCManager(this.socket, this.userId, this.roomId);
        this.operationManager = new OperationManager(
            this.socket,
            this.webrtcManager,
            this.sceneManager,
            this.userId,
            this.roomId
        );

        this.timelineManager = new TimelineManager(this.operationManager);
        this.timelineManager.show();

        this.webrtcManager.onLatency((latency) => {
            this.updateLatency(latency);
        });

        this.operationManager.onLog(() => {
            this.updateVersion();
        });

        this.setupEditorEvents();
        this.isJoined = true;

        setTimeout(() => {
            this.sceneManager.onResize();
        }, 100);
    }

    setupEditorEvents() {
        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const shape = btn.dataset.shape;
                this.operationManager.addGeometry(shape);
            });
        });

        this.sceneManager.onSelect((geometry) => {
            this.updatePropertiesPanel(geometry);
        });

        const propInputs = ['propColor', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'];
        propInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.applyPropertyChanges());
                el.addEventListener('change', () => this.applyPropertyChanges());
            }
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            this.operationManager.deleteSelectedGeometry();
        });
    }

    updatePropertiesPanel(geometry) {
        const panel = document.getElementById('propertiesPanel');
        if (!geometry) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        document.getElementById('propColor').value = geometry.color;
        document.getElementById('posX').value = geometry.position.x;
        document.getElementById('posY').value = geometry.position.y;
        document.getElementById('posZ').value = geometry.position.z;
        document.getElementById('rotX').value = geometry.rotation.x;
        document.getElementById('rotY').value = geometry.rotation.y;
        document.getElementById('rotZ').value = geometry.rotation.z;
        document.getElementById('scaleX').value = geometry.scale.x;
        document.getElementById('scaleY').value = geometry.scale.y;
        document.getElementById('scaleZ').value = geometry.scale.z;
    }

    applyPropertyChanges() {
        const selectedId = this.sceneManager.getSelectedId();
        if (!selectedId) return;

        const updates = {};

        const color = document.getElementById('propColor').value;
        if (color) updates.color = color;

        const posX = parseFloat(document.getElementById('posX').value);
        const posY = parseFloat(document.getElementById('posY').value);
        const posZ = parseFloat(document.getElementById('posZ').value);
        if (!isNaN(posX) && !isNaN(posY) && !isNaN(posZ)) {
            updates.position = { x: posX, y: posY, z: posZ };
        }

        const rotX = parseFloat(document.getElementById('rotX').value);
        const rotY = parseFloat(document.getElementById('rotY').value);
        const rotZ = parseFloat(document.getElementById('rotZ').value);
        if (!isNaN(rotX) && !isNaN(rotY) && !isNaN(rotZ)) {
            updates.rotation = { x: rotX, y: rotY, z: rotZ };
        }

        const scaleX = parseFloat(document.getElementById('scaleX').value);
        const scaleY = parseFloat(document.getElementById('scaleY').value);
        const scaleZ = parseFloat(document.getElementById('scaleZ').value);
        if (!isNaN(scaleX) && !isNaN(scaleY) && !isNaN(scaleZ) && scaleX > 0 && scaleY > 0 && scaleZ > 0) {
            updates.scale = { x: scaleX, y: scaleY, z: scaleZ };
        }

        if (Object.keys(updates).length > 0) {
            this.operationManager.updateSelectedGeometry(updates);
        }
    }

    updateSocketStatus(status) {
        const statusEl = document.getElementById('socketStatus');
        if (statusEl) {
            statusEl.className = `status-dot ${status}`;
        }
    }

    updateLatency(latency) {
        this.latencies.push(latency);
        if (this.latencies.length > 10) {
            this.latencies.shift();
        }

        const avgLatency = Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length);
        const latencyEl = document.getElementById('latency');
        if (latencyEl) {
            latencyEl.textContent = `${avgLatency} ms`;
            
            if (avgLatency < 50) {
                latencyEl.style.color = '#00ff88';
            } else if (avgLatency < 100) {
                latencyEl.style.color = '#ffa502';
            } else {
                latencyEl.style.color = '#ff6b81';
            }
        }
    }

    updateVersion() {
        const versionEl = document.getElementById('currentVersion');
        if (versionEl && this.operationManager) {
            versionEl.textContent = this.operationManager.getVersion();
        }
    }

    updatePeersCount() {
        const peersCountEl = document.getElementById('peersCount');
        if (peersCountEl && this.webrtcManager) {
            const count = this.webrtcManager.getConnectedCount() + 1;
            peersCountEl.textContent = count;
        }
    }

    addSystemMessage(message) {
        const opLogEl = document.getElementById('opLog');
        if (opLogEl) {
            const logItem = document.createElement('div');
            logItem.className = 'op-log-item';
            logItem.style.borderLeftColor = '#a55eea';
            logItem.innerHTML = `
                <span class="op-type" style="color: #a55eea">系统</span>
                <span class="op-user">${message}</span>
                <span class="op-time">${new Date().toLocaleTimeString()}</span>
            `;
            opLogEl.insertBefore(logItem, opLogEl.firstChild);
            
            while (opLogEl.children.length > 50) {
                opLogEl.removeChild(opLogEl.lastChild);
            }
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
