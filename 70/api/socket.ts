import { Server as HTTPServer, AddressInfo } from 'net';
import { Server, Socket } from 'socket.io';
import { GameEngine } from './game/GameEngine';
import { ClientToServerEvents, ServerToClientEvents, FaultType, Player } from '../shared/types';

interface Room {
  id: string;
  name: string;
  engine: GameEngine;
  players: Map<string, Socket>;
  hostId: string | null;
  createdAt: number;
  maxPlayers: number;
  isPrivate: boolean;
}

const rooms: Map<string, Room> = new Map();

export function setupSocketIO(server: any): void {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
  });

  setInterval(() => {
    const roomList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      hasPassword: room.isPrivate,
      hostName: room.hostId ? room.engine.getPlayer(room.hostId)?.name || '未知' : '无',
    }));
    io.emit('room_list_update', roomList as any);
  }, 2000);

  io.on('connection', (socket: Socket) => {
    console.log('Player connected:', socket.id, 'from', socket.handshake.address);

    socket.on('get_room_list', () => {
      const roomList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        hasPassword: room.isPrivate,
        hostName: room.hostId ? room.engine.getPlayer(room.hostId)?.name || '未知' : '无',
      }));
      socket.emit('room_list', roomList as any);
    });

    socket.on('create_room', (data) => {
      const roomId = data.roomId || `room_${Date.now()}`;
      
      if (rooms.has(roomId)) {
        socket.emit('create_room_failed', { message: '房间ID已存在' } as any);
        return;
      }

      const engine = new GameEngine();
      const room: Room = {
        id: roomId,
        name: data.roomName || `${data.playerName}的房间`,
        engine,
        players: new Map(),
        hostId: null,
        createdAt: Date.now(),
        maxPlayers: data.maxPlayers || 8,
        isPrivate: data.isPrivate || false,
      };

      engine.setOnStateChange((state) => {
        io.to(roomId).emit('game_state_update', state);
      });

      engine.setOnDeviceFault((deviceId: string, fault: FaultType) => {
        io.to(roomId).emit('device_fault', { deviceId, fault });
      });

      engine.setOnWeatherChange((weather, intensity) => {
        io.to(roomId).emit('weather_change', { weather, intensity });
      });

      engine.setOnNewTask((task) => {
        io.to(roomId).emit('task_assigned', task);
      });

      rooms.set(roomId, room);
      console.log('Room created:', roomId, 'by', data.playerName);
      socket.emit('room_created', { roomId } as any);
    });

    socket.on('join_room', (data) => {
      let room = rooms.get(data.roomId);

      if (!room) {
        const engine = new GameEngine();
        room = {
          id: data.roomId,
          name: data.roomId,
          engine,
          players: new Map(),
          hostId: null,
          createdAt: Date.now(),
          maxPlayers: 8,
          isPrivate: false,
        };

        engine.setOnStateChange((state) => {
          io.to(data.roomId).emit('game_state_update', state);
        });

        engine.setOnDeviceFault((deviceId: string, fault: FaultType) => {
          io.to(data.roomId).emit('device_fault', { deviceId, fault });
        });

        engine.setOnWeatherChange((weather, intensity) => {
          io.to(data.roomId).emit('weather_change', { weather, intensity });
        });

        engine.setOnNewTask((task) => {
          io.to(data.roomId).emit('task_assigned', task);
        });

        rooms.set(data.roomId, room);
        console.log('Room auto-created:', data.roomId);
      }

      if (room.players.size >= room.maxPlayers) {
        socket.emit('join_room_failed', { message: '房间已满' } as any);
        return;
      }

      const player = room.engine.addPlayer(data.playerName);
      
      if (room.players.size === 0) {
        room.hostId = player.id;
      }

      socket.join(data.roomId);
      socket.data.playerId = player.id;
      socket.data.roomId = data.roomId;
      room.players.set(player.id, socket);

      io.to(data.roomId).emit('player_joined', player);
      socket.emit('join_room_success', { player, roomId: data.roomId } as any);
      socket.emit('game_state_update', room.engine.getState());

      const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
        hasPassword: r.isPrivate,
        hostName: r.hostId ? r.engine.getPlayer(r.hostId)?.name || '未知' : '无',
      }));
      io.emit('room_list_update', roomList as any);

      console.log('Player joined:', data.playerName, 'to room:', data.roomId, 'total players:', room.players.size);

      if (!room.engine.getState().isRunning) {
        room.engine.start();
        console.log('Game engine started for room:', data.roomId);
      }
    });

    socket.on('leave_room', (data) => {
      const room = rooms.get(data.roomId);
      if (!room) return;

      room.engine.removePlayer(data.playerId);
      room.players.delete(data.playerId);
      socket.leave(data.roomId);

      if (room.hostId === data.playerId) {
        const remainingPlayers = Array.from(room.players.keys());
        room.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
      }

      io.to(data.roomId).emit('player_left', data.playerId);

      const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
        hasPassword: r.isPrivate,
        hostName: r.hostId ? r.engine.getPlayer(r.hostId)?.name || '未知' : '无',
      }));
      io.emit('room_list_update', roomList as any);

      console.log('Player left:', data.playerId, 'from room:', data.roomId, 'remaining:', room.players.size);

      if (room.players.size === 0) {
        setTimeout(() => {
          const checkRoom = rooms.get(data.roomId);
          if (checkRoom && checkRoom.players.size === 0) {
            checkRoom.engine.stop();
            rooms.delete(data.roomId);
            console.log('Room destroyed:', data.roomId);
            
            const updatedRoomList = Array.from(rooms.values()).map(r => ({
              id: r.id,
              name: r.name,
              playerCount: r.players.size,
              maxPlayers: r.maxPlayers,
              hasPassword: r.isPrivate,
              hostName: r.hostId ? r.engine.getPlayer(r.hostId)?.name || '未知' : '无',
            }));
            io.emit('room_list_update', updatedRoomList as any);
          }
        }, 10000);
      }
    });

    socket.on('start_diagnosis', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const faults = room.engine.startDiagnosis(data.deviceId, data.playerId);
      if (faults) {
        socket.emit('diagnosis_result', { deviceId: data.deviceId, faults });
      }
    });

    socket.on('perform_repair', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const repairStart = room.engine.startRepair(data.deviceId, data.playerId);
      
      if (repairStart) {
        let progress = 0;
        const repairInterval = setInterval(() => {
          progress += 10;
          socket.emit('repair_progress', { deviceId: data.deviceId, progress });

          if (progress >= 100) {
            clearInterval(repairInterval);
            const result = room.engine.performRepair(
              data.deviceId,
              data.playerId,
              data.faultIndex
            );
            socket.emit('repair_complete', { 
              deviceId: data.deviceId, 
              success: result.success 
            });

            const player = room.engine.getPlayer(data.playerId);
            if (player) {
              io.to(socket.data.roomId).emit('score_update', { playerId: player.id, score: player.score });
            }
          }
        }, 300);
      }
    });

    socket.on('accept_task', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const task = room.engine.acceptTask(data.taskId, data.playerId);
      if (task) {
        io.to(socket.data.roomId).emit('task_assigned', task);
      }
    });

    socket.on('complete_task', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const task = room.engine.completeTask(data.taskId, data.playerId);
      if (task) {
        const player = room.engine.getPlayer(data.playerId);
        if (player) {
          io.to(socket.data.roomId).emit('score_update', { playerId: player.id, score: player.score });
        }
      }
    });

    socket.on('perform_maintenance', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const success = room.engine.performMaintenance(
        data.deviceId,
        data.playerId,
        data.maintenanceType
      );

      if (success) {
        socket.emit('maintenance_complete', { 
          deviceId: data.deviceId, 
          success: true,
          type: data.maintenanceType
        });

        const player = room.engine.getPlayer(data.playerId);
        if (player) {
          io.to(socket.data.roomId).emit('score_update', { playerId: player.id, score: player.score });
        }
      }
    });

    socket.on('chat_message', (data) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;

      const player = room.engine.getPlayer(data.playerId);
      if (player) {
        io.to(socket.data.roomId).emit('chat_message', {
          playerName: player.name,
          message: data.message,
          timestamp: Date.now(),
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Player disconnected:', socket.id);
      if (socket.data.playerId && socket.data.roomId) {
        const room = rooms.get(socket.data.roomId);
        if (room) {
          room.engine.removePlayer(socket.data.playerId);
          room.players.delete(socket.data.playerId);
          
          if (room.hostId === socket.data.playerId) {
            const remainingPlayers = Array.from(room.players.keys());
            room.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
          }

          io.to(socket.data.roomId).emit('player_left', socket.data.playerId);
          
          const roomList = Array.from(rooms.values()).map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.size,
            maxPlayers: r.maxPlayers,
            hasPassword: r.isPrivate,
            hostName: r.hostId ? r.engine.getPlayer(r.hostId)?.name || '未知' : '无',
          }));
          io.emit('room_list_update', roomList as any);

          console.log('Player disconnected cleanup:', socket.data.playerId, 'from room:', socket.data.roomId);

          if (room.players.size === 0) {
            setTimeout(() => {
              const checkRoom = rooms.get(socket.data.roomId);
              if (checkRoom && checkRoom.players.size === 0) {
                checkRoom.engine.stop();
                rooms.delete(socket.data.roomId);
                console.log('Room destroyed on disconnect:', socket.data.roomId);
                
                const updatedRoomList = Array.from(rooms.values()).map(r => ({
                  id: r.id,
                  name: r.name,
                  playerCount: r.players.size,
                  maxPlayers: r.maxPlayers,
                  hasPassword: r.isPrivate,
                  hostName: r.hostId ? r.engine.getPlayer(r.hostId)?.name || '未知' : '无',
                }));
                io.emit('room_list_update', updatedRoomList as any);
              }
            }, 10000);
          }
        }
      }
    });
  });

  const addr = server.address() as AddressInfo;
  console.log('Socket.IO server ready on port', addr?.port || 'unknown');
  console.log('Room discovery service active');
}
