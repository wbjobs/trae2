/**
 * 链路分析 REST 路由（增强版）
 *
 * GET  /api/analysis/links           - 所有链路分析结果
 * GET  /api/analysis/links/:id       - 单链路详情+历史
 * GET  /api/analysis/abnormal        - 异常链路列表
 * GET  /api/analysis/overview        - 全网概览
 *
 * 规则管理：
 * GET  /api/analysis/rules           - 所有规则
 * POST /api/analysis/rules           - 新增规则
 * PUT  /api/analysis/rules/:id       - 更新规则
 * DELETE /api/analysis/rules/:id     - 删除规则
 * POST /api/analysis/rules/:id/toggle - 启用/禁用规则
 * GET  /api/analysis/rules/stats     - 规则引擎统计
 * GET  /api/analysis/rules/audit     - 规则变更审计日志
 * GET  /api/analysis/thresholds/:type - 获取指定链路类型阈值
 */

const express = require('express');
const router = express.Router();

module.exports = (analyzer) => {
  router.get('/links', (req, res) => {
    try {
      const links = analyzer.getAllLinks();
      res.json({ code: 0, message: 'success', data: links });
    } catch (err) {
      console.error('[Route] 查询链路分析结果失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: [] });
    }
  });

  router.get('/links/:id', (req, res) => {
    try {
      const linkId = req.params.id;
      const detail = analyzer.getLinkDetail(linkId);
      if (!detail) {
        return res.status(404).json({ code: 404, message: '链路不存在', data: null });
      }
      res.json({ code: 0, message: 'success', data: detail });
    } catch (err) {
      console.error('[Route] 查询链路详情失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  router.get('/abnormal', (req, res) => {
    try {
      const abnormal = analyzer.getAbnormalLinks();
      res.json({ code: 0, message: 'success', data: abnormal });
    } catch (err) {
      console.error('[Route] 查询异常链路失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: [] });
    }
  });

  router.get('/overview', (req, res) => {
    try {
      const overview = analyzer.getOverview();
      res.json({ code: 0, message: 'success', data: overview });
    } catch (err) {
      console.error('[Route] 查询全网概览失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  // ========== 规则管理路由 ==========

  router.get('/rules', (req, res) => {
    try {
      const { linkType, metric, enabled } = req.query;
      const options = {};
      if (linkType) options.linkType = linkType;
      if (metric) options.metric = metric;
      if (enabled !== undefined) options.enabled = enabled === 'true';

      const rules = analyzer.getAllRules(options);
      res.json({ code: 0, message: 'success', data: rules, count: rules.length });
    } catch (err) {
      console.error('[Route] 查询规则失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: [] });
    }
  });

  router.post('/rules', (req, res) => {
    try {
      const { metric, operator, threshold, severity, linkType, enabled } = req.body;
      if (!metric || threshold === undefined) {
        return res.status(400).json({
          code: 400,
          message: 'metric 和 threshold 为必填项',
          data: null,
        });
      }

      const rule = analyzer.addRule({
        metric,
        operator: operator || '>',
        threshold,
        severity: severity || 'warning',
        linkType: linkType || null,
        enabled: enabled !== false,
      });

      analyzer.analyzeAll();

      res.status(201).json({
        code: 0,
        message: '规则已创建并立即生效',
        data: rule,
      });
    } catch (err) {
      console.error('[Route] 创建规则失败:', err);
      res.status(500).json({ code: 500, message: '创建失败: ' + err.message, data: null });
    }
  });

  router.put('/rules/:id', (req, res) => {
    try {
      const ruleId = req.params.id;
      const updates = req.body;

      const rule = analyzer.updateRule(ruleId, updates);
      if (!rule) {
        return res.status(404).json({ code: 404, message: '规则不存在', data: null });
      }

      analyzer.analyzeAll();

      res.json({ code: 0, message: '规则已更新并重新评估所有链路', data: rule });
    } catch (err) {
      console.error('[Route] 更新规则失败:', err);
      res.status(500).json({ code: 500, message: '更新失败: ' + err.message, data: null });
    }
  });

  router.delete('/rules/:id', (req, res) => {
    try {
      const ruleId = req.params.id;
      const removed = analyzer.removeRule(ruleId);
      if (!removed) {
        return res.status(404).json({ code: 404, message: '规则不存在', data: null });
      }

      analyzer.analyzeAll();

      res.json({ code: 0, message: '规则已删除并重新评估所有链路', data: { ruleId } });
    } catch (err) {
      console.error('[Route] 删除规则失败:', err);
      res.status(500).json({ code: 500, message: '删除失败: ' + err.message, data: null });
    }
  });

  router.post('/rules/:id/toggle', (req, res) => {
    try {
      const ruleId = req.params.id;
      const { enabled } = req.body;

      if (enabled === undefined) {
        return res.status(400).json({ code: 400, message: 'enabled 为必填项', data: null });
      }

      const rule = analyzer.setRuleEnabled(ruleId, enabled);
      if (!rule) {
        return res.status(404).json({ code: 404, message: '规则不存在', data: null });
      }

      analyzer.analyzeAll();

      res.json({
        code: 0,
        message: '规则' + (enabled ? '已启用' : '已禁用') + '并重新评估所有链路',
        data: rule,
      });
    } catch (err) {
      console.error('[Route] 切换规则状态失败:', err);
      res.status(500).json({ code: 500, message: '操作失败: ' + err.message, data: null });
    }
  });

  router.get('/rules/stats', (req, res) => {
    try {
      const stats = analyzer.getRuleStats();
      res.json({ code: 0, message: 'success', data: stats });
    } catch (err) {
      console.error('[Route] 查询规则统计失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  router.get('/rules/audit', (req, res) => {
    try {
      const auditLog = analyzer.getRuleAuditLog();
      res.json({ code: 0, message: 'success', data: auditLog });
    } catch (err) {
      console.error('[Route] 查询规则审计日志失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: [] });
    }
  });

  router.get('/thresholds/:type', (req, res) => {
    try {
      const linkType = req.params.type;
      const thresholds = analyzer.getThresholds(linkType);
      res.json({ code: 0, message: 'success', data: { linkType, thresholds } });
    } catch (err) {
      console.error('[Route] 查询阈值失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  // ========== 故障时序回放路由 ==========

  router.get('/fault-events', (req, res) => {
    try {
      const { linkId, linkType, eventType, severity, startTime, endTime, limit, offset } = req.query;
      const result = analyzer.replayEngine.queryEvents({
        linkId,
        linkType,
        eventType,
        severity,
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : 500,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json({ code: 0, message: 'success', data: result });
    } catch (err) {
      console.error('[Route] 查询故障事件失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  router.get('/fault-events/timeline', (req, res) => {
    try {
      const { startTime, endTime, interval } = req.query;
      const timeline = analyzer.replayEngine.getEventTimeline({
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
        interval: interval ? parseInt(interval, 10) : 60000,
      });
      res.json({ code: 0, message: 'success', data: timeline });
    } catch (err) {
      console.error('[Route] 获取事件时间轴失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  router.get('/fault-events/export', (req, res) => {
    try {
      const { linkId, linkType, eventType, severity, startTime, endTime, format = 'json' } = req.query;
      const result = analyzer.replayEngine.exportEvents({
        linkId,
        linkType,
        eventType,
        severity,
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
      });

      if (format === 'csv') {
        const headers = ['timestamp', 'eventType', 'linkName', 'linkType', 'severity', 'latency', 'packetLoss', 'jitter', 'availability'];
        const lines = [headers.join(',')];
        result.events.forEach(e => {
          lines.push([
            e.timestamp,
            e.eventType,
            e.linkName,
            e.linkType,
            e.severity,
            e.metrics.latency.toFixed(2),
            e.metrics.packetLoss.toFixed(4),
            e.metrics.jitter.toFixed(2),
            e.metrics.availability.toFixed(2),
          ].join(','));
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="fault-events-' + Date.now() + '.csv"');
        res.send(lines.join('\n'));
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="fault-events-' + Date.now() + '.json"');
        res.json(result);
      }
    } catch (err) {
      console.error('[Route] 导出故障事件失败:', err);
      res.status(500).json({ code: 500, message: '导出失败: ' + err.message });
    }
  });

  router.get('/fault-events/duration/:linkId', (req, res) => {
    try {
      const { linkId } = req.params;
      const { startTime, endTime } = req.query;
      const stats = analyzer.replayEngine.getFaultDurationStats(
        linkId,
        startTime ? parseInt(startTime, 10) : undefined,
        endTime ? parseInt(endTime, 10) : undefined
      );
      res.json({ code: 0, message: 'success', data: stats });
    } catch (err) {
      console.error('[Route] 获取故障时长统计失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  // 回放会话管理
  router.post('/replay/create', (req, res) => {
    try {
      const { startTime, endTime, linkIds, severities, speed, loop } = req.body;
      const sessionId = analyzer.replayEngine.createReplaySession({
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
        linkIds,
        severities,
        speed: speed || 1,
        loop: loop || false,
      });
      res.status(201).json({
        code: 0,
        message: '回放会话已创建',
        data: { sessionId },
      });
    } catch (err) {
      console.error('[Route] 创建回放会话失败:', err);
      res.status(500).json({ code: 500, message: '创建失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/start', (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = analyzer.replayEngine.getReplayStatus(sessionId);
      if (!session) {
        return res.status(404).json({ code: 404, message: '回放会话不存在', data: null });
      }

      const started = analyzer.replayEngine.startReplay(
        sessionId,
        (event, session) => {
          if (analyzer.handleReplayEvent) {
            analyzer.handleReplayEvent(sessionId, event, session);
          }
        },
        (session) => {
          if (analyzer.handleReplayComplete) {
            analyzer.handleReplayComplete(sessionId, session);
          }
        }
      );

      res.json({
        code: 0,
        message: started ? '回放已开始' : '回放启动失败',
        data: { sessionId, started },
      });
    } catch (err) {
      console.error('[Route] 启动回放失败:', err);
      res.status(500).json({ code: 500, message: '启动失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/pause', (req, res) => {
    try {
      const { sessionId } = req.params;
      const paused = analyzer.replayEngine.pauseReplay(sessionId);
      res.json({
        code: 0,
        message: paused ? '回放已暂停' : '暂停失败',
        data: { sessionId, paused },
      });
    } catch (err) {
      console.error('[Route] 暂停回放失败:', err);
      res.status(500).json({ code: 500, message: '暂停失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/resume', (req, res) => {
    try {
      const { sessionId } = req.params;
      const resumed = analyzer.replayEngine.resumeReplay(
        sessionId,
        (event, session) => {
          if (analyzer.handleReplayEvent) {
            analyzer.handleReplayEvent(sessionId, event, session);
          }
        },
        (session) => {
          if (analyzer.handleReplayComplete) {
            analyzer.handleReplayComplete(sessionId, session);
          }
        }
      );
      res.json({
        code: 0,
        message: resumed ? '回放已继续' : '继续失败',
        data: { sessionId, resumed },
      });
    } catch (err) {
      console.error('[Route] 继续回放失败:', err);
      res.status(500).json({ code: 500, message: '继续失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/seek', (req, res) => {
    try {
      const { sessionId } = req.params;
      const { targetTime } = req.body;
      const result = analyzer.replayEngine.seekToTime(sessionId, parseInt(targetTime, 10));
      if (!result) {
        return res.status(404).json({ code: 404, message: '回放会话不存在', data: null });
      }
      res.json({ code: 0, message: '跳转成功', data: result });
    } catch (err) {
      console.error('[Route] 跳转回放失败:', err);
      res.status(500).json({ code: 500, message: '跳转失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/speed', (req, res) => {
    try {
      const { sessionId } = req.params;
      const { speed } = req.body;
      const updated = analyzer.replayEngine.setReplaySpeed(sessionId, parseFloat(speed));
      res.json({
        code: 0,
        message: updated ? '速度已更新' : '更新失败',
        data: { sessionId, speed: parseFloat(speed) },
      });
    } catch (err) {
      console.error('[Route] 设置回放速度失败:', err);
      res.status(500).json({ code: 500, message: '设置失败: ' + err.message, data: null });
    }
  });

  router.post('/replay/:sessionId/stop', (req, res) => {
    try {
      const { sessionId } = req.params;
      const stopped = analyzer.replayEngine.stopReplay(sessionId);
      res.json({
        code: 0,
        message: stopped ? '回放已停止' : '停止失败',
        data: { sessionId, stopped },
      });
    } catch (err) {
      console.error('[Route] 停止回放失败:', err);
      res.status(500).json({ code: 500, message: '停止失败: ' + err.message, data: null });
    }
  });

  router.get('/replay/:sessionId/status', (req, res) => {
    try {
      const { sessionId } = req.params;
      const status = analyzer.replayEngine.getReplayStatus(sessionId);
      if (!status) {
        return res.status(404).json({ code: 404, message: '回放会话不存在', data: null });
      }
      res.json({ code: 0, message: 'success', data: status });
    } catch (err) {
      console.error('[Route] 获取回放状态失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  router.get('/replay/sessions', (req, res) => {
    try {
      const sessions = analyzer.replayEngine.getActiveSessions();
      res.json({ code: 0, message: 'success', data: sessions });
    } catch (err) {
      console.error('[Route] 获取回放会话列表失败:', err);
      res.status(500).json({ code: 500, message: '查询失败: ' + err.message, data: null });
    }
  });

  return router;
};
