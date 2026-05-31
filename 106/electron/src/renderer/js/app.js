class PrinterManagerApp {
  constructor() {
    this.printers = [];
    this.tasks = new Map();
    this.alerts = [];
    this.templates = [];
    this.selectedTemplateIds = new Set();
    this.currentTab = 'printers';
    this.currentTaskTab = 'active';
    this.taskPriorityFilter = 'all';
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.loadAppInfo();
    await this.loadPrinters();
    await this.loadTasks();
    await this.loadTemplates();
    this.startAutoRefresh();
    this.setupIpcListeners();
  }

  setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        this.switchTab(tab);
      });
    });

    document.querySelectorAll('.task-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const taskTab = tab.dataset.taskTab;
        this.switchTaskTab(taskTab);
      });
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refreshAll();
    });

    document.getElementById('printFileBtn').addEventListener('click', () => {
      this.handlePrintFile();
    });

    document.getElementById('addPrinterBtn').addEventListener('click', () => {
      this.showAddPrinterDialog();
    });

    document.getElementById('createTemplateBtn').addEventListener('click', () => {
      this.showCreateTemplateDialog();
    });

    document.getElementById('importTemplateBtn').addEventListener('click', () => {
      this.importTemplate();
    });

    document.getElementById('batchImportTemplateBtn').addEventListener('click', () => {
      this.batchImportTemplates();
    });

    document.getElementById('batchExportTemplateBtn').addEventListener('click', () => {
      this.batchExportTemplates();
    });

    document.getElementById('taskPriorityFilter').addEventListener('change', (e) => {
      this.taskPriorityFilter = e.target.value;
      this.renderTasks();
    });

    document.getElementById('alertModalAck').addEventListener('click', () => {
      this.closeAlertModal();
    });

    document.getElementById('clearAlertsBtn').addEventListener('click', () => {
      this.clearAlerts();
    });

    document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModal();
      });
    });

    document.getElementById('printerModal').addEventListener('click', (e) => {
      if (e.target.id === 'printerModal') {
        this.closeModal();
      }
    });

    document.getElementById('defaultPrinterSelect').addEventListener('change', (e) => {
      this.setDefaultPrinter(e.target.value);
    });
  }

  setupIpcListeners() {
    window.printerAPI.onTaskUpdate((task) => {
      this.updateTask(task);
    });

    window.printerAPI.onAlert((alert) => {
      this.addAlert(alert);
    });

    window.printerAPI.onAlertDialog((data) => {
      this.showAlertDialog(data);
    });

    window.printerAPI.onRefreshPrinters(() => {
      this.loadPrinters();
    });

    window.printerAPI.onPrintFile(() => {
      this.handlePrintFile();
    });

    window.printerAPI.onSettings(() => {
      this.switchTab('settings');
    });
  }

  async loadAppInfo() {
    const version = await window.printerAPI.getAppVersion();
    const platform = await window.printerAPI.getPlatform();

    document.getElementById('appVersion').textContent = version;
    document.getElementById('platform').textContent = this.formatPlatform(platform);
  }

  formatPlatform(platform) {
    const platforms = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux'
    };
    return platforms[platform] || platform;
  }

  async loadPrinters() {
    try {
      this.printers = await window.printerAPI.enumeratePrinters();
      this.renderPrinters();
      this.updateDefaultPrinterSelect();
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  }

  renderPrinters() {
    const container = document.getElementById('printerList');

    if (this.printers.length === 0) {
      container.innerHTML = this.getEmptyState('🖨️', '暂无打印机');
      return;
    }

    container.innerHTML = this.printers.map(printer => `
      <div class="printer-card" data-printer-id="${printer.id}">
        <div class="printer-header">
          <span class="printer-icon">🖨️</span>
          <span class="printer-status ${printer.status}">${this.getStatusText(printer.status)}</span>
        </div>
        <div class="printer-info">
          <h3>${printer.name}</h3>
          <p>${printer.model}</p>
          <p>端口: ${printer.port}</p>
          <p>任务数: ${printer.jobCount}</p>
          ${printer.isDefault ? '<p><strong>✓ 默认打印机</strong></p>' : ''}
        </div>
        <div class="printer-actions">
          <button class="btn btn-sm btn-secondary" onclick="app.printToPrinter('${printer.id}')">打印文件</button>
          <button class="btn btn-sm btn-secondary" onclick="app.showPrinterDetails('${printer.id}')">详情</button>
          ${printer.status === 'paused' ?
            `<button class="btn btn-sm btn-primary" onclick="app.resumePrinter('${printer.id}')">恢复</button>` :
            `<button class="btn btn-sm btn-secondary" onclick="app.pausePrinter('${printer.id}')">暂停</button>`
          }
        </div>
      </div>
    `).join('');
  }

  getStatusText(status) {
    const statusMap = {
      ready: '就绪',
      busy: '忙碌',
      printing: '打印中',
      paused: '已暂停',
      error: '错误',
      offline: '离线',
      paper_out: '缺纸',
      cover_open: '机盖打开',
      jammed: '卡纸',
      unknown: '未知'
    };
    return statusMap[status] || status;
  }

  async loadTasks() {
    try {
      const activeTasks = await window.printerAPI.getActiveTasks();
      const completedTasks = await window.printerAPI.getCompletedTasks(50);

      activeTasks.forEach(task => this.tasks.set(task.id, task));
      completedTasks.forEach(task => this.tasks.set(task.id, task));

      this.renderTasks();
      this.updateTaskBadge();
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  renderTasks() {
    const tasks = Array.from(this.tasks.values());
    const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'processing');
    const completedTasks = tasks.filter(t => t.status !== 'queued' && t.status !== 'processing');

    this.renderTaskList('activeTasks', activeTasks);
    this.renderTaskList('completedTasks', completedTasks, true);
  }

  renderTaskList(containerId, tasks, isCompleted = false) {
    const container = document.getElementById(containerId);

    let filteredTasks = tasks;
    if (this.taskPriorityFilter !== 'all') {
      const filterPriority = parseInt(this.taskPriorityFilter);
      filteredTasks = tasks.filter(t => t.priority === filterPriority);
    }

    if (filteredTasks.length === 0) {
      container.innerHTML = this.getEmptyState('📋', isCompleted ? '暂无已完成任务' : '暂无进行中任务');
      return;
    }

    container.innerHTML = filteredTasks
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      })
      .map(task => {
        const printer = this.printers.find(p => p.id === task.printerId);
        const printerName = printer?.name || task.printerId;
        const priorityLabel = this.getPriorityLabel(task.priority);
        const priorityClass = `priority-${task.priority}`;

        return `
          <div class="task-item">
            <span class="task-icon">${task.status === 'processing' ? '⏳' : task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '📄'}</span>
            <div class="task-info">
              <h4>${task.documentName} <span class="priority-badge ${priorityClass}">${priorityLabel}</span></h4>
              <p>打印机: ${printerName}</p>
              <p>${this.formatTime(task.createdAt)}</p>
            </div>
            ${task.status === 'processing' ? `
              <div class="task-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${task.progress}%"></div>
                </div>
                <div class="progress-text">${task.progress}%</div>
              </div>
            ` : ''}
            <span class="task-status ${task.status}">${this.getTaskStatusText(task.status)}</span>
            ${task.status === 'queued' ? `
              <select class="task-priority-select" onchange="app.changeTaskPriority('${task.id}', this.value)">
                <option value="0" ${task.priority === 0 ? 'selected' : ''}>低</option>
                <option value="1" ${task.priority === 1 ? 'selected' : ''}>普通</option>
                <option value="2" ${task.priority === 2 ? 'selected' : ''}>高</option>
                <option value="3" ${task.priority === 3 ? 'selected' : ''}>紧急</option>
              </select>
            ` : ''}
            ${task.status === 'queued' || task.status === 'processing' ? `
              <button class="btn btn-sm btn-danger" onclick="app.cancelTask('${task.id}')">取消</button>
            ` : ''}
          </div>
        `;
      }).join('');
  }

  getPriorityLabel(priority) {
    const labels = { 0: '低', 1: '普通', 2: '高', 3: '紧急' };
    return labels[priority] || '普通';
  }

  async changeTaskPriority(taskId, priority) {
    try {
      await window.printerAPI.setTaskPriority(taskId, parseInt(priority));
      await this.loadTasks();
    } catch (error) {
      console.error('Failed to change task priority:', error);
    }
  }

  getTaskStatusText(status) {
    const statusMap = {
      queued: '排队中',
      processing: '处理中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    };
    return statusMap[status] || status;
  }

  updateTask(task) {
    const existingTask = this.tasks.get(task.id);

    if (!existingTask ||
        existingTask.status !== task.status ||
        existingTask.progress !== task.progress) {
      this.tasks.set(task.id, task);
      this.renderTasks();
      this.updateTaskBadge();
    }
  }

  updateTaskBadge() {
    const activeCount = Array.from(this.tasks.values()).filter(
      t => t.status === 'queued' || t.status === 'processing'
    ).length;
    document.getElementById('taskBadge').textContent = activeCount;
    document.getElementById('taskBadge').style.display = activeCount > 0 ? 'block' : 'none';
  }

  async loadTemplates() {
    try {
      this.templates = await window.printerAPI.getAllTemplates();
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  renderTemplates() {
    const container = document.getElementById('templateList');

    if (this.templates.length === 0) {
      container.innerHTML = this.getEmptyState('📄', '暂无打印模板');
      return;
    }

    const typeIcons = {
      label: '🏷️',
      receipt: '🧾',
      report: '📊',
      barcode: '📊',
      custom: '📄'
    };

    container.innerHTML = this.templates.map(template => `
      <div class="template-card" data-template-id="${template.id}">
        <input type="checkbox" class="template-checkbox"
          ${this.selectedTemplateIds.has(template.id) ? 'checked' : ''}
          onchange="app.toggleTemplateSelection('${template.id}', this.checked)">
        <div class="template-preview">
          ${typeIcons[template.type] || '📄'}
        </div>
        <div class="template-info">
          <h4>${template.name}</h4>
          <p>${template.width} × ${template.height} ${template.unit}</p>
        </div>
        <div class="template-actions">
          <button class="btn btn-sm btn-secondary" onclick="app.exportSingleTemplate('${template.id}')">导出</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteSingleTemplate('${template.id}')">删除</button>
        </div>
      </div>
    `).join('');
  }

  toggleTemplateSelection(templateId, checked) {
    if (checked) {
      this.selectedTemplateIds.add(templateId);
    } else {
      this.selectedTemplateIds.delete(templateId);
    }
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    this.renderAlerts();
    this.updateAlertBadge();
    this.showNotification(alert);
  }

  renderAlerts() {
    const container = document.getElementById('alertList');

    if (this.alerts.length === 0) {
      container.innerHTML = this.getEmptyState('✅', '暂无告警');
      return;
    }

    container.innerHTML = this.alerts.map(alert => `
      <div class="alert-item ${alert.severity >= 3 ? 'error' : alert.severity >= 2 ? 'warning' : 'info'}">
        <span class="alert-icon">${alert.severity >= 3 ? '❌' : alert.severity >= 2 ? '⚠️' : 'ℹ️'}</span>
        <div class="alert-content">
          <h4>${alert.type}</h4>
          <p>${alert.message}</p>
          <span class="alert-time">${this.formatTime(alert.timestamp)}</span>
        </div>
      </div>
    `).join('');
  }

  updateAlertBadge() {
    const unacknowledged = this.alerts.filter(a => !a.acknowledged).length;
    document.getElementById('alertBadge').textContent = unacknowledged;
    document.getElementById('alertBadge').style.display = unacknowledged > 0 ? 'block' : 'none';
  }

  clearAlerts() {
    this.alerts = [];
    this.renderAlerts();
    this.updateAlertBadge();
  }

  showNotification(alert) {
    if (Notification.permission === 'granted') {
      new Notification('打印机告警', {
        body: alert.message,
        icon: '🖨️'
      });
    }
  }

  showAlertDialog(data) {
    const alertIcons = {
      paper_out: '📄',
      jammed: '⚠️',
      error: '❌'
    };

    const modal = document.getElementById('alertModal');
    const title = document.getElementById('alertModalTitle');
    const body = document.getElementById('alertModalBody');

    const icon = alertIcons[data.type] || '⚠️';
    title.textContent = `${icon} ${data.title}`;
    body.innerHTML = `
      <span class="alert-icon-large">${icon}</span>
      <p>${data.message}</p>
    `;

    modal.classList.add('active');

    if (Notification.permission === 'granted') {
      new Notification(data.title, {
        body: data.message
      });
    }
  }

  closeAlertModal() {
    document.getElementById('alertModal').classList.remove('active');
  }

  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tab}-tab`);
    });
  }

  switchTaskTab(taskTab) {
    this.currentTaskTab = taskTab;

    document.querySelectorAll('.task-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.taskTab === taskTab);
    });

    document.getElementById('activeTasks').classList.toggle('hidden', taskTab !== 'active');
    document.getElementById('completedTasks').classList.toggle('hidden', taskTab !== 'completed');
  }

  updateDefaultPrinterSelect() {
    const select = document.getElementById('defaultPrinterSelect');
    select.innerHTML = this.printers.map(p =>
      `<option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${p.name}</option>`
    ).join('');
  }

  async setDefaultPrinter(printerId) {
    try {
      await window.printerAPI.setDefaultPrinter(printerId);
      await this.loadPrinters();
    } catch (error) {
      console.error('Failed to set default printer:', error);
    }
  }

  async handlePrintFile() {
    const modal = document.getElementById('printerModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = '打印文件';
    modalBody.innerHTML = `
      <div class="setting-group">
        <h3>选择文件</h3>
        <div class="setting-item">
          <label>文件路径</label>
          <span id="selectedFilePath" style="color: #666;">未选择文件</span>
          <button class="btn btn-sm btn-secondary" onclick="app.selectFileForPrint()">选择文件</button>
        </div>
        <div class="setting-item">
          <label>打印机</label>
          <select id="printTargetPrinter">
            ${this.printers.map(p => `<option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="setting-item">
          <label>优先级</label>
          <select id="printTaskPriority">
            <option value="0">低</option>
            <option value="1" selected>普通</option>
            <option value="2">高</option>
            <option value="3">紧急</option>
          </select>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  async selectFileForPrint() {
    try {
      const filePath = await window.printerAPI.openFileDialog();
      if (filePath) {
        document.getElementById('selectedFilePath').textContent = filePath;
        this._pendingFilePath = filePath;
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }

  async printToPrinter(printerId) {
    try {
      const filePath = await window.printerAPI.openFileDialog();
      if (!filePath) return;

      const documentName = filePath.split(/[\\/]/).pop();
      await window.printerAPI.addFileTask(printerId, filePath, documentName);
      await this.loadTasks();
    } catch (error) {
      console.error('Failed to print:', error);
      alert('打印失败: ' + error.message);
    }
  }

  async pausePrinter(printerId) {
    try {
      await window.printerAPI.pausePrinter(printerId);
      await this.loadPrinters();
    } catch (error) {
      console.error('Failed to pause printer:', error);
    }
  }

  async resumePrinter(printerId) {
    try {
      await window.printerAPI.resumePrinter(printerId);
      await this.loadPrinters();
    } catch (error) {
      console.error('Failed to resume printer:', error);
    }
  }

  async cancelTask(taskId) {
    try {
      await window.printerAPI.cancelTask(taskId);
      await this.loadTasks();
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }

  showPrinterDetails(printerId) {
    const printer = this.printers.find(p => p.id === printerId);
    if (!printer) return;

    const modal = document.getElementById('printerModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = printer.name;
    modalBody.innerHTML = `
      <div class="setting-group">
        <h3>基本信息</h3>
        <div class="setting-item">
          <label>名称</label>
          <span>${printer.name}</span>
        </div>
        <div class="setting-item">
          <label>型号</label>
          <span>${printer.model}</span>
        </div>
        <div class="setting-item">
          <label>制造商</label>
          <span>${printer.manufacturer}</span>
        </div>
        <div class="setting-item">
          <label>端口</label>
          <span>${printer.port}</span>
        </div>
        <div class="setting-item">
          <label>状态</label>
          <span class="printer-status ${printer.status}">${this.getStatusText(printer.status)}</span>
        </div>
        <div class="setting-item">
          <label>当前任务数</label>
          <span>${printer.jobCount}</span>
        </div>
      </div>
      <div class="setting-group">
        <h3>操作</h3>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-primary" onclick="app.printToPrinter('${printer.id}'); app.closeModal();">打印文件</button>
          ${printer.status === 'paused' ?
            `<button class="btn btn-primary" onclick="app.resumePrinter('${printer.id}'); app.closeModal();">恢复打印机</button>` :
            `<button class="btn btn-secondary" onclick="app.pausePrinter('${printer.id}'); app.closeModal();">暂停打印机</button>`
          }
          <button class="btn btn-danger" onclick="app.cancelAllJobs('${printer.id}')">取消所有任务</button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  async cancelAllJobs(printerId) {
    try {
      await window.printerAPI.cancelAllJobs(printerId);
      this.closeModal();
      await this.loadPrinters();
      await this.loadTasks();
    } catch (error) {
      console.error('Failed to cancel all jobs:', error);
    }
  }

  showAddPrinterDialog() {
    const modal = document.getElementById('printerModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = '添加打印机';
    modalBody.innerHTML = `
      <div class="setting-group">
        <h3>系统打印机</h3>
        <p style="margin-bottom: 16px; color: #666;">以下是系统中检测到的打印机:</p>
        ${this.printers.length > 0 ?
          this.printers.map(p => `
            <div style="padding: 12px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 8px;">
              <strong>${p.name}</strong>
              <p style="font-size: 12px; color: #666; margin-top: 4px;">${p.model} - ${p.port}</p>
            </div>
          `).join('') :
          '<p>未检测到打印机</p>'
        }
      </div>
      <div class="setting-group">
        <h3>手动添加</h3>
        <div class="setting-item">
          <label>打印机名称</label>
          <input type="text" id="manualPrinterName" placeholder="输入打印机名称">
        </div>
        <div class="setting-item">
          <label>IP地址/端口</label>
          <input type="text" id="manualPrinterPort" placeholder="例如: 192.168.1.100">
        </div>
        <button class="btn btn-primary" onclick="app.addManualPrinter()">添加</button>
      </div>
    `;

    modal.classList.add('active');
  }

  addManualPrinter() {
    const name = document.getElementById('manualPrinterName').value;
    const port = document.getElementById('manualPrinterPort').value;
    if (!name || !port) {
      alert('请填写打印机名称和端口');
      return;
    }
    alert(`手动添加打印机功能开发中: ${name} (${port})`);
    this.closeModal();
  }

  showCreateTemplateDialog() {
    const modal = document.getElementById('printerModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = '创建打印模板';
    modalBody.innerHTML = `
      <div class="setting-group">
        <h3>模板信息</h3>
        <div class="setting-item">
          <label>模板名称</label>
          <input type="text" id="templateName" placeholder="输入模板名称">
        </div>
        <div class="setting-item">
          <label>模板类型</label>
          <select id="templateType">
            <option value="label">标签</option>
            <option value="receipt">收据</option>
            <option value="report">报表</option>
            <option value="barcode">条码</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        <div class="setting-item">
          <label>宽度</label>
          <input type="number" id="templateWidth" value="100">
        </div>
        <div class="setting-item">
          <label>高度</label>
          <input type="number" id="templateHeight" value="50">
        </div>
        <div class="setting-item">
          <label>单位</label>
          <select id="templateUnit">
            <option value="mm">毫米</option>
            <option value="cm">厘米</option>
            <option value="inch">英寸</option>
          </select>
        </div>
        <div class="setting-item">
          <label>分辨率 (DPI)</label>
          <input type="number" id="templateDpi" value="300">
        </div>
      </div>
      <button class="btn btn-primary" onclick="app.createTemplate()">创建</button>
    `;

    modal.classList.add('active');
  }

  async createTemplate() {
    const template = {
      name: document.getElementById('templateName').value,
      type: document.getElementById('templateType').value,
      width: parseInt(document.getElementById('templateWidth').value),
      height: parseInt(document.getElementById('templateHeight').value),
      unit: document.getElementById('templateUnit').value,
      dpi: parseInt(document.getElementById('templateDpi').value),
      content: ''
    };

    if (!template.name) {
      alert('请输入模板名称');
      return;
    }

    try {
      await window.printerAPI.createTemplate(template);
      this.closeModal();
      await this.loadTemplates();
    } catch (error) {
      console.error('Failed to create template:', error);
    }
  }

  async importTemplate() {
    try {
      const filePath = await window.printerAPI.openFileDialog([
        { name: '模板文件', extensions: ['json', 'txt', 'zpl', 'epl', 'tmpl'] }
      ]);
      if (!filePath) return;

      const result = await window.printerAPI.batchImportTemplates([filePath]);
      if (result > 0) {
        await this.loadTemplates();
        alert(`成功导入 ${result} 个模板`);
      } else {
        alert('导入失败');
      }
    } catch (error) {
      console.error('Failed to import template:', error);
    }
  }

  async batchImportTemplates() {
    try {
      const filePaths = await window.printerAPI.openFilesDialog([
        { name: '模板文件', extensions: ['json', 'zpl', 'epl', 'txt', 'tmpl'] },
        { name: '所有文件', extensions: ['*'] }
      ]);
      if (!filePaths || filePaths.length === 0) return;

      const result = await window.printerAPI.batchImportTemplates(filePaths);
      await this.loadTemplates();
      alert(`批量导入完成，成功导入 ${result} 个模板`);
    } catch (error) {
      console.error('Failed to batch import templates:', error);
      alert('批量导入失败: ' + error.message);
    }
  }

  async batchExportTemplates() {
    if (this.selectedTemplateIds.size === 0) {
      alert('请先选择要导出的模板');
      return;
    }

    try {
      const directoryPath = await window.printerAPI.openDirectoryDialog();
      if (!directoryPath) return;

      const templateIds = Array.from(this.selectedTemplateIds);
      const result = await window.printerAPI.batchExportTemplates(templateIds, directoryPath);
      alert(`批量导出完成，成功导出 ${result} 个模板到 ${directoryPath}`);
      this.selectedTemplateIds.clear();
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to batch export templates:', error);
      alert('批量导出失败: ' + error.message);
    }
  }

  async exportSingleTemplate(templateId) {
    try {
      const directoryPath = await window.printerAPI.openDirectoryDialog();
      if (!directoryPath) return;

      const result = await window.printerAPI.batchExportTemplates([templateId], directoryPath);
      if (result > 0) {
        alert('模板导出成功');
      } else {
        alert('模板导出失败');
      }
    } catch (error) {
      console.error('Failed to export template:', error);
    }
  }

  async deleteSingleTemplate(templateId) {
    if (!confirm('确定要删除此模板吗？')) return;

    try {
      await window.printerAPI.deleteTemplate(templateId);
      this.selectedTemplateIds.delete(templateId);
      await this.loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }

  closeModal() {
    document.getElementById('printerModal').classList.remove('active');
  }

  refreshAll() {
    this.loadPrinters();
    this.loadTasks();
  }

  startAutoRefresh() {
    let refreshIntervalId = setInterval(() => {
      this.debouncedRefresh();
    }, 10000);

    document.getElementById('refreshInterval').addEventListener('change', (e) => {
      const newInterval = parseInt(e.target.value) || 10;
      e.target.value = newInterval;

      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
      }
      refreshIntervalId = setInterval(() => {
        this.debouncedRefresh();
      }, newInterval * 1000);
    });
  }

  debouncedRefresh() {
    if (this.isRefreshing) return;

    this.isRefreshing = true;

    Promise.all([
      this.loadPrinters(),
      this.loadTasks()
    ]).finally(() => {
      this.isRefreshing = false;
    });
  }

  getEmptyState(icon, message) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <p>${message}</p>
      </div>
    `;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PrinterManagerApp();

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});
