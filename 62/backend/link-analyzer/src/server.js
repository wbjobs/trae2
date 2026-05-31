/**
 * 链路质量分析服务 - 主入口
 * 
 * 功能:
 * - Express HTTP 服务 (端口 3002)
 * - CORS 跨域支持
 * - REST API 路由 (链路分析、异常检测、全网概览)
 * - WebSocket 实时消息推送（异常链路实时推送)
 * - 订阅信令服务实时数据
 * - 启动时自动生成链路样本数据
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');
const path = require('path');

const LinkAnalyzer = require('./analyzer');
const analysisRoutes = require('./routes/analysis');
const SignalSubscriber = require('./subscriber');
const { FaultReplayEngine, EVENT_TYPES } = require('./replayEngine');

const PORT = process.env.PORT || 3002;

/** 分析引擎实例 */
const analyzer = new LinkAnalyzer();

/** 故障回放引擎实例 */
const replayEngine = new FaultReplayEngine(path.join(__dirname, '..'));
analyzer.replayEngine = replayEngine;

/** WebSocket 客户端集合 */
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** REST API 路由 */
app.use('/api/analysis', analysisRoutes(analyzer));

/** 健康检查端点 */
app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'link-analyzer',
      version: '2.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    },
  });
});

const server = http.createServer(app);

/** WebSocket 服务器 */
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WebSocket] 新客户端连接');

  ws.send(JSON.stringify({
    type: 'system',
    message: '已连接到链路质量分析服务',
    timestamp: new Date().toISOString(),
  }));

  const overview = analyzer.getOverview();
  ws.send(JSON.stringify({
    type: 'overview',
    data: overview,
    timestamp: new Date().toISOString(),
  }));

  const abnormal = analyzer.getAbnormalLinks();
  ws.send(JSON.stringify({
    type: 'abnormalList',
    data: abnormal,
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('[WebSocket] 收到客户端消息:', data);

      if (data.type === 'request') {
        if (data.action === 'getOverview') {
          ws.send(JSON.stringify({
            type: 'overview',
            data: analyzer.getOverview(),
            timestamp: new Date().toISOString(),
          }));
        } else if (data.action === 'getAbnormal') {
            ws.send(JSON.stringify({
              type: 'abnormalList',
              data: analyzer.getAbnormalLinks(),
              timestamp: new Date().toISOString(),
            }));
        } else if (data.action === 'getLinks') {
          ws.send(JSON.stringify({
            type: 'linkList',
            data: analyzer.getAllLinks(),
            timestamp: new Date().toISOString(),
          }));
        }
      }
    } catch (err) {
      console.error('[WebSocket] 消息解析失败:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] 客户端断开连接');
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] 连接错误:', err);
  });
});

/** 广播消息到所有客户端 */
function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

/** 异常链路状态变化时的回调 */
function handleAbnormalUpdate(changes, allResults) {
  if (changes.newlyAbnormal.length > 0) {
    changes.newlyAbnormal.forEach(link => {
      const linkDetail = analyzer.links.find(l => l.id === link.id);
      if (linkDetail) {
        replayEngine.recordFaultEvent(linkDetail, EVENT_TYPES.FAULT_OCCURRED);
      }
    });

    broadcastToClients({
      type: 'abnormalDetected',
      data: changes.newlyAbnormal,
      message: '检测到新的异常链路',
      timestamp: new Date().toISOString(),
    });
  }

  if (changes.newlyRecovered.length > 0) {
    changes.newlyRecovered.forEach(link => {
      const linkDetail = analyzer.links.find(l => l.id === link.id);
      if (linkDetail) {
        replayEngine.recordFaultEvent(linkDetail, EVENT_TYPES.FAULT_RECOVERED);
      }
    });

    broadcastToClients({
      type: 'linkRecovered',
      data: changes.newlyRecovered,
      message: '链路已恢复正常',
      timestamp: new Date().toISOString(),
    });
  }

  if (allResults) {
    allResults.forEach(result => {
      if (result.severityChanged && result.link) {
        const prevOrder = result.prevSeverity ? analyzer.ruleEngine.SEVERITY_ORDER[result.prevSeverity] : 0;
        const newOrder = analyzer.ruleEngine.SEVERITY_ORDER[result.link.severity] || 0;
        if (newOrder > prevOrder && result.link.status === 'abnormal') {
          replayEngine.recordFaultEvent(result.link, EVENT_TYPES.SEVERITY_UPGRADE, { prevSeverity: result.prevSeverity });
        } else if (newOrder < prevOrder && result.link.status === 'abnormal') {
          replayEngine.recordFaultEvent(result.link, EVENT_TYPES.SEVERITY_DOWNGRADE, { prevSeverity: result.prevSeverity });
        }
      }
    });
  }

  broadcastToClients({
    type: 'overviewUpdate',
    data: analyzer.getOverview(),
    timestamp: new Date().toISOString(),
  });
}

