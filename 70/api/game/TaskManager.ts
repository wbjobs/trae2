import { Task, Device, Player, TaskType, DEVICE_CONFIG, FAULT_CONFIG, MAINTENANCE_TASK_LIBRARY, MaintenanceTask } from '../../shared/types';

export class TaskManager {
  private tasks: Task[] = [];
  private maxActiveTasks: number = 8;
  private taskIdCounter: number = 0;
  private lastTaskGeneration: number = 0;
  private taskGenerationInterval: number = 12000;
  private maintenanceTaskPool: MaintenanceTask[] = [];

  constructor() {
    this.refreshMaintenanceTaskPool();
  }

  private refreshMaintenanceTaskPool(): void {
    this.maintenanceTaskPool = [...MAINTENANCE_TASK_LIBRARY];
    for (let i = this.maintenanceTaskPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.maintenanceTaskPool[i], this.maintenanceTaskPool[j]] = [this.maintenanceTaskPool[j], this.maintenanceTaskPool[i]];
    }
  }

  tick(
    currentTime: number,
    devices: Device[],
    players: Player[]
  ): { tasks: Task[]; newTasks: Task[] } {
    const newTasks: Task[] = [];

    this.tasks = this.tasks.filter(task => {
      if (task.completed && currentTime - task.createdAt > 60000) {
        return false;
      }
      if (!task.assignedPlayerId && currentTime - task.createdAt > 120000) {
        return false;
      }
      return true;
    });

    const activeTaskCount = this.tasks.filter(t => !t.completed && !t.assignedPlayerId).length;

    if (currentTime - this.lastTaskGeneration > this.taskGenerationInterval && 
        activeTaskCount < this.maxActiveTasks) {
      
      const taskType = this.pickTaskType(devices);
      let newTask: Task | null = null;

      if (taskType === 'repair') {
        const faultyDevices = devices.filter(d => d.faults.length > 0 && d.status !== 'repairing');
        if (faultyDevices.length > 0) {
          const targetDevice = faultyDevices[Math.floor(Math.random() * faultyDevices.length)];
          newTask = this.createRepairTask(targetDevice, currentTime);
        }
      } else {
        const eligibleDevices = devices.filter(d => d.status !== 'repairing');
        if (eligibleDevices.length > 0) {
          const targetDevice = eligibleDevices[Math.floor(Math.random() * eligibleDevices.length)];
          newTask = this.createMaintenanceTask(targetDevice, currentTime, taskType);
        }
      }

      if (newTask) {
        this.tasks.push(newTask);
        newTasks.push(newTask);
        this.lastTaskGeneration = currentTime;
      }
    }

    return { tasks: [...this.tasks], newTasks };
  }

  private pickTaskType(devices: Device[]): TaskType {
    const faultyCount = devices.filter(d => d.faults.length > 0).length;
    const lowDurabilityCount = devices.filter(d => d.durability < 50).length;

    const weights: { type: TaskType; weight: number }[] = [
      { type: 'repair', weight: faultyCount > 0 ? 40 : 10 },
      { type: 'inspect', weight: 20 },
      { type: 'calibrate', weight: 15 },
      { type: 'maintenance', weight: lowDurabilityCount > 0 ? 25 : 15 },
      { type: 'replace', weight: lowDurabilityCount > 2 ? 15 : 5 },
    ];

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { type, weight } of weights) {
      random -= weight;
      if (random <= 0) {
        return type;
      }
    }

    return 'maintenance';
  }

  createRepairTask(device: Device, currentTime: number): Task {
    const mainFault = device.faults[0];
    const faultConfig = FAULT_CONFIG[mainFault];
    const deviceConfig = DEVICE_CONFIG[device.type];
    
    this.taskIdCounter++;
    
    const priority = faultConfig.repairDifficulty >= 3 ? 'high' : 
                     faultConfig.repairDifficulty >= 2 ? 'medium' : 'low';

    return {
      id: `task_${this.taskIdCounter}`,
      type: 'repair',
      targetDeviceId: device.id,
      description: `修复${deviceConfig.name}的${faultConfig.name}`,
      reward: 50 + faultConfig.repairDifficulty * 25,
      progress: 0,
      assignedPlayerId: null,
      completed: false,
      createdAt: currentTime,
      priority,
    };
  }

  createMaintenanceTask(device: Device, currentTime: number, taskType: TaskType): Task | null {
    const candidates = this.maintenanceTaskPool.filter(t => t.type === taskType);
    
    if (candidates.length === 0) {
      this.refreshMaintenanceTaskPool();
      return null;
    }

    const template = candidates[Math.floor(Math.random() * candidates.length)];
    const deviceConfig = DEVICE_CONFIG[device.type];
    
    this.taskIdCounter++;

    const priority = template.priority;
    const rewardMultiplier = device.durability < 30 ? 1.5 : device.durability < 60 ? 1.2 : 1;

    return {
      id: `task_${this.taskIdCounter}`,
      type: taskType,
      targetDeviceId: device.id,
      description: `${template.title} - ${deviceConfig.name}`,
      reward: Math.floor(template.baseReward * rewardMultiplier),
      progress: 0,
      assignedPlayerId: null,
      completed: false,
      createdAt: currentTime,
      priority,
    };
  }

  acceptTask(taskId: string, playerId: string): Task | null {
    const task = this.tasks.find(t => t.id === taskId);
    if (task && !task.assignedPlayerId && !task.completed) {
      task.assignedPlayerId = playerId;
      return { ...task };
    }
    return null;
  }

  updateTaskProgress(taskId: string, progress: number): Task | null {
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      this.tasks[taskIndex].progress = Math.min(100, progress);
      return { ...this.tasks[taskIndex] };
    }
    return null;
  }

  completeTask(taskId: string): Task | null {
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      this.tasks[taskIndex].completed = true;
      this.tasks[taskIndex].progress = 100;
      return { ...this.tasks[taskIndex] };
    }
    return null;
  }

  releaseTask(taskId: string): Task | null {
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      this.tasks[taskIndex].assignedPlayerId = null;
      this.tasks[taskIndex].progress = 0;
      return { ...this.tasks[taskIndex] };
    }
    return null;
  }

  getTasks(): Task[] {
    return [...this.tasks];
  }

  getPlayerTasks(playerId: string): Task[] {
    return this.tasks.filter(t => t.assignedPlayerId === playerId);
  }

  getAvailableTasks(): Task[] {
    return this.tasks.filter(t => !t.assignedPlayerId && !t.completed);
  }

  getTasksByDevice(deviceId: string): Task[] {
    return this.tasks.filter(t => t.targetDeviceId === deviceId);
  }
}
