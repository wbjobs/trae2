const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class ExportManager extends EventEmitter {
  constructor(mysqlPool, redisClient, exportDir = 'exports') {
    super();
    this.mysqlPool = mysqlPool;
    this.redisClient = redisClient;
    this.exportDir = path.resolve(process.cwd(), exportDir);
    this.taskQueue = [];
    this.processingTask = null;
    this.isProcessing = false;
    this.maxConcurrentTasks = 2;
    this.runningTasks = 0;

    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  generateTaskId() {
    return `export_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  async createTask(params) {
    const { format = 'csv', filters = {}, createdBy = 'system' } = params;
    const taskId = this.generateTaskId();

    const [result] = await this.mysqlPool.execute(
      `INSERT INTO export_tasks (task_id, format, status, filters, created_by)
       VALUES (?, ?, 'pending', ?, ?)`,
      [taskId, format, JSON.stringify(filters), createdBy]
    );

    const task = {
      id: result.insertId,
      taskId,
      format,
      filters,
      createdBy,
      status: 'pending',
      createdAt: new Date()
    };

    this.taskQueue.push(task);
    this.emit('task:created', task);

    this.processQueue();

    return { taskId, status: 'pending' };
  }

  async processQueue() {
    if (this.isProcessing || this.runningTasks >= this.maxConcurrentTasks) return;
    if (this.taskQueue.length === 0) return;

    this.isProcessing = true;

    while (this.taskQueue.length > 0 && this.runningTasks < this.maxConcurrentTasks) {
      const task = this.taskQueue.shift();
      this.runningTasks++;
      this.processTask(task).finally(() => {
        this.runningTasks--;
        if (this.taskQueue.length > 0) {
          this.processQueue();
        }
      });
    }

    this.isProcessing = false;
  }

  async processTask(task) {
    const { taskId, format, filters } = task;

    try {
      await this.updateTaskStatus(taskId, 'processing');

      const data = await this.fetchData(filters);
      const filePath = path.join(this.exportDir, `${taskId}.${format}`);

      let fileContent;
      if (format === 'csv') {
        fileContent = this.generateCsv(data);
      } else if (format === 'json') {
        fileContent = this.generateJson(data);
      } else {
        throw new Error(`不支持的导出格式: ${format}`);
      }

      fs.writeFileSync(filePath, fileContent, 'utf-8');
      const stats = fs.statSync(filePath);

      await this.mysqlPool.execute(
        `UPDATE export_tasks 
         SET status = 'completed', file_path = ?, file_size = ?, record_count = ?, completed_at = NOW()
         WHERE task_id = ?`,
        [filePath, stats.size, data.length, taskId]
      );

      this.emit('task:completed', { taskId, recordCount: data.length, filePath });
      return { success: true, recordCount: data.length };
    } catch (error) {
      console.error(`导出任务失败 [${taskId}]:`, error);
      await this.mysqlPool.execute(
        `UPDATE export_tasks SET status = 'failed', error_message = ?, completed_at = NOW() WHERE task_id = ?`,
        [error.message, taskId]
      );
      this.emit('task:failed', { taskId, error: error.message });
      throw error;
    }
  }

  async fetchData(filters) {
    const { nodeId, groupId, region, status, startTime, endTime, limit = 100000 } = filters;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (nodeId) {
      whereClause += ' AND node_id = ?';
      params.push(nodeId);
    }
    if (groupId) {
      whereClause += ' AND group_id = ?';
      params.push(groupId);
    }
    if (region) {
      whereClause += ' AND region = ?';
      params.push(region);
    }
    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }
    if (startTime) {
      whereClause += ' AND timestamp >= ?';
      params.push(startTime);
    }
    if (endTime) {
      whereClause += ' AND timestamp <= ?';
      params.push(endTime);
    }

    params.push(parseInt(limit));

    const [rows] = await this.mysqlPool.execute(
      `SELECT id, node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp
       FROM node_metrics ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
      params
    );

    return rows;
  }

  generateCsv(data) {
    if (data.length === 0) {
      return 'id,node_id,group_id,region,cpu_usage,memory_usage,bandwidth_usage,uptime,status,timestamp\n';
    }

    const headers = Object.keys(data[0]);
    const headerLine = headers.join(',');

    const lines = data.map(row => {
      return headers.map(h => {
        let value = row[h];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    return [headerLine, ...lines].join('\n');
  }

  generateJson(data) {
    return JSON.stringify({
      exportTime: new Date().toISOString(),
      recordCount: data.length,
      data: data
    }, null, 2);
  }

  async updateTaskStatus(taskId, status) {
    await this.mysqlPool.execute(
      `UPDATE export_tasks SET status = ? WHERE task_id = ?`,
      [status, taskId]
    );
  }

  async getTaskStatus(taskId) {
    const [rows] = await this.mysqlPool.execute(
      `SELECT * FROM export_tasks WHERE task_id = ?`,
      [taskId]
    );

    if (rows.length === 0) {
      return null;
    }

    const task = rows[0];
    return {
      taskId: task.task_id,
      format: task.format,
      status: task.status,
      filters: task.filters ? JSON.parse(task.filters) : null,
      filePath: task.file_path,
      fileSize: task.file_size,
      recordCount: task.record_count,
      errorMessage: task.error_message,
      createdBy: task.created_by,
      createdAt: task.created_at,
      completedAt: task.completed_at
    };
  }

  async listTasks(status = null, limit = 100) {
    let whereClause = '';
    let params = [];

    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    params.push(parseInt(limit));

    const [rows] = await this.mysqlPool.execute(
      `SELECT * FROM export_tasks ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      params
    );

    return rows.map(task => ({
      taskId: task.task_id,
      format: task.format,
      status: task.status,
      fileSize: task.file_size,
      recordCount: task.record_count,
      errorMessage: task.error_message,
      createdBy: task.created_by,
      createdAt: task.created_at,
      completedAt: task.completed_at
    }));
  }

  getDownloadPath(taskId) {
    const formats = ['csv', 'json'];
    for (const format of formats) {
      const filePath = path.join(this.exportDir, `${taskId}.${format}`);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  async deleteTask(taskId) {
    const filePath = this.getDownloadPath(taskId);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.mysqlPool.execute(
      `DELETE FROM export_tasks WHERE task_id = ?`,
      [taskId]
    );

    return { success: true };
  }

  getQueueStats() {
    return {
      pending: this.taskQueue.length,
      running: this.runningTasks,
      maxConcurrent: this.maxConcurrentTasks,
      exportDir: this.exportDir
    };
  }
}

module.exports = ExportManager;
