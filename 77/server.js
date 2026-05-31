const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

const mockData = {
  bridges: [
    {
      id: 'bridge_001',
      name: '长江大桥',
      location: '湖北省武汉市',
      length: 100,
      width: 12,
      type: '连续梁桥',
      buildYear: 2010,
      lastInspection: '2026-05-20',
      condition: 'good',
      description: '跨越长江的高速公路桥梁'
    }
  ],
  bearings: Array.from({ length: 14 }, (_, i) => ({
    id: `bearing_${Math.floor(i / 2) - 3}_${i % 2 === 0 ? -1 : 1}`,
    bridgeId: 'bridge_001',
    type: '板式橡胶支座',
    model: 'GJZ200x300x42',
    installationDate: '2010-06-15',
    lastInspection: '2026-05-20',
    condition: i % 3 === 0 ? 'warning' : 'good',
    designLoad: 5000,
    currentLoad: 1000 + Math.random() * 1000,
    position: {
      x: (i % 2 === 0 ? -1 : 1) * 1.5,
      y: 5.4,
      z: (Math.floor(i / 2) - 3) * 15
    }
  })),
  guardrails: Array.from({ length: 51 * 2 }, (_, i) => ({
    id: `guardrail_${i}`,
    bridgeId: 'bridge_001',
    type: '波形护栏',
    material: 'Q235钢材',
    installationDate: '2010-06-20',
    lastInspection: '2026-05-18',
    condition: i % 20 === 0 ? 'poor' : 'good',
    position: {
      x: (i < 51 ? -1 : 1) * 5.5,
      y: 5.6,
      z: -50 + (i % 51) * 2
    }
  })),
  diseases: [
    {
      id: 'disease_001',
      bridgeId: 'bridge_001',
      componentType: 'bearing',
      componentId: 'bearing_-2_-1',
      type: 'crack',
      severity: 'moderate',
      description: '支座橡胶层出现横向裂缝',
      length: 15,
      width: 2,
      depth: 0.5,
      position: { x: -1.5, y: 5.4, z: -30 },
      discoveryDate: '2026-05-10',
      inspector: '张三',
      status: 'pending',
      repairSuggestion: '建议更换支座',
      images: ['/images/crack_001.jpg']
    },
    {
      id: 'disease_002',
      bridgeId: 'bridge_001',
      componentType: 'guardrail',
      componentId: 'guardrail_15',
      type: 'deformation',
      severity: 'minor',
      description: '护栏立柱轻微变形',
      position: { x: -5.5, y: 5.6, z: -20 },
      discoveryDate: '2026-05-12',
      inspector: '李四',
      status: 'pending',
      repairSuggestion: '建议校直修复',
      images: ['/images/deform_001.jpg']
    },
    {
      id: 'disease_003',
      bridgeId: 'bridge_001',
      componentType: 'deck',
      componentId: 'deck_segment_8',
      type: 'spalling',
      severity: 'severe',
      description: '桥面混凝土剥落，面积约0.5平方米',
      area: 0.5,
      position: { x: 0, y: 5, z: -10 },
      discoveryDate: '2026-05-15',
      inspector: '王五',
      status: 'repairing',
      repairSuggestion: '建议凿除破损部分，重新浇筑混凝土',
      images: ['/images/spalling_001.jpg', '/images/spalling_002.jpg']
    },
    {
      id: 'disease_004',
      bridgeId: 'bridge_001',
      componentType: 'bearing',
      componentId: 'bearing_1_1',
      type: 'corrosion',
      severity: 'moderate',
      description: '支座钢板锈蚀',
      area: 0.1,
      position: { x: 1.5, y: 5.4, z: 15 },
      discoveryDate: '2026-05-18',
      inspector: '张三',
      status: 'pending',
      repairSuggestion: '建议除锈防腐处理',
      images: ['/images/corrosion_001.jpg']
    },
    {
      id: 'disease_005',
      bridgeId: 'bridge_001',
      componentType: 'guardrail',
      componentId: 'guardrail_85',
      type: 'missing',
      severity: 'severe',
      description: '护栏连接螺栓缺失',
      position: { x: 5.5, y: 5.6, z: 18 },
      discoveryDate: '2026-05-20',
      inspector: '李四',
      status: 'repaired',
      repairSuggestion: '已补充螺栓',
      images: ['/images/missing_001.jpg']
    }
  ],
  inspections: [
    {
      id: 'inspection_001',
      bridgeId: 'bridge_001',
      date: '2026-05-20',
      inspector: '张三',
      type: 'routine',
      weather: '晴',
      temperature: 25,
      description: '月度常规巡检',
      diseasesFound: 5,
      diseasesRepaired: 1,
      status: 'completed'
    },
    {
      id: 'inspection_002',
      bridgeId: 'bridge_001',
      date: '2026-04-20',
      inspector: '李四',
      type: 'routine',
      weather: '多云',
      temperature: 20,
      description: '月度常规巡检',
      diseasesFound: 3,
      diseasesRepaired: 3,
      status: 'completed'
    },
    {
      id: 'inspection_003',
      bridgeId: 'bridge_001',
      date: '2026-03-20',
      inspector: '王五',
      type: 'special',
      weather: '小雨',
      temperature: 15,
      description: '季度专项检测',
      diseasesFound: 8,
      diseasesRepaired: 6,
      status: 'completed'
    }
  ],
  stressHistory: Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString(),
    bearingId: 'bearing_0_-1',
    stress: 80 + Math.sin(i / 3) * 30 + Math.random() * 10
  }))
};

