class TaskManager {
  constructor() {
    this.tasks = [];
    this.completedTasks = [];
    this.taskIdCounter = 0;
    this.totalScore = 0;
  }

  initTasks(equipmentList) {
    this.addTask({
      type: 'routine_check',
      name: '日常巡检',
      description: '检查所有设备运行状态',
      priority: 'low',
      equipmentIds: equipmentList.map(e => e.id)
    });

    this.addTask({
      type: 'maintenance',
      name: '定期维护',
      description: '对设备进行常规维护',
      priority: 'medium',
      targetTime: 300
    });
  }

  addTask(taskData) {
    const task = {
      id: ++this.taskIdCounter,
      ...taskData,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      completedBy: null
    };
    this.tasks.push(task);
    return task;
  }

  addFaultTask(fault) {
    const existingTask = this.tasks.find(t => 
      t.type === 'repair' && 
      t.equipmentId === fault.equipmentId && 
      t.faultType === fault.type
    );
    
    if (existingTask) return;

    this.addTask({
      type: 'repair',
      name: `修复 ${fault.equipmentName} - ${fault.name}`,
      description: `修复设备 ${fault.equipmentName} 的 ${fault.name} 故障`,
      priority: 'high',
      equipmentId: fault.equipmentId,
      equipmentName: fault.equipmentName,
      faultType: fault.type,
      faultName: fault.name
    });
  }

  completeRepairTask(equipmentId, faultType, playerId) {
    const taskIndex = this.tasks.findIndex(t => 
      t.type === 'repair' && 
      t.equipmentId === equipmentId && 
      t.faultType === faultType &&
      t.status === 'pending'
    );

    if (taskIndex !== -1) {
      const task = this.tasks[taskIndex];
      task.status = 'completed';
      task.completedAt = Date.now();
      task.completedBy = playerId;
      
      this.completedTasks.push(task);
      this.tasks.splice(taskIndex, 1);
      
      this.totalScore += 100;
      
      return task;
    }
    return null;
  }

  completeTask(taskId, playerId) {
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex !== -1) {
      const task = this.tasks[taskIndex];
      task.status = 'completed';
      task.completedAt = Date.now();
      task.completedBy = playerId;
      
      this.completedTasks.push(task);
      this.tasks.splice(taskIndex, 1);
      
      return task;
    }
    return null;
  }

  getTasks() {
    return {
      active: this.tasks,
      completed: this.completedTasks.slice(-20),
      totalScore: this.totalScore,
      stats: {
        total: this.tasks.length + this.completedTasks.length,
        pending: this.tasks.length,
        completed: this.completedTasks.length
      }
    };
  }

  getPendingRepairs() {
    return this.tasks.filter(t => t.type === 'repair');
  }

  getTaskStats() {
    return {
      totalTasks: this.tasks.length + this.completedTasks.length,
      pendingTasks: this.tasks.length,
      completedTasks: this.completedTasks.length,
      totalScore: this.totalScore,
      highPriorityTasks: this.tasks.filter(t => t.priority === 'high').length,
      repairTasks: this.tasks.filter(t => t.type === 'repair').length
    };
  }
}

module.exports = TaskManager;
