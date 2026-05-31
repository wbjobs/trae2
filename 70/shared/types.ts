export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'frosty';

export type DeviceType = 'anemometer' | 'wind_vane' | 'thermometer' | 'hygrometer' | 'barometer' | 'rain_gauge';

export type FaultType = 'sensor_drift' | 'connection_loss' | 'power_failure' | 'mechanical_jam' | 'icing' | 'water_damage';

export type DeviceStatus = 'normal' | 'warning' | 'fault' | 'repairing';

export type TaskType = 'repair' | 'inspect' | 'calibrate' | 'maintenance' | 'replace';

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  status: DeviceStatus;
  health: number;
  durability: number;
  lastMaintenanceTime: number;
  value: number;
  position: [number, number, number];
  faults: FaultType[];
  lastUpdate: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  currentTask: string | null;
  connected: boolean;
}

export interface Task {
  id: string;
  type: TaskType;
  targetDeviceId: string;
  description: string;
  reward: number;
  progress: number;
  assignedPlayerId: string | null;
  completed: boolean;
  createdAt: number;
  priority: 'low' | 'medium' | 'high';
}

export interface MaintenanceTask {
  type: TaskType;
  title: string;
  description: string;
  baseReward: number;
  duration: number;
  priority: 'low' | 'medium' | 'high';
  requiredDurability?: number;
}

export interface GameState {
  weather: WeatherType;
  weatherIntensity: number;
  timeOfDay: number;
  devices: Device[];
  players: Player[];
  tasks: Task[];
  gameTime: number;
  isRunning: boolean;
}

export interface GameConfig {
  tickRate: number;
  weatherChangeProbability: number;
  faultBaseProbability: number;
  weatherFaultMultiplier: Record<WeatherType, number>;
}

export const WEATHER_CONFIG: Record<WeatherType, {
  name: string;
  color: string;
  ambientIntensity: number;
  fogDensity: number;
  faultMultiplier: number;
  healthDecayRate: number;
}> = {
  sunny: { name: '晴朗', color: '#87CEEB', ambientIntensity: 1.0, fogDensity: 0.02, faultMultiplier: 0.5, healthDecayRate: 0.1 },
  cloudy: { name: '多云', color: '#708090', ambientIntensity: 0.7, fogDensity: 0.03, faultMultiplier: 0.8, healthDecayRate: 0.2 },
  rainy: { name: '雨天', color: '#4A5568', ambientIntensity: 0.5, fogDensity: 0.04, faultMultiplier: 1.5, healthDecayRate: 0.5 },
  stormy: { name: '暴风雨', color: '#2D3748', ambientIntensity: 0.3, fogDensity: 0.05, faultMultiplier: 2.5, healthDecayRate: 1.0 },
  snowy: { name: '下雪', color: '#E2E8F0', ambientIntensity: 0.6, fogDensity: 0.06, faultMultiplier: 1.8, healthDecayRate: 0.7 },
  frosty: { name: '霜冻', color: '#A0AEC0', ambientIntensity: 0.65, fogDensity: 0.04, faultMultiplier: 2.0, healthDecayRate: 0.8 },
};

export const DEVICE_CONFIG: Record<DeviceType, {
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  affectedBy: WeatherType[];
}> = {
  anemometer: { name: '风速计', unit: 'm/s', minValue: 0, maxValue: 50, affectedBy: ['stormy', 'rainy', 'snowy'] },
  wind_vane: { name: '风向标', unit: '°', minValue: 0, maxValue: 360, affectedBy: ['stormy', 'frosty'] },
  thermometer: { name: '温度计', unit: '°C', minValue: -40, maxValue: 50, affectedBy: ['sunny', 'snowy', 'frosty'] },
  hygrometer: { name: '湿度计', unit: '%', minValue: 0, maxValue: 100, affectedBy: ['rainy', 'frosty'] },
  barometer: { name: '气压计', unit: 'hPa', minValue: 900, maxValue: 1100, affectedBy: ['stormy', 'cloudy'] },
  rain_gauge: { name: '雨量计', unit: 'mm', minValue: 0, maxValue: 200, affectedBy: ['rainy', 'stormy', 'snowy'] },
};

