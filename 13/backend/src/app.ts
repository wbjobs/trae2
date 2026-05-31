import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { requestLogger, errorHandler, notFoundHandler } from './common/middleware/errorHandler';

import authRoutes from './modules/auth/routes';
import userRoutes from './modules/user/routes';
import departmentRoutes from './modules/department/routes';
import specimenRoutes from './modules/specimen/routes';
import annotationRoutes from './modules/annotation/routes';
import versionRoutes from './modules/version/routes';
import fileRoutes from './modules/file/routes';
import tagRoutes from './modules/tag/routes';
import logRoutes from './modules/log/routes';
import uploadRoutes from './modules/upload/routes';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: config.cors.methods
  }
});

app.use(cors(config.cors));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/specimens', specimenRoutes);
app.use('/api/annotations', annotationRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/upload', uploadRoutes);

app.use('/api', notFoundHandler);
app.use(errorHandler);

interface SpecimenRoom {
  specimenId: string;
  users: Map<string, {
    userId: string;
    userName: string;
    socketId: string;
    joinedAt: Date;
    cursor?: { line: number; column: number };
  }>;
}

const specimenRooms = new Map<string, SpecimenRoom>();

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('join_specimen', (data: { specimenId: string; userId: string; userName: string }) => {
    const { specimenId, userId, userName } = data;

    if (!specimenRooms.has(specimenId)) {
      specimenRooms.set(specimenId, {
        specimenId,
        users: new Map()
      });
    }

    const room = specimenRooms.get(specimenId)!;
    room.users.set(socket.id, {
      userId,
      userName,
      socketId: socket.id,
      joinedAt: new Date()
    });

    socket.join(`specimen:${specimenId}`);

    const onlineUsers = Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      userName: u.userName,
      joinedAt: u.joinedAt
    }));

    io.to(`specimen:${specimenId}`).emit('user_joined', {
      specimenId,
      user: { userId, userName },
      onlineUsers
    });

    console.log(`[Socket.IO] User ${userName} joined specimen: ${specimenId}`);
  });

  socket.on('leave_specimen', (data: { specimenId: string; userId: string; userName: string }) => {
    const { specimenId, userId, userName } = data;
    const room = specimenRooms.get(specimenId);

    if (room) {
      room.users.delete(socket.id);
      socket.leave(`specimen:${specimenId}`);

      const onlineUsers = Array.from(room.users.values()).map(u => ({
        userId: u.userId,
        userName: u.userName,
        joinedAt: u.joinedAt
      }));

      io.to(`specimen:${specimenId}`).emit('user_left', {
        specimenId,
        user: { userId, userName },
        onlineUsers
      });

      if (room.users.size === 0) {
        specimenRooms.delete(specimenId);
      }
    }

    console.log(`[Socket.IO] User ${userName} left specimen: ${specimenId}`);
  });

  socket.on('cursor_update', (data: { specimenId: string; userId: string; userName: string; cursor: { line: number; column: number } }) => {
    const { specimenId, userId, userName, cursor } = data;
    const room = specimenRooms.get(specimenId);

    if (room) {
      const user = room.users.get(socket.id);
      if (user) {
        user.cursor = cursor;
      }

      socket.to(`specimen:${specimenId}`).emit('cursor_updated', {
        specimenId,
        userId,
        userName,
        cursor
      });
    }
  });

  socket.on('edit_start', (data: { specimenId: string; userId: string; userName: string }) => {
    const { specimenId, userId, userName } = data;
    socket.to(`specimen:${specimenId}`).emit('edit_started', {
      specimenId,
      userId,
      userName,
      startedAt: new Date()
    });
  });

  socket.on('edit_end', (data: { specimenId: string; userId: string; userName: string }) => {
    const { specimenId, userId, userName } = data;
    socket.to(`specimen:${specimenId}`).emit('edit_ended', {
      specimenId,
      userId,
      userName,
      endedAt: new Date()
    });
  });

  socket.on('annotation_created', (data: { specimenId: string; annotationId: string }) => {
    socket.to(`specimen:${data.specimenId}`).emit('new_annotation', {
      specimenId: data.specimenId,
      annotationId: data.annotationId
    });
  });

  socket.on('specimen_updated', (data: { specimenId: string; version: number }) => {
    socket.to(`specimen:${data.specimenId}`).emit('specimen_changed', {
      specimenId: data.specimenId,
      version: data.version,
      updatedAt: new Date()
    });
  });

  socket.on('disconnect', () => {
    for (const [specimenId, room] of specimenRooms) {
      const user = room.users.get(socket.id);
      if (user) {
        room.users.delete(socket.id);
        socket.leave(`specimen:${specimenId}`);

        const onlineUsers = Array.from(room.users.values()).map(u => ({
          userId: u.userId,
          userName: u.userName,
          joinedAt: u.joinedAt
        }));

        io.to(`specimen:${specimenId}`).emit('user_left', {
          specimenId,
          user: { userId: user.userId, userName: user.userName },
          onlineUsers
        });

        if (room.users.size === 0) {
          specimenRooms.delete(specimenId);
        }
      }
    }
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

export { app, server, io };
