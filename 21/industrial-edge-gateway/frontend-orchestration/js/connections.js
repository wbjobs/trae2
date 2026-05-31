class ConnectionManager {
    constructor(canvas) {
        this.canvas = canvas;
    }
    
    createConnection(source, target) {
        const connection = this.canvas.addConnection(
            { node: source.node, port: source.port },
            { node: target.node, port: target.port }
        );
        return connection;
    }
    
    deleteConnection(connection) {
        this.canvas.deleteConnection(connection);
    }
    
    getConnectionData(connection) {
        return {
            id: connection.id,
            source: {
                nodeId: connection.source.node.id,
                nodeName: connection.source.node.name,
                port: connection.source.port,
            },
            target: {
                nodeId: connection.target.node.id,
                nodeName: connection.target.node.name,
                port: connection.target.port,
            },
            data: connection.data,
        };
    }
    
    updateConnectionData(connection, data) {
        connection.data = { ...connection.data, ...data };
    }
    
    validateConnection(source, target) {
        if (source.node === target.node) {
            return { valid: false, error: '不能连接到同一节点' };
        }
        
        const hasConnection = this.canvas.connections.some(c => 
            c.source.node === source.node && 
            c.source.port === source.port &&
            c.target.node === target.node &&
            c.target.port === target.port
        );
        
        if (hasConnection) {
            return { valid: false, error: '该连接已存在' };
        }
        
        return { valid: true };
    }
    
    getAllConnections() {
        return this.canvas.connections.map(c => this.getConnectionData(c));
    }
    
    getConnectionsForNode(nodeId) {
        return this.canvas.connections.filter(c => 
            c.source.node.id === nodeId || c.target.node.id === nodeId
        );
    }
}