class UIManager {
  constructor(app) {
    this.app = app;
    this.elements = {};
    this.currentTab = 'info';
    this.tooltipElement = null;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.initLayerPanel();
  }

  cacheElements() {
    this.elements = {
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      progressFill: document.getElementById('progress-fill'),
      fpsValue: document.getElementById('fps-value'),
      componentCount: document.getElementById('component-count'),
      collisionCount: document.getElementById('collision-count'),
      viewPosition: document.getElementById('view-position'),
      tooltip: document.getElementById('tooltip'),
      infoEmpty: document.getElementById('info-empty'),
      infoPanel: document.getElementById('info-panel'),
      infoIcon: document.getElementById('info-icon'),
      infoName: document.getElementById('info-name'),
      infoId: document.getElementById('info-id'),
      infoBasic: document.getElementById('info-basic'),
      infoGeometry: document.getElementById('info-geometry'),
      infoTechnical: document.getElementById('info-technical'),
      collisionStats: document.getElementById('collision-stats'),
      collisionList: document.getElementById('collision-list'),
      statHard: document.getElementById('stat-hard'),
      statSoft: document.getElementById('stat-soft'),
      statTotal: document.getElementById('stat-total')
    };
    this.tooltipElement = this.elements.tooltip;
  }

  bindEvents() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.currentTarget.dataset.tool;
        this.setActiveTool(tool);
        this.app.setNavigationMode(tool);
      });
    });

    document.getElementById('btn-fit').addEventListener('click', () => {
      this.app.fitView();
    });

    document.getElementById('btn-top').addEventListener('click', () => {
      this.app.setView('top');
    });

    document.getElementById('btn-front').addEventListener('click', () => {
      this.app.setView('front');
    });

    document.getElementById('btn-side').addEventListener('click', () => {
      this.app.setView('side');
    });

    document.getElementById('btn-iso').addEventListener('click', () => {
      this.app.setView('iso');
    });

    document.getElementById('btn-wireframe').addEventListener('click', (e) => {
      const active = this.app.toggleWireframe();
      e.currentTarget.classList.toggle('active', active);
    });

    document.getElementById('btn-xray').addEventListener('click', (e) => {
      const active = this.app.toggleXray();
      e.currentTarget.classList.toggle('active', active);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.setActiveTab(tab);
      });
    });

    document.getElementById('btn-detect-collision').addEventListener('click', () => {
      this.app.detectCollisions();
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      this.app.refreshData();
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      this.app.exportReport();
    });

    document.getElementById('section-position').addEventListener('input', (e) => {
      document.getElementById('section-value').textContent = `${e.target.value}%`;
      this.app.setSectionPosition(parseFloat(e.target.value));
    });

    document.getElementById('section-thickness').addEventListener('input', (e) => {
      document.getElementById('thickness-value').textContent = `${e.target.value}%`;
      this.app.setSectionThickness(parseFloat(e.target.value));
    });

    document.querySelectorAll('.axis-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.axis-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.app.setSectionAxis(e.currentTarget.dataset.axis);
      });
    });

    document.getElementById('btn-reset-section').addEventListener('click', () => {
      this.app.resetSection();
    });

    document.getElementById('btn-select-box').addEventListener('click', () => {
      this.app.toggleBoxSelection();
    });

    document.getElementById('btn-select-all').addEventListener('click', () => {
      this.app.selectAll();
    });

    document.getElementById('btn-clear-selection').addEventListener('click', () => {
      this.app.clearSelection();
    });

    document.getElementById('btn-isolate-selection').addEventListener('click', () => {
      this.app.isolateSelection();
    });

    document.getElementById('btn-hide-selection').addEventListener('click', () => {
      this.app.hideSelection();
    });

    document.getElementById('btn-export-selection').addEventListener('click', () => {
      this.app.exportSelection();
    });

    document.getElementById('btn-add-annotation').addEventListener('click', () => {
      this.app.addAnnotation();
    });

    document.getElementById('btn-anim-play').addEventListener('click', () => {
      this.app.playAnimation();
    });

    document.getElementById('btn-anim-stop').addEventListener('click', () => {
      this.app.stopAnimation();
    });

    document.getElementById('btn-anim-prev').addEventListener('click', () => {
      this.app.prevPhase();
    });

    document.getElementById('btn-anim-next').addEventListener('click', () => {
      this.app.nextPhase();
    });

    document.getElementById('anim-speed').addEventListener('input', (e) => {
      this.app.setAnimationSpeed(e.target.value);
    });

    document.getElementById('anim-timeline').addEventListener('input', (e) => {
      this.app.setAnimationTime(e.target.value);
    });
  }

  initLayerPanel() {
    const layers = this.app.layerManager?.getAllLayers() || [];
    const layerContainers = {
      structure: document.getElementById('structure-layers'),
      hvac: document.getElementById('hvac-layers'),
      plumbing: document.getElementById('plumbing-layers'),
      electrical: document.getElementById('electrical-layers'),
      fire: document.getElementById('fire-layers')
    };

    Object.entries(layerContainers).forEach(([system, container]) => {
      if (!container) return;
      
      const systemLayers = layers.filter(l => l.system === system);
      container.innerHTML = systemLayers.map(layer => `
        <div class="layer-item" data-layer="${layer.id}">
          <div class="layer-checkbox checked" data-layer="${layer.id}"></div>
          <div class="layer-color" style="background: ${layer.color}"></div>
          <span class="layer-name">${layer.name}</span>
        </div>
      `).join('');
    });

    document.querySelectorAll('.layer-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = e.currentTarget.dataset.layer;
        this.toggleLayer(layerId);
      });
    });

    document.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const layerId = e.currentTarget.dataset.layer;
        this.toggleLayer(layerId);
      });
    });
  }

  toggleLayer(layerId) {
    const checkbox = document.querySelector(`.layer-checkbox[data-layer="${layerId}"]`);
    const isVisible = !checkbox.classList.contains('checked');
    
    checkbox.classList.toggle('checked', isVisible);
    this.app.setLayerVisibility(layerId, isVisible);
  }

  setActiveTool(tool) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  setActiveTab(tab) {
    this.currentTab = tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tab}`);
    });
  }

  showLoading(text = '加载中...', progress = 0) {
    this.elements.loadingText.textContent = text;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.loadingOverlay.classList.remove('hidden');
  }

  updateLoadingProgress(progress, text = null) {
    if (text) {
      this.elements.loadingText.textContent = text;
    }
    this.elements.progressFill.style.width = `${progress}%`;
  }

  hideLoading() {
    this.elements.loadingOverlay.classList.add('hidden');
  }

  updateFPS(fps) {
    this.elements.fpsValue.textContent = Math.round(fps);
  }

  updateComponentCount(count) {
    this.elements.componentCount.textContent = count;
  }

  updateCollisionCount(count) {
    this.elements.collisionCount.textContent = count;
  }

  updateViewPosition(position) {
    this.elements.viewPosition.textContent = 
      `X: ${position.x.toFixed(2)} Y: ${position.y.toFixed(2)} Z: ${position.z.toFixed(2)}`;
  }

  showComponentInfo(componentData) {
    if (!componentData) {
      this.elements.infoEmpty.style.display = 'flex';
      this.elements.infoPanel.style.display = 'none';
      return;
    }

    this.elements.infoEmpty.style.display = 'none';
    this.elements.infoPanel.style.display = 'block';

    const systemIcons = {
      structure: '🏢',
      hvac: '❄️',
      plumbing: '💧',
      electrical: '⚡',
      fire: '🔥'
    };

    const systemColors = {
      structure: '#64748b',
      hvac: '#f97316',
      plumbing: '#06b6d4',
      electrical: '#eab308',
      fire: '#ef4444'
    };

    this.elements.infoIcon.innerHTML = systemIcons[componentData.system] || '📦';
    this.elements.infoIcon.style.background = systemColors[componentData.system] || '#64748b';
    this.elements.infoName.textContent = componentData.name;
    this.elements.infoId.textContent = `ID: ${componentData.componentId}`;

    this.elements.infoBasic.innerHTML = `
      <div class="info-item">
        <div class="label">系统类型</div>
        <div class="value">${this.getSystemName(componentData.system)}</div>
      </div>
      <div class="info-item">
        <div class="label">图层</div>
        <div class="value">${componentData.layerName || componentData.layer}</div>
      </div>
      <div class="info-item">
        <div class="label">材料</div>
        <div class="value">${componentData.material || '-'}</div>
      </div>
      <div class="info-item">
        <div class="label">状态</div>
        <div class="value">${componentData.status === 'approved' ? '已批准' : '待审核'}</div>
      </div>
    `;

    const dim = componentData.dimensions;
    this.elements.infoGeometry.innerHTML = `
      <div class="info-item">
        <div class="label">宽度</div>
        <div class="value">${(dim?.width * 1000 || 0).toFixed(0)} mm</div>
      </div>
      <div class="info-item">
        <div class="label">高度</div>
        <div class="value">${(dim?.height * 1000 || 0).toFixed(0)} mm</div>
      </div>
      <div class="info-item">
        <div class="label">长度</div>
        <div class="value">${(dim?.depth * 1000 || 0).toFixed(0)} mm</div>
      </div>
    `;

    const props = componentData.properties || {};
    const techItems = Object.entries(props).slice(0, 4);
    this.elements.infoTechnical.innerHTML = techItems.map(([key, value]) => `
      <div class="info-item">
        <div class="label">${this.getPropertyName(key)}</div>
        <div class="value">${value}</div>
      </div>
    `).join('');
  }

  getSystemName(system) {
    const names = {
      structure: '建筑结构',
      hvac: '暖通系统',
      plumbing: '给排水系统',
      electrical: '电气系统',
      fire: '消防系统'
    };
    return names[system] || system;
  }

  getPropertyName(key) {
    const names = {
      loadCapacity: '承载力',
      concreteGrade: '混凝土等级',
      reinforcement: '钢筋等级',
      airflow: '风量',
      pressure: '压力',
      insulation: '保温层',
      capacity: '容量',
      flowRate: '流量',
      diameter: '管径',
      cableCount: '电缆数',
      maxCurrent: '最大电流',
      voltage: '电压',
      power: '功率',
      standard: '执行标准'
    };
    return names[key] || key;
  }

  updateCollisionStats(stats) {
    this.elements.collisionStats.style.display = 'grid';
    this.elements.statHard.textContent = stats.hard;
    this.elements.statSoft.textContent = stats.soft;
    this.elements.statTotal.textContent = stats.total;
  }

  updateCollisionList(collisions) {
    this.elements.collisionList.innerHTML = collisions.map((collision, index) => `
      <div class="collision-item ${collision.type}" data-collision="${index}">
        <div class="collision-title">${collision.componentA.name} ↔ ${collision.componentB.name}</div>
        <div class="collision-detail">${collision.componentA.system} - ${collision.componentB.system}</div>
        <span class="collision-depth">穿透: ${collision.depth.toFixed(0)} mm</span>
      </div>
    `).join('');

    this.elements.collisionList.querySelectorAll('.collision-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.collision);
        this.app.focusOnCollision(collisions[index]);
      });
    });
  }

  showTooltip(event, content) {
    if (!this.tooltipElement) return;
    
    const safeContent = content?.replace ? content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    this.tooltipElement.innerHTML = safeContent.replace(/\n/g, '<br>');
    this.tooltipElement.classList.add('visible');
    
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const rightSidebar = document.querySelector('.right-sidebar');
    const leftSidebar = document.querySelector('.left-sidebar');
    const rightSidebarWidth = rightSidebar ? rightSidebar.offsetWidth : 0;
    const leftSidebarWidth = leftSidebar ? leftSidebar.offsetWidth : 0;
    
    const maxWidth = viewportWidth - rightSidebarWidth - 20;
    const minX = leftSidebarWidth + 10;
    
    let x = event.clientX + 18;
    let y = event.clientY + 18;
    
    const offsetX = 20;
    const offsetY = 20;
    
    if (x + tooltipRect.width > maxWidth) {
      const leftPosition = event.clientX - tooltipRect.width - offsetX;
      if (leftPosition >= minX) {
        x = leftPosition;
      } else {
        x = Math.max(minX, maxWidth - tooltipRect.width);
      }
    }
    
    if (x < minX) {
      x = event.clientX + offsetX;
    }
    
    if (y + tooltipRect.height > viewportHeight - 20) {
      y = event.clientY - tooltipRect.height - offsetY;
    }
    
    if (y < 70) {
      y = event.clientY + offsetY;
      if (y + tooltipRect.height > viewportHeight - 20) {
        y = Math.max(70, (viewportHeight - tooltipRect.height) / 2);
      }
    }
    
    this.tooltipElement.style.left = `${Math.round(x)}px`;
    this.tooltipElement.style.top = `${Math.round(y)}px`;
    this.tooltipElement.style.maxWidth = `${Math.min(300, maxWidth - minX)}px`;
  }

  hideTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.classList.remove('visible');
    }
  }
}

export default UIManager;
