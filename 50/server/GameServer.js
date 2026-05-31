const EnvironmentSimulator = require('./modules/EnvironmentSimulator');
const EquipmentManager = require('./modules/EquipmentManager');
const FaultDetector = require('./modules/FaultDetector');
const TaskManager = require('./modules/TaskManager');
const PlayerManager = require('./modules/PlayerManager');
const MissionLibrary = require('./modules/MissionLibrary');

class GameServer {
  constructor(wss) {
    this.wss = wss;
    this.players = new PlayerManager();
    this.environment = new EnvironmentSimulator();
    this.equipment = new EquipmentManager();
    this.faultDetector = new FaultDetector();
    this.taskManager = new TaskManager();
    this.missionLibrary = new MissionLibrary();
    
    this.gameTime = 0;
    this.isRunning = true;
    this.lastStormState = false;
    this.completedRepairs = 0;
    this.frameCount = 0;
    
    this.cachedState = null;
    this.lastCacheTime = 0;
    
    this.initGame();
    this.startGameLoop();
  }

  initGame() {
    this.equipment.initEquipment();
    this.taskManager.initTasks(this.equipment.getEquipmentList());
    this.missionLibrary.generateDailyMissions();
  }

  handleConnection(ws) {
    const playerId = this.players.addPlayer(ws);
    console.log(`玩家 ${playerId} 连接`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(playerId, message);
      } catch (e) {
        console.error('消息解析错误:', e);
      }
    });

    ws.on('close', () => {
      console.log(`玩家 ${playerId} 断开连接`);
      this.players.removePlayer(playerId);
    });

    this.sendToPlayer(playerId, {
      type: 'init',
      playerId,
      environment: this.environment.getState(),
      equipment: this.equipment.getEquipmentList(),
      tasks: this.taskManager.getTasks(),
      missions: this.missionLibrary.getAvailableMissions(),
      gameTime: this.gameTime,
      equipmentStats: this.equipment.getEquipmentStats()
    });
  }

  handleMessage(playerId, message) {
    switch (message.type) {
      case 'repair':
        this.handleRepair(playerId, message);
        break;
      case 'diagnose':
        this.handleDiagnose(playerId, message);
        break;
      case 'maintenance':
        this.handleMaintenance(playerId, message);
        break;
      case 'accept_mission':
        this.handleAcceptMission(playerId, message);
        break;
      case 'chat':
        this.broadcast({
          type: 'chat',
          playerId,
          content: message.content,
          timestamp: Date.now()
        });
        break;
    }
  }

  handleRepair(playerId, message) {
    const { equipmentId, faultType } = message;
    const success = this.equipment.repairEquipment(equipmentId, faultType);
    
    if (success) {
      this.completedRepairs++;
      this.taskManager.completeRepairTask(equipmentId, faultType, playerId);
      this.players.addScore(playerId, 100);
      
      this.broadcast({
        type: 'repair_success',
        playerId,
        equipmentId,
        faultType,
        score: this.players.getPlayer(playerId)?.score || 0
      });
    }
  }

  handleDiagnose(playerId, message) {
    const { equipmentId } = message;
    const equipment = this.equipment.getEquipment(equipmentId);
    
    if (equipment) {
      const faults = this.faultDetector.diagnose(equipment);
      
      this.sendToPlayer(playerId, {
        type: 'diagnose_result',
        equipmentId,
        faults
      });
    }
  }

  handleMaintenance(playerId, message) {
    const { equipmentId, type } = message;
    let success = false;
    let points = 0;
    
    if (type === 'routine') {
      success = this.equipment.performMaintenance(equipmentId);
      points = 50;
    } else if (type === 'replace') {
      success = this.equipment.replacePart(equipmentId);
      points = 150;
    }
    
    if (success) {
      this.players.addScore(playerId, points);
      
      this.broadcast({
        type: 'maintenance_success',
        playerId,
        equipmentId,
        type,
        score: this.players.getPlayer(playerId)?.score || 0
      });
    }
  }

  handleAcceptMission(playerId, message) {
    const { missionId } = message;
    const mission = this.missionLibrary.getMissionById(missionId);
    
    if (mission) {
      this.players.setCurrentTask(playerId, missionId);
      
      this.sendToPlayer(playerId, {
        type: 'mission_accepted',
        missionId,
        mission
      });
    }
  }

  startGameLoop() {
    const TICK_RATE = 1000;
    
    setInterval(() => {
      if (!this.isRunning) return;
      
      this.gameTime++;
      this.frameCount++;
      
      this.updateGameState();
      
      if (this.frameCount % 2 === 0) {
        this.broadcastGameState();
      }
      
    }, TICK_RATE);
  }

  updateGameState() {
    this.environment.update();
    
    this.equipment.updateAll(this.environment.getState());
    
    const newFaults = this.faultDetector.detectFaults(
      this.equipment.getEquipmentList(),
      this.environment.getState()
    );
    
    newFaults.forEach(fault => {
      this.equipment.applyFault(fault.equipmentId, fault.type);
      this.taskManager.addFaultTask(fault);
    });
    
    this.checkSpecialEvents();
    
    this.updateMissions();
  }

  checkSpecialEvents() {
    const env = this.environment.getState();
    
    if (env.isStorm && !this.lastStormState) {
      const mission = this.missionLibrary.generateSpecialMission('storm', {
        isEmergency: env.weatherLevel >= 4
      });
      
      if (mission) {
        this.missionLibrary.addSpecialMission(mission);
        
        this.broadcast({
          type: 'special_mission',
          mission,
          message: '⚡ 暴风雨来临！触发特殊研究任务！'
        });
      }
    }
    
    this.lastStormState = env.isStorm;
  }

  updateMissions() {
    const gameState = {
      environment: this.environment.getState(),
      equipment: this.equipment.getEquipmentList(),
      completedRepairs: this.completedRepairs,
      gameTime: this.gameTime
    };
    
    const allMissions = [
      ...this.missionLibrary.dailyMissions,
      ...this.missionLibrary.specialMissions
    ];
    
    allMissions.forEach(mission => {
      if (mission.accepted && !mission.completed) {
        const isComplete = this.missionLibrary.checkMissionCompletion(mission, gameState);
        
        if (isComplete) {
          mission.completed = true;
          
          if (mission.reward) {
            this.players.addScoreToAll(mission.reward.score || 0);
          }
          
          this.broadcast({
            type: 'mission_complete',
            mission,
            reward: mission.reward
          });
        }
      }
    });
    
    this.missionLibrary.cleanCompletedMissions();
  }

  broadcastGameState() {
    const state = this.getCachedState();
    this.broadcast(state);
  }

  getCachedState() {
    const now = Date.now();
    if (this.cachedState && now - this.lastCacheTime < 500) {
      return this.cachedState;
    }
    
    this.cachedState = {
      type: 'game_state',
      gameTime: this.gameTime,
      environment: this.environment.getState(),
      equipment: this.equipment.getEquipmentList(),
      tasks: this.taskManager.getTasks(),
      players: this.players.getAllPlayers(),
      missions: this.missionLibrary.getAvailableMissions(),
      equipmentStats: this.equipment.getEquipmentStats()
    };
    
    this.lastCacheTime = now;
    return this.cachedState;
  }

  sendToPlayer(playerId, message) {
    const player = this.players.getPlayer(playerId);
    if (player && player.ws && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }
}

module.exports = GameServer;
