class WebRTCManager {
    constructor(socket, userId, roomId) {
        this.socket = socket;
        this.userId = userId;
        this.roomId = roomId;
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.onOperationCallback = null;
        this.onLatencyUpdate = null;
        this.pingIntervals = new Map();
        
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('existing-peers', ({ peers }) => {
            peers.forEach(peerId => {
                this.createPeerConnection(peerId, true);
            });
        });

        this.socket.on('peer-joined', ({ peerId, userId }) => {
            this.createPeerConnection(peerId, false);
        });

        this.socket.on('webrtc-signal', ({ from, signal }) => {
            this.handleSignal(from, signal);
        });

        this.socket.on('peer-left', ({ peerId }) => {
            this.removePeer(peerId);
        });
    }

    createPeerConnection(peerId, isInitiator) {
        if (this.peerConnections.has(peerId)) {
            return;
        }

        const pc = new RTCPeerConnection(this.iceServers);
        this.peerConnections.set(peerId, pc);

        const dataChannel = pc.createDataChannel('operations', {
            ordered: false,
            maxRetransmits: 0
        });

        this.setupDataChannel(dataChannel, peerId);

        pc.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, peerId);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-signal', {
                    to: peerId,
                    from: this.socket.id,
                    signal: { type: 'candidate', candidate: event.candidate },
                    userId: this.userId
                });
            }
        };

        pc.onconnectionstatechange = () => {
            this.updateWebRTCStatus();
            if (pc.connectionState === 'connected') {
                this.startPing(peerId);
            } else if (pc.connectionState === 'disconnected' || 
                       pc.connectionState === 'failed' ||
                       pc.connectionState === 'closed') {
                this.stopPing(peerId);
            }
        };

        if (isInitiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    this.socket.emit('webrtc-signal', {
                        to: peerId,
                        from: this.socket.id,
                        signal: { type: 'offer', sdp: pc.localDescription },
                        userId: this.userId
                    });
                });
        }
    }

    setupDataChannel(channel, peerId) {
        channel.onopen = () => {
            console.log(`Data channel opened with ${peerId}`);
            this.dataChannels.set(peerId, channel);
            this.updateWebRTCStatus();
        };

        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'ping') {
                    channel.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
                } else if (message.type === 'pong') {
                    const latency = Date.now() - message.timestamp;
                    if (this.onLatencyUpdate) {
                        this.onLatencyUpdate(latency);
                    }
                } else if (message.type === 'operation') {
                    if (this.onOperationCallback) {
                        this.onOperationCallback(message.operation, 'webrtc');
                    }
                }
            } catch (e) {
                console.error('Error parsing data channel message:', e);
            }
        };

        channel.onclose = () => {
            console.log(`Data channel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
            this.stopPing(peerId);
            this.updateWebRTCStatus();
        };

        channel.onerror = (error) => {
            console.error(`Data channel error with ${peerId}:`, error);
        };
    }

    handleSignal(from, signal) {
        const pc = this.peerConnections.get(from) || this.createPeerConnection(from, false);
        const peerConnection = this.peerConnections.get(from);

        if (!peerConnection) return;

        if (signal.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => peerConnection.createAnswer())
                .then(answer => peerConnection.setLocalDescription(answer))
                .then(() => {
                    this.socket.emit('webrtc-signal', {
                        to: from,
                        from: this.socket.id,
                        signal: { type: 'answer', sdp: peerConnection.localDescription },
                        userId: this.userId
                    });
                });
        } else if (signal.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate') {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    removePeer(peerId) {
        this.stopPing(peerId);
        
        const dc = this.dataChannels.get(peerId);
        if (dc) {
            dc.close();
            this.dataChannels.delete(peerId);
        }

        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }

        this.updateWebRTCStatus();
    }

    sendOperation(operation) {
        const message = JSON.stringify({
            type: 'operation',
            operation
        });

        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(message);
                } catch (e) {
                    console.error(`Failed to send to ${peerId}:`, e);
                }
            }
        });
    }

    startPing(peerId) {
        this.stopPing(peerId);
        
        const interval = setInterval(() => {
            const channel = this.dataChannels.get(peerId);
            if (channel && channel.readyState === 'open') {
                channel.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, 2000);

        this.pingIntervals.set(peerId, interval);
    }

    stopPing(peerId) {
        const interval = this.pingIntervals.get(peerId);
        if (interval) {
            clearInterval(interval);
            this.pingIntervals.delete(peerId);
        }
    }

    onOperation(callback) {
        this.onOperationCallback = callback;
    }

    onLatency(callback) {
        this.onLatencyUpdate = callback;
    }

    getConnectedCount() {
        let count = 0;
        this.dataChannels.forEach(channel => {
            if (channel.readyState === 'open') count++;
        });
        return count;
    }

    updateWebRTCStatus() {
        const statusEl = document.getElementById('webrtcStatus');
        if (!statusEl) return;

        const connectedCount = this.getConnectedCount();
        if (connectedCount > 0) {
            statusEl.className = 'status-dot connected';
            statusEl.title = `已连接 ${connectedCount} 个对等端`;
        } else if (this.peerConnections.size > 0) {
            statusEl.className = 'status-dot connecting';
        } else {
            statusEl.className = 'status-dot disconnected';
        }
    }

    destroy() {
        this.pingIntervals.forEach((interval) => clearInterval(interval));
        this.pingIntervals.clear();

        this.dataChannels.forEach(channel => channel.close());
        this.dataChannels.clear();

        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
    }
}
