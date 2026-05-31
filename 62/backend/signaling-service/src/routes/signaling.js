/**
 * 信令相关 REST 路由
 * GET /api/signaling - 查询信令列表（支持筛选和分页）
 * GET /api/signaling/:id - 查询单条信令详情
 * GET /api/signaling/stats - 信令统计数据
 * POST /api/signaling/:id/ack - 确认信令接收（ACK）
 * GET /api/signaling/:id/ack-status - 查询信令ACK状态
 * GET /api/signaling/sniffer/stats - 信令抓取器统计
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

let sniffer = null;

function setSniffer(snifferInstance) {
  sniffer = snifferInstance;
}

router.post('/:id/ack', (req, res) => {
  const id = req.params.id;
  try {
    if (sniffer) {
      const result = sniffer.ackSignal(id);
      res.json({
        code: 0,
        message: 'success',
        data: { signalId: id, acked: result },
      });
    } else {
      res.json({
        code: 0,
        message: 'sniffer_not_available',
        data: { signalId: id, acked: true },
      });
    }
  } catch (err) {
    console.error('[Route] ACK信令失败:', err);
    res.status(500).json({
      code: 500,
      message: 'ACK失败: ' + err.message,
    });
  }
});

router.get('/:id/ack-status', (req, res) => {
  const id = req.params.id;
  try {
    if (sniffer) {
      const status = sniffer.getAckStatus(id);
      res.json({
        code: 0,
        message: 'success',
        data: status,
      });
    } else {
      res.json({
        code: 0,
        message: 'sniffer_not_available',
        data: { signalId: id, status: 'unknown' },
      });
    }
  } catch (err) {
    console.error('[Route] 查询ACK状态失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
    });
  }
});

router.get('/sniffer/stats', (req, res) => {
  try {
    if (sniffer) {
      const stats = sniffer.getStats();
      res.json({
        code: 0,
        message: 'success',
        data: stats,
      });
    } else {
      res.json({
        code: 0,
        message: 'sniffer_not_available',
        data: { running: false },
      });
    }
  } catch (err) {
    console.error('[Route] 查询抓取器统计失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
    });
  }
});

router.get('/', (req, res) => {
  const params = {
    type: req.query.type,
    protocol: req.query.protocol,
    severity: req.query.severity,
    src_station: req.query.src_station,
    limit: parseInt(req.query.limit) || 100,
    offset: parseInt(req.query.offset) || 0,
  };

  try {
    const signals = db.getSignaling(params);

    const processed = signals.map(s => ({
      ...s,
      parsed_data: s.parsed_data ? JSON.parse(s.parsed_data) : null,
    }));

    res.json({
      code: 0,
      message: 'success',
      data: processed,
      count: processed.length,
    });
  } catch (err) {
    console.error('[Route] 查询信令失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: [],
    });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = db.getSignalingStats();

    const total = stats.reduce((sum, item) => sum + item.count, 0);

    const typeStats = {};
    stats.forEach(item => {
      if (!typeStats[item.type]) {
        typeStats[item.type] = { total: 0, protocols: {} };
      }
      typeStats[item.type].total += item.count;
      if (!typeStats[item.type].protocols[item.protocol]) {
        typeStats[item.type].protocols[item.protocol] = 0;
      }
      typeStats[item.type].protocols[item.protocol] += item.count;
    });

    const severityStats = {};
    stats.forEach(item => {
      if (!severityStats[item.severity]) {
        severityStats[item.severity] = 0;
      }
      severityStats[item.severity] += item.count;
    });

    res.json({
      code: 0,
      message: 'success',
      data: {
        total,
        byType: typeStats,
        bySeverity: severityStats,
        details: stats,
      },
    });
  } catch (err) {
    console.error('[Route] 查询信令统计失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: {},
    });
  }
});

router.get('/:id', (req, res) => {
  const id = req.params.id;

  try {
    const signal = db.getSignalingById(id);

    if (!signal) {
      return res.status(404).json({
        code: 404,
        message: '信令不存在',
        data: null,
      });
    }

    signal.parsed_data = signal.parsed_data ? JSON.parse(signal.parsed_data) : null;

    res.json({
      code: 0,
      message: 'success',
      data: signal,
    });
  } catch (err) {
    console.error('[Route] 查询信令详情失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: null,
    });
  }
});

module.exports = router;
module.exports.setSniffer = setSniffer;