const $ = (id) => document.getElementById(id);

class GameClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.clientId = null;
    this.globalState = { inventory: [], pickedItems: [], flags: {}, unlockedScenes: ['entrance'] };
    this.selfState = { currentScene: 'entrance' };
    this.currentScene = 'entrance';
    this.itemData = null;
    this.selectedItems = new Set();
    this.craftMode = false;
    this.pendingPicks = new Set();
    this.lastPing = 0;
    this.latency = 0;
    this.version = 0;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this._initCanvas();
    this._bindUI();
    this._connect();
  }

  _initCanvas() {
    this.canvas = $('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onCanvasClick({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: false });
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._render();
  }

  _bindUI() {
    $('craftModeBtn').onclick = () => this._toggleCraftMode();
    $('craftBtn').onclick = () => this._craftSelected();
    $('craftCancelBtn').onclick = () => this._toggleCraftMode(false);
    $('hintBtn').onclick = () => this._showAllHints();
    $('saveBtn').onclick = () => this._openSaveDialog();
    $('loadBtn').onclick = () => this._openLoadDialog();
    $('resetBtn').onclick = () => this._resetGame();
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    this._setConnStatus('connecting');

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this._toast('无法连接服务器', 'error');
      this._setConnStatus('disconnected');
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this._setConnStatus('connected');
      this._send({ type: 'getState' });
    };

    this.ws.onmessage = (e) => {
      try {
        this._handleMessage(JSON.parse(e.data));
      } catch (err) {
        console.error('消息解析失败:', err);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._setConnStatus('disconnected');
      this._toast('与服务器断开连接，3秒后重连...', 'error');
      setTimeout(() => this._connect(), 3000);
    };

    this.ws.onerror = () => this._setConnStatus('disconnected');
  }

  _setConnStatus(s) {
    const dot = $('connDot');
    const text = $('connText');
    dot.className = 'conn-dot';
    if (s === 'connected') {
      dot.classList.add('connected');
      text.textContent = `已连接 ${this.latency > 0 ? `(${this.latency}ms)` : ''}`;
    } else if (s === 'connecting') {
      dot.classList.add('connecting');
      text.textContent = '连接中...';
    } else {
      text.textContent = '已断开';
    }
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  _applyDelta(delta) {
    if (!delta || typeof delta !== 'object') return;
    if (delta.inventory) this.globalState.inventory = delta.inventory;
    if (delta.pickedItems) this.globalState.pickedItems = delta.pickedItems;
    if (delta.flags) this.globalState.flags = delta.flags;
    if (delta.unlockedScenes) this.globalState.unlockedScenes = delta.unlockedScenes;
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'ping':
        this.lastPing = msg.t;
        this._send({ type: 'pong' });
        break;
      case 'pong':
        this.latency = Date.now() - this.lastPing;
        this._setConnStatus('connected');
        break;
      case 'welcome':
        this.clientId = msg.clientId;
        this.globalState = msg.state;
        this.selfState = msg.self;
        if (msg.self?.currentScene) this.currentScene = msg.self.currentScene;
        if (msg.version) this.version = msg.version;
        this.itemData = msg.itemData;
        this._render();
        this._updateInventoryUI();
        break;
      case 'stateUpdate':
        if (msg.state) this.globalState = msg.state;
        if (msg.self) {
          this.selfState = msg.self;
          if (msg.self.currentScene) this.currentScene = msg.self.currentScene;
        }
        if (msg.itemData) this.itemData = msg.itemData;
        if (msg.version) this.version = msg.version;
        this._render();
        this._updateInventoryUI();
        break;
      case 'deltaUpdate':
        this._applyDelta(msg.delta);
        if (msg.self?.currentScene) this.currentScene = msg.self.currentScene;
        if (msg.events) this._handleEvents(msg.events);
        if (msg.version) this.version = msg.version;
        this._render();
        this._updateInventoryUI();
        break;
      case 'hint':
        if (msg.hint) this._toast(`💡 ${msg.hint}`, 'info');
        else this._toast('没有更多线索了', 'info');
        break;
      case 'pickUpSuccess':
        this.pendingPicks.delete(msg.itemId);
        this._toast(`✅ 获得: ${msg.item?.name || msg.itemId}`, 'success');
        if (msg.events) this._handleEvents(msg.events);
        break;
      case 'pickUpFailed':
        this.pendingPicks.delete(msg.itemId);
        this._toast(`拾取失败: ${msg.reason}`, 'error');
        break;
      case 'itemPicked':
        if (msg.by !== this.clientId) this._toast(`👤 ${msg.by} 拾取了物品`, 'info');
        break;
      case 'moveSuccess':
        this.currentScene = msg.sceneId;
        this._toast(`🚪 进入 ${msg.scene?.name || msg.sceneId}`, 'info');
        this._render();
        break;
      case 'moveFailed':
        this._toast(`无法移动: ${msg.reason}`, 'error');
        break;
      case 'craftSuccess':
        this._toast(`🔧 合成成功: ${msg.resultName || msg.result}`, 'success');
        if (msg.events) this._handleEvents(msg.events);
        this.selectedItems.clear();
        this._updateCraftUI();
        break;
      case 'craftFailed':
        this._toast(`合成失败: ${msg.reason}`, 'error');
        break;
      case 'playerJoined':
        this._toast(`${msg.clientId} 加入了游戏`, 'info');
        break;
      case 'playerLeft':
        this._toast(`${msg.clientId} 离开了游戏`, 'info');
        break;
      case 'gameLoaded':
        this._toast('📂 游戏已读取', 'success');
        break;
      case 'loadFailed':
        this._toast(`读取失败: ${msg.reason}`, 'error');
        break;
      case 'saveResult':
        if (msg.success) {
          this._toast(`💾 ${msg.message || '存档成功'}`, 'success');
          this._closeDialog();
        } else {
          this._toast(`存档失败: ${msg.message || msg.error}`, 'error');
        }
        break;
      case 'saveList':
        this._renderSaveList(msg);
        break;
      case 'deleteResult':
        this._send({ type: 'listSaves' });
        this._toast('存档已删除', 'info');
        break;
      case 'gameReset':
        this.currentScene = 'entrance';
        this._toast('🔄 游戏已重置', 'info');
        this.selectedItems.clear();
        this._toggleCraftMode(false);
        break;
      case 'chat':
        this._toast(`${msg.from}: ${msg.text}`, 'info');
        break;
      case 'error':
        this._toast(`错误: ${msg.error}`, 'error');
        break;
    }
  }

  _handleEvents(events) {
    if (!Array.isArray(events)) return;
    for (const ev of events) {
      if (ev.effect?.type === 'hint' && ev.effect.message) {
        this._toast(`📜 ${ev.effect.message}`, 'info');
      }
    }
  }

  _render() {
    if (!this.globalState || !this.itemData) return;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);
    const scene = this.itemData.scenes[this.currentScene];
    if (!scene) return;

    const bg = scene.background || '#1a1a2e';
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, this._darken(bg, 30));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    $('sceneTitle').textContent = scene.name;
    $('sceneDesc').textContent = scene.desc;

    this._drawDecor(ctx, w, h);

    for (const item of this._getVisibleItems()) {
      if (item.position) this._drawItem(ctx, item);
    }

    this._drawExits(ctx, w, h, scene);

    if (this.pendingPicks.size > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  _darken(hex, p) {
    const n = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * p);
    return `rgb(${Math.max(0, (n >> 16) - amt)},${Math.max(0, ((n >> 8) & 0x00FF) - amt)},${Math.max(0, (n & 0x0000FF) - amt)})`;
  }

  _drawDecor(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      ctx.arc((i * 137 + 50) % w, (i * 89 + 30) % (h - 100), 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawItem(ctx, item) {
    const x = item.position.x;
    const y = item.position.y;
    const t = Date.now() / 1000;
    const bob = Math.sin(t * 2 + x * 0.01) * 3;

    ctx.save();
    const glow = ctx.createRadialGradient(x, y + bob, 0, x, y + bob, 40);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
    glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y + bob, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, x, y + bob);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(item.name, x, y + bob + 30);
    ctx.restore();
  }

  _drawExits(ctx, w, h, scene) {
    if (!scene.exits) return;
    const pos = {
      north: { x: w / 2, y: 50, label: '↑ 北' },
      south: { x: w / 2, y: h - 160, label: '↓ 南' },
      east: { x: w - 50, y: h / 2 - 50, label: '东 →' },
      west: { x: 50, y: h / 2 - 50, label: '← 西' }
    };

    const exits = this._getExits();
    const m = {};
    exits.forEach(e => m[e.targetScene] = e);

    ctx.save();
    for (const [dir, targetId] of Object.entries(scene.exits)) {
      const p = pos[dir];
      if (!p) continue;
      const info = m[targetId];
      const can = info?.canEnter ?? true;
      const name = this.itemData.scenes[targetId]?.name || targetId;

      ctx.fillStyle = can ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.5)';
      ctx.strokeStyle = can ? '#4caf50' : '#f44336';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - 40, p.y - 18, 80, 36, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${p.label} ${name}`, p.x, p.y);
    }
    ctx.restore();
  }

  _getVisibleItems() {
    const scene = this.itemData.scenes[this.currentScene];
    if (!scene?.items) return [];
    return scene.items
      .filter(id => !this.globalState.pickedItems.includes(id))
      .filter(id => !this.pendingPicks.has(id))
      .map(id => this.itemData.items[id])
      .filter(Boolean);
  }

  _getExits() {
    const scene = this.itemData.scenes[this.currentScene];
    if (!scene?.exits) return [];
    return Object.entries(scene.exits).map(([dir, id]) => {
      const t = this.itemData.scenes[id];
      return {
        direction: dir, targetScene: id, targetName: t?.name || id,
        unlocked: this.globalState.unlockedScenes.includes(id),
        canEnter: !t?.locked || this.globalState.inventory.includes(t.requiredItem)
      };
    });
  }

  _onCanvasClick(e) {
    if (!this.globalState || !this.itemData) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const scene = this.itemData.scenes[this.currentScene];
    if (!scene?.exits) return;
    const w = r.width, h = r.height;

    const pos = {
      north: { x: w / 2, y: 50 },
      south: { x: w / 2, y: h - 160 },
      east: { x: w - 50, y: h / 2 - 50 },
      west: { x: 50, y: h / 2 - 50 }
    };

    for (const [dir, targetId] of Object.entries(scene.exits)) {
      const p = pos[dir];
      if (!p) continue;
      if (x >= p.x - 40 && x <= p.x + 40 && y >= p.y - 18 && y <= p.y + 18) {
        this._send({ type: 'moveTo', sceneId: targetId });
        return;
      }
    }

    for (const item of this._getVisibleItems()) {
      if (!item.position) continue;
      const dx = x - item.position.x, dy = y - item.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 30) {
        this.pendingPicks.add(item.id);
        this._render();
        this._send({ type: 'pickUp', itemId: item.id });
        return;
      }
    }
  }

  _updateInventoryUI() {
    const c = $('inventory');
    const n = $('invCount');
    if (!this.globalState) {
      c.innerHTML = '';
      n.textContent = '(0)';
      return;
    }

    n.textContent = `(${this.globalState.inventory.length})`;
    c.innerHTML = this.globalState.inventory.map(id => {
      const item = this.itemData?.items?.[id];
      if (!item) return '';
      const sel = this.selectedItems.has(id);
      return `<div class="inventory-item ${sel ? 'selected' : ''}" data-id="${id}">${item.icon}<div class="tooltip">${item.name}<br><small style="color:#aaa">${item.desc}</small></div></div>`;
    }).join('');

    c.querySelectorAll('.inventory-item').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        if (this.craftMode) {
          if (this.selectedItems.has(id)) this.selectedItems.delete(id);
          else if (this.selectedItems.size < 5) this.selectedItems.add(id);
          this._updateCraftUI();
        } else {
          this._send({ type: 'requestHint', itemId: id });
        }
        this._updateInventoryUI();
      };
    });
  }

  _toggleCraftMode(force) {
    this.craftMode = force !== undefined ? force : !this.craftMode;
    const panel = $('craftPanel');
    const btn = $('craftModeBtn');
    if (this.craftMode) {
      panel.classList.add('active');
      btn.style.borderColor = '#ff9800';
      btn.style.color = '#ff9800';
      this.selectedItems.clear();
    } else {
      panel.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.color = '';
      this.selectedItems.clear();
    }
    this._updateInventoryUI();
    this._updateCraftUI();
  }

  _updateCraftUI() {
    const slots = $('craftSlots');
    slots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'craft-slot';
      const id = Array.from(this.selectedItems)[i];
      if (id) {
        slot.classList.add('filled');
        slot.textContent = this.itemData?.items?.[id]?.icon || '?';
        slot.onclick = () => {
          this.selectedItems.delete(id);
          this._updateCraftUI();
          this._updateInventoryUI();
        };
      }
      slots.appendChild(slot);
    }
    $('craftBtn').disabled = this.selectedItems.size < 2;
  }

  _craftSelected() {
    if (this.selectedItems.size < 2) return;
    this._send({ type: 'craft', ingredients: Array.from(this.selectedItems) });
  }

  _showAllHints() {
    if (this.globalState.inventory.length === 0) {
      this._toast('背包是空的，先去收集一些道具吧！', 'info');
      return;
    }
    const hints = [];
    for (const id of this.globalState.inventory) {
      const item = this.itemData?.items?.[id];
      if (item?.hints?.[0]) hints.push(`${item.icon} ${item.name}: ${item.hints[0]}`);
    }
    if (hints.length > 0) {
      this._showDialog(`
        <h2>💡 线索提示</h2>
        <div style="font-size:13px;line-height:1.8">
          ${hints.map(h => `<div>• ${h}</div>`).join('')}
        </div>
        <div class="dialog-actions"><button class="btn" onclick="gameClient._closeDialog()">知道了</button></div>
      `);
    }
  }

  _openSaveDialog() {
    this._send({ type: 'listSaves' });
    this._showDialog(`
      <h2>💾 保存游戏</h2>
      <div class="input-row"><input type="text" id="slotInput" placeholder="存档名称" value="autosave"></div>
      <h3>存档模式</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px;font-size:13px;">
        <label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="sm" value="both" checked> 本地+云端</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="sm" value="local"> 仅本地</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="sm" value="cloud"> 仅云端</label>
      </div>
      <div id="saveListContainer"></div>
      <div class="dialog-actions">
        <button class="btn" id="saveOkBtn">保存</button>
        <button class="btn secondary" id="closeDlgBtn">关闭</button>
      </div>
    `, () => {
      $('saveOkBtn').onclick = () => {
        const slot = $('slotInput').value.trim() || 'autosave';
        const mode = document.querySelector('input[name="sm"]:checked').value;
        this._send({ type: 'saveGame', slotId: slot, mode });
      };
      $('closeDlgBtn').onclick = () => this._closeDialog();
    });
  }

  _openLoadDialog() {
    this._send({ type: 'listSaves' });
    this._showDialog(`
      <h2>📂 读取存档</h2>
      <h3>读取优先</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px;font-size:13px;">
        <label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="lp" value="local" checked> 本地优先</label>
        <label style="display:flex;align-items:center;gap:4px;"><input type="radio" name="lp" value="cloud"> 云端优先</label>
      </div>
      <div id="saveListContainer"><div style="text-align:center;color:#888;padding:20px;">加载中...</div></div>
      <div class="dialog-actions"><button class="btn secondary" id="closeDlgBtn">关闭</button></div>
    `, () => {
      $('closeDlgBtn').onclick = () => this._closeDialog();
    });
  }

  _renderSaveList(msg) {
    const c = $('saveListContainer');
    if (!c) return;
    const all = [];
    (msg.local || []).forEach(s => all.push({ ...s, type: '本地' }));
    (msg.cloud || []).forEach(s => {
      if (!all.find(a => a.slotId === s.slotId && a.type === '云端')) all.push({ ...s, type: '云端' });
    });
    if (all.length === 0) {
      c.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无存档</div>';
      return;
    }
    const isLoad = document.querySelector('#dialog h2')?.textContent.includes('读取');
    c.innerHTML = '<div class="save-list">' + all.map(s => `
      <div class="save-item">
        <div class="info">
          <div class="name">${s.slotId} <small style="color:#888;">[${s.type}]</small></div>
          <div class="meta">场景: ${s.scene} | 物品: ${s.inventoryCount}件 | ${new Date(s.savedAt).toLocaleString()}</div>
        </div>
        <div class="actions">
          ${isLoad ? `<button onclick="gameClient._loadSave('${s.slotId}')">读取</button>` : ''}
          <button class="del" onclick="gameClient._deleteSave('${s.slotId}')">删除</button>
        </div>
      </div>
    `).join('') + '</div>';
  }

  _loadSave(slotId) {
    const pref = document.querySelector('input[name="lp"]:checked')?.value || 'local';
    this._send({ type: 'loadGame', slotId, prefer: pref });
  }

  _deleteSave(slotId) {
    if (confirm(`删除存档 "${slotId}"？`)) this._send({ type: 'deleteSave', slotId });
  }

  _resetGame() {
    if (confirm('确定重置游戏？所有进度将丢失！')) this._send({ type: 'resetGame' });
  }

  _showDialog(html, onMount) {
    $('dialog').innerHTML = html;
    $('dialogOverlay').classList.add('active');
    if (onMount) onMount();
  }

  _closeDialog() {
    $('dialogOverlay').classList.remove('active');
  }

  _toast(text, type = 'info') {
    const c = $('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = text;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  start() {
    this._loop();
  }

  _loop() {
    this._render();
    requestAnimationFrame(() => this._loop());
  }
}

const gameClient = new GameClient();
gameClient.start();
window.gameClient = gameClient;