const API = {
    baseUrl: 'http://localhost:8000',
    
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const mergedOptions = { ...defaultOptions, ...options };
        if (options.body) {
            mergedOptions.body = JSON.stringify(options.body);
        }
        
        try {
            const response = await fetch(url, mergedOptions);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API请求失败: ${url}`, error);
            throw error;
        }
    },
    
    devices: {
        getAll: () => API.request('/devices'),
        getById: (id) => API.request(`/devices/${id}`),
        register: (device) => API.request('/devices', { method: 'POST', body: device }),
        unregister: (id) => API.request(`/devices/${id}`, { method: 'DELETE' }),
        connect: (id) => API.request('/devices/connect', { method: 'POST', body: { device_id: id } }),
        disconnect: (id) => API.request('/devices/disconnect', { method: 'POST', body: { device_id: id } }),
        readPoints: (id, points) => API.request('/devices/read', { method: 'POST', body: { device_id: id, points } }),
        writePoints: (id, points) => API.request('/devices/write', { method: 'POST', body: { device_id: id, points } }),
    },
    
    rules: {
        getAll: () => API.request('/rules'),
        getById: (id) => API.request(`/rules/${id}`),
        create: (rule) => API.request('/rules', { method: 'POST', body: rule }),
        update: (id, rule) => API.request(`/rules/${id}`, { method: 'PUT', body: rule }),
        delete: (id) => API.request(`/rules/${id}`, { method: 'DELETE' }),
        execute: (id, context) => API.request('/execute', { method: 'POST', body: { rule_id: id, context } }),
    },
    
    storage: {
        getBuckets: () => API.request('/buckets'),
        createBucket: (bucket) => API.request('/buckets', { method: 'POST', body: bucket }),
        deleteBucket: (name) => API.request(`/buckets/${name}`, { method: 'DELETE' }),
        write: (data) => API.request('/write', { method: 'POST', body: data }),
        writeBatch: (data) => API.request('/write/batch', { method: 'POST', body: data }),
        query: (params) => {
            const queryString = new URLSearchParams(params).toString();
            return API.request(`/query?${queryString}`);
        },
        queryLatest: (params) => {
            const queryString = new URLSearchParams(params).toString();
            return API.request(`/query/latest?${queryString}`);
        },
    },
    
    protocols: {
        getSupported: () => API.request('/protocols'),
    },
    
    canvas: {
        get: () => API.request('/canvas'),
        save: (canvasData) => API.request('/canvas', { method: 'POST', body: { canvas: canvasData } }),
    },
    
    health: {
        check: () => API.request('/health'),
    }
};