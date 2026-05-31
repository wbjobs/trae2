const express = require('express');
const cors = require('cors');
const config = require('../../config/config');
const logger = require('../modules/logger');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const vehicleDataStore = new Map();
const syncHistory = [];

app.post('/api/vehicle/sync', (req, res) => {
  const vehicleId = req.headers['x-vehicle-id'] || 'unknown';
  const trainLine = req.headers['x-train-line'] || 'unknown';
  const syncData = req.body;

  logger.info(`Received sync from vehicle ${vehicleId} on ${trainLine}`);

  const record = {
    vehicleId,
    trainLine,
    receivedAt: Date.now(),
    data: syncData
  };

  if (!vehicleDataStore.has(vehicleId)) {
    vehicleDataStore.set(vehicleId, []);
  }
  vehicleDataStore.get(vehicleId).push(record);

  syncHistory.push({
    vehicleId,
    trainLine,
    timestamp: Date.now(),
    nodeCount: syncData.nodes?.length || 0,
    success: true
  });

  if (syncHistory.length > 1000) {
    syncHistory.shift();
  }

  res.json({
    success: true,
    message: 'Data received',
    timestamp: Date.now()
  });
});

app.get('/api/vehicles', (req, res) => {
  const vehicles = [];
  vehicleDataStore.forEach((data, vehicleId) => {
    const latest = data[data.length - 1];
    vehicles.push({
      vehicleId,
      trainLine: latest?.trainLine || 'unknown',
      lastSync: latest?.receivedAt || 0,
      nodes: latest?.data?.nodes?.length || 0,
      status: Date.now() - (latest?.receivedAt || 0) < 30000 ? 'online' : 'offline'
    });
  });
  res.json({ success: true, vehicles });
});

app.get('/api/vehicle/:vehicleId/latest', (req, res) => {
  const vehicleId = req.params.vehicleId;
  const data = vehicleDataStore.get(vehicleId);
  if (data && data.length > 0) {
    res.json({ success: true, data: data[data.length - 1] });
  } else {
    res.status(404).json({ success: false, error: 'Vehicle not found' });
  }
});

app.get('/api/vehicle/:vehicleId/history', (req, res) => {
  const vehicleId = req.params.vehicleId;
  const limit = parseInt(req.query.limit) || 100;
  const data = vehicleDataStore.get(vehicleId) || [];
  res.json({
    success: true,
    history: data.slice(-limit).reverse()
  });
});

app.get('/api/sync/statistics', (req, res) => {
  const stats = {
    totalVehicles: vehicleDataStore.size,
    onlineVehicles: 0,
    totalSyncs: syncHistory.length,
    todaySyncs: 0,
    averageNodesPerSync: 0
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalNodes = 0;
  let syncCount = 0;

  vehicleDataStore.forEach((data, vehicleId) => {
    const latest = data[data.length - 1];
    if (latest && Date.now() - latest.receivedAt < 30000) {
      stats.onlineVehicles++;
    }
  });

  syncHistory.forEach(sync => {
    if (new Date(sync.timestamp) >= today) {
      stats.todaySyncs++;
    }
    totalNodes += sync.nodeCount;
    syncCount++;
  });

  stats.averageNodesPerSync = syncCount > 0 ? totalNodes / syncCount : 0;

  res.json({ success: true, stats });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'Ground Server',
    connectedVehicles: vehicleDataStore.size
  });
});

const PORT = process.env.GROUND_PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Ground server running on http://${HOST}:${PORT}`);
});
