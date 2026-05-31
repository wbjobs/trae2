/**
 * 操作日志审计 REST 路由（增强版）
 *
 * 路由前缀: /api/audit
 *
 * 基础接口:
 * GET  /api/audit/logs          - 查询操作日志（支持多条件过滤）
 * GET  /api/audit/logs/:id      - 获取单条日志详情
 * GET  /api/audit/stats         - 审计统计数据
 * GET  /api/audit/export        - 导出日志（支持 json/csv 格式）
 * POST /api/audit/logs          - 手动记录审计日志
 *
 * 批量导出接口:
 * POST /api/audit/batch-export       - 异步批量导出（含归档数据）
 * GET  /api/audit/batch-export/:taskId - 查询导出任务状态
 * GET  /api/audit/batch-export/:taskId/download - 下载导出文件
 *
 * 异常日志专用接口:
 * GET  /api/audit/anomaly-logs    - 查询异常日志
 * GET  /api/audit/anomaly-export  - 导出异常日志
 *
 * 归档文件管理:
 * GET  /api/audit/archive/files   - 查询归档文件列表
 * POST /api/audit/archive/merge   - 合并多个归档文件
 * POST /api/audit/archive/cleanup - 清理过期归档文件
 * GET  /api/audit/archive/:filename - 读取归档文件内容
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { AuditAction, EntityType, ANOMALY_ACTIONS, auditStore } = require('../auditStore');

const EXPORT_TASK_DIR = path.join(__dirname, '..', 'data', 'export-tasks');
if (!fs.existsSync(EXPORT_TASK_DIR)) {
  fs.mkdirSync(EXPORT_TASK_DIR, { recursive: true });
}

const exportTasks = new Map();

router.get('/logs', (req, res) => {
  try {
    const {
      action,
      entityType,
      entityId,
      operator,
      startTime,
      endTime,
      keyword,
      isAnomaly,
      limit,
      offset,
    } = req.query;

    const result = auditStore.query({
      action,
      entityType,
      entityId,
      operator,
      startTime: startTime ? parseInt(startTime, 10) : undefined,
      endTime: endTime ? parseInt(endTime, 10) : undefined,
      keyword,
      isAnomaly: isAnomaly === 'true',
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.json({
      code: 0,
      message: 'success',
      ...result,
    });
  } catch (err) {
    console.error('[AuditRoute] 查询日志失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      logs: [],
    });
  }
});

router.get('/logs/:id', (req, res) => {
  try {
    const log = auditStore.getById(req.params.id);
    if (!log) {
      return res.status(404).json({
        code: 404,
        message: '日志不存在',
        data: null,
      });
    }
    res.json({
      code: 0,
      message: 'success',
      data: log,
    });
  } catch (err) {
    console.error('[AuditRoute] 查询日志详情失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: null,
    });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = auditStore.getStats();
    const actionList = Object.values(AuditAction);
    const entityTypeList = Object.values(EntityType);

    res.json({
      code: 0,
      message: 'success',
      data: {
        ...stats,
        availableActions: actionList,
        availableEntityTypes: entityTypeList,
        anomalyActions: ANOMALY_ACTIONS,
      },
    });
  } catch (err) {
    console.error('[AuditRoute] 查询统计失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: null,
    });
  }
});

router.get('/export', (req, res) => {
  try {
    const {
      format = 'json',
      action,
      entityType,
      operator,
      startTime,
      endTime,
      isAnomaly,
    } = req.query;

    const options = {};
    if (action) options.action = action;
    if (entityType) options.entityType = entityType;
    if (operator) options.operator = operator;
    if (startTime) options.startTime = parseInt(startTime, 10);
    if (endTime) options.endTime = parseInt(endTime, 10);
    if (isAnomaly === 'true') options.isAnomaly = true;

    const content = auditStore.export(options, format);

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const ext = format === 'csv' ? 'csv' : 'json';
    const filename = `audit-export-${Date.now()}.${ext}`;

    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=' + filename);
    res.send(content);
  } catch (err) {
    console.error('[AuditRoute] 导出失败:', err);
    res.status(500).json({
      code: 500,
      message: '导出失败: ' + err.message,
    });
  }
});

router.post('/logs', (req, res) => {
  try {
    const { action, entityType, entityId, operator, detail } = req.body;

    if (!action || !entityType) {
      return res.status(400).json({
        code: 400,
        message: 'action 和 entityType 为必填项',
      });
    }

    const entry = auditStore.record(action, entityType, entityId, operator || 'system', detail || '');

    res.status(201).json({
      code: 0,
      message: '日志已记录',
      data: entry,
    });
  } catch (err) {
    console.error('[AuditRoute] 记录日志失败:', err);
    res.status(500).json({
      code: 500,
      message: '记录失败: ' + err.message,
    });
  }
});

// ========== 批量导出接口 ==========

router.post('/batch-export', async (req, res) => {
  try {
    const {
      format = 'json',
      action,
      entityType,
      operator,
      startTime,
      endTime,
      isAnomaly,
      filename,
    } = req.body;

    const taskId = uuidv4();
    const task = {
      id: taskId,
      status: 'pending',
      format,
      options: {
        action,
        entityType,
        operator,
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
        isAnomaly: isAnomaly === true,
      },
      createdAt: Date.now(),
      completedAt: null,
      progress: 0,
      recordCount: 0,
      fileSize: 0,
      filename: filename || `batch-export-${taskId}.${format}`,
    };

    exportTasks.set(taskId, task);

    setImmediate(async () => {
      try {
        task.status = 'processing';
        task.progress = 10;

        const result = await auditStore.batchExport(task.options, format);
        const outputPath = path.join(EXPORT_TASK_DIR, task.filename);

        if (format === 'csv') {
          fs.writeFileSync(outputPath, result.content, 'utf8');
        } else {
          fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
        }

        const stat = fs.statSync(outputPath);
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = Date.now();
        task.recordCount = result.recordCount || (result.logs ? result.logs.length : 0);
        task.fileSize = stat.size;
        task.outputPath = outputPath;
      } catch (err) {
        console.error('[AuditRoute] 批量导出任务失败:', err);
        task.status = 'failed';
        task.error = err.message;
        task.completedAt = Date.now();
      }
    });

    res.status(202).json({
      code: 0,
      message: '导出任务已创建',
      data: { taskId, status: task.status },
    });
  } catch (err) {
    console.error('[AuditRoute] 创建批量导出任务失败:', err);
    res.status(500).json({
      code: 500,
      message: '创建任务失败: ' + err.message,
    });
  }
});

router.get('/batch-export/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = exportTasks.get(taskId);

    if (!task) {
      return res.status(404).json({
        code: 404,
        message: '导出任务不存在',
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        recordCount: task.recordCount,
        fileSize: task.fileSize,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        filename: task.filename,
        error: task.error,
      },
    });
  } catch (err) {
    console.error('[AuditRoute] 查询导出任务失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
    });
  }
});

router.get('/batch-export/:taskId/download', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = exportTasks.get(taskId);

    if (!task) {
      return res.status(404).json({
        code: 404,
        message: '导出任务不存在',
      });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({
        code: 400,
        message: '导出任务尚未完成',
      });
    }

    const filePath = path.join(EXPORT_TASK_DIR, task.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        code: 404,
        message: '导出文件不存在',
      });
    }

    const contentType = task.format === 'csv' ? 'text/csv' : 'application/json';
    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=' + task.filename);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (err) {
    console.error('[AuditRoute] 下载导出文件失败:', err);
    res.status(500).json({
      code: 500,
      message: '下载失败: ' + err.message,
    });
  }
});

router.get('/batch-export', (req, res) => {
  try {
    const tasks = Array.from(exportTasks.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(task => ({
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        recordCount: task.recordCount,
        fileSize: task.fileSize,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        filename: task.filename,
      }));

    res.json({
      code: 0,
      message: 'success',
      data: tasks,
    });
  } catch (err) {
    console.error('[AuditRoute] 查询导出任务列表失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
    });
  }
});

// ========== 异常日志专用接口 ==========

router.get('/anomaly-logs', (req, res) => {
  try {
    const {
      startTime,
      endTime,
      limit = 200,
      offset = 0,
    } = req.query;

    const result = auditStore.query({
      isAnomaly: true,
      startTime: startTime ? parseInt(startTime, 10) : undefined,
      endTime: endTime ? parseInt(endTime, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 200,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.json({
      code: 0,
      message: 'success',
      anomalyActions: ANOMALY_ACTIONS,
      ...result,
    });
  } catch (err) {
    console.error('[AuditRoute] 查询异常日志失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      logs: [],
    });
  }
});

router.get('/anomaly-export', async (req, res) => {
  try {
    const { format = 'json', startTime, endTime } = req.query;

    const result = await auditStore.exportAnomalyLogs({
      startTime: startTime ? parseInt(startTime, 10) : undefined,
      endTime: endTime ? parseInt(endTime, 10) : undefined,
    }, format);

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const ext = format === 'csv' ? 'csv' : 'json';
    const filename = `anomaly-logs-${Date.now()}.${ext}`;

    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=' + filename);

    if (format === 'csv') {
      res.send(result.content);
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('[AuditRoute] 导出异常日志失败:', err);
    res.status(500).json({
      code: 500,
      message: '导出失败: ' + err.message,
    });
  }
});

// ========== 归档文件管理接口 ==========

router.get('/archive/files', (req, res) => {
  try {
    const files = auditStore.getArchivedFiles();
    res.json({
      code: 0,
      message: 'success',
      data: files,
      count: files.length,
    });
  } catch (err) {
    console.error('[AuditRoute] 查询归档文件失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
    });
  }
});

router.get('/archive/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const { limit, offset } = req.query;

    const files = auditStore.getArchivedFiles();
    const fileInfo = files.find(f => f.filename === filename);

    if (!fileInfo) {
      return res.status(404).json({
        code: 404,
        message: '归档文件不存在',
      });
    }

    const filePath = path.join(__dirname, '..', 'data', 'audit-archive', filename);
    const content = fs.readFileSync(filePath, 'utf8');
    let logs = JSON.parse(content);

    const limitNum = limit ? parseInt(limit, 10) : 100;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const total = logs.length;
    logs = logs.slice().reverse().slice(offsetNum, offsetNum + limitNum);

    res.json({
      code: 0,
      message: 'success',
      data: {
        filename,
        fileInfo,
        total,
        returned: logs.length,
        logs,
      },
    });
  } catch (err) {
    console.error('[AuditRoute] 读取归档文件失败:', err);
    res.status(500).json({
      code: 500,
      message: '读取失败: ' + err.message,
    });
  }
});

router.post('/archive/merge', (req, res) => {
  try {
    const { fileNames, outputFilename } = req.body;

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'fileNames 为必填数组',
      });
    }

    const outputPath = path.join(EXPORT_TASK_DIR, outputFilename || `merged-${Date.now()}.json`);
    const result = auditStore.mergeArchiveFiles(fileNames, outputPath);

    res.json({
      code: 0,
      message: '合并成功',
      data: result,
    });
  } catch (err) {
    console.error('[AuditRoute] 合并归档文件失败:', err);
    res.status(500).json({
      code: 500,
      message: '合并失败: ' + err.message,
    });
  }
});

router.post('/archive/cleanup', (req, res) => {
  try {
    const { maxAgeDays = 30 } = req.body;
    const result = auditStore.cleanupOldArchiveFiles(parseInt(maxAgeDays, 10));

    res.json({
      code: 0,
      message: `已清理 ${result.deletedCount} 个过期文件`,
      data: result,
    });
  } catch (err) {
    console.error('[AuditRoute] 清理归档文件失败:', err);
    res.status(500).json({
      code: 500,
      message: '清理失败: ' + err.message,
    });
  }
});

// ========== 流式导出接口（适用于大文件） ==========

router.get('/stream-export', async (req, res) => {
  try {
    const {
      format = 'json',
      action,
      entityType,
      operator,
      startTime,
      endTime,
      isAnomaly,
    } = req.query;

    const options = {
      action,
      entityType,
      operator,
      startTime: startTime ? parseInt(startTime, 10) : undefined,
      endTime: endTime ? parseInt(endTime, 10) : undefined,
      isAnomaly: isAnomaly === 'true',
    };

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const ext = format === 'csv' ? 'csv' : 'json';
    const filename = `audit-stream-export-${Date.now()}.${ext}`;

    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=' + filename);

    await auditStore.streamExport(options, format, res);
  } catch (err) {
    console.error('[AuditRoute] 流式导出失败:', err);
    if (!res.headersSent) {
      res.status(500).json({
        code: 500,
        message: '导出失败: ' + err.message,
      });
    }
  }
});

module.exports = router;
module.exports.AuditAction = AuditAction;
module.exports.EntityType = EntityType;