export const FAULT_CONFIG: Record<FaultType, {
  name: string;
  description: string;
  repairTime: number;
  repairDifficulty: number;
  causedBy: WeatherType[];
  durabilityDamage: number;
}> = {
  sensor_drift: { name: '传感器漂移', description: '传感器读数出现偏差，需要重新校准', repairTime: 5000, repairDifficulty: 1, causedBy: ['sunny', 'cloudy'], durabilityDamage: 5 },
  connection_loss: { name: '连接中断', description: '设备通信连接断开，需要检查线路', repairTime: 8000, repairDifficulty: 2, causedBy: ['stormy', 'rainy'], durabilityDamage: 8 },
  power_failure: { name: '电源故障', description: '设备供电异常，需要检查电源系统', repairTime: 10000, repairDifficulty: 2, causedBy: ['stormy', 'snowy'], durabilityDamage: 10 },
  mechanical_jam: { name: '机械卡滞', description: '机械部件运转受阻，需要清理润滑', repairTime: 12000, repairDifficulty: 3, causedBy: ['frosty', 'snowy'], durabilityDamage: 12 },
  icing: { name: '结冰故障', description: '设备表面结冰影响运转，需要除冰', repairTime: 15000, repairDifficulty: 3, causedBy: ['snowy', 'frosty'], durabilityDamage: 15 },
  water_damage: { name: '进水损坏', description: '雨水渗入设备内部，需要干燥处理', repairTime: 20000, repairDifficulty: 4, causedBy: ['rainy', 'stormy'], durabilityDamage: 20 },
};

export const MAINTENANCE_TASK_LIBRARY: MaintenanceTask[] = [
  { type: 'inspect', title: '设备巡检', description: '检查设备外观和运行状态', baseReward: 20, duration: 5000, priority: 'low' },
  { type: 'calibrate', title: '传感器校准', description: '校准传感器读数精度', baseReward: 35, duration: 8000, priority: 'medium' },
  { type: 'maintenance', title: '定期维护', description: '清洁和润滑设备部件', baseReward: 30, duration: 6000, priority: 'low' },
  { type: 'maintenance', title: '线路检查', description: '检查通信和供电线路', baseReward: 40, duration: 7000, priority: 'medium' },
  { type: 'maintenance', title: '防尘清理', description: '清理设备防尘罩和滤网', baseReward: 25, duration: 4000, priority: 'low' },
  { type: 'replace', title: '部件更换', description: '更换老化或损坏的部件', baseReward: 60, duration: 12000, priority: 'high', requiredDurability: 40 },
  { type: 'maintenance', title: '固件更新', description: '更新设备固件到最新版本', baseReward: 45, duration: 10000, priority: 'medium' },
  { type: 'inspect', title: '数据验证', description: '验证设备数据采集准确性', baseReward: 30, duration: 5000, priority: 'low' },
  { type: 'calibrate', title: '零点校准', description: '对传感器进行零点校准', baseReward: 40, duration: 7000, priority: 'medium' },
  { type: 'maintenance', title: '接地检查', description: '检查设备接地系统', baseReward: 35, duration: 6000, priority: 'low' },
];

export const PERFORMANCE_CONFIG = {
  high: {
    particleCount: 3000,
    shadowQuality: 'high' as const,
    postProcessing: true,
    targetFps: 60,
    particleDetail: 1.0,
  },
  medium: {
    particleCount: 1500,
    shadowQuality: 'medium' as const,
    postProcessing: false,
    targetFps: 45,
    particleDetail: 0.7,
  },
  low: {
    particleCount: 500,
    shadowQuality: 'low' as const,
    postProcessing: false,
    targetFps: 30,
    particleDetail: 0.4,
  },
};

export type PerformanceLevel = keyof typeof PERFORMANCE_CONFIG;

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  hostName: string;
}

export interface ClientToServerEvents {
  join_room: (data: { roomId: string; playerName: string }) => void;
  leave_room: (data: { roomId: string; playerId: string }) => void;
  start_diagnosis: (data: { deviceId: string; playerId: string }) => void;
  perform_repair: (data: { deviceId: string; playerId: string; faultIndex: number }) => void;
  accept_task: (data: { taskId: string; playerId: string }) => void;
  complete_task: (data: { taskId: string; playerId: string }) => void;
  chat_message: (data: { playerId: string; message: string }) => void;
  get_room_list: () => void;
  create_room: (data: { roomId: string; roomName: string; playerName: string; maxPlayers: number; isPrivate: boolean }) => void;
}

export interface ServerToClientEvents {
  game_state_update: (state: GameState) => void;
  device_fault: (data: { deviceId: string; fault: FaultType }) => void;
  weather_change: (data: { weather: WeatherType; intensity: number }) => void;
  task_assigned: (task: Task) => void;
  player_joined: (player: Player) => void;
  player_left: (playerId: string) => void;
  score_update: (data: { playerId: string; score: number }) => void;
  chat_message: (data: { playerName: string; message: string; timestamp: number }) => void;
  diagnosis_result: (data: { deviceId: string; faults: FaultType[] }) => void;
  repair_progress: (data: { deviceId: string; progress: number }) => void;
  repair_complete: (data: { deviceId: string; success: boolean }) => void;
  room_list: (rooms: RoomInfo[]) => void;
  room_list_update: (rooms: RoomInfo[]) => void;
  room_created: (data: { roomId: string }) => void;
  create_room_failed: (data: { message: string }) => void;
  join_room_success: (data: { player: Player; roomId: string }) => void;
  join_room_failed: (data: { message: string }) => void;
}
