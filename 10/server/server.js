const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const Room = require('./models/Room');
const OperationLog = require('./models/OperationLog');
const VideoRenderer = require('./videoRenderer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/collab3d';
const PORT = process.env.PORT || 3000;

const peers = new Map();
const rooms = new Map();
const clientStates = new Map();
const videoRenderer = new VideoRenderer(path.join(__dirname, '../exports'));
const exportJobs = new Map();

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function getOrCreateRoom(roomId) {
  let room = await Room.findOne({ roomId });
  if (!room) {
    room = new Room({
      roomId,
      geometries: [],
      version: 0
    });
    await room.save();
  }
  return room;
}

async function saveOperation(roomId, opType, geometryId, userId, data, version) {
  const op = new OperationLog({
    roomId,
    opId: uuidv4(),
    type: opType,
    geometryId,
    userId,
    data,
    version,
    timestamp: Date.now()
  });
  await op.save();
  return op;
}

async function applyOperation(roomId, operation) {
  const room = await getOrCreateRoom(roomId);
  const { type, geometryId, data, userId } = operation;

  let geometryIndex = room.geometries.findIndex(g => g.id === geometryId);

  switch (type) {
    case 'ADD':
      if (geometryIndex === -1) {
        room.geometries.push({
          id: geometryId,
          type: data.type,
          position: data.position || { x: 0, y: 0, z: 0 },
          rotation: data.rotation || { x: 0, y: 0, z: 0 },
          scale: data.scale || { x: 1, y: 1, z: 1 },
          color: data.color || '#00ff00',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      break;

    case 'UPDATE':
      if (geometryIndex !== -1) {
        const geometry = room.geometries[geometryIndex];
        if (data.position) geometry.position = data.position;
        if (data.rotation) geometry.rotation = data.rotation;
        if (data.scale) geometry.scale = data.scale;
        if (data.color) geometry.color = data.color;
        geometry.updatedAt = Date.now();
      }
      break;

    case 'DELETE':
      if (geometryIndex !== -1) {
        room.geometries.splice(geometryIndex, 1);
      }
      break;
  }

  room.version += 1;
  await room.save();
  await saveOperation(roomId, type, geometryId, userId, data, room.version);

  return room;
}

async function getRoomStateSnapshot(roomId) {
  const room = await getOrCreateRoom(roomId);
  return {
    geometries: room.geometries,
    version: room.version
  };
}

async function getIncrementalOperations(roomId, sinceVersion) {
  const operations = await OperationLog.find({
    roomId,
    version: { $gt: parseInt(sinceVersion) }
  }).sort({ version: 1 });
  
  return operations.map(op => ({
    type: op.type,
    geometryId: op.geometryId,
    userId: op.userId,
    data: op.data,
    version: op.version,
    timestamp: op.timestamp,
    opId: op.opId
  }));
}

async function getOperationsByTimeRange(roomId, startTime, endTime) {
  const operations = await OperationLog.find({
    roomId,
    timestamp: { 
      $gte: parseInt(startTime), 
      $lte: parseInt(endTime) 
    }
  }).sort({ timestamp: 1 });
  
  return operations.map(op => ({
    type: op.type,
    geometryId: op.geometryId,
    userId: op.userId,
    data: op.data,
    version: op.version,
    timestamp: op.timestamp,
    opId: op.opId
  }));
}

async function getInitialStateAtTime(roomId, startTime) {
  const operationsBefore = await OperationLog.find({
    roomId,
    timestamp: { $lt: parseInt(startTime) }
  }).sort({ version: 1 });

  const state = new Map();
  
  for (const op of operationsBefore) {
    const { type, geometryId, data } = op;
    switch (type) {
      case 'ADD':
        state.set(geometryId, { ...data, id: geometryId });
        break;
      case 'UPDATE':
        if (state.has(geometryId)) {
          const existing = state.get(geometryId);
          if (data.position) existing.position = { ...data.position };
          if (data.rotation) existing.rotation = { ...data.rotation };
          if (data.scale) existing.scale = { ...data.scale };
          if (data.color) existing.color = data.color;
        }
        break;
      case 'DELETE':
        state.delete(geometryId);
        break;
    }
  }

  return Array.from(state.values());
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let currentClientKey = null;

  socket.on('join-room', async ({ roomId, userId, lastKnownVersion = 0, isReconnect = false }) => {
    console.log(`User ${userId} joining room ${roomId}, isReconnect: ${isReconnect}, lastKnownVersion: ${lastKnownVersion}`);

    const clientKey = `${roomId}:${userId}`;
    currentClientKey = clientKey;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);
    peers.set(socket.id, { roomId, userId, joinedAt: Date.now() });

    socket.join(roomId);

    const snapshot = await getRoomStateSnapshot(roomId);
    const incrementalOps = await getIncrementalOperations(roomId, lastKnownVersion);

    clientStates.set(clientKey, {
      lastSyncVersion: snapshot.version,
      lastSyncTime: Date.now(),
      socketId: socket.id
    });

    socket.emit('room-state', {
      isReconnect,
      snapshot: snapshot,
      incrementalOps: incrementalOps,
      lastKnownVersion: lastKnownVersion,
      operations: []
    });

    const peersInRoom = Array.from(rooms.get(roomId)).filter(id => id !== socket.id);
    socket.emit('existing-peers', { peers: peersInRoom });

    if (!isReconnect) {
      socket.to(roomId).emit('peer-joined', {
        peerId: socket.id,
        userId
      });
    }
  });

  socket.on('reconnect-sync', async ({ roomId, userId, lastKnownVersion }) => {
    console.log(`Reconnect sync request from ${userId}, lastKnownVersion: ${lastKnownVersion}`);

    const snapshot = await getRoomStateSnapshot(roomId);
    const incrementalOps = await getIncrementalOperations(roomId, lastKnownVersion);

    const clientKey = `${roomId}:${userId}`;
    clientStates.set(clientKey, {
      lastSyncVersion: snapshot.version,
      lastSyncTime: Date.now(),
      socketId: socket.id
    });

    socket.emit('reconnect-state', {
      snapshot: snapshot,
      incrementalOps: incrementalOps,
      lastKnownVersion: lastKnownVersion,
      serverTime: Date.now()
    });
  });

  socket.on('operation', async ({ roomId, operation }) => {
    const room = await applyOperation(roomId, operation);
    const operationWithVersion = {
      ...operation,
      version: room.version
    };
    socket.to(roomId).emit('operation-broadcast', {
      operation: operationWithVersion,
      version: room.version
    });
  });

  socket.on('webrtc-signal', ({ to, from, signal, userId }) => {
    io.to(to).emit('webrtc-signal', {
      to,
      from,
      signal,
      userId
    });
  });

  socket.on('request-export', async ({ roomId, userId, exportId, startTime, endTime, fps, resolution }) => {
    console.log(`Export requested by ${userId}: ${startTime} - ${endTime}, ${fps}fps, ${resolution}`);

    try {
      socket.emit('export-progress', { progress: 5, status: '正在获取操作数据...' });

      const initialState = await getInitialStateAtTime(roomId, startTime);
      const operations = await getOperationsByTimeRange(roomId, startTime, endTime);

      socket.emit('export-progress', { progress: 15, status: '正在初始化渲染器...' });

      const jobId = exportId || uuidv4();
      const filename = `animation_${roomId}_${Date.now()}.mp4`;

      const onProgress = (progress, status) => {
        socket.emit('export-progress', { 
          progress: 15 + progress * 0.8, 
          status 
        });
      };

      const result = await videoRenderer.renderVideo({
        jobId,
        roomId,
        initialState,
        operations,
        startTime,
        endTime,
        fps: fps || 30,
        resolution: resolution || '1920x1080',
        filename,
        onProgress
      });

      const downloadUrl = `/exports/${filename}`;
      socket.emit('export-complete', {
        downloadUrl,
        filename,
        duration: result.duration,
        fileSize: result.fileSize
      });

    } catch (error) {
      console.error('Export error:', error);
      socket.emit('export-error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const peerInfo = peers.get(socket.id);
    if (peerInfo) {
      const { roomId, userId } = peerInfo;
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('peer-left', {
            peerId: socket.id,
            userId
          });
        }
      }
      peers.delete(socket.id);
    }
  });
});

app.get('/api/rooms/:roomId/operations', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { sinceVersion = 0 } = req.query;
    const operations = await OperationLog.find({
      roomId,
      version: { $gt: parseInt(sinceVersion) }
    }).sort({ version: 1 });
    res.json(operations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms/:roomId/state', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await getOrCreateRoom(roomId);
    res.json({
      geometries: room.geometries,
      version: room.version
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms/:roomId/operations-by-time', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { startTime, endTime } = req.query;
    const operations = await getOperationsByTimeRange(roomId, startTime, endTime);
    res.json(operations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms/:roomId/initial-state', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { startTime } = req.query;
    const initialState = await getInitialStateAtTime(roomId, startTime);
    res.json({ geometries: initialState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/exports', express.static(path.join(__dirname, '../exports')));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