/** 回放事件处理回调 */
analyzer.handleReplayEvent = function (sessionId, event, session) {
  broadcastToClients({
    type: 'replayEvent',
    data: { sessionId, event, sessionStatus: replayEngine.getReplayStatus(sessionId) },
    timestamp: new Date().toISOString(),
  });
};

/** 回放完成处理回调 */
analyzer.handleReplayComplete = function (sessionId, session) {
  broadcastToClients({
    type: 'replayComplete',
    data: { sessionId, sessionStatus: replayEngine.getReplayStatus(sessionId) },
    message: '回放已完成',
    timestamp: new Date().toISOString(),
  });
};

/** 规则变更时的回调 */
function handleRuleChange(action, ruleId) {
  broadcastToClients({
    type: 'ruleChange',
    data: { action, ruleId, timestamp: new Date().toISOString() },
    message: '规则已变更: ' + action,
    timestamp: new Date().toISOString(),
  });

  broadcastToClients({
    type: 'overviewUpdate',
    data: analyzer.getOverview(),
    timestamp: new Date().toISOString(),
  });
}

/** 信令订阅服务实例 */
const subscriber = new SignalSubscriber(analyzer, handleAbnormalUpdate);

/** 定时任务：每秒更新全网概览推送 */
cron.schedule('*/5 * * * * *', () => {
  const overview = analyzer.getOverview();
  broadcastToClients({
    type: 'overviewUpdate',
    data: overview,
    timestamp: new Date().toISOString(),
  });
});

/** 主启动流程 */
async function main() {
  console.log('========================================');
  console.log('  地铁弱电系统链路质量分析服务');
  console.log('  Link Quality Analysis Service v1.0.0');
  console.log('========================================');

  analyzer.initializeMockData();
  console.log('[Analyzer] 链路数据初始化完成');

  subscriber.start();
  console.log('[Subscriber] 信令订阅服务已启动');

  server.listen(PORT, () => {
    console.log('========================================');
    console.log('  服务已启动');
    console.log('  HTTP 服务: http://localhost:' + PORT);
    console.log('  WebSocket: ws://localhost:' + PORT + '/ws');
    console.log('========================================');
    console.log('');
    console.log('可用 API 端点:');
    console.log('  GET  /api/health          - 健康检查');
    console.log('  GET  /api/analysis/links    - 所有链路分析结果');
    console.log('  GET  /api/analysis/links/:id  - 单链路详情+历史');
    console.log('  GET  /api/analysis/abnormal    - 异常链路列表');
    console.log('  GET  /api/analysis/overview   - 全网概览');
    console.log('');
    console.log('WebSocket 消息类型:');
    console.log('  system           - 系统消息');
    console.log('  overview         - 全网概览');
    console.log('  overviewUpdate   - 概览更新');
    console.log('  abnormalList     - 异常链路列表');
    console.log('  abnormalDetected - 检测到异常链路');
    console.log('  linkRecovered    - 链路恢复');
    console.log('');
    console.log('[Server] 服务已就绪，等待信令数据...');
  });
}

main().catch(err => {
  console.error('[Server] 启动失败:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[Server] 收到中断信号，正在关闭...');
  subscriber.stop();
  server.close(() => {
    console.log('[Server] 服务已关闭');
    process.exit(0);
  });
});
