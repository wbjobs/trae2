class GameClient {
  constructor(renderer) {
    this.renderer = renderer;
    this.ws = null;
    this.clientId = null;
    this.vehicleId = null;
    this.config = null;
    this.gameState = null;
    this.isConnected = false;
    this.isSinglePlayer = false;
    this.inputState = {
      forward: 0,
      backward: 0,
      left: 0,
      right: 0,
      up: 0,
      down: 0,
      rollLeft: 0,
      rollRight: 0,
      boost: 0,
      brake: 0
    };
    this.cameraMode = 'follow';
    this.mouseSensitivity = 0.002;
    this.isPointerLocked = false;
    this.onStateChange = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onChatMessage = null;
    this.onMissionStarted = null;
    this.onPlayersUpdate = null;
    this.singlePlayerEngine = null;
    this.lastInputSend = 0;
    this.inputSendInterval = 33;
    this.chatHistory = [];
    this.players = new Map();
    
    this.interpolationFactor = 0.15;
    this.targetState = null;
    this.renderState = null;
    this.lastServerTime = 0;
    this.localTime = 0;
    this.interpolationDelay = 0.1;
  }

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);
        
        this.ws.onopen = () => {
          console.log('连接到服务器');
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          if (!this.isConnected) {
            reject(error);
          }
        };
        
        this.ws.onclose = () => {
          console.log('断开连接');
          this.isConnected = false;
          if (this.onDisconnected) {
            this.onDisconnected();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  startSinglePlayer() {
    this.isSinglePlayer = true;
    this.clientId = 'local_player';
    this.vehicleId = 'vehicle_local';
    this.isConnected = true;
    
    this.singlePlayerEngine = new PhysicsEngine();
    this.singlePlayerEngine.addVehicle(this.vehicleId);
    
    this.renderState = null;
    
    this.startGameLoop();
    
    if (this.onConnected) {
      this.onConnected();
    }
    
    return Promise.resolve();
  }

  joinGame(playerName, playerColor) {
    if (this.isSinglePlayer) {
      return;
    }
    
    const message = {
      type: 'join',
      name: playerName,
      color: playerColor
    };
    this.send(message);
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        this.clientId = message.clientId;
        this.config = message.config;
        this.serverInfo = message.serverInfo;
        break;
        
      case 'joined':
        this.vehicleId = message.vehicleId;
        this.isConnected = true;
        this.targetState = message.state;
        if (this.onConnected) {
          this.onConnected();
        }
        break;
        
      case 'state':
        this.targetState = message.state;
        this.lastServerTime = Date.now();
        
        if (!this.renderState) {
          this.renderState = this.deepCloneState(message.state);
        }
        
        if (this.onStateChange) {
          this.onStateChange(message.state);
        }
        break;
        
      case 'playerJoined':
        this.players.set(message.player.id, message.player);
        if (this.onPlayersUpdate) {
          this.onPlayersUpdate(Array.from(this.players.values()));
        }
        break;
        
      case 'playerLeft':
        this.players.delete(message.vehicleId);
        if (this.onPlayersUpdate) {
          this.onPlayersUpdate(Array.from(this.players.values()));
        }
        break;
        
      case 'playersList':
        message.players.forEach(p => {
          this.players.set(p.id, p);
        });
        if (this.onPlayersUpdate) {
          this.onPlayersUpdate(Array.from(this.players.values()));
        }
        break;
        
      case 'missionStarted':
        if (this.onMissionStarted) {
          this.onMissionStarted(message.mission);
        }
        break;
        
      case 'chat':
        this.addChatMessage(message.sender, message.message, message.timestamp);
        break;
        
      case 'ping':
        this.send({ type: 'pong' });
        break;
        
      case 'error':
        console.error('服务器错误:', message.message);
        alert(message.message);
        break;
    }
  }

  deepCloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  interpolateState(deltaTime) {
    if (!this.targetState || !this.renderState) return;
    
    const targetVehicles = this.targetState.vehicles;
    const renderVehicles = this.renderState.vehicles;
    
    for (const targetVeh of targetVehicles) {
      let renderVeh = renderVehicles.find(v => v.id === targetVeh.id);
      
      if (!renderVeh) {
        renderVeh = this.deepCloneState(targetVeh);
        renderVehicles.push(renderVeh);
        continue;
      }
      
      const factor = this.interpolationFactor;
      
      renderVeh.position.x = Utils.lerp(renderVeh.position.x, targetVeh.position.x, factor);
      renderVeh.position.y = Utils.lerp(renderVeh.position.y, targetVeh.position.y, factor);
      renderVeh.position.z = Utils.lerp(renderVeh.position.z, targetVeh.position.z, factor);
      
      renderVeh.rotation.x = Utils.lerpAngle(renderVeh.rotation.x, targetVeh.rotation.x, factor);
      renderVeh.rotation.y = Utils.lerpAngle(renderVeh.rotation.y, targetVeh.rotation.y, factor);
      renderVeh.rotation.z = Utils.lerpAngle(renderVeh.rotation.z, targetVeh.rotation.z, factor);
      
      if (targetVeh.bionicState && renderVeh.bionicState) {
        renderVeh.bionicState.tailPhase = targetVeh.bionicState.tailPhase;
        renderVeh.bionicState.leftFinAngle = Utils.lerp(renderVeh.bionicState.leftFinAngle, targetVeh.bionicState.leftFinAngle, factor);
        renderVeh.bionicState.rightFinAngle = Utils.lerp(renderVeh.bionicState.rightFinAngle, targetVeh.bionicState.rightFinAngle, factor);
        renderVeh.bionicState.tailAmplitude = Utils.lerp(renderVeh.bionicState.tailAmplitude, targetVeh.bionicState.tailAmplitude, factor);
        renderVeh.bionicState.bodyPitch = Utils.lerp(renderVeh.bionicState.bodyPitch, targetVeh.bionicState.bodyPitch, factor);
        renderVeh.bionicState.bodyRoll = Utils.lerp(renderVeh.bionicState.bodyRoll, targetVeh.bionicState.bodyRoll, factor);
      }
      
      renderVeh.health = targetVeh.health;
      renderVeh.energy = targetVeh.energy;
      renderVeh.buoyancy = targetVeh.buoyancy;
      renderVeh.alive = targetVeh.alive;
      renderVeh.sensorData = targetVeh.sensorData;
    }
    
    for (let i = renderVehicles.length - 1; i >= 0; i--) {
      if (!targetVehicles.find(v => v.id === renderVehicles[i].id)) {
        renderVehicles.splice(i, 1);
      }
    }
    
    if (this.targetState.world && this.renderState.world) {
      this.renderState.world.obstacles = this.targetState.world.obstacles.map(o => ({ ...o }));
      this.renderState.world.samples = this.targetState.world.samples.map(s => ({ ...s }));
    }
  }

  updateFromState(state) {
    if (!this.renderer.isInitialized) return;
    
    const displayState = this.isSinglePlayer ? state : this.renderState;
    if (!displayState) return;
    
    this.renderer.updateVehicles(displayState.vehicles);
    this.renderer.updateObstacles(displayState.world.obstacles);
    this.renderer.updateSamples(displayState.world.samples);
    
    const myVehicle = displayState.vehicles.find(v => v.id === this.vehicleId);
    if (myVehicle && myVehicle.sensorData) {
      const pos = new THREE.Vector3(
        myVehicle.position.x,
        myVehicle.position.y,
        myVehicle.position.z
      );
      const rot = { y: myVehicle.rotation.y };
      this.renderer.updateSonar(myVehicle.sensorData, pos, rot);
    }
    
    if (this.cameraMode === 'follow' && this.vehicleId) {
      this.renderer.followVehicle(this.vehicleId);
    }
  }

  startGameLoop() {
    let lastTime = Date.now();
    
    const loop = () => {
      if (!this.isConnected && !this.isSinglePlayer) {
        return;
      }
      
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;
      
      if (this.isSinglePlayer && this.singlePlayerEngine) {
        this.singlePlayerEngine.setInput(this.vehicleId, this.inputState);
        const newState = this.singlePlayerEngine.update();
        this.gameState = newState;
        this.renderState = newState;
        this.updateFromState(newState);
        if (this.onStateChange) {
          this.onStateChange(newState);
        }
      } else if (!this.isSinglePlayer) {
        this.interpolateState(deltaTime);
        
        if (this.renderState) {
          this.gameState = this.targetState;
          this.updateFromState(this.renderState);
        }
      }
      
      this.sendInput();
      
      this.renderer.render();
      
      requestAnimationFrame(loop);
    };
    
    loop();
  }

  sendInput() {
    const now = Date.now();
    if (now - this.lastInputSend < this.inputSendInterval) {
      return;
    }
    
    this.lastInputSend = now;
    
    if (this.isSinglePlayer) {
      return;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'input',
        input: this.inputState
      });
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  setInput(key, value) {
    this.inputState[key] = value;
  }

  handleKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.inputState.forward = 1;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.inputState.backward = 1;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.inputState.left = 1;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.inputState.right = 1;
        break;
      case 'Space':
        this.inputState.up = 1;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.inputState.down = 1;
        break;
      case 'KeyQ':
        this.inputState.rollLeft = 1;
        break;
      case 'KeyE':
        this.inputState.rollRight = 1;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.inputState.boost = 1;
        break;
      case 'KeyF':
        this.cameraMode = this.cameraMode === 'follow' ? 'free' : 'follow';
        break;
      case 'KeyV':
        this.inputState.brake = this.inputState.brake ? 0 : 1;
        break;
      case 'Tab':
        event.preventDefault();
        if (!this.isSinglePlayer) {
          this.send({ type: 'getPlayers' });
        }
        break;
    }
  }

  handleKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.inputState.forward = 0;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.inputState.backward = 0;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.inputState.left = 0;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.inputState.right = 0;
        break;
      case 'Space':
        this.inputState.up = 0;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.inputState.down = 0;
        break;
      case 'KeyQ':
        this.inputState.rollLeft = 0;
        break;
      case 'KeyE':
        this.inputState.rollRight = 0;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.inputState.boost = 0;
        break;
    }
  }

  handleMouseMove(event) {
    if (!this.isPointerLocked) return;
    
    if (this.cameraMode === 'free') {
      this.renderer.rotateCamera(event.movementX, event.movementY);
    }
  }

  handleMouseDown(event) {
    if (event.button === 0) {
      this.renderer.canvas.requestPointerLock();
    }
  }

  startMission(missionId) {
    if (this.isSinglePlayer) {
      const mission = this.singlePlayerEngine.startMission(this.vehicleId, missionId);
      if (this.onMissionStarted) {
        this.onMissionStarted(mission);
      }
    } else {
      this.send({
        type: 'startMission',
        missionId: missionId
      });
    }
  }

  sendChat(message) {
    if (this.isSinglePlayer) {
      this.addChatMessage('我', message, Date.now());
    } else {
      this.send({
        type: 'chat',
        message: message
      });
    }
  }

  addChatMessage(sender, message, timestamp) {
    this.chatHistory.push({ sender, message, timestamp });
    if (this.onChatMessage) {
      this.onChatMessage(sender, message, timestamp);
    }
  }

  getMyVehicle() {
    const state = this.renderState || this.gameState;
    if (!state) return null;
    return state.vehicles.find(v => v.id === this.vehicleId);
  }

  getActiveMissions() {
    const state = this.targetState || this.gameState;
    if (!state || !state.missionState) return [];
    const vehicleMissions = state.missionState.activeMissions.find(m => m.vehicleId === this.vehicleId);
    return vehicleMissions ? vehicleMissions.missions : [];
  }

  getAvailableMissions() {
    const state = this.targetState || this.gameState;
    if (!state || !state.missionState) return [];
    return state.missionState.availableMissions.filter(mission => {
      const notCompleted = !state.missionState.completedMissions.some(
        cm => cm.missionId === mission.id && cm.vehicleId === this.vehicleId
      );
      const notActive = !this.getActiveMissions().some(am => am.id === mission.id);
      const prereqsMet = mission.prerequisites.every(prereq =>
        state.missionState.completedMissions.some(
          cm => cm.missionId === prereq && cm.vehicleId === this.vehicleId
        )
      );
      return notCompleted && notActive && prereqsMet;
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.isConnected = false;
    this.isSinglePlayer = false;
    this.renderState = null;
    this.targetState = null;
  }
}
