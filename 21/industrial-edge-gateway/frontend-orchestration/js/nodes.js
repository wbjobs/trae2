class NodeManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.deviceList = document.getElementById('deviceList');
        this.dataPointsList = document.getElementById('dataPointsList');
    }
    
    async loadDevices() {
        try {
            const response = await API.devices.getAll();
            const devices = response.devices || [];
            this.renderDevices(devices);
        } catch (error) {
            this.renderMockDevices();
        }
    }
    
    renderDevices(devices) {
        this.deviceList.innerHTML = '';
        devices.forEach(device => {
            const item = document.createElement('div');
            item.className = 'device-item';
            item.draggable = true;
            item.dataset.device = JSON.stringify(device);
            
            item.innerHTML = `
                <div class="device-name">${device.device_name || '未知设备'}</div>
                <div class="device-protocol">${device.protocol || 'unknown'}</div>
                <span class="device-status ${device.status === 'online' ? 'online' : 'offline'}">
                    ${device.status === 'online' ? '在线' : '离线'}
                </span>
            `;
            
            item.addEventListener('dragstart', (e) => this.onDeviceDragStart(e, device));
            item.addEventListener('dragend', (e) => this.onDragEnd(e));
            
            this.deviceList.appendChild(item);
        });
    }
    
    renderMockDevices() {
        const mockDevices = [
            { device_id: 'dev1', device_name: 'PLC控制器', protocol: 'modbus_tcp', status: 'online' },
            { device_id: 'dev2', device_name: '温度传感器', protocol: 'modbus_rtu', status: 'online' },
            { device_id: 'dev3', device_name: '变频器', protocol: 'profinet', status: 'offline' },
            { device_id: 'dev4', device_name: '电机驱动器', protocol: 'profinet', status: 'online' },
            { device_id: 'dev5', device_name: '压力变送器', protocol: 'modbus_tcp', status: 'online' },
        ];
        this.renderDevices(mockDevices);
    }
    
    renderDataPoints(points) {
        this.dataPointsList.innerHTML = '';
        points.forEach(point => {
            const item = document.createElement('div');
            item.className = 'data-point-item';
            item.draggable = true;
            item.dataset.point = JSON.stringify(point);
            
            item.innerHTML = `
                <div class="device-name">${point.point_name || point.address}</div>
                <div class="device-protocol">${point.data_type || 'float32'}</div>
            `;
            
            item.addEventListener('dragstart', (e) => this.onDataPointDragStart(e, point));
            item.addEventListener('dragend', (e) => this.onDragEnd(e));
            
            this.dataPointsList.appendChild(item);
        });
    }
    
    onDeviceDragStart(e, device) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'device',
            device: device,
        }));
        e.target.classList.add('dragging');
        
        const canvasContainer = document.getElementById('canvasContainer');
        canvasContainer.addEventListener('dragover', this.onDragOver);
        canvasContainer.addEventListener('drop', (ev) => this.onDrop(ev));
        canvasContainer.addEventListener('dragleave', this.onDragLeave);
    }
    
    onDataPointDragStart(e, point) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'datapoint',
            point: point,
        }));
        e.target.classList.add('dragging');
        
        const canvasContainer = document.getElementById('canvasContainer');
        canvasContainer.addEventListener('dragover', this.onDragOver);
        canvasContainer.addEventListener('drop', (ev) => this.onDrop(ev));
        canvasContainer.addEventListener('dragleave', this.onDragLeave);
    }
    
    onDragEnd(e) {
        e.target.classList.remove('dragging');
        const canvasContainer = document.getElementById('canvasContainer');
        canvasContainer.classList.remove('drag-over');
    }
    
    onDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    
    onDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    
    onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            const rect = this.canvas.svg.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.canvas.offsetX) / this.canvas.scale;
            const y = (e.clientY - rect.top - this.canvas.offsetY) / this.canvas.scale;
            
            if (data.type === 'device') {
                this.createDeviceNode(data.device, x, y);
            } else if (data.type === 'datapoint') {
                this.createDataPointNode(data.point, x, y);
            }
        } catch (error) {
            console.error('Drop error:', error);
        }
    }
    
    createDeviceNode(device, x, y) {
        const node = this.canvas.addNode({
            type: 'device',
            name: device.device_name || '设备',
            x: x - 80,
            y: y - 40,
            data: {
                deviceId: device.device_id,
                protocol: device.protocol,
                device: device,
            },
        });
        return node;
    }
    
    createDataPointNode(point, x, y) {
        const node = this.canvas.addNode({
            type: 'source',
            name: point.point_name || '数据点',
            x: x - 80,
            y: y - 40,
            data: {
                pointId: point.point_id,
                address: point.address,
                dataType: point.data_type,
                point: point,
            },
        });
        return node;
    }
    
    addTransformNode(x, y) {
        return this.canvas.addNode({
            type: 'transform',
            name: '数据转换',
            x: x - 80,
            y: y - 40,
            data: {
                expression: '',
            },
        });
    }
    
    addConditionNode(x, y) {
        return this.canvas.addNode({
            type: 'condition',
            name: '条件判断',
            x: x - 80,
            y: y - 40,
            data: {
                condition: '',
            },
        });
    }
    
    addStorageNode(x, y) {
        return this.canvas.addNode({
            type: 'storage',
            name: '数据存储',
            x: x - 80,
            y: y - 40,
            data: {
                bucket: '',
                measurement: '',
            },
        });
    }
    
    addTargetNode(x, y) {
        return this.canvas.addNode({
            type: 'target',
            name: '数据目标',
            x: x - 80,
            y: y - 40,
            data: {
                deviceId: '',
                pointId: '',
            },
        });
    }
}