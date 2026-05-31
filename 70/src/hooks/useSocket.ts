import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import { ClientToServerEvents, ServerToClientEvents, GameState } from '../../shared/types';

interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  hostName: string;
}

export function useSocket() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  
  const { 
    setGameState, 
    setConnected, 
    setPlayerId,
    addNotification,
    setDiagnosisResult,
    setRepairProgress,
    selectDevice,
  } = useGameStore();

  const connect = useCallback((roomId: string, playerName: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }

    const socket = io('http://localhost:3002', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setConnected(true);
      socket.emit('join_room', { roomId, playerName });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
      setConnected(false);
      addNotification('连接服务器失败，请检查网络', 'error');
    });

    socket.on('join_room_success', (data: any) => {
      console.log('Join room success:', data);
      setPlayerId(data.player.id);
      addNotification(`成功加入房间 ${roomId}`, 'success');
    });

    socket.on('join_room_failed', (data: any) => {
      console.error('Join room failed:', data);
      addNotification(data.message || '加入房间失败', 'error');
    });

    socket.on('game_state_update', (state: GameState) => {
      setGameState(state);
    });

    socket.on('player_joined', (player) => {
      addNotification(`${player.name} 加入了游戏`, 'info');
    });

    socket.on('player_left', (playerId) => {
      addNotification('有玩家离开了游戏', 'info');
    });

    socket.on('device_fault', (data) => {
      addNotification(`设备发生故障: ${data.fault}`, 'warning');
    });

    socket.on('weather_change', (data) => {
      addNotification(`天气变化: ${data.weather}`, 'info');
    });

    socket.on('diagnosis_result', (data) => {
      setDiagnosisResult(data.faults);
      addNotification(`诊断完成，发现 ${data.faults.length} 个故障`, 'info');
    });

    socket.on('repair_progress', (data) => {
      setRepairProgress(data.deviceId, data.progress);
    });

    socket.on('repair_complete', (data) => {
      if (data.success) {
        addNotification('修复成功！', 'success');
        setDiagnosisResult(null);
        selectDevice(null);
      } else {
        addNotification('修复失败，请重试', 'error');
      }
    });

    socket.on('score_update', (data) => {
      addNotification(`积分更新: ${data.score}`, 'success');
    });

    socket.on('task_assigned', (task) => {
      addNotification(`新任务: ${task.description}`, 'info');
    });

    socket.on('chat_message', (data) => {
      addNotification(`${data.playerName}: ${data.message}`, 'info');
    });

    socket.on('room_list', (roomList: any) => {
      console.log('Received room list:', roomList);
      setRooms(roomList);
    });

    socket.on('room_list_update', (roomList: any) => {
      console.log('Room list updated:', roomList);
      setRooms(roomList);
    });

    socket.on('room_created', (data: any) => {
      console.log('Room created:', data);
      addNotification('房间创建成功', 'success');
    });

    socket.on('create_room_failed', (data: any) => {
      console.error('Create room failed:', data);
      addNotification(data.message || '创建房间失败', 'error');
    });

    return socket;
  }, [setGameState, setConnected, setPlayerId, addNotification, setDiagnosisResult, setRepairProgress, selectDevice]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
      setIsConnected(false);
    }
  }, [setConnected]);

  const emit = useCallback(<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) => {
    if (socketRef.current?.connected) {
      (socketRef.current.emit as any)(event, ...args);
    } else {
      console.warn('Socket not connected, cannot emit:', event);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return { connect, disconnect, emit, isConnected, rooms };
}
