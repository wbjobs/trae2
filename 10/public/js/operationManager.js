class OperationManager {
    constructor(socket, webrtcManager, sceneManager, userId, roomId) {
        this.socket = socket;
        this.webrtcManager = webrtcManager;
        this.sceneManager = sceneManager;
        this.userId = userId;
        this.roomId = roomId;
        this.version = 0;
        this.pendingOperations = new Map();
        this.operationHistory = [];
        this.appliedOpIds = new Set();
        this.onOperationLogged = null;
        this.isRecovering = false;
        this.localOpsDuringDisconnect = [];
        this.isConnected = true;
        this.isInHistoryMode = false;
        this.historyGeometries = new Map();
        this.currentHistoryTime = null;
        this.onHistoryStateChange = null;
        this.onExitHistory = null;

        this.setupListeners();
    }

    setupListeners() {
        this.webrtcManager.onOperation((operation, source) => {
            if (!this.isRecovering && !this.isInHistoryMode) {
                this.applyRemoteOperation(operation);
            }
        });

        this.socket.on('room-state', (state) => {
            this.handleRoomState(state);
        });

        this.socket.on('reconnect-state', (state) => {
            this.handleReconnectState(state);
        });

        this.socket.on('operation-broadcast', ({ operation, version }) => {
            if (this.isRecovering || this.isInHistoryMode) return;
            
            if (operation.version) {
                this.version = Math.max(this.version, operation.version);
            } else {
                this.version = version;
            }
            
            const opKey = this.getOpKey(operation);
            if (this.appliedOpIds.has(opKey)) {
                return;
            }
            
            if (!this.pendingOperations.has(operation.geometryId + '_' + operation.type)) {
                this.applyRemoteOperation(operation);
            }
            this.pendingOperations.delete(operation.geometryId + '_' + operation.type);
        });

        this.socket.on('export-progress', ({ progress, status }) => {
            if (this.onExportProgress) {
                this.onExportProgress(progress, status);
            }
        });

        this.socket.on('export-complete', ({ downloadUrl, filename, duration }) => {
            if (this.onExportComplete) {
                this.onExportComplete(downloadUrl, filename, duration);
            }
        });

        this.socket.on('export-error', ({ error }) => {
            if (this.onExportError) {
                this.onExportError(error);
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('Socket disconnected, caching local operations...');
        });

        this.socket.on('connect', () => {
            if (this.isConnected === false) {
                console.log('Socket reconnected, triggering state recovery...');
                this.isConnected = true;
                this.triggerReconnectSync();
            }
        });

        this.sceneManager.onTransform((transform) => {
            this.handleLocalTransform(transform);
        });
    }

    getOpKey(operation) {
        if (operation.opId) return operation.opId;
        return `${operation.geometryId}_${operation.type}_${operation.version || operation.timestamp}`;
    }

    handleLocalTransform(transform) {
        const { type, geometryId } = transform;

        let operation;
        switch (type) {
            case 'DELETE':
                operation = {
                    type: 'DELETE',
                    geometryId,
                    userId: this.userId,
                    data: {},
                    timestamp: Date.now()
                };
                break;

            case 'ADD':
                operation = {
                    type: 'ADD',
                    geometryId,
                    userId: this.userId,
                    data: transform.data,
                    timestamp: Date.now()
                };
                break;

            case 'UPDATE':
                operation = {
                    type: 'UPDATE',
                    geometryId,
                    userId: this.userId,
                    data: transform.data,
                    timestamp: Date.now()
                };
                break;
        }

        this.applyLocalOperation(operation);
        
        if (this.isConnected) {
            this.broadcastOperation(operation);
        } else {
            this.localOpsDuringDisconnect.push(operation);
            console.log('Cached operation during disconnect:', operation.type);
        }
    }

    addGeometry(type) {
        const geometryId = uuidv4();
        const colors = ['#00ff88', '#ff6b81', '#ffa502', '#00d4ff', '#a55eea', '#26de81', '#fd79a8', '#fdcb6e'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const position = {
            x: (Math.random() - 0.5) * 4,
            y: Math.random() * 2 + 0.5,
            z: (Math.random() - 0.5) * 4
        };

        const data = {
            id: geometryId,
            type,
            position,
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: randomColor
        };

        this.handleLocalTransform({
            type: 'ADD',
            geometryId,
            data
        });

        this.sceneManager.selectGeometry(geometryId);
        return geometryId;
    }

    updateSelectedGeometry(updates) {
        const selectedId = this.sceneManager.getSelectedId();
        if (!selectedId) return;

        this.handleLocalTransform({
            type: 'UPDATE',
            geometryId: selectedId,
            data: updates
        });
    }

    deleteSelectedGeometry() {
        const selectedId = this.sceneManager.getSelectedId();
        if (!selectedId) return;

        this.handleLocalTransform({
            type: 'DELETE',
            geometryId: selectedId
        });
    }

    applyLocalOperation(operation) {
        this.applyOperationToScene(operation);
        this.pendingOperations.set(operation.geometryId + '_' + operation.type, operation);
        this.logOperation(operation);
    }

    applyRemoteOperation(operation) {
        const opKey = this.getOpKey(operation);
        if (this.appliedOpIds.has(opKey)) {
            console.log('Skipping duplicate operation:', opKey);
            return;
        }

        this.applyOperationToScene(operation);
        this.appliedOpIds.add(opKey);
        this.logOperation(operation);

        if (operation.version) {
            this.version = Math.max(this.version, operation.version);
        }
    }

    applyOperationToScene(operation) {
        const { type, geometryId, data } = operation;

        switch (type) {
            case 'ADD':
                this.sceneManager.createGeometry(data);
                break;

            case 'UPDATE':
                this.sceneManager.updateGeometry(geometryId, data);
                break;

            case 'DELETE':
                this.sceneManager.deleteGeometry(geometryId);
                break;
        }
    }

    broadcastOperation(operation) {
        if (this.webrtcManager.getConnectedCount() > 0) {
            this.webrtcManager.sendOperation(operation);
        }

        this.socket.emit('operation', {
            roomId: this.roomId,
            operation
        });
    }

    triggerReconnectSync() {
        this.isRecovering = true;
        document.getElementById('syncOverlay').classList.remove('hidden');
        document.querySelector('.sync-content p').textContent = '正在恢复状态...';

        console.log('Sending reconnect-sync, lastKnownVersion:', this.version);

        this.socket.emit('reconnect-sync', {
            roomId: this.roomId,
            userId: this.userId,
            lastKnownVersion: this.version
        });
    }

    handleRoomState(state) {
        if (state.isReconnect) {
            this.handleReconnectState(state);
        } else {
            this.syncState(state);
        }
    }

    handleReconnectState(state) {
        const { snapshot, incrementalOps, lastKnownVersion } = state;
        
        console.log('Reconnect sync received:');
        console.log('  - Snapshot version:', snapshot.version);
        console.log('  - Last known version:', lastKnownVersion);
        console.log('  - Incremental ops count:', incrementalOps.length);

        this.appliedOpIds.clear();

        this.sceneManager.clearAll();

        snapshot.geometries.forEach(geometry => {
            this.sceneManager.createGeometry(geometry);
        });

        this.version = snapshot.version;

        let appliedCount = 0;
        incrementalOps.forEach(op => {
            const opKey = this.getOpKey(op);
            if (!this.appliedOpIds.has(opKey)) {
                this.applyOperationToScene(op);
                this.appliedOpIds.add(opKey);
                this.operationHistory.push(op);
                this.logOperation(op, true);
                appliedCount++;
            }
        });

        console.log(`Applied ${appliedCount} incremental operations during recovery`);

        if (this.localOpsDuringDisconnect.length > 0) {
            console.log(`Replaying ${this.localOpsDuringDisconnect.length} cached local operations...`);
            this.localOpsDuringDisconnect.forEach(op => {
                this.broadcastOperation(op);
            });
            this.localOpsDuringDisconnect = [];
        }

        this.isRecovering = false;
        document.getElementById('syncOverlay').classList.add('hidden');
        
        this.addSystemMessage(`连接已恢复，同步了 ${appliedCount} 条操作`);
    }

    syncState(state) {
        const { snapshot, operations } = state;
        
        let geometries, version;
        if (snapshot) {
            geometries = snapshot.geometries;
            version = snapshot.version;
        } else {
            geometries = state.geometries;
            version = state.version;
        }
        
        this.version = version;
        this.appliedOpIds.clear();

        this.sceneManager.clearAll();

        geometries.forEach(geometry => {
            this.sceneManager.createGeometry(geometry);
        });

        this.operationHistory = operations || [];
        this.operationHistory.forEach(op => {
            const opKey = this.getOpKey(op);
            this.appliedOpIds.add(opKey);
            this.logOperation(op, true);
        });

        document.getElementById('syncOverlay').classList.add('hidden');
    }

    logOperation(operation, isHistory = false) {
        const opType = operation.type;
        const geometryId = operation.geometryId;
        const userId = operation.userId;
        const timestamp = operation.timestamp;

        if (!isHistory) {
            this.operationHistory.push(operation);
        }

        const opLogEl = document.getElementById('opLog');
        if (opLogEl) {
            const logItem = document.createElement('div');
            logItem.className = 'op-log-item';
            
            const timeStr = new Date(timestamp).toLocaleTimeString();
            const typeLabels = { 'ADD': '添加', 'UPDATE': '修改', 'DELETE': '删除' };
            const typeColors = { 'ADD': '#00ff88', 'UPDATE': '#00d4ff', 'DELETE': '#ff6b81' };
            
            logItem.innerHTML = `
                <span class="op-type" style="color: ${typeColors[opType]}">${typeLabels[opType]}</span>
                <span class="op-user">${userId}</span>
                <div style="color: #888; font-size: 11px; margin-top: 3px;">
                    ID: ${geometryId.substring(0, 8)}...
                    ${operation.version ? ` | v${operation.version}` : ''}
                </div>
                <span class="op-time">${timeStr}</span>
            `;
            
            opLogEl.insertBefore(logItem, opLogEl.firstChild);
            
            while (opLogEl.children.length > 50) {
                opLogEl.removeChild(opLogEl.lastChild);
            }
        }

        if (this.onOperationLogged) {
            this.onOperationLogged(operation);
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

    getVersion() {
        return this.version;
    }

    onLog(callback) {
        this.onOperationLogged = callback;
    }

    replayOperations(fromVersion = 0) {
        const opsToReplay = this.operationHistory.filter(op => (op.version || 0) > fromVersion);
        opsToReplay.forEach(op => this.applyOperationToScene(op));
    }

    getSortedOperations() {
        return [...this.operationHistory].sort((a, b) => a.timestamp - b.timestamp);
    }

    getTimeRange() {
        const ops = this.getSortedOperations();
        if (ops.length === 0) {
            const now = Date.now();
            return { start: now, end: now };
        }
        return {
            start: ops[0].timestamp,
            end: ops[ops.length - 1].timestamp
        };
    }

    computeStateAtTime(targetTime) {
        const ops = this.getSortedOperations();
        const state = new Map();

        for (const op of ops) {
            if (op.timestamp > targetTime) break;

            const { type, geometryId, data } = op;

            switch (type) {
                case 'ADD':
                    state.set(geometryId, { ...data });
                    break;

                case 'UPDATE':
                    if (state.has(geometryId)) {
                        const existing = state.get(geometryId);
                        if (data.position) existing.position = { ...data.position };
                        if (data.rotation) existing.rotation = { ...data.rotation };
                        if (data.scale) existing.scale = { ...data.scale };
                        if (data.color) existing.color = data.color;
                    }
                    break;

                case 'DELETE':
                    state.delete(geometryId);
                    break;
            }
        }

        return state;
    }

    enterHistoryMode() {
        if (this.isInHistoryMode) return;

        this.isInHistoryMode = true;
        this.historyGeometries.clear();

        const currentGeoms = this.sceneManager.getAllGeometries();
        currentGeoms.forEach(g => {
            this.historyGeometries.set(g.id, { ...g });
        });

        if (this.onHistoryStateChange) {
            this.onHistoryStateChange(true);
        }
    }

    exitHistoryMode() {
        if (!this.isInHistoryMode) return;

        this.isInHistoryMode = false;
        this.currentHistoryTime = null;

        this.sceneManager.clearAll();
        this.historyGeometries.forEach(geometry => {
            this.sceneManager.createGeometry(geometry);
        });

        this.historyGeometries.clear();

        if (this.onHistoryStateChange) {
            this.onHistoryStateChange(false);
        }

        if (this.onExitHistory) {
            this.onExitHistory();
        }
    }

    rollbackToTime(targetTime) {
        if (!this.isInHistoryMode) {
            this.enterHistoryMode();
        }

        this.currentHistoryTime = targetTime;
        const stateAtTime = this.computeStateAtTime(targetTime);

        this.sceneManager.clearAll();

        stateAtTime.forEach(geometry => {
            this.sceneManager.createGeometry(geometry);
        });

        if (this.onHistoryRollback) {
            this.onHistoryRollback(targetTime, stateAtTime.size);
        }
    }

    requestExport(options) {
        return new Promise((resolve, reject) => {
            const exportId = uuidv4();
            
            this.onExportProgress = null;
            this.onExportComplete = null;
            this.onExportError = null;

            this.socket.emit('request-export', {
                roomId: this.roomId,
                userId: this.userId,
                exportId,
                ...options
            });

            resolve(exportId);
        });
    }

    onExportProgress(callback) {
        this.onExportProgress = callback;
    }

    onExportComplete(callback) {
        this.onExportComplete = callback;
    }

    onExportError(callback) {
        this.onExportError = callback;
    }

    onHistoryStateChange(callback) {
        this.onHistoryStateChange = callback;
    }

    onHistoryRollback(callback) {
        this.onHistoryRollback = callback;
    }

    onExitHistory(callback) {
        this.onExitHistory = callback;
    }
}
