class App {
    constructor() {
        this.canvas = null;
        this.nodeManager = null;
        this.connectionManager = null;
        this.propertiesPanel = null;
        this.init();
    }
    
    init() {
        const svgElement = document.getElementById('canvasSvg');
        const wrapperElement = document.getElementById('canvasWrapper');
        
        this.canvas = new Canvas(svgElement, wrapperElement);
        this.nodeManager = new NodeManager(this.canvas);
        this.connectionManager = new ConnectionManager(this.canvas);
        this.propertiesPanel = new PropertiesPanel(this.canvas);
        
        this.setupEventListeners();
        this.nodeManager.loadDevices();
        this.checkConnection();
        this.loadFlow();
        
        setInterval(() => this.checkConnection(), 5000);
    }
    
    setupEventListeners() {
        document.getElementById('saveBtn').addEventListener('click', () => this.saveFlow());
        document.getElementById('deployBtn').addEventListener('click', () => this.deployFlow());
        
        document.getElementById('selectTool').addEventListener('click', (e) => this.setTool('select', e));
        document.getElementById('connectTool').addEventListener('click', (e) => this.setTool('connect', e));
        document.getElementById('transformTool').addEventListener('click', (e) => this.setTool('transform', e));
        
        document.getElementById('zoomInBtn').addEventListener('click', () => this.canvas.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.canvas.zoomOut());
        document.getElementById('fitBtn').addEventListener('click', () => this.canvas.fitToView());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportFlow());
        
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modalConfirm').addEventListener('click', () => this.confirmModal());
        
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        const canvasContainer = document.getElementById('canvasContainer');
        canvasContainer.addEventListener('contextmenu', (e) => this.showContextMenu(e));
        
