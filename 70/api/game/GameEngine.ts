import { GameState, Player, Device, WeatherType, DeviceType, FaultType, DEVICE_CONFIG } from '../../shared/types';
import { WeatherSimulator } from './WeatherSimulator';
import { FaultDetector } from './FaultDetector';
import { TaskManager } from './TaskManager';

export class GameEngine {
  private state: GameState;
  private weatherSimulator: WeatherSimulator;
  private faultDetector: FaultDetector;
  private taskManager: TaskManager;
  private lastTickTime: number;
  private isRunning: boolean;
  private tickInterval: NodeJS.Timeout | null = null;
  private tickRate: number = 1000;
  private stateThrottleRate: number = 100;
  private lastStateUpdate: number = 0;
  private cachedState: GameState | null = null;
  private onStateChange: ((state: GameState) => void) | null = null;
  private onDeviceFault: ((deviceId: string, fault: FaultType) => void) | null = null;
  private onWeatherChange: ((weather: WeatherType, intensity: number) => void) | null = null;
  private onNewTask: ((task: any) => void) | null = null;
  private optimizationLevel: 'high' | 'medium' | 'low' = 'medium';

  constructor() {
    this.weatherSimulator = new WeatherSimulator('sunny');
    this.faultDetector = new FaultDetector();
    this.taskManager = new TaskManager();
    this.lastTickTime = Date.now();
    this.isRunning = false;

    this.state = {
      weather: 'sunny',
      weatherIntensity: 0.5,
      timeOfDay: 0.5,
      devices: this.initializeDevices(),
      players: [],
      tasks: [],
      gameTime: 0,
      isRunning: false,
    };
  }

  private initializeDevices(): Device[] {
    const deviceTypes: DeviceType[] = ['anemometer', 'wind_vane', 'thermometer', 'hygrometer', 'barometer', 'rain_gauge'];
    const positions: [number, number, number][] = [
      [0, 3, 0],
      [3, 2.5, 2],
      [-3, 2, -2],
      [2, 2, -3],
      [-2, 2.8, 3],
      [0, 1.5, 4],
    ];

    const now = Date.now();
    return deviceTypes.map((type, index) => ({
      id: `device_${index + 1}`,
      type,
      name: DEVICE_CONFIG[type].name,
      status: 'normal' as const,
      health: 100,
      durability: 100,
      lastMaintenanceTime: now,
      value: (DEVICE_CONFIG[type].minValue + DEVICE_CONFIG[type].maxValue) / 2,
      position: positions[index],
      faults: [],
      lastUpdate: now,
    }));
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.state.isRunning = true;
    this.lastTickTime = Date.now();

    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.tickRate);
  }

  stop(): void {
    this.isRunning = false;
    this.state.isRunning = false;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private tick(): void {
    const currentTime = Date.now();
    const deltaTime = currentTime - this.lastTickTime;
    this.lastTickTime = currentTime;
    this.state.gameTime += deltaTime;

    const weatherResult = this.weatherSimulator.tick(currentTime, deltaTime);
    this.state.weather = weatherResult.weather;
    this.state.weatherIntensity = weatherResult.intensity;

    if (weatherResult.changed && this.onWeatherChange) {
      this.onWeatherChange(weatherResult.weather, weatherResult.intensity);
    }

    this.processDevices(currentTime, deltaTime, weatherResult.weather, weatherResult.intensity);

    const taskResult = this.taskManager.tick(currentTime, this.state.devices, this.state.players);
    this.state.tasks = taskResult.tasks;

    taskResult.newTasks.forEach(task => {
      if (this.onNewTask) {
        this.onNewTask(task);
      }
    });

    this.state.timeOfDay = (this.state.gameTime / 120000) % 1;

    if (currentTime - this.lastStateUpdate > this.stateThrottleRate) {
      this.lastStateUpdate = currentTime;
      this.cachedState = { ...this.state };
      
      if (this.onStateChange) {
        this.onStateChange(this.cachedState);
      }
    }
  }

  private processDevices(
    currentTime: number,
    deltaTime: number,
    weather: WeatherType,
    intensity: number
  ): void {
    const processBatch = this.optimizationLevel === 'low' ? 2 : 1;
    
    for (let i = 0; i < this.state.devices.length; i++) {
      if (i % processBatch !== 0 && this.optimizationLevel === 'low') continue;
      
      const device = this.state.devices[i];
      const result = this.faultDetector.detectFaults(
        device,
        weather,
        intensity,
        deltaTime
      );

      let newHealth = Math.max(0, Math.min(100, device.health + result.healthChange));
      let newDurability = Math.max(0, Math.min(100, device.durability + (result.durabilityChange || 0)));
      let newFaults = [...device.faults, ...result.newFaults];
      let newValue = this.faultDetector.generateDeviceValue(
        { ...device, faults: newFaults, durability: newDurability },
        weather,
        intensity
      );
      let newStatus = this.faultDetector.calculateDeviceStatus(newHealth, newDurability, newFaults.length);

      if (device.status !== 'repairing') {
        result.newFaults.forEach(fault => {
          if (this.onDeviceFault) {
            this.onDeviceFault(device.id, fault);
          }
        });
      }

      this.state.devices[i] = {
        ...device,
        health: newHealth,
        durability: newDurability,
        faults: newFaults,
        value: newValue,
        status: device.status === 'repairing' ? 'repairing' : newStatus,
        lastUpdate: currentTime,
      };
    }
  }

  getState(): GameState {
    return this.cachedState || { ...this.state };
  }

  addPlayer(playerName: string): Player {
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isHost = this.state.players.length === 0;

    const player: Player = {
      id: playerId,
      name: playerName,
      score: 0,
      isHost,
      currentTask: null,
      connected: true,
    };

    this.state.players.push(player);
    return player;
  }

  removePlayer(playerId: string): void {
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    
    this.state.players.forEach(p => {
      if (p.currentTask) {
        this.taskManager.releaseTask(p.currentTask);
        p.currentTask = null;
      }
    });

    const device = this.state.devices.find(d => d.status === 'repairing');
    if (device) {
      device.status = this.faultDetector.calculateDeviceStatus(device.health, device.durability, device.faults.length);
    }
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players.find(p => p.id === playerId);
  }

  startDiagnosis(deviceId: string, playerId: string): FaultType[] | null {
    const device = this.state.devices.find(d => d.id === deviceId);
    if (!device) return null;

    return this.faultDetector.diagnoseDevice(device);
  }

  startRepair(deviceId: string, playerId: string): boolean {
    const deviceIndex = this.state.devices.findIndex(d => d.id === deviceId);
    if (deviceIndex < 0) return false;

    const device = this.state.devices[deviceIndex];
    if (device.faults.length === 0 || device.status === 'repairing') return false;

    this.state.devices[deviceIndex].status = 'repairing';
    return true;
  }

  performRepair(deviceId: string, playerId: string, faultIndex: number): { success: boolean; newHealth: number; newDurability: number } {
    const deviceIndex = this.state.devices.findIndex(d => d.id === deviceId);
    if (deviceIndex < 0) return { success: false, newHealth: 0, newDurability: 0 };

    const device = this.state.devices[deviceIndex];
    const repairedDevice = this.faultDetector.repairDevice(device, faultIndex);
    
    this.state.devices[deviceIndex] = repairedDevice;
    
    if (repairedDevice.faults.length === 0) {
      this.state.devices[deviceIndex].status = this.faultDetector.calculateDeviceStatus(
        repairedDevice.health,
        repairedDevice.durability,
        0
      );
    } else {
      this.state.devices[deviceIndex].status = 'repairing';
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.score += 30;
    }

    return { success: true, newHealth: repairedDevice.health, newDurability: repairedDevice.durability };
  }

  performMaintenance(deviceId: string, playerId: string, maintenanceType: string): boolean {
    const deviceIndex = this.state.devices.findIndex(d => d.id === deviceId);
    if (deviceIndex < 0) return false;

    const device = this.state.devices[deviceIndex];
    this.state.devices[deviceIndex] = this.faultDetector.performMaintenance(device, maintenanceType);

    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.score += 15;
    }

    return true;
  }

  acceptTask(taskId: string, playerId: string) {
    const task = this.taskManager.acceptTask(taskId, playerId);
    if (task) {
      const player = this.state.players.find(p => p.id === playerId);
      if (player) {
        player.currentTask = taskId;
      }
    }
    return task;
  }

  completeTask(taskId: string, playerId: string) {
    const task = this.taskManager.completeTask(taskId);
    if (task) {
      const player = this.state.players.find(p => p.id === playerId);
      if (player) {
        player.score += task.reward;
        player.currentTask = null;
      }
    }
    return task;
  }

  setOnStateChange(callback: (state: GameState) => void): void {
    this.onStateChange = callback;
  }

  setOnDeviceFault(callback: (deviceId: string, fault: FaultType) => void): void {
    this.onDeviceFault = callback;
  }

  setOnWeatherChange(callback: (weather: WeatherType, intensity: number) => void): void {
    this.onWeatherChange = callback;
  }

  setOnNewTask(callback: (task: any) => void): void {
    this.onNewTask = callback;
  }

  setWeather(weather: WeatherType): void {
    this.weatherSimulator.setWeather(weather);
    this.state.weather = weather;
  }

  setOptimizationLevel(level: 'high' | 'medium' | 'low'): void {
    this.optimizationLevel = level;
    this.stateThrottleRate = level === 'high' ? 50 : level === 'medium' ? 100 : 200;
  }

  getOptimizationLevel(): 'high' | 'medium' | 'low' {
    return this.optimizationLevel;
  }

  getPlayers(): Player[] {
    return [...this.state.players];
  }

  getDevices(): Device[] {
    return [...this.state.devices];
  }
}
