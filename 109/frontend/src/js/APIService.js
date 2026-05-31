export class APIService {
    constructor() {
        this.baseURL = 'http://localhost:8080/api';
        this.timeout = 30000;
    }

    async request(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`API warning: ${response.status} for ${url}`);
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    async getPointCloudData(mineId, limit = null, offset = null) {
        const params = new URLSearchParams();
        if (limit !== null) params.append('limit', limit);
        if (offset !== null) params.append('offset', offset);
        const queryString = params.toString() ? `?${params.toString()}` : '';

        try {
            return await this.request(
                `${this.baseURL}/pointcloud/data/${mineId}${queryString}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API调用失败，使用模拟数据:', error.message);
            return this.getMockPointCloudData(mineId, limit);
        }
    }

    async getPointCloudPage(mineId, pageSize = 10000, page = 0) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/page/${mineId}?pageSize=${pageSize}&page=${page}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API分页调用失败:', error.message);
            const mockData = this.getMockPointCloudData(mineId, pageSize);
            return {
                ...mockData,
                page: page,
                pageSize: pageSize,
                hasMore: page < Math.floor(mockData.total / pageSize)
            };
        }
    }

    async getPointCloudByHeightRange(mineId, minHeight, maxHeight, limit = null, offset = null) {
        const params = new URLSearchParams();
        params.append('minHeight', minHeight);
        params.append('maxHeight', maxHeight);
        if (limit !== null) params.append('limit', limit);
        if (offset !== null) params.append('offset', offset);

        try {
            return await this.request(
                `${this.baseURL}/pointcloud/range/${mineId}?${params.toString()}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API高度范围查询失败:', error.message);
            return { total: 0, points: [], hasMore: false };
        }
    }

    async getHeightRange(mineId) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/heightrange/${mineId}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API调用失败:', error.message);
            return { minHeight: -20, maxHeight: 60 };
        }
    }

    async getPointCount(mineId) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/count/${mineId}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API调用失败:', error.message);
            return { count: 0, mineId };
        }
    }

    async addPointCloudData(mineId, pointData) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/add/${mineId}`,
                { method: 'POST', body: JSON.stringify(pointData) }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async batchImportPointCloud(mineId, points) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/batch/${mineId}`,
                { method: 'POST', body: JSON.stringify(points) }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async deletePointCloudData(id) {
        try {
            return await this.request(
                `${this.baseURL}/pointcloud/${id}`,
                { method: 'DELETE' }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async getMiningAreas(mineId) {
        try {
            return await this.request(
                `${this.baseURL}/mining-area/list/${mineId}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.warn('API调用失败，使用模拟数据:', error.message);
            return this.getMockMiningAreas(mineId);
        }
    }

    async getMiningAreaById(id) {
        try {
            return await this.request(
                `${this.baseURL}/mining-area/${id}`,
                { method: 'GET' }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async createMiningArea(areaData) {
        try {
            const result = await this.request(
                `${this.baseURL}/mining-area/create`,
                { method: 'POST', body: JSON.stringify(areaData) }
            );
            return result;
        } catch (error) {
            console.warn('API调用失败，返回模拟成功:', error.message);
            return { success: true, data: areaData };
        }
    }

    async updateMiningArea(id, areaData) {
        try {
            return await this.request(
                `${this.baseURL}/mining-area/update/${id}`,
                { method: 'PUT', body: JSON.stringify(areaData) }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async deleteMiningArea(id) {
        try {
            return await this.request(
                `${this.baseURL}/mining-area/delete/${id}`,
                { method: 'DELETE' }
            );
        } catch (error) {
            console.error('API调用失败:', error);
            throw error;
        }
    }

    async loadAllPages(mineId, pageSize = 10000, onProgress = null) {
        const allPoints = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            try {
                const result = await this.getPointCloudPage(mineId, pageSize, page);

                if (result.points && result.points.length > 0) {
                    allPoints.push(...result.points);
                }

                hasMore = result.hasMore === true;

                if (onProgress) {
                    onProgress({
                        loaded: allPoints.length,
                        total: result.total,
                        page: page,
                        progress: Math.min(100, Math.round((allPoints.length / (result.total || 1)) * 100))
                    });
                }

                page++;

                if (!hasMore || (result.points && result.points.length < pageSize)) {
                    break;
                }
            } catch (error) {
                console.error(`分页加载第${page}页失败:`, error);
                break;
            }
        }

        return {
            points: allPoints,
            total: allPoints.length,
            pages: page
        };
    }

    getMockPointCloudData(mineId, limit) {
        const count = limit || 20000;
        const points = [];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * 80;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const distFromCenter = Math.sqrt(x * x + z * z);
            let y = 0;
            y += Math.sin(x * 0.05) * 10;
            y += Math.cos(z * 0.05) * 10;
            y += Math.sin((x + z) * 0.03) * 15;
            if (distFromCenter < 30) y += (30 - distFromCenter) * 0.5;
            if (distFromCenter > 50 && distFromCenter < 70) y += Math.sin((distFromCenter - 50) * 0.3) * 5;
            y += (Math.random() - 0.5) * 2;

            const heightRatio = Math.max(0, Math.min(1, (y + 20) / 80));
            let r, g, b;
            if (heightRatio < 0.2) { r = 77; g = 51; b = 25; }
            else if (heightRatio < 0.4) { r = 102; g = 89; b = 51; }
            else if (heightRatio < 0.6) { r = 89; g = 102; b = 64; }
            else if (heightRatio < 0.8) { r = 77; g = 128; b = 77; }
            else { r = 217; g = 217; b = 191; }

            points.push({ x, y, z, r, g, b, intensity: Math.random() });
        }

        return { total: 500000, points: points, hasMore: true };
    }

    getMockMiningAreas(mineId) {
        return [
            {
                id: 1, mineId, name: '北矿区开采面', description: '北部主要开采区域',
                area: 1250.5, status: 'active', operator: '张三',
                coordinates: [[116.4074, 39.9042, 25], [116.4084, 39.9042, 28], [116.4084, 39.9052, 30], [116.4074, 39.9052, 27], [116.4074, 39.9042, 25]]
            },
            {
                id: 2, mineId, name: '南矿区开采面', description: '南部辅助开采区域',
                area: 890.3, status: 'active', operator: '李四',
                coordinates: [[116.4064, 39.9022, 20], [116.4074, 39.9022, 22], [116.4074, 39.9032, 25], [116.4064, 39.9032, 23], [116.4064, 39.9022, 20]]
            }
        ];
    }
}