        this.canvas.svg.addEventListener('dblclick', (e) => this.onCanvasDoubleClick(e));
    }
    
    setTool(tool, event) {
        document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
        if (event.currentTarget) {
            event.currentTarget.classList.add('active');
        }
        
        this.canvas.currentTool = tool;
        
        if (tool === 'connect') {
            this.canvas.svg.style.cursor = 'crosshair';
        } else if (tool === 'transform') {
            this.canvas.svg.style.cursor = 'cell';
        } else {
            this.canvas.svg.style.cursor = 'default';
        }
    }
    
    async checkConnection() {
        try {
            const response = await API.health.check();
            if (response.status === 'running') {
                this.updateConnectionStatus(true);
                return;
            }
        } catch (error) {
        }
        this.updateConnectionStatus(false);
    }
    
    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = '已连接';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = '未连接 (演示模式)';
        }
    }
    
    async saveFlow() {
        const flowData = this.canvas.exportData();
        
        try {
            await API.canvas.save(flowData);
            this.showToast('数据流已保存到服务器', 'success');
        } catch (error) {
            console.error('保存到服务器失败:', error);
            
            const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dataflow_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            localStorage.setItem('backupFlow', JSON.stringify(flowData));
            this.showToast('服务器保存失败, 已下载到本地', 'warning');
        }
    }
    
    async loadFlow() {
        try {
            const response = await API.canvas.get();
            if (response.canvas && response.canvas.nodes && response.canvas.nodes.length > 0) {
                this.canvas.importData(response.canvas);
                this.showToast(`已加载 ${response.canvas.nodes.length} 个节点`, 'success');
                return true;
            }
        } catch (error) {
            console.error('从服务器加载失败:', error);
            
            const backup = localStorage.getItem('backupFlow');
            if (backup) {
                try {
                    const flowData = JSON.parse(backup);
                    this.canvas.importData(flowData);
                    this.showToast('已从本地备份恢复数据流', 'warning');
                    return true;
                } catch (e) {
                    console.error('恢复本地备份失败:', e);
                }
            }
        }
        return false;
    }
    
    async deployFlow() {
        const flowData = this.canvas.exportData();
        
        const rules = this.generateRulesFromFlow(flowData);
        
        this.showModal('部署确认', `确认部署 ${rules.length} 条数据流规则?`, async () => {
            try {
                for (const rule of rules) {
                    await API.rules.create(rule);
                }
                this.showToast('数据流部署成功', 'success');
            } catch (error) {
                this.showToast('数据流部署失败, 已保存到本地', 'warning');
                localStorage.setItem('pendingRules', JSON.stringify(rules));
            }
        });
    }
    
    generateRulesFromFlow(flowData) {
        const rules = [];
        const sourceNodes = flowData.nodes.filter(n => n.type === 'source');
        
        sourceNodes.forEach(sourceNode => {
            const connections = flowData.connections.filter(c => c.source.nodeId === sourceNode.id);
            
            connections.forEach(conn => {
                const targetNode = flowData.nodes.find(n => n.id === conn.target.nodeId);
                if (targetNode) {
                    const rule = {
                        rule_name: `${sourceNode.name} → ${targetNode.name}`,
                        source_device: sourceNode.data.deviceId || sourceNode.data.pointId || '',
                        source_point: sourceNode.data.pointId || sourceNode.data.address || '',
                        target_device: targetNode.data.deviceId || '',
                        target_point: targetNode.data.pointId || '',
                        transform_expression: conn.data.expression || targetNode.data.expression || '',
                        trigger_condition: conn.data.condition || targetNode.data.condition || '',
                        direction: 'edge_to_cloud',
                        priority: 5,
                        enabled: true,
                    };
                    rules.push(rule);
                }
            });
        });
        
        return rules;
    }
    
    clearCanvas() {
        this.showModal('清空确认', '确定要清空画布吗? 所有节点和连接将被删除。', () => {
            this.canvas.clear();
            this.showToast('画布已清空', 'success');
        });
    }
    
    exportFlow() {
        const flowData = this.canvas.exportData();
        const jsonStr = JSON.stringify(flowData, null, 2);
        
        navigator.clipboard.writeText(jsonStr).then(() => {
            this.showToast('数据流已复制到剪贴板', 'success');
        }).catch(() => {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dataflow_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
    
    onKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                this.canvas.deleteSelected();
            }
        }
        
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 's') {
                e.preventDefault();
                this.saveFlow();
            } else if (e.key === 'z') {
                e.preventDefault();
            }
        }
    }
    
    showContextMenu(e) {
        e.preventDefault();
        
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        
        const node = this.canvas.findNodeByElement(e.target.closest('.node'));
        
        if (node) {
            menu.innerHTML = `
                <div class="context-menu-item" data-action="edit">编辑节点</div>
                <div class="context-menu-item" data-action="duplicate">复制节点</div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item danger" data-action="delete">删除节点</div>
            `;
        } else {
            menu.innerHTML = `
                <div class="context-menu-item" data-action="add-source">添加数据源</div>
                <div class="context-menu-item" data-action="add-transform">添加转换</div>
                <div class="context-menu-item" data-action="add-condition">添加条件</div>
                <div class="context-menu-item" data-action="add-storage">添加存储</div>
                <div class="context-menu-item" data-action="add-target">添加目标</div>
            `;
        }
        
        document.body.appendChild(menu);
        
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (ev) => {
                this.handleContextMenuAction(item.dataset.action, e);
                menu.remove();
            });
        });
        
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(ev) {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }
    
    handleContextMenuAction(action, event) {
        const rect = this.canvas.svg.getBoundingClientRect();
        const x = (event.clientX - rect.left - this.canvas.offsetX) / this.canvas.scale;
        const y = (event.clientY - rect.top - this.canvas.offsetY) / this.canvas.scale;
        
        switch (action) {
            case 'add-source':
                this.nodeManager.addSourceNode(x, y);
                break;
            case 'add-transform':
                this.nodeManager.addTransformNode(x, y);
                break;
            case 'add-condition':
                this.nodeManager.addConditionNode(x, y);
                break;
            case 'add-storage':
                this.nodeManager.addStorageNode(x, y);
                break;
            case 'add-target':
                this.nodeManager.addTargetNode(x, y);
                break;
            case 'delete':
                if (this.canvas.selectedNode) {
                    this.canvas.deleteNode(this.canvas.selectedNode);
                }
                break;
            case 'duplicate':
                if (this.canvas.selectedNode) {
                    const node = this.canvas.selectedNode;
                    this.canvas.addNode({
                        ...node,
                        id: `node_${Date.now()}`,
                        x: node.x + 20,
                        y: node.y + 20,
                    });
                }
                break;
        }
    }
    
    onCanvasDoubleClick(e) {
        const rect = this.canvas.svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.canvas.offsetX) / this.canvas.scale;
        const y = (e.clientY - rect.top - this.canvas.offsetY) / this.canvas.scale;
        
        const node = this.canvas.findNodeByElement(e.target.closest('.node'));
        
        if (!node && !e.target.closest('.connection')) {
            this.nodeManager.addSourceNode(x, y);
        }
    }
    
    showModal(title, content, onConfirm) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const confirmBtn = document.getElementById('modalConfirm');
        
        modalTitle.textContent = title;
        modalBody.innerHTML = typeof content === 'string' ? `<p>${content}</p>` : content;
        
        modal.style.display = 'flex';
        
        confirmBtn.onclick = () => {
            if (onConfirm) onConfirm();
            this.closeModal();
        };
    }
    
    closeModal() {
        document.getElementById('modal').style.display = 'none';
    }
    
    confirmModal() {
        this.closeModal();
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});