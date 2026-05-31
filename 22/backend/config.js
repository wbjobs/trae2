const path = require('path');
const fs = require('fs');

const CONFIG = {
  server: {
    httpPort: 8080,
    wsPort: 8081,
    host: '0.0.0.0',
  },
  cluster: {
    nodeId: process.env.NODE_ID || 'node-01',
    nodeName: process.env.NODE_NAME || '主节点-01',
    nodes: [
      { id: 'node-01', host: '127.0.0.1', port: 7001, status: 'online' },
      { id: 'node-02', host: '127.0.0.1', port: 7002, status: 'online' },
      { id: 'node-03', host: '127.0.0.1', port: 7003, status: 'online' },
    ],
    heartbeatInterval: 5000,
    syncInterval: 10000,
    gossipPort: 6000,
    maxSyncRate: 1000,
  },
  ecu: {
    interfaces: [
      { id: 'ecu-can-01', type: 'CAN', baudrate: 500000, enabled: true },
      { id: 'ecu-can-02', type: 'CAN-FD', baudrate: 2000000, enabled: true },
      { id: 'ecu-eth-01', type: 'DoIP', host: '192.168.1.10', port: 13400, enabled: true },
    ],
    udpPort: 9000,
    tcpPort: 9001,
    messageBufferSize: 10000,
  },
  filter: {
    defaultRules: [
      {
        id: 'rule-001',
        name: '阻断诊断会话控制',
        description: '阻断 0x10 服务的所有诊断会话控制请求',
        enabled: true,
        priority: 100,
        conditions: { sid: ['0x10'], sourceNodes: [] },
        action: 'block',
        logLevel: 'high',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
      {
        id: 'rule-002',
        name: '限制ECU复位频率',
        description: '限制 0x11 ECUReset 服务调用频率不超过1次/10秒',
        enabled: true,
        priority: 90,
        conditions: { sid: ['0x11'], rateLimit: { max: 1, windowMs: 10000 } },
        action: 'rate_limit',
        logLevel: 'medium',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
      {
        id: 'rule-003',
        name: '白名单-安全认证',
        description: '仅允许特定节点执行安全认证服务',
        enabled: true,
        priority: 80,
        conditions: { sid: ['0x27'], sourceNodes: ['node-01', 'node-02'] },
        action: 'allow',
        logLevel: 'low',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
      {
        id: 'rule-004',
        name: '数据记录-读取数据',
        description: '记录所有 0x22 ReadDataByIdentifier 服务调用',
        enabled: true,
        priority: 50,
        conditions: { sid: ['0x22'], did: ['0xF190', '0xF191'] },
        action: 'log',
        logLevel: 'medium',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
      {
        id: 'rule-005',
        name: '阻断写入数据',
        description: '阻断所有 0x2E WriteDataByIdentifier 服务（禁止写入操作）',
        enabled: true,
        priority: 95,
        conditions: { sid: ['0x2E'] },
        action: 'block',
        logLevel: 'high',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
      {
        id: 'rule-006',
        name: '例程控制监控',
        description: '监控所有 0x31 RoutineControl 服务调用',
        enabled: true,
        priority: 70,
        conditions: { sid: ['0x31'] },
        action: 'monitor',
        logLevel: 'medium',
        createdAt: new Date().toISOString(),
        isDefault: true,
      },
    ],
    actions: ['block', 'allow', 'rate_limit', 'log', 'monitor', 'transform'],
  },
  logger: {
    logDir: path.join(__dirname, '..', 'logs'),
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 10,
    levels: ['error', 'warn', 'info', 'debug', 'audit'],
    defaultLevel: 'info',
  },
};

function loadRulesFromDisk() {
  const rulesFile = path.join(CONFIG.logger.logDir, 'custom_rules.json');
  if (fs.existsSync(rulesFile)) {
    try {
      const raw = fs.readFileSync(rulesFile, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveRulesToDisk(rules) {
  if (!fs.existsSync(CONFIG.logger.logDir)) {
    fs.mkdirSync(CONFIG.logger.logDir, { recursive: true });
  }
  const rulesFile = path.join(CONFIG.logger.logDir, 'custom_rules.json');
  fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2), 'utf8');
}

function getEffectiveRules() {
  const custom = loadRulesFromDisk();
  const ruleMap = new Map();
  for (const rule of CONFIG.filter.defaultRules) {
    ruleMap.set(rule.id, { ...rule });
  }
  for (const rule of custom) {
    ruleMap.set(rule.id, { ...rule, isDefault: false });
  }
  return Array.from(ruleMap.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
  });
}

module.exports = { CONFIG, loadRulesFromDisk, saveRulesToDisk, getEffectiveRules };
