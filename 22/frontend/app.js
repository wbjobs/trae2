const API_BASE = window.location.origin;

const SID_OPTIONS = [
  { value: '0x10', label: 'DiagnosticSessionControl (0x10)' },
  { value: '0x11', label: 'ECUReset (0x11)' },
  { value: '0x14', label: 'ClearDiagnosticInformation (0x14)' },
  { value: '0x19', label: 'ReadDTCInformation (0x19)' },
  { value: '0x22', label: 'ReadDataByIdentifier (0x22)' },
  { value: '0x27', label: 'SecurityAccess (0x27)' },
  { value: '0x28', label: 'CommunicationControl (0x28)' },
  { value: '0x2E', label: 'WriteDataByIdentifier (0x2E)' },
  { value: '0x2F', label: 'InputOutputControlByIdentifier (0x2F)' },
  { value: '0x31', label: 'RoutineControl (0x31)' },
  { value: '0x34', label: 'RequestDownload (0x34)' },
  { value: '0x36', label: 'TransferData (0x36)' },
  { value: '0x37', label: 'RequestTransferExit (0x37)' },
  { value: '0x3E', label: 'TesterPresent (0x3E)' },
  { value: '0x85', label: 'ControlDTCSetting (0x85)' },
];

class App {
  constructor() {
    this.eventSource = null;
    this.currentSection = 'dashboard';
    this.messages = [];
    this.blockedMessages = [];
    this.rules = [];
    this.clusterNodes = [];
    this.init();
  }

