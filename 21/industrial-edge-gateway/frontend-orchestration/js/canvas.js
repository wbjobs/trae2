class Canvas {
    constructor(svgElement, wrapperElement) {
        this.svg = svgElement;
        this.wrapper = wrapperElement;
        this.connectionsLayer = svgElement.querySelector('#connectionsLayer');
        this.nodesLayer = svgElement.querySelector('#nodesLayer');
        
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.selectedConnection = null;
        
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        
        this.isDragging = false;
        this.isPanning = false;
        this.isConnecting = false;
        this.dragNode = null;
        this.connectionStart = null;
        this.tempConnection = null;
        
        this.gridSize = 20;
        this.showGrid = true;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.drawGrid();
        this.updateTransform();
    }
    
    setupEventListeners() {
        this.svg.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.svg.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.svg.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.svg.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.svg.addEventListener('wheel', (e) => this.onWheel(e));
        this.svg.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        
        this.svg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    onMouseDown(e) {
        const point = this.getSVGPoint(e);
        
        if (e.button === 0) {
            if (e.target.classList.contains('port')) {
                this.startConnection(e.target, point);
            } else if (e.target.closest('.node')) {
                const node = this.findNodeByElement(e.target.closest('.node'));
                if (node) {
                    this.selectNode(node);
                    this.startDrag(node, point);
                }
            } else if (e.target.closest('.connection')) {
                const connection = this.findConnectionByElement(e.target.closest('.connection'));
                if (connection) {
                    this.selectConnection(connection);
                }
            } else {
                this.clearSelection();
                this.isPanning = true;
                this.panStart = point;
            }
        } else if (e.button === 2) {
            this.isPanning = true;
            this.panStart = point;
        }
    }
    
    onMouseMove(e) {
        const point = this.getSVGPoint(e);
        
        if (this.isDragging && this.dragNode) {
            this.dragNode.x = point.x - this.dragOffset.x;
            this.dragNode.y = point.y - this.dragOffset.y;
            this.snapToGrid(this.dragNode);
            this.updateNodePosition(this.dragNode);
            this.updateConnectionsForNode(this.dragNode);
        } else if (this.isPanning) {
            this.offsetX += (point.x - this.panStart.x) * this.scale;
            this.offsetY += (point.y - this.panStart.y) * this.scale;
            this.updateTransform();
        } else if (this.isConnecting && this.tempConnection) {
            this.updateTempConnection(point);
        }
    }
    
    onMouseUp(e) {
        if (this.isConnecting) {
            const point = this.getSVGPoint(e);
            this.endConnection(point, e.target);
        }
        
        this.isDragging = false;
        this.isPanning = false;
        this.isConnecting = false;
        this.dragNode = null;
    }
    
    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const point = this.getSVGPoint(e);
        
        const newScale = Math.max(0.25, Math.min(4, this.scale * delta));
        const scaleRatio = newScale / this.scale;
        
        this.offsetX = point.x - (point.x - this.offsetX) * scaleRatio;
        this.offsetY = point.y - (point.y - this.offsetY) * scaleRatio;
        
        this.scale = newScale;
        this.updateTransform();
        this.updateZoomDisplay();
    }
    
    onDoubleClick(e) {
        const point = this.getSVGPoint(e);
        
        if (!e.target.closest('.node') && !e.target.closest('.connection')) {
            this.fitToView();
        }
    }
    
    getSVGPoint(e) {
        const rect = this.svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.offsetX) / this.scale;
        const y = (e.clientY - rect.top - this.offsetY) / this.scale;
        return { x, y };
    }
    
    updateTransform() {
        const transform = `translate(${this.offsetX}, ${this.offsetY}) scale(${this.scale})`;
        this.nodesLayer.setAttribute('transform', transform);
        this.connectionsLayer.setAttribute('transform', transform);
    }
    
    drawGrid() {
        const existingGrid = this.svg.querySelector('#gridLayer');
        if (existingGrid) existingGrid.remove();
        
        const gridLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gridLayer.id = 'gridLayer';
        
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        
        for (let x = 0; x < width; x += this.gridSize) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', 0);
            line.setAttribute('x2', x);
            line.setAttribute('y2', height);
            line.setAttribute('class', x % (this.gridSize * 5) === 0 ? 'grid-line-major' : 'grid-line');
            gridLayer.appendChild(line);
        }
        
        for (let y = 0; y < height; y += this.gridSize) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', 0);
            line.setAttribute('y1', y);
            line.setAttribute('x2', width);
            line.setAttribute('y2', y);
            line.setAttribute('class', y % (this.gridSize * 5) === 0 ? 'grid-line-major' : 'grid-line');
            gridLayer.appendChild(line);
        }
        
        this.svg.insertBefore(gridLayer, this.svg.firstChild);
    }
    
    addNode(nodeData) {
        const node = {
            id: nodeData.id || `node_${Date.now()}`,
            type: nodeData.type || 'device',
            name: nodeData.name || '新节点',
            x: nodeData.x || 100,
            y: nodeData.y || 100,
            width: nodeData.width || 160,
            height: nodeData.height || 80,
            data: nodeData.data || {},
            ports: nodeData.ports || this.getDefaultPorts(nodeData.type),
        };
        
        this.nodes.push(node);
        this.renderNode(node);
        return node;
    }
    
    getDefaultPorts(type) {
        if (type === 'source') {
            return [{ id: 'output', type: 'output', name: '输出' }];
        } else if (type === 'target') {
            return [{ id: 'input', type: 'input', name: '输入' }];
        }
        return [
            { id: 'input', type: 'input', name: '输入' },
            { id: 'output', type: 'output', name: '输出' },
        ];
    }
    
    renderNode(node) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('node', `node-${node.type}`);
        g.setAttribute('data-node-id', node.id);
        g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'node-rect');
        rect.setAttribute('width', node.width);
        rect.setAttribute('height', node.height);
        g.appendChild(rect);
        
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('class', 'node-icon');
        icon.setAttribute('x', node.width / 2);
        icon.setAttribute('y', 28);
        icon.setAttribute('text-anchor', 'middle');
        icon.textContent = this.getNodeIcon(node.type);
        g.appendChild(icon);
        
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'node-label');
        label.setAttribute('x', node.width / 2);
        label.setAttribute('y', 50);
        label.textContent = node.name;
        g.appendChild(label);
        
        const typeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        typeLabel.setAttribute('class', 'node-type');
        typeLabel.setAttribute('x', node.width / 2);
        typeLabel.setAttribute('y', 68);
        typeLabel.textContent = this.getNodeTypeName(node.type);
        g.appendChild(typeLabel);
        
        node.ports.forEach((port, index) => {
            const portG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            portG.classList.add('port');
            portG.setAttribute('data-port-id', port.id);
            portG.setAttribute('data-port-type', port.type);
            
            const portX = port.type === 'input' ? 0 : node.width;
            const portY = node.height / 2;
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'port-circle');
            circle.setAttribute('cx', portX);
            circle.setAttribute('cy', portY);
            circle.setAttribute('r', 6);
            portG.appendChild(circle);
            
            const portLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            portLabel.setAttribute('class', 'port-label');
            portLabel.setAttribute('x', portX + (port.type === 'input' ? -12 : 12));
            portLabel.setAttribute('y', portY + 4);
            portLabel.setAttribute('text-anchor', port.type === 'input' ? 'end' : 'start');
            portLabel.textContent = port.name;
            portG.appendChild(portLabel);
            
            g.appendChild(portG);
        });
        
        node.element = g;
        this.nodesLayer.appendChild(g);
        this.updateCountDisplay();
    }
    
    getNodeIcon(type) {
        const icons = {
            source: '📤',
            target: '📥',
            device: '🔧',
            transform: '🔄',
            condition: '❓',
            storage: '💾',
        };
        return icons[type] || '📦';
    }
    
    getNodeTypeName(type) {
        const names = {
            source: '数据源',
            target: '数据目标',
            device: '设备',
            transform: '转换',
            condition: '条件',
            storage: '存储',
        };
        return names[type] || type;
    }
    
    startDrag(node, point) {
        this.isDragging = true;
        this.dragNode = node;
        this.dragOffset = {
            x: point.x - node.x,
            y: point.y - node.y,
        };
    }
    
    snapToGrid(node) {
        node.x = Math.round(node.x / this.gridSize) * this.gridSize;
        node.y = Math.round(node.y / this.gridSize) * this.gridSize;
    }
    
    updateNodePosition(node) {
        if (node.element) {
            node.element.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        }
    }
    
    startConnection(portElement, point) {
        this.isConnecting = true;
        this.connectionStart = {
            node: this.findNodeByElement(portElement.closest('.node')),
            port: portElement.getAttribute('data-port-id'),
            portType: portElement.getAttribute('data-port-type'),
        };
        
        this.tempConnection = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempConnection.setAttribute('class', 'connection-temp');
        this.connectionsLayer.appendChild(this.tempConnection);
    }
    
    updateTempConnection(point) {
        if (!this.connectionStart || !this.tempConnection) return;
        
        const startPoint = this.getPortPosition(this.connectionStart.node, this.connectionStart.port);
        const path = this.createCurvePath(startPoint, point);
        this.tempConnection.setAttribute('d', path);
    }
    
    endConnection(point, target) {
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }
        
        if (target && target.classList.contains('port')) {
            const targetNode = this.findNodeByElement(target.closest('.node'));
            const targetPort = target.getAttribute('data-port-id');
            const targetPortType = target.getAttribute('data-port-type');
            
            if (targetNode && targetNode !== this.connectionStart.node) {
                this.addConnection(this.connectionStart, {
                    node: targetNode,
                    port: targetPort,
                    portType: targetPortType,
                });
            }
        }
        
        this.connectionStart = null;
    }
    
    addConnection(start, end) {
        const connection = {
            id: `conn_${Date.now()}`,
            source: { node: start.node, port: start.port },
            target: { node: end.node, port: end.port },
            data: {},
        };
        
        this.connections.push(connection);
        this.renderConnection(connection);
        this.updateCountDisplay();
        return connection;
    }
    
    renderConnection(connection) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connection');
        path.setAttribute('data-connection-id', connection.id);
        
        const startPoint = this.getPortPosition(connection.source.node, connection.source.port);
        const endPoint = this.getPortPosition(connection.target.node, connection.target.port);
        
        path.setAttribute('d', this.createCurvePath(startPoint, endPoint));
        connection.element = path;
        
        this.connectionsLayer.appendChild(path);
    }
    
    createCurvePath(start, end) {
        const dx = Math.abs(end.x - start.x) * 0.5;
        return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
    }
    
    getPortPosition(node, portId) {
        const port = node.ports.find(p => p.id === portId);
        if (!port) return { x: node.x, y: node.y };
        
        const x = port.type === 'input' ? node.x : node.x + node.width;
        const y = node.y + node.height / 2;
        return { x, y };
    }
    
    updateConnectionsForNode(node) {
        this.connections.forEach(connection => {
            if (connection.source.node === node || connection.target.node === node) {
                if (connection.element) {
                    const startPoint = this.getPortPosition(connection.source.node, connection.source.port);
                    const endPoint = this.getPortPosition(connection.target.node, connection.target.port);
                    connection.element.setAttribute('d', this.createCurvePath(startPoint, endPoint));
                }
            }
        });
    }
    
    selectNode(node) {
        this.clearSelection();
        this.selectedNode = node;
        if (node.element) {
            node.element.classList.add('selected');
        }
        this.onNodeSelected?.(node);
    }
    
    selectConnection(connection) {
        this.clearSelection();
        this.selectedConnection = connection;
        if (connection.element) {
            connection.element.classList.add('selected');
        }
        this.onConnectionSelected?.(connection);
    }
    
    clearSelection() {
        if (this.selectedNode && this.selectedNode.element) {
            this.selectedNode.element.classList.remove('selected');
        }
        if (this.selectedConnection && this.selectedConnection.element) {
            this.selectedConnection.element.classList.remove('selected');
        }
        this.selectedNode = null;
        this.selectedConnection = null;
    }
    
    findNodeByElement(element) {
        const nodeId = element.getAttribute('data-node-id');
        return this.nodes.find(n => n.id === nodeId);
    }
    
    findConnectionByElement(element) {
        const connId = element.getAttribute('data-connection-id');
        return this.connections.find(c => c.id === connId);
    }
    
    deleteSelected() {
        if (this.selectedNode) {
            this.deleteNode(this.selectedNode);
        } else if (this.selectedConnection) {
            this.deleteConnection(this.selectedConnection);
        }
    }
    
    deleteNode(node) {
        this.connections = this.connections.filter(c => {
            if (c.source.node === node || c.target.node === node) {
                if (c.element) c.element.remove();
                return false;
            }
            return true;
        });
        
        if (node.element) node.element.remove();
        this.nodes = this.nodes.filter(n => n.id !== node.id);
        this.selectedNode = null;
        this.updateCountDisplay();
    }
    
    deleteConnection(connection) {
        if (connection.element) connection.element.remove();
        this.connections = this.connections.filter(c => c.id !== connection.id);
        this.selectedConnection = null;
        this.updateCountDisplay();
    }
    
    zoomIn() {
        this.scale = Math.min(4, this.scale * 1.2);
        this.updateTransform();
        this.updateZoomDisplay();
    }
    
    zoomOut() {
        this.scale = Math.max(0.25, this.scale / 1.2);
        this.updateTransform();
        this.updateZoomDisplay();
    }
    
    fitToView() {
        if (this.nodes.length === 0) {
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
        } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.nodes.forEach(node => {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x + node.width);
                maxY = Math.max(maxY, node.y + node.height);
            });
            
            const padding = 100;
            const viewWidth = maxX - minX + padding * 2;
            const viewHeight = maxY - minY + padding * 2;
            const scaleX = this.svg.clientWidth / viewWidth;
            const scaleY = this.svg.clientHeight / viewHeight;
            
            this.scale = Math.min(scaleX, scaleY, 2);
            this.offsetX = (this.svg.clientWidth - (maxX + minX) * this.scale) / 2;
            this.offsetY = (this.svg.clientHeight - (maxY + minY) * this.scale) / 2;
        }
        
        this.updateTransform();
        this.updateZoomDisplay();
    }
    
    clear() {
        this.nodes.forEach(node => {
            if (node.element) node.element.remove();
        });
        this.connections.forEach(connection => {
            if (connection.element) connection.element.remove();
        });
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.selectedConnection = null;
        this.updateCountDisplay();
    }
    
    exportData() {
        return {
            nodes: this.nodes.map(n => ({
                id: n.id,
                type: n.type,
                name: n.name,
                x: n.x,
                y: n.y,
                width: n.width,
                height: n.height,
                data: n.data,
                ports: n.ports,
            })),
            connections: this.connections.map(c => ({
                id: c.id,
                source: { nodeId: c.source.node.id, port: c.source.port },
                target: { nodeId: c.target.node.id, port: c.target.port },
                data: c.data,
            })),
        };
    }
    
    importData(data) {
        this.clear();
        
        const nodeMap = {};
        data.nodes.forEach(nodeData => {
            const node = this.addNode(nodeData);
            nodeMap[node.id] = node;
        });
        
        data.connections.forEach(connData => {
            const sourceNode = nodeMap[connData.source.nodeId];
            const targetNode = nodeMap[connData.target.nodeId];
            
            if (sourceNode && targetNode) {
                this.addConnection(
                    { node: sourceNode, port: connData.source.port },
                    { node: targetNode, port: connData.target.port }
                );
            }
        });
    }
    
    updateZoomDisplay() {
        const zoomDisplay = document.getElementById('zoomLevel');
        if (zoomDisplay) {
            zoomDisplay.textContent = `缩放: ${Math.round(this.scale * 100)}%`;
        }
    }
    
    updateCountDisplay() {
        const nodeCount = document.getElementById('nodeCount');
        const connCount = document.getElementById('connectionCount');
        if (nodeCount) nodeCount.textContent = `节点: ${this.nodes.length}`;
        if (connCount) connCount.textContent = `连接: ${this.connections.length}`;
    }
}