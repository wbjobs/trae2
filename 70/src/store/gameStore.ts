import { create } from 'zustand';
import { GameState, Player, Device, Task, WeatherType, FaultType, WEATHER_CONFIG } from '../../shared/types';

interface GameStore {
  gameState: GameState | null;
  playerId: string | null;
  playerName: string;
  roomId: string;
  isConnected: boolean;
  selectedDevice: Device | null;
  diagnosisResult: FaultType[] | null;
  repairProgress: Record<string, number>;
  notifications: Array<{ id: string; message: string; type: 'info' | 'warning' | 'success' | 'error' }>;
  
  setGameState: (state: GameState) => void;
  setPlayerId: (id: string) => void;
  setPlayerName: (name: string) => void;
  setRoomId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  selectDevice: (device: Device | null) => void;
  setDiagnosisResult: (faults: FaultType[] | null) => void;
  setRepairProgress: (deviceId: string, progress: number) => void;
  addNotification: (message: string, type: 'info' | 'warning' | 'success' | 'error') => void;
  removeNotification: (id: string) => void;
  resetGame: () => void;
}

const initialGameState: GameState = {
  weather: 'sunny',
  weatherIntensity: 0.5,
  timeOfDay: 0.5,
  devices: [],
  players: [],
  tasks: [],
  gameTime: 0,
  isRunning: false,
};

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  playerId: null,
  playerName: '',
  roomId: 'default_room',
  isConnected: false,
  selectedDevice: null,
  diagnosisResult: null,
  repairProgress: {},
  notifications: [],

  setGameState: (state) => set({ gameState: state }),
  setPlayerId: (id) => set({ playerId: id }),
  setPlayerName: (name) => set({ playerName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  selectDevice: (device) => set({ selectedDevice: device }),
  setDiagnosisResult: (faults) => set({ diagnosisResult: faults }),
  setRepairProgress: (deviceId, progress) => 
    set((state) => ({
      repairProgress: { ...state.repairProgress, [deviceId]: progress },
    })),
  addNotification: (message, type) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { id: Date.now().toString(), message, type },
      ],
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  resetGame: () =>
    set({
      gameState: initialGameState,
      playerId: null,
      selectedDevice: null,
      diagnosisResult: null,
      repairProgress: {},
      isConnected: false,
    }),
}));