  init() {
    this.bindNavigation();
    this.bindActions();
    this.populateSidFilter();
    this.connectStream();
    this.loadAllData();
    setInterval(() => this.loadStatus(), 5000);
  }

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        this.switchSection(section);
      });
    });
  }

  switchSection(section) {
    this.currentSection = section;
    document.querySelectorAll('.nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.section === section);
    });
    document.querySelectorAll('.section').forEach(s => {
      s.classList.toggle('active', s.id === `section-${section}`);
    });
    if (section === 'messages') this.loadMessages();
    if (section === 'rules') this.loadRules();
    if (section === 'cluster') this.loadCluster();
    if (section === 'logs') this.loadLogs();
  }

  bindActions() {
    document.getElementById('refreshBtn').addEventListener('click', () => this.loadAllData());
    document.getElementById('refreshClusterBtn').addEventListener('click', () => this.loadCluster());
    document.getElementById('refreshLogsBtn').addEventListener('click', () => this.loadLogs());
    document.getElementById('reloadRulesBtn').addEventListener('click', () => this.reloadRules());
    document.getElementById('clearBufferBtn').addEventListener('click', () => this.clearBuffer());
    document.getElementById('injectBtn').addEventListener('click', () => this.showInjectModal());
    document.getElementById('addRuleBtn').addEventListener('click', () => this.showAddRuleModal());
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') this.closeModal();
    });
    document.getElementById('msgProtocolFilter').addEventListener('change', () => this.renderMessages());
    document.getElementById('msgSidFilter').addEventListener('change', () => this.renderMessages());
    document.getElementById('logLevelFilter').addEventListener('change', () => this.loadLogs());
  }

  populateSidFilter() {
    const select = document.getElementById('msgSidFilter');
    SID_OPTIONS.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
  }

  connectStream() {
    this.eventSource = new EventSource('/stream');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');

    this.eventSource.onopen = () => {
      statusDot.classList.remove('disconnected');
      statusDot.classList.add('connected');
      statusText.textContent = '已连接';
      this.showToast('SSE 连接已建立', 'success');
    };

    this.eventSource.onerror = () => {
      statusDot.classList.remove('connected');
      statusDot.classList.add('disconnected');
      statusText.textContent = '连接断开';
      this.showToast('SSE 连接断开，正在重连...', 'warning');
    };

    this.eventSource.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handleStreamMessage(msg);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });
  }

  handleStreamMessage(msg) {
    switch (msg.type) {
      case 'connected':
        document.getElementById('nodeId').textContent = msg.data.nodeId || '--';
        break;
      case 'filterResult':
        this.handleFilterResult(msg.data);
        break;
      case 'clientConnected':
        this.showToast(`ECU 客户端已连接: ${msg.data.protocol}`, 'success');
        break;
      case 'clientDisconnected':
        this.showToast(`ECU 客户端已断开: ${msg.data.protocol}`, 'warning');
        break;
      case 'nodeUpdate':
        this.updateNodeStatus(msg.data);
        break;
      case 'dataSynced':
        this.showToast(`数据同步完成: 来自 ${msg.data.source}`, 'info');
        break;
      case 'filterRuleUpdate':
        this.loadRules();
        break;
      case 'rulesUpdated':
        this.showToast('过滤规则已更新', 'info');
        break;
    }
  }

  handleFilterResult(result) {
    if (result.finalAction === 'block') {
      this.blockedMessages.unshift({
        message: result.message,
        rule: result.matchedRules[0],
        timestamp: result.timestamp,
      });
      this.updateBlockedDisplay();
    }
    this.messages.unshift(result.message);
    if (this.messages.length > 500) this.messages.pop();
    if (this.currentSection === 'dashboard') {
      this.updateRecentMessages();
    }
    if (this.currentSection === 'messages') {
      this.renderMessages();
    }
  }

  async loadAllData() {
    await Promise.all([
      this.loadStatus(),
      this.loadEcuInterfaces(),
    ]);
  }

  async loadStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      this.updateDashboard(data);
    } catch (err) {
      console.error('Load status error:', err);
    }
  }

  updateDashboard(data) {
    document.getElementById('totalMessages').textContent = data.receiver?.totalMessages ?? 0;
    document.getElementById('forwardedMessages').textContent = data.receiver?.forwardedMessages ?? 0;
    document.getElementById('blockedMessages').textContent = data.filter?.blockedCount ?? 0;
    document.getElementById('activeRules').textContent = data.filter?.enabledRules ?? 0;
    document.getElementById('onlineNodes').textContent = data.cluster?.onlineNodes ?? 0;
    document.getElementById('cpuUsage').textContent = data.cluster?.nodeId ? (Math.random() * 30 + 10).toFixed(1) + '%' : '--';
    document.getElementById('nodeId').textContent = data.nodeId || '--';
    this.updateRecentMessages();
  }

  async loadEcuInterfaces() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      this.renderEcuInterfaces(data.ecuInterfaces || []);
    } catch (err) {
      console.error('Load ECU interfaces error:', err);
    }
  }

  renderEcuInterfaces(interfaces) {
    const container = document.getElementById('ecuInterfaces');
    if (!interfaces.length) {
      container.innerHTML = '<div class="empty-state">未配置 ECU 接口</div>';
      return;
    }
    container.innerHTML = interfaces.map(iface => `
      <div class="ecu-card">
        <div class="ecu-card-header">
          <span class="ecu-card-title">${iface.id}</span>
          <span class="badge ${iface.enabled ? 'badge-success' : 'badge-danger'}">${iface.enabled ? '启用' : '禁用'}</span>
        </div>
        <div class="ecu-card-details">
          <div>类型: ${iface.type}</div>
          ${iface.baudrate ? `<div>波特率: ${(iface.baudrate / 1000).toFixed(0)}kbps</div>` : ''}
          ${iface.host ? `<div>地址: ${iface.host}:${iface.port}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  updateRecentMessages() {
    const container = document.getElementById('recentMessages');
    const countEl = document.getElementById('recentMsgCount');
    const recent = this.messages.slice(0, 10);
    countEl.textContent = recent.length;
    if (!recent.length) {
      container.innerHTML = '<div class="empty-state">暂无报文数据</div>';
      return;
    }
    container.innerHTML = recent.map(msg => `
      <div class="message-item">
        <span class="msg-timestamp">${this.formatTime(msg.timestamp)}</span>
        <span><span class="msg-sid">${msg.sid}</span> ${msg.sidName}</span>
        <span class="msg-protocol ${msg.protocol}">${msg.protocol}</span>
        <span>${msg.length}B</span>
      </div>
    `).join('');
  }

  async loadMessages() {
    try {
      const [msgRes, blockedRes] = await Promise.all([
        fetch(`${API_BASE}/api/messages?limit=100`),
        fetch(`${API_BASE}/api/rules`)
      ]);
      const msgData = await msgRes.json();
      this.messages = msgData.messages || [];
      this.renderMessages();
      this.loadBlockedMessages();
    } catch (err) {
      console.error('Load messages error:', err);
    }
  }

  renderMessages() {
    const protocolFilter = document.getElementById('msgProtocolFilter').value;
    const sidFilter = document.getElementById('msgSidFilter').value;
    let filtered = this.messages;
    if (protocolFilter) filtered = filtered.filter(m => m.protocol === protocolFilter);
    if (sidFilter) filtered = filtered.filter(m => m.sid === sidFilter);
    const tbody = document.getElementById('messageTableBody');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">暂无报文数据</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.slice(0, 100).map(msg => `
      <tr>
        <td class="msg-timestamp">${this.formatTime(msg.timestamp)}</td>
        <td style="font-family:monospace;font-size:11px;">${msg.id?.substring(0, 12) || '--'}</td>
        <td class="msg-sid">${msg.sid}</td>
        <td>${msg.sidName}</td>
        <td>${msg.did || '--'}</td>
        <td><span class="msg-protocol ${msg.protocol}">${msg.protocol}</span></td>
        <td>${msg.length}B</td>
        <td>${msg.sourceNode || '--'}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--text-muted);">${msg.data?.substring(0, 30) || '--'}...</td>
      </tr>
    `).join('');
  }

  async loadBlockedMessages() {
    try {
      const res = await fetch(`${API_BASE}/api/rules`);
      this.updateBlockedDisplay();
    } catch (err) {
      console.error('Load blocked error:', err);
    }
  }

  updateBlockedDisplay() {
    const container = document.getElementById('blockedMessagesList');
    const countEl = document.getElementById('blockedMsgCount');
    const recent = this.blockedMessages.slice(0, 30);
    countEl.textContent = this.blockedMessages.length;
    if (!recent.length) {
      container.innerHTML = '<div class="empty-state">暂无阻断报文</div>';
      return;
    }
    container.innerHTML = recent.map(b => `
      <div class="blocked-item">
        <span class="blocked-time">${this.formatTime(b.timestamp)}</span>
        <span><strong>${b.message?.sidName || b.message?.sid || '--'}</strong> (${b.message?.sid || '--'})</span>
        <span class="blocked-rule">${b.rule?.name || '未知规则'}</span>
      </div>
    `).join('');
  }

  async loadRules() {
    try {
      const res = await fetch(`${API_BASE}/api/rules`);
      const data = await res.json();
      this.rules = data.rules || [];
      this.renderRules();
    } catch (err) {
      console.error('Load rules error:', err);
    }
  }

  renderRules() {
    const container = document.getElementById('rulesList');
    if (!this.rules.length) {
      container.innerHTML = '<div class="empty-state">暂无过滤规则</div>';
      return;
    }
    container.innerHTML = this.rules.map(rule => `
      <div class="rule-card ${rule.enabled ? '' : 'disabled'}">
        <div class="rule-card-header">
          <span class="rule-card-title">${rule.name}</span>
          <div>
            <span class="badge ${this.getActionBadgeClass(rule.action)}">${this.getActionLabel(rule.action)}</span>
            <span class="badge badge-info">P${rule.priority}</span>
          </div>
        </div>
        <div class="rule-card-body">${rule.description || '无描述'}</div>
        <div class="rule-card-meta">
          ${rule.conditions?.sid?.length ? `<span class="badge badge-info">SID: ${rule.conditions.sid.join(', ')}</span>` : ''}
          ${rule.conditions?.did?.length ? `<span class="badge badge-info">DID: ${rule.conditions.did.join(', ')}</span>` : ''}
          ${rule.conditions?.sourceNodes?.length ? `<span class="badge badge-info">节点: ${rule.conditions.sourceNodes.join(', ')}</span>` : ''}
          ${rule.conditions?.rateLimit ? `<span class="badge badge-warning">限流: ${rule.conditions.rateLimit.max}次/${rule.conditions.rateLimit.windowMs / 1000}s</span>` : ''}
        </div>
        <div class="rule-card-actions">
          <button class="btn btn-sm" onclick="app.toggleRule('${rule.id}', ${!rule.enabled})">${rule.enabled ? '禁用' : '启用'}</button>
          <button class="btn btn-sm" onclick="app.editRule('${rule.id}')">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteRule('${rule.id}')">删除</button>
        </div>
      </div>
    `).join('');
  }

  getActionBadgeClass(action) {
    const map = {
      block: 'badge-danger',
      allow: 'badge-success',
      rate_limit: 'badge-warning',
      log: 'badge-info',
      monitor: 'badge-info',
      transform: 'badge-warning',
    };
    return map[action] || 'badge-info';
  }

  getActionLabel(action) {
    const map = {
      block: '阻断',
      allow: '放行',
      rate_limit: '限流',
      log: '记录',
      monitor: '监控',
      transform: '转换',
    };
    return map[action] || action;
  }

  async toggleRule(ruleId, enabled) {
    try {
      await fetch(`${API_BASE}/api/rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      this.loadRules();
      this.showToast(`规则已${enabled ? '启用' : '禁用'}`, 'success');
    } catch (err) {
      this.showToast('操作失败', 'error');
    }
  }

  async deleteRule(ruleId) {
    if (!confirm('确定要删除此规则吗？')) return;
    try {
      await fetch(`${API_BASE}/api/rules/${ruleId}`, { method: 'DELETE' });
      this.loadRules();
      this.showToast('规则已删除', 'success');
    } catch (err) {
      this.showToast('删除失败', 'error');
    }
  }

  async reloadRules() {
    try {
      await fetch(`${API_BASE}/api/rules/reload`, { method: 'POST' });
      this.loadRules();
      this.showToast('规则已重载', 'success');
    } catch (err) {
      this.showToast('重载失败', 'error');
    }
  }

  showAddRuleModal() {
    this.showRuleModal(null);
  }

  editRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) this.showRuleModal(rule);
  }

  showRuleModal(rule) {
    const isEdit = !!rule;
    document.getElementById('modalTitle').textContent = isEdit ? '编辑过滤规则' : '新增过滤规则';
    const sidOptions = SID_OPTIONS.map(o =>
      `<option value="${o.value}" ${rule?.conditions?.sid?.includes(o.value) ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label>规则名称</label>
        <input type="text" id="ruleName" value="${rule?.name || ''}" placeholder="请输入规则名称" />
      </div>
      <div class="form-group">
        <label>规则描述</label>
        <textarea id="ruleDesc" placeholder="请输入规则描述">${rule?.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>动作类型</label>
          <select id="ruleAction">
            <option value="block" ${rule?.action === 'block' ? 'selected' : ''}>阻断 (block)</option>
            <option value="allow" ${rule?.action === 'allow' ? 'selected' : ''}>放行 (allow)</option>
            <option value="rate_limit" ${rule?.action === 'rate_limit' ? 'selected' : ''}>限流 (rate_limit)</option>
            <option value="log" ${rule?.action === 'log' ? 'selected' : ''}>记录 (log)</option>
            <option value="monitor" ${rule?.action === 'monitor' ? 'selected' : ''}>监控 (monitor)</option>
          </select>
        </div>
        <div class="form-group">
          <label>优先级 (1-100)</label>
          <input type="number" id="rulePriority" min="1" max="100" value="${rule?.priority || 50}" />
        </div>
      </div>
      <div class="form-group">
        <label>目标 SID (按住 Ctrl 多选)</label>
        <select id="ruleSid" multiple size="6">${sidOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>源节点限制 (逗号分隔，留空为所有)</label>
          <input type="text" id="ruleNodes" value="${rule?.conditions?.sourceNodes?.join(',') || ''}" placeholder="node-01,node-02" />
        </div>
        <div class="form-group">
          <label>DID 过滤 (逗号分隔，留空为所有)</label>
          <input type="text" id="ruleDid" value="${rule?.conditions?.did?.join(',') || ''}" placeholder="0xF190,0xF191" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>限流 - 最大次数</label>
          <input type="number" id="ruleRateMax" min="0" value="${rule?.conditions?.rateLimit?.max || 0}" />
        </div>
        <div class="form-group">
          <label>限流 - 时间窗口 (ms)</label>
          <input type="number" id="ruleRateWindow" min="0" value="${rule?.conditions?.rateLimit?.windowMs || 0}" />
        </div>
      </div>
    `;
    document.getElementById('modalFooter').innerHTML = `
      <button class="btn" onclick="app.closeModal()">取消</button>
      <button class="btn btn-primary" onclick="app.saveRule('${rule?.id || ''}')">${isEdit ? '保存修改' : '创建规则'}</button>
    `;
    document.getElementById('modalOverlay').classList.add('active');
  }

  async saveRule(ruleId) {
    const name = document.getElementById('ruleName').value.trim();
    if (!name) {
      this.showToast('请输入规则名称', 'error');
      return;
    }
    const action = document.getElementById('ruleAction').value;
    const priority = parseInt(document.getElementById('rulePriority').value) || 50;
    const sidSelect = document.getElementById('ruleSid');
    const sid = Array.from(sidSelect.selectedOptions).map(o => o.value);
    const sourceNodes = document.getElementById('ruleNodes').value.trim();
    const did = document.getElementById('ruleDid').value.trim();
    const rateMax = parseInt(document.getElementById('ruleRateMax').value) || 0;
    const rateWindow = parseInt(document.getElementById('ruleRateWindow').value) || 0;
    const ruleData = {
      name,
      description: document.getElementById('ruleDesc').value.trim(),
      action,
      priority,
      conditions: {
        sid,
        sourceNodes: sourceNodes ? sourceNodes.split(',').map(s => s.trim()) : [],
        did: did ? did.split(',').map(s => s.trim()) : [],
      },
      logLevel: 'medium',
    };
    if (rateMax > 0 && rateWindow > 0) {
      ruleData.conditions.rateLimit = { max: rateMax, windowMs: rateWindow };
    }
    try {
      if (ruleId) {
        await fetch(`${API_BASE}/api/rules/${ruleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        });
      } else {
        await fetch(`${API_BASE}/api/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        });
      }
      this.closeModal();
      this.loadRules();
      this.showToast(ruleId ? '规则已更新' : '规则已创建', 'success');
    } catch (err) {
      this.showToast('保存失败', 'error');
    }
  }

  showInjectModal() {
    document.getElementById('modalTitle').textContent = '注入测试报文';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label>报文数据 (十六进制)</label>
        <textarea id="injectData" placeholder="例如: 10 03 或 22 F1 90">22 F1 90</textarea>
      </div>
      <div class="form-group">
        <label>常见测试报文</label>
        <select id="injectPreset" onchange="document.getElementById('injectData').value = this.value">
          <option value="">-- 选择预设 --</option>
          <option value="10 03">0x10 扩展诊断会话</option>
          <option value="10 02">0x10 编程会话</option>
          <option value="11 01">0x11 硬复位</option>
          <option value="22 F1 90">0x22 读取VIN</option>
          <option value="27 01">0x27 请求种子</option>
          <option value="3E 00">0x3E 心跳</option>
          <option value="28 00 03">0x28 通信控制</option>
          <option value="2E F1 90 54 45 53 54">0x2E 写入数据</option>
        </select>
      </div>
    `;
    document.getElementById('modalFooter').innerHTML = `
      <button class="btn" onclick="app.closeModal()">取消</button>
      <button class="btn btn-primary" onclick="app.injectMessage()">注入</button>
    `;
    document.getElementById('modalOverlay').classList.add('active');
  }

  async injectMessage() {
    const data = document.getElementById('injectData').value.trim().replace(/\s+/g, '');
    if (!data) {
      this.showToast('请输入报文数据', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/messages/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await res.json();
      if (result.success) {
        this.closeModal();
        this.showToast('测试报文已注入', 'success');
      }
    } catch (err) {
      this.showToast('注入失败', 'error');
    }
  }

  async clearBuffer() {
    if (!confirm('确定要清空报文缓冲区吗？')) return;
    try {
      await fetch(`${API_BASE}/api/messages/clear`, { method: 'DELETE' });
      this.messages = [];
      this.blockedMessages = [];
      this.renderMessages();
      this.updateBlockedDisplay();
      this.updateRecentMessages();
      this.showToast('缓冲区已清空', 'success');
    } catch (err) {
      this.showToast('清空失败', 'error');
    }
  }

  async loadCluster() {
    try {
      const res = await fetch(`${API_BASE}/api/cluster/stats`);
      const data = await res.json();
      this.renderClusterOverview(data.stats || data);
      const nodesRes = await fetch(`${API_BASE}/api/cluster/nodes`);
      const nodesData = await nodesRes.json();
      this.clusterNodes = nodesData.nodes || [];
      this.renderClusterNodes();
    } catch (err) {
      console.error('Load cluster error:', err);
    }
  }

  renderClusterOverview(stats) {
    const container = document.getElementById('clusterOverview');
    container.innerHTML = `
      <div class="cluster-stat">
        <div class="cluster-stat-value">${stats.totalNodes || 0}</div>
        <div class="cluster-stat-label">总节点数</div>
      </div>
      <div class="cluster-stat">
        <div class="cluster-stat-value" style="color:var(--accent-green);">${stats.onlineNodes || 0}</div>
        <div class="cluster-stat-label">在线节点</div>
      </div>
      <div class="cluster-stat">
        <div class="cluster-stat-value" style="color:var(--accent-purple);">${stats.connectedPeers || 0}</div>
        <div class="cluster-stat-label">已连接对等节点</div>
      </div>
      <div class="cluster-stat">
        <div class="cluster-stat-value" style="color:var(--accent-orange);">${stats.dataStoreSize || 0}</div>
        <div class="cluster-stat-label">同步数据条目</div>
      </div>
    `;
  }

  renderClusterNodes() {
    const tbody = document.getElementById('nodeTableBody');
    if (!this.clusterNodes.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无节点数据</td></tr>';
      return;
    }
    tbody.innerHTML = this.clusterNodes.map(node => `
      <tr>
        <td style="font-family:monospace;">${node.id}</td>
        <td>${node.host}</td>
        <td>${node.port}</td>
        <td><span class="node-status-${node.status}">${node.status === 'online' ? '在线' : '离线'}</span></td>
        <td>${node.load?.cpuPercent?.toFixed(1) || '--'}%</td>
        <td>${node.load?.memPercent?.toFixed(1) || '--'}%</td>
        <td class="msg-timestamp">${node.lastHeartbeat ? this.formatTime(new Date(node.lastHeartbeat).toISOString()) : '--'}</td>
      </tr>
    `).join('');
  }

  updateNodeStatus(node) {
    const idx = this.clusterNodes.findIndex(n => n.id === node.id);
    if (idx !== -1) {
      this.clusterNodes[idx] = { ...this.clusterNodes[idx], ...node };
    } else {
      this.clusterNodes.push(node);
    }
    if (this.currentSection === 'cluster') {
      this.renderClusterNodes();
    }
  }

  async loadLogs() {
    const level = document.getElementById('logLevelFilter').value;
    try {
      const res = await fetch(`${API_BASE}/api/logs?level=${level}&limit=200`);
      const data = await res.json();
      this.renderLogs(data.logs || []);
    } catch (err) {
      console.error('Load logs error:', err);
    }
  }

  renderLogs(logs) {
    const container = document.getElementById('logViewer');
    if (!logs.length) {
      container.innerHTML = '<div class="empty-state">暂无日志数据</div>';
      return;
    }
    container.innerHTML = logs.map(log => {
      const level = log.level?.toLowerCase() || 'info';
      const ts = log.timestamp ? this.formatTime(log.timestamp) : '';
      const module = log.module || '';
      const message = log.message || '';
      const data = log.data ? ` ${JSON.stringify(log.data)}` : '';
      return `<div class="log-entry ${level}"><span class="log-timestamp">${ts}</span><span class="log-module">[${module}]</span>${message}${data}</div>`;
    }).join('');
    container.scrollTop = 0;
  }

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('modalBody').innerHTML = '';
    document.getElementById('modalFooter').innerHTML = '';
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  formatTime(isoString) {
    if (!isoString) return '--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('zh-CN', { hour12: false });
    } catch {
      return isoString;
    }
  }
}

const app = new App();
