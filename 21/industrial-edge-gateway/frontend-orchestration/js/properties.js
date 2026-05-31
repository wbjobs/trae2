class PropertiesPanel {
    constructor(canvas) {
        this.canvas = canvas;
        this.panel = document.getElementById('propertiesPanel');
        this.transformExpression = document.getElementById('transformExpression');
        this.triggerCondition = document.getElementById('triggerCondition');
        
        this.canvas.onNodeSelected = (node) => this.showNodeProperties(node);
        this.canvas.onConnectionSelected = (connection) => this.showConnectionProperties(connection);
        
        this.canvas.clearSelectionCallback = () => this.clearPanel();
        
        this.transformExpression.addEventListener('input', (e) => {
            if (this.canvas.selectedNode) {
                this.canvas.selectedNode.data.expression = e.target.value;
            }
        });
        
        this.triggerCondition.addEventListener('input', (e) => {
            if (this.canvas.selectedNode) {
                this.canvas.selectedNode.data.condition = e.target.value;
            }
        });
    }
    
    showNodeProperties(node) {
        this.clearPanel();
        
        let html = `
            <div class="property-group">
                <label class="property-label">节点名称</label>
                <input type="text" class="property-input" id="nodeName" value="${node.name}">
            </div>
            <div class="property-group">
                <label class="property-label">节点类型</label>
                <select class="property-select" id="nodeType">
                    <option value="source" ${node.type === 'source' ? 'selected' : ''}>数据源</option>
                    <option value="target" ${node.type === 'target' ? 'selected' : ''}>数据目标</option>
                    <option value="device" ${node.type === 'device' ? 'selected' : ''}>设备</option>
                    <option value="transform" ${node.type === 'transform' ? 'selected' : ''}>数据转换</option>
                    <option value="condition" ${node.type === 'condition' ? 'selected' : ''}>条件判断</option>
                    <option value="storage" ${node.type === 'storage' ? 'selected' : ''}>数据存储</option>
                </select>
            </div>
        `;
        
        if (node.type === 'device' && node.data.device) {
            html += `
                <div class="property-group">
                    <label class="property-label">设备ID</label>
                    <input type="text" class="property-input" value="${node.data.device.device_id || ''}" readonly>
                </div>
                <div class="property-group">
                    <label class="property-label">协议类型</label>
                    <input type="text" class="property-input" value="${node.data.device.protocol || ''}" readonly>
                </div>
            `;
        }
        
        if (node.type === 'source' && node.data.point) {
            html += `
                <div class="property-group">
                    <label class="property-label">数据点地址</label>
                    <input type="text" class="property-input" value="${node.data.point.address || ''}" readonly>
                </div>
                <div class="property-group">
                    <label class="property-label">数据类型</label>
                    <input type="text" class="property-input" value="${node.data.point.data_type || ''}" readonly>
                </div>
            `;
        }
        
        if (node.type === 'transform') {
            html += `
                <div class="property-group">
                    <label class="property-label">转换表达式</label>
                    <textarea class="property-input" id="nodeExpression" rows="3" 
                        placeholder="例如: value * 1.8 + 32">${node.data.expression || ''}</textarea>
                </div>
            `;
        }
        
        if (node.type === 'condition') {
            html += `
                <div class="property-group">
                    <label class="property-label">条件表达式</label>
                    <textarea class="property-input" id="nodeCondition" rows="3" 
                        placeholder="例如: value > 100">${node.data.condition || ''}</textarea>
                </div>
            `;
        }
        
        if (node.type === 'storage') {
            html += `
                <div class="property-group">
                    <label class="property-label">存储桶</label>
                    <input type="text" class="property-input" id="nodeBucket" 
                        value="${node.data.bucket || ''}" placeholder="输入存储桶名称">
                </div>
                <div class="property-group">
                    <label class="property-label">测量项</label>
                    <input type="text" class="property-input" id="nodeMeasurement" 
                        value="${node.data.measurement || ''}" placeholder="输入测量项名称">
                </div>
            `;
        }
        
        html += `
            <div class="property-group">
                <label class="property-label">位置 X</label>
                <input type="number" class="property-input" id="nodeX" value="${node.x}">
            </div>
            <div class="property-group">
                <label class="property-label">位置 Y</label>
                <input type="number" class="property-input" id="nodeY" value="${node.y}">
            </div>
        `;
        
        this.panel.innerHTML = html;
        
        this.setupPropertyListeners(node);
        this.showTransformPanel(node);
    }
    
    setupPropertyListeners(node) {
        const nameInput = document.getElementById('nodeName');
        const typeSelect = document.getElementById('nodeType');
        const xInput = document.getElementById('nodeX');
        const yInput = document.getElementById('nodeY');
        
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                node.name = e.target.value;
                const label = node.element.querySelector('.node-label');
                if (label) label.textContent = node.name;
            });
        }
        
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                node.type = e.target.value;
                node.element.className.baseVal = `node node-${node.type}`;
                const typeLabel = node.element.querySelector('.node-type');
                if (typeLabel) typeLabel.textContent = this.getNodeTypeName(node.type);
                this.showNodeProperties(node);
            });
        }
        
        if (xInput) {
            xInput.addEventListener('input', (e) => {
                node.x = parseFloat(e.target.value) || 0;
                this.canvas.updateNodePosition(node);
                this.canvas.updateConnectionsForNode(node);
            });
        }
        
        if (yInput) {
            yInput.addEventListener('input', (e) => {
                node.y = parseFloat(e.target.value) || 0;
                this.canvas.updateNodePosition(node);
                this.canvas.updateConnectionsForNode(node);
            });
        }
        
        const expressionInput = document.getElementById('nodeExpression');
        if (expressionInput) {
            expressionInput.addEventListener('input', (e) => {
                node.data.expression = e.target.value;
            });
        }
        
        const conditionInput = document.getElementById('nodeCondition');
        if (conditionInput) {
            conditionInput.addEventListener('input', (e) => {
                node.data.condition = e.target.value;
            });
        }
        
        const bucketInput = document.getElementById('nodeBucket');
        if (bucketInput) {
            bucketInput.addEventListener('input', (e) => {
                node.data.bucket = e.target.value;
            });
        }
        
        const measurementInput = document.getElementById('nodeMeasurement');
        if (measurementInput) {
            measurementInput.addEventListener('input', (e) => {
                node.data.measurement = e.target.value;
            });
        }
    }
    
    showConnectionProperties(connection) {
        this.clearPanel();
        
        const html = `
            <div class="property-group">
                <label class="property-label">连接ID</label>
                <input type="text" class="property-input" value="${connection.id}" readonly>
            </div>
            <div class="property-group">
                <label class="property-label">源节点</label>
                <input type="text" class="property-input" value="${connection.source.node.name}" readonly>
            </div>
            <div class="property-group">
                <label class="property-label">目标节点</label>
                <input type="text" class="property-input" value="${connection.target.node.name}" readonly>
            </div>
            <div class="property-group">
                <label class="property-label">数据转换表达式</label>
                <textarea class="property-input" id="connExpression" rows="3" 
                    placeholder="例如: value * 1.8 + 32">${connection.data.expression || ''}</textarea>
            </div>
            <div class="property-group">
                <label class="property-label">触发条件</label>
                <textarea class="property-input" id="connCondition" rows="3" 
                    placeholder="例如: value > 100">${connection.data.condition || ''}</textarea>
            </div>
        `;
        
        this.panel.innerHTML = html;
        
        const connExpression = document.getElementById('connExpression');
        if (connExpression) {
            connExpression.addEventListener('input', (e) => {
                connection.data.expression = e.target.value;
            });
        }
        
        const connCondition = document.getElementById('connCondition');
        if (connCondition) {
            connCondition.addEventListener('input', (e) => {
                connection.data.condition = e.target.value;
            });
        }
    }
    
    showTransformPanel(node) {
        this.transformExpression.value = node.data.expression || '';
        this.triggerCondition.value = node.data.condition || '';
    }
    
    clearPanel() {
        this.panel.innerHTML = '<p class="no-selection">请选择一个节点查看属性</p>';
        this.transformExpression.value = '';
        this.triggerCondition.value = '';
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
}