class PlayerManager {
  constructor() {
    this.players = new Map();
    this.playerIdCounter = 0;
  }

  addPlayer(ws) {
    const playerId = `player_${++this.playerIdCounter}`;
    
    const player = {
      id: playerId,
      ws,
      name: `运维工程师${this.playerIdCounter}`,
      score: 0,
      joinedAt: Date.now(),
      currentTask: null,
      repairsCompleted: 0,
      status: 'online'
    };
    
    this.players.set(playerId, player);
    return playerId;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.status = 'offline';
      this.players.delete(playerId);
      return true;
    }
    return false;
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getAllPlayers() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      joinedAt: p.joinedAt,
      repairsCompleted: p.repairsCompleted,
      status: p.status
    }));
  }

  addScore(playerId, points) {
    const player = this.players.get(playerId);
    if (player) {
      player.score += points;
      return player.score;
    }
    return 0;
  }

  completeRepair(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.repairsCompleted++;
      return player.repairsCompleted;
    }
    return 0;
  }

  setCurrentTask(playerId, taskId) {
    const player = this.players.get(playerId);
    if (player) {
      player.currentTask = taskId;
      return true;
    }
    return false;
  }

  getLeaderboard() {
    return Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        repairsCompleted: p.repairsCompleted
      }));
  }

  getPlayerCount() {
    return this.players.size;
  }

  addScoreToAll(points) {
    this.players.forEach(player => {
      player.score += points;
    });
  }
}

module.exports = PlayerManager;
