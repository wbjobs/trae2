import axios from 'axios';

export class InspectionAPI {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.mockData = this.initMockData();
    this.useMock = true;
  }

  initMockData() {
    return {
      bridges: [
        {
          id: 'bridge_001',
          name: '长江大桥',
          location: '湖北省武汉市',
          length: 100,
          width: 12,
          type: '连续梁桥',
          buildYear: 2010,
          lastInspection: '2026-05-20',
          condition: 'good',
          description: '跨越长江的高速公路桥梁'
        }
      ],
      bearings: Array.from({ length: 14 }, (_, i) => ({
        id: `bearing_${Math.floor(i / 2) - 3}_${i % 2 === 0 ? -1 : 1}`,
        bridgeId: 'bridge_001',
        type: '板式橡胶支座',
        model: 'GJZ200x300x42',
        installationDate: '2010-06-15',
        lastInspection: '2026-05-20',
        condition: i % 3 === 0 ? 'warning' : 'good',
        designLoad: 5000,
        currentLoad: 1000 + Math.random() * 1000,
        position: {
          x: (i % 2 === 0 ? -1 : 1) * 1.5,
          y: 5.4,
          z: (Math.floor(i / 2) - 3) * 15
        }
      })),
      guardrails: Array.from({ length: 51 * 2 }, (_, i) => ({
        id: `guardrail_${i}`,
        bridgeId: 'bridge_001',
        type: '波形护栏',
        material: 'Q235钢材',
        installationDate: '2010-06-20',
        lastInspection: '2026-05-18',
        condition: i % 20 === 0 ? 'poor' : 'good',
        position: {
          x: (i < 51 ? -1 : 1) * 5.5,
          y: 5.6,
          z: -50 + (i % 51) * 2
        }
      })),
      diseases: [
        {
          id: 'disease_001',
          bridgeId: 'bridge_001',
          componentType: 'bearing',
          componentId: 'bearing_-2_-1',
          type: 'crack',
          severity: 'moderate',
          description: '支座橡胶层出现横向裂缝',
          length: 15,
          width: 2,
          depth: 0.5,
          position: { x: -1.5, y: 5.4, z: -30 },
          discoveryDate: '2026-05-10',
          inspector: '张三',
          status: 'pending',
          repairSuggestion: '建议更换支座',
          images: ['/images/crack_001.jpg']
        },
        {
          id: 'disease_002',
          bridgeId: 'bridge_001',
          componentType: 'guardrail',
          componentId: 'guardrail_15',
          type: 'deformation',
          severity: 'minor',
          description: '护栏立柱轻微变形',
          position: { x: -5.5, y: 5.6, z: -20 },
          discoveryDate: '2026-05-12',
          inspector: '李四',
          status: 'pending',
          repairSuggestion: '建议校直修复',
          images: ['/images/deform_001.jpg']
        },
        {
          id: 'disease_003',
          bridgeId: 'bridge_001',
          componentType: 'deck',
          componentId: 'deck_segment_8',
          type: 'spalling',
          severity: 'severe',
          description: '桥面混凝土剥落，面积约0.5平方米',
          area: 0.5,
          position: { x: 0, y: 5, z: -10 },
          discoveryDate: '2026-05-15',
          inspector: '王五',
          status: 'repairing',
          repairSuggestion: '建议凿除破损部分，重新浇筑混凝土',
          images: ['/images/spalling_001.jpg', '/images/spalling_002.jpg']
        },
        {
          id: 'disease_004',
          bridgeId: 'bridge_001',
          componentType: 'bearing',
          componentId: 'bearing_1_1',
          type: 'corrosion',
          severity: 'moderate',
          description: '支座钢板锈蚀',
          area: 0.1,
          position: { x: 1.5, y: 5.4, z: 15 },
          discoveryDate: '2026-05-18',
          inspector: '张三',
          status: 'pending',
          repairSuggestion: '建议除锈防腐处理',
          images: ['/images/corrosion_001.jpg']
        },
        {
          id: 'disease_005',
          bridgeId: 'bridge_001',
          componentType: 'guardrail',
          componentId: 'guardrail_85',
          type: 'missing',
          severity: 'severe',
          description: '护栏连接螺栓缺失',
          position: { x: 5.5, y: 5.6, z: 18 },
          discoveryDate: '2026-05-20',
          inspector: '李四',
          status: 'repaired',
          repairSuggestion: '已补充螺栓',
          images: ['/images/missing_001.jpg']
        }
      ],
      inspections: [
        {
          id: 'inspection_001',
          bridgeId: 'bridge_001',
          date: '2026-05-20',
          inspector: '张三',
          type: 'routine',
          weather: '晴',
          temperature: 25,
          description: '月度常规巡检',
          diseasesFound: 5,
          diseasesRepaired: 1,
          status: 'completed'
        },
        {
          id: 'inspection_002',
          bridgeId: 'bridge_001',
          date: '2026-04-20',
          inspector: '李四',
          type: 'routine',
          weather: '多云',
          temperature: 20,
          description: '月度常规巡检',
          diseasesFound: 3,
          diseasesRepaired: 3,
          status: 'completed'
        },
        {
          id: 'inspection_003',
          bridgeId: 'bridge_001',
          date: '2026-03-20',
          inspector: '王五',
          type: 'special',
          weather: '小雨',
          temperature: 15,
          description: '季度专项检测',
          diseasesFound: 8,
          diseasesRepaired: 6,
          status: 'completed'
        }
      ],
      stressHistory: Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString(),
        bearingId: 'bearing_0_-1',
        stress: 80 + Math.sin(i / 3) * 30 + Math.random() * 10
      }))
    };
  }

  async request(method, endpoint, data = null) {
    if (this.useMock) {
      return this.mockRequest(method, endpoint, data);
    }

    try {
      const response = await this.httpClient.request({
        method,
        url: endpoint,
        data
      });
      return response.data;
    } catch (error) {
      console.error(`API请求失败 [${method} ${endpoint}]:`, error);
      throw error;
    }
  }

  async mockRequest(method, endpoint, data) {
    await new Promise(resolve => setTimeout(resolve, 200));

    const urlParts = endpoint.split('/').filter(p => p);

    if (endpoint.startsWith('/bridges')) {
      if (method === 'GET') {
        if (urlParts.length === 1) {
          return { success: true, data: this.mockData.bridges };
        } else {
          const bridgeId = urlParts[1];
          const bridge = this.mockData.bridges.find(b => b.id === bridgeId);
          return { success: true, data: bridge };
        }
      }
    }

    if (endpoint.startsWith('/bearings')) {
      if (method === 'GET') {
        if (urlParts.length === 1) {
          const bridgeId = data?.bridgeId || 'bridge_001';
          const bearings = this.mockData.bearings.filter(b => b.bridgeId === bridgeId);
          return { success: true, data: bearings };
        } else {
          const bearingId = urlParts[1];
          const bearing = this.mockData.bearings.find(b => b.id === bearingId);
          return { success: true, data: bearing };
        }
      }
    }

    if (endpoint.startsWith('/guardrails')) {
      if (method === 'GET') {
        const bridgeId = data?.bridgeId || 'bridge_001';
        const guardrails = this.mockData.guardrails.filter(g => g.bridgeId === bridgeId);
        return { success: true, data: guardrails };
      }
    }

    if (endpoint.startsWith('/diseases')) {
      if (method === 'GET') {
        if (urlParts.length === 1) {
          const bridgeId = data?.bridgeId || 'bridge_001';
          let diseases = this.mockData.diseases.filter(d => d.bridgeId === bridgeId);

          if (data?.componentType) {
            diseases = diseases.filter(d => d.componentType === data.componentType);
          }
          if (data?.severity) {
            diseases = diseases.filter(d => d.severity === data.severity);
          }
          if (data?.status) {
            diseases = diseases.filter(d => d.status === data.status);
          }

          return { success: true, data: diseases };
        } else {
          const diseaseId = urlParts[1];
          const disease = this.mockData.diseases.find(d => d.id === diseaseId);
          return { success: true, data: disease };
        }
      }

      if (method === 'POST') {
        const newDisease = {
          ...data,
          id: `disease_${String(this.mockData.diseases.length + 1).padStart(3, '0')}`,
          discoveryDate: new Date().toISOString().split('T')[0],
          status: 'pending'
        };
        this.mockData.diseases.push(newDisease);
        return { success: true, data: newDisease };
      }

      if (method === 'PUT') {
        const diseaseId = urlParts[1];
        const index = this.mockData.diseases.findIndex(d => d.id === diseaseId);
        if (index !== -1) {
          this.mockData.diseases[index] = { ...this.mockData.diseases[index], ...data };
          return { success: true, data: this.mockData.diseases[index] };
        }
      }

      if (method === 'DELETE') {
        const diseaseId = urlParts[1];
        const index = this.mockData.diseases.findIndex(d => d.id === diseaseId);
        if (index !== -1) {
          this.mockData.diseases.splice(index, 1);
          return { success: true };
        }
      }
    }

    if (endpoint.startsWith('/inspections')) {
      if (method === 'GET') {
        if (urlParts.length === 1) {
          const bridgeId = data?.bridgeId || 'bridge_001';
          const inspections = this.mockData.inspections.filter(i => i.bridgeId === bridgeId);
          return { success: true, data: inspections };
        } else {
          const inspectionId = urlParts[1];
          const inspection = this.mockData.inspections.find(i => i.id === inspectionId);
          return { success: true, data: inspection };
        }
      }

      if (method === 'POST') {
        const newInspection = {
          ...data,
          id: `inspection_${String(this.mockData.inspections.length + 1).padStart(3, '0')}`,
          date: new Date().toISOString().split('T')[0],
          status: 'in_progress'
        };
        this.mockData.inspections.unshift(newInspection);
        return { success: true, data: newInspection };
      }
    }

    if (endpoint.startsWith('/stress/history')) {
      if (method === 'GET') {
        const bearingId = data?.bearingId;
        let history = this.mockData.stressHistory;
        if (bearingId) {
          history = history.filter(h => h.bearingId === bearingId);
        }
        return { success: true, data: history };
      }
    }

    if (endpoint.startsWith('/stress/realtime')) {
      if (method === 'GET') {
        const bearingId = data?.bearingId;
        const stress = 80 + Math.random() * 60;
        return {
          success: true,
          data: {
            bearingId,
            stress,
            timestamp: new Date().toISOString(),
            status: stress > 150 ? 'danger' : stress > 100 ? 'warning' : 'normal'
          }
        };
      }
    }

    if (endpoint.startsWith('/components')) {
      if (method === 'GET') {
        const bridgeId = data?.bridgeId || 'bridge_001';
        const type = data?.type;

        let components = [];
        if (!type || type === 'bearing') {
          components = components.concat(
            this.mockData.bearings.filter(b => b.bridgeId === bridgeId).map(b => ({ ...b, componentType: 'bearing' }))
          );
        }
        if (!type || type === 'guardrail') {
          components = components.concat(
            this.mockData.guardrails.filter(g => g.bridgeId === bridgeId).map((g, i) => ({ ...g, componentType: 'guardrail', id: `guardrail_${i}` }))
          );
        }

        return { success: true, data: components };
      }
    }

    return { success: false, error: '未知的API端点' };
  }

  async getBridges() {
    return this.request('GET', '/bridges');
  }

  async getBridge(bridgeId) {
    return this.request('GET', `/bridges/${bridgeId}`);
  }

  async getBearings(bridgeId) {
    return this.request('GET', '/bearings', { bridgeId });
  }

  async getBearing(bearingId) {
    return this.request('GET', `/bearings/${bearingId}`);
  }

  async getGuardrails(bridgeId) {
    return this.request('GET', '/guardrails', { bridgeId });
  }

  async getDiseases(params = {}) {
    return this.request('GET', '/diseases', params);
  }

  async getDisease(diseaseId) {
    return this.request('GET', `/diseases/${diseaseId}`);
  }

  async createDisease(diseaseData) {
    return this.request('POST', '/diseases', diseaseData);
  }

  async updateDisease(diseaseId, diseaseData) {
    return this.request('PUT', `/diseases/${diseaseId}`, diseaseData);
  }

  async deleteDisease(diseaseId) {
    return this.request('DELETE', `/diseases/${diseaseId}`);
  }

  async getInspections(bridgeId) {
    return this.request('GET', '/inspections', { bridgeId });
  }

  async getInspection(inspectionId) {
    return this.request('GET', `/inspections/${inspectionId}`);
  }

  async createInspection(inspectionData) {
    return this.request('POST', '/inspections', inspectionData);
  }

  async getStressHistory(bearingId, startDate, endDate) {
    return this.request('GET', '/stress/history', { bearingId, startDate, endDate });
  }

  async getRealTimeStress(bearingId) {
    return this.request('GET', '/stress/realtime', { bearingId });
  }

  async getComponents(bridgeId, type) {
    return this.request('GET', '/components', { bridgeId, type });
  }

  async exportInspectionReport(inspectionId, format = 'pdf') {
    if (this.useMock) {
      return {
        success: true,
        data: {
          url: `/reports/${inspectionId}.${format}`,
          filename: `inspection_report_${inspectionId}.${format}`
        }
      };
    }
    return this.request('GET', `/inspections/${inspectionId}/export?format=${format}`);
  }

  async uploadDiseaseImage(diseaseId, file) {
    if (this.useMock) {
      return {
        success: true,
        data: {
          url: `/images/${diseaseId}_${Date.now()}.jpg`
        }
      };
    }

    const formData = new FormData();
    formData.append('file', file);
    return this.request('POST', `/diseases/${diseaseId}/images`, formData);
  }

  setMockMode(enabled) {
    this.useMock = enabled;
  }

  isMockMode() {
    return this.useMock;
  }

  setAuthToken(token) {
    this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete this.httpClient.defaults.headers.common['Authorization'];
  }
}