const sendSuccess = (res, data) => {
  res.json({ success: true, data });
};

const sendError = (res, error, status = 400) => {
  res.status(status).json({ success: false, error });
};

app.get('/api/bridges', (req, res) => {
  sendSuccess(res, mockData.bridges);
});

app.get('/api/bridges/:id', (req, res) => {
  const bridge = mockData.bridges.find(b => b.id === req.params.id);
  if (bridge) {
    sendSuccess(res, bridge);
  } else {
    sendError(res, '桥梁不存在', 404);
  }
});

app.get('/api/bearings', (req, res) => {
  const bridgeId = req.query.bridgeId || 'bridge_001';
  const bearings = mockData.bearings.filter(b => b.bridgeId === bridgeId);
  sendSuccess(res, bearings);
});

app.get('/api/bearings/:id', (req, res) => {
  const bearing = mockData.bearings.find(b => b.id === req.params.id);
  if (bearing) {
    sendSuccess(res, bearing);
  } else {
    sendError(res, '支座不存在', 404);
  }
});

app.get('/api/guardrails', (req, res) => {
  const bridgeId = req.query.bridgeId || 'bridge_001';
  const guardrails = mockData.guardrails.filter(g => g.bridgeId === bridgeId);
  sendSuccess(res, guardrails);
});

app.get('/api/diseases', (req, res) => {
  const bridgeId = req.query.bridgeId || 'bridge_001';
  let diseases = mockData.diseases.filter(d => d.bridgeId === bridgeId);

  if (req.query.componentType) {
    diseases = diseases.filter(d => d.componentType === req.query.componentType);
  }
  if (req.query.severity) {
    diseases = diseases.filter(d => d.severity === req.query.severity);
  }
  if (req.query.status) {
    diseases = diseases.filter(d => d.status === req.query.status);
  }

  sendSuccess(res, diseases);
});

app.get('/api/diseases/:id', (req, res) => {
  const disease = mockData.diseases.find(d => d.id === req.params.id);
  if (disease) {
    sendSuccess(res, disease);
  } else {
    sendError(res, '病害记录不存在', 404);
  }
});

app.post('/api/diseases', (req, res) => {
  const newDisease = {
    ...req.body,
    id: `disease_${String(mockData.diseases.length + 1).padStart(3, '0')}`,
    discoveryDate: new Date().toISOString().split('T')[0],
    status: 'pending'
  };
  mockData.diseases.push(newDisease);
  sendSuccess(res, newDisease);
});

