class DataQuery {
    constructor() {
        this.baseUrl = '/api';
        this.cache = new Map();
        this.cacheTimeout = 30000;
    }

    async fetchPipelines(filters) {
        const params = new URLSearchParams();
        if (filters) {
            if (filters.type) params.set('type', filters.type);
            if (filters.section) params.set('section', filters.section);
        }
        const url = `${this.baseUrl}/pipelines?${params.toString()}`;
        const cacheKey = url;

        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.time < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const resp = await fetch(url);
            const result = await resp.json();
            if (result.success) {
                this.cache.set(cacheKey, { data: result.data, time: Date.now() });
                return result.data;
            }
        } catch (e) {
            console.error('获取管线数据失败:', e);
        }
        return [];
    }

    async fetchPipelineById(id) {
        const url = `${this.baseUrl}/pipelines/${id}`;
        try {
            const resp = await fetch(url);
            const result = await resp.json();
            if (result.success) return result.data;
        } catch (e) {
            console.error('获取管线详情失败:', e);
        }
        return null;
    }

    async createPipeline(data) {
        try {
            const resp = await fetch(`${this.baseUrl}/pipelines`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (result.success) {
                this.invalidateCache();
                return result.data;
            }
        } catch (e) {
            console.error('创建管线失败:', e);
        }
        return null;
    }

    async updatePipeline(id, data) {
        try {
            const resp = await fetch(`${this.baseUrl}/pipelines/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (result.success) {
                this.invalidateCache();
                return result.data;
            }
        } catch (e) {
            console.error('更新管线失败:', e);
        }
        return null;
    }

    async deletePipeline(id) {
        try {
            const resp = await fetch(`${this.baseUrl}/pipelines/${id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                this.invalidateCache();
                return true;
            }
        } catch (e) {
            console.error('删除管线失败:', e);
        }
        return false;
    }

    async fetchSections() {
        const url = `${this.baseUrl}/sections`;
        try {
            const resp = await fetch(url);
            const result = await resp.json();
            if (result.success) return result.data;
        } catch (e) {
            console.error('获取区段数据失败:', e);
        }
        return [];
    }

    async fetchStats() {
        const url = `${this.baseUrl}/stats`;
        try {
            const resp = await fetch(url);
            const result = await resp.json();
            if (result.success) return result.data;
        } catch (e) {
            console.error('获取统计数据失败:', e);
        }
        return null;
    }

    invalidateCache() {
        this.cache.clear();
    }

    getTypeOptions() {
        return [
            { value: '', label: '全部类型' },
            { value: 'ventilation', label: '通风' },
            { value: 'fire_water', label: '消防水' },
            { value: 'fire_sprinkler', label: '喷淋' },
            { value: 'electrical', label: '电力' },
            { value: 'communication', label: '通信' },
            { value: 'water_supply', label: '给水' },
            { value: 'drainage', label: '排水' },
            { value: 'gas', label: '燃气' },
            { value: 'smoke_exhaust', label: '排烟' }
        ];
    }

    getTypeLabel(type) {
        const map = {
            ventilation: '通风', fire_water: '消防水', fire_sprinkler: '喷淋',
            electrical: '电力', communication: '通信', water_supply: '给水',
            drainage: '排水', gas: '燃气', smoke_exhaust: '排烟'
        };
        return map[type] || type;
    }

    getStatusLabel(status) {
        const map = { active: '在用', maintenance: '维修中', decommissioned: '停用' };
        return map[status] || status;
    }
}
