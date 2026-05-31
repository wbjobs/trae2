/**
 * 操作日志审计服务 - 主入口
 *
 * 功能:
 * - Express HTTP 服务 (端口 3004)
 * - CORS 跨域支持
 * - REST API 路由 (日志查询、统计、导出)
 * - WebSocket 实时推送新日志
 * - 内存环形缓冲区 (最大 10000 条)
 * - 自动归档到本地文件
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const { auditStore, AuditAction, EntityType } = require('./auditStore');
const auditRoutes = require('./routes/audit');

const PORT = process.env.PORT || 3004;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'audit-service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    },
  });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[AuditWebSocket] 新客户端连接');

  ws.send(JSON.stringify({
    type: 'system',
    message: '已连接到操作日志审计服务',
    timestamp: new Date().toISOString(),
  }));

  const stats = auditStore.getStats();
  ws.send(JSON.stringify({
    type: 'stats',
    data: stats,
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('[AuditWebSocket] 收到消息:', data.type);

      if (data.type === 'query') {
        const result = auditStore.query(data.options || {});
        ws.send(JSON.stringify({
          type: 'queryResult',
          data: result,
          timestamp: new Date().toISOString(),
        }));
      } else if (data.type === 'getStats') {
        ws.send(JSON.stringify({
          type: 'stats',
          data: auditStore.getStats(),
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('[AuditWebSocket] 消息解析失败:', err);
    }
  });

  ws.on('close', () => {
    console.log('[AuditWebSocket] 客户端断开');
  });

  ws.on('error', (err) => {
    console.error('[AuditWebSocket] 错误:', err);
  });
});

function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

const originalRecord = auditStore.record.bind(auditStore);
auditStore.record = function (action, entityType, entityId, operator, detail) {
  const entry = originalRecord(action, entityType, entityId, operator, detail);
  broadcastToClients({
    type: 'newLog',
    data: entry,
    timestamp: new Date().toISOString(),
  });
  return entry;
};

const MOCK_OPERATORS = ['admin', 'operator', 'maintenance', 'occ-dispatcher', 'station-staff', 'system'];
const MOCK_ACTIONS = Object.values(AuditAction);
const MOCK_ENTITY_TYPES = Object.values(EntityType);

function generateMockAuditLogs() {
  console.log('[Audit] 生成模拟审计日志...');

  const actions = [
    { action: AuditAction.LOGIN, entityType: EntityType.USER, entityId: 'user-001', operator: 'admin', detail: '管理员登录系统' },
    { action: AuditAction.RULE_ADD, entityType: EntityType.RULE, entityId: 'rule-001', operator: 'admin', detail: '新增规则: 光纤延迟>100ms标记为严重' },
    { action: AuditAction.RULE_UPDATE, entityType: EntityType.RULE, entityId: 'rule-001', operator: 'admin', detail: '更新规则阈值: 100ms→150ms' },
    { action: AuditAction.RULE_TOGGLE, entityType: EntityType.RULE, entityId: 'rule-002', operator: 'operator', detail: '禁用规则: wireless-loss-warning' },
    { action: AuditAction.NODE_REGISTER, entityType: EntityType.NODE, entityId: 'node-001', operator: 'system', detail: '注册车载终端: 列车-01' },
    { action: AuditAction.NODE_HEARTBEAT, entityType: EntityType.NODE, entityId: 'node-002', operator: 'system', detail: '车站节点心跳: 人民广场站' },
    { action: AuditAction.LINK_RESET, entityType: EntityType.LINK, entityId: 'link-001', operator: 'maintenance', detail: '重置链路: 人民广场-陆家嘴 主干链路' },
    { action: AuditAction.SYNC_PUSH, entityType: EntityType.SIGNAL, entityId: null, operator: 'system', detail: '车载终端推送数据: 列车状态' },
    { action: AuditAction.SYNC_PULL, entityType: EntityType.SIGNAL, entityId: null, operator: 'system', detail: '车站节点拉取增量数据: 15条变更' },
    { action: AuditAction.SYNC_BROADCAST, entityType: EntityType.SIGNAL, entityId: null, operator: 'occ-dispatcher', detail: '运营中心广播: 全局调度指令' },
    { action: AuditAction.SIGNAL_ACK, entityType: EntityType.SIGNAL, entityId: 'signal-001', operator: 'system', detail: '信令确认: SIP-INVITE from 人民广场站' },
    { action: AuditAction.SIGNAL_RETRY, entityType: EntityType.SIGNAL, entityId: 'signal-002', operator: 'system', detail: '信令重传: 第2次重传, 类型=门禁' },
    { action: AuditAction.CONFIG_CHANGE, entityType: EntityType.CONFIG, entityId: null, operator: 'admin', detail: '修改配置: 重传最大次数 3→5' },
    { action: AuditAction.SYSTEM_START, entityType: EntityType.SYSTEM, entityId: null, operator: 'system', detail: '审计服务启动' },
    { action: AuditAction.LOGOUT, entityType: EntityType.USER, entityId: 'user-001', operator: 'admin', detail: '管理员登出' },
  ];

  const now = Date.now();
  actions.forEach((action, idx) => {
    auditStore.record(
      action.action,
      action.entityType,
      action.entityId,
      action.operator,
      action.detail,
    );
    auditStore.logs[auditStore.logs.length - 1].timestamp = now - (actions.length - idx) * 60000;
    auditStore.logs[auditStore.logs.length - 1].timestampStr = new Date(now - (actions.length - idx) * 60000).toISOString();
  });

  console.log('[Audit] 已生成 ' + actions.length + ' 条模拟审计日志');
}

async function main() {
  console.log('========================================');
  console.log('  地铁弱电系统操作日志审计服务');
  console.log('  Metro Audit Service v1.0.0');
  console.log('========================================');

  generateMockAuditLogs();

  setInterval(() => {
    const randomAction = MOCK_ACTIONS[Math.floor(Math.random() * MOCK_ACTIONS.length)];
    const randomEntity = MOCK_ENTITY_TYPES[Math.floor(Math.random() * MOCK_ENTITY_TYPES.length)];
    const randomOperator = MOCK_OPERATORS[Math.floor(Math.random() * MOCK_OPERATORS.length)];
    auditStore.record(randomAction, randomEntity, null, randomOperator, '自动生成的操作日志: ' + randomAction);
  }, 15000);

  server.listen(PORT, () => {
    console.log('========================================');
    console.log('  服务已启动');
    console.log('  HTTP 服务: http://localhost:' + PORT);
    console.log('  WebSocket: ws://localhost:' + PORT + '/ws');
    console.log('========================================');
    console.log('');
    console.log('可用 API 端点:');
    console.log('  GET  /api/health            - 健康检查');
    console.log('  GET  /api/audit/logs        - 查询操作日志');
    console.log('  GET  /api/audit/logs/:id    - 日志详情');
    console.log('  GET  /api/audit/stats       - 审计统计');
    console.log('  GET  /api/audit/export      - 导出日志 (?format=csv/json)');
    console.log('  POST /api/audit/logs        - 手动记录日志');
    console.log('');
    console.log('[Audit] 审计服务已就绪');
  });
}

main().catch(err => {
  console.error('[Audit] 启动失败:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[Audit] 收到中断信号，正在关闭...');
  server.close(() => {
    console.log('[Audit] 服务已关闭');
    process.exit(0);
  });
});