app.put('/api/diseases/:id', (req, res) => {
  const index = mockData.diseases.findIndex(d => d.id === req.params.id);
  if (index !== -1) {
    mockData.diseases[index] = { ...mockData.diseases[index], ...req.body };
    sendSuccess(res, mockData.diseases[index]);
  } else {
    sendError(res, '病害记录不存在', 404);
  }
});

app.delete('/api/diseases/:id', (req, res) => {
  const index = mockData.diseases.findIndex(d => d.id === req.params.id);
  if (index !== -1) {
    mockData.diseases.splice(index, 1);
    sendSuccess(res, null);
  } else {
    sendError(res, '病害记录不存在', 404);
  }
});

app.get('/api/inspections', (req, res) => {
  const bridgeId = req.query.bridgeId || 'bridge_001';
  const inspections = mockData.inspections.filter(i => i.bridgeId === bridgeId);
  sendSuccess(res, inspections);
});

app.get('/api/inspections/:id', (req, res) => {
  const inspection = mockData.inspections.find(i => i.id === req.params.id);
  if (inspection) {
    sendSuccess(res, inspection);
  } else {
    sendError(res, '巡检记录不存在', 404);
  }
});

app.post('/api/inspections', (req, res) => {
  const newInspection = {
    ...req.body,
    id: `inspection_${String(mockData.inspections.length + 1).padStart(3, '0')}`,
    date: new Date().toISOString().split('T')[0],
    status: 'in_progress'
  };
  mockData.inspections.unshift(newInspection);
  sendSuccess(res, newInspection);
});

app.get('/api/stress/history', (req, res) => {
  const bearingId = req.query.bearingId;
  let history = mockData.stressHistory;
  if (bearingId) {
    history = history.filter(h => h.bearingId === bearingId);
  }
  sendSuccess(res, history);
});

app.get('/api/stress/realtime', (req, res) => {
  const bearingId = req.query.bearingId;
  const stress = 80 + Math.random() * 60;
  sendSuccess(res, {
    bearingId,
    stress,
    timestamp: new Date().toISOString(),
    status: stress > 150 ? 'danger' : stress > 100 ? 'warning' : 'normal'
  });
});

app.get('/api/components', (req, res) => {
  const bridgeId = req.query.bridgeId || 'bridge_001';
  const type = req.query.type;

  let components = [];
  if (!type || type === 'bearing') {
    components = components.concat(
      mockData.bearings.filter(b => b.bridgeId === bridgeId).map(b => ({ ...b, componentType: 'bearing' }))
    );
  }
  if (!type || type === 'guardrail') {
    components = components.concat(
      mockData.guardrails.filter(g => g.bridgeId === bridgeId).map((g, i) => ({ ...g, componentType: 'guardrail', id: `guardrail_${i}` }))
    );
  }

  sendSuccess(res, components);
});

app.get('/api/inspections/:id/export', (req, res) => {
  const format = req.query.format || 'pdf';
  sendSuccess(res, {
    url: `/reports/${req.params.id}.${format}`,
    filename: `inspection_report_${req.params.id}.${format}`
  });
});

app.post('/api/diseases/:id/images', (req, res) => {
  sendSuccess(res, {
    url: `/images/${req.params.id}_${Date.now()}.jpg`
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    sendError(res, 'API端点不存在', 404);
  } else {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`
  ============================================
  高速公路桥梁三维巡检平台后端服务已启动
  ============================================
  服务器地址: http://localhost:${PORT}
  API地址:    http://localhost:${PORT}/api
  前端地址:   http://localhost:3000
  
  可用API端点:
  GET  /api/bridges              获取桥梁列表
  GET  /api/bridges/:id          获取桥梁详情
  GET  /api/bearings             获取支座列表
  GET  /api/guardrails           获取护栏列表
  GET  /api/diseases             获取病害列表
  POST /api/diseases             新增病害记录
  PUT  /api/diseases/:id         更新病害记录
  GET  /api/inspections          获取巡检记录
  GET  /api/stress/history       获取应力历史数据
  GET  /api/stress/realtime      获取实时应力数据
  ============================================
  `);
});
