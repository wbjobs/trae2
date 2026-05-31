class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.timeout = 30000;
    this.mockData = this.generateMockData();
    this.useMock = true;
  }

  generateMockData() {
    const systems = ['hvac', 'plumbing', 'electrical', 'fire', 'structure'];
    const systemNames = {
      hvac: '暖通系统',
      plumbing: '给排水系统',
      electrical: '电气系统',
      fire: '消防系统',
      structure: '建筑结构'
    };

    const layers = {
      structure: [
        { id: 'structure_floor', name: '楼板', color: '#64748b' },
        { id: 'structure_column', name: '结构柱', color: '#475569' },
        { id: 'structure_wall', name: '墙体', color: '#334155' },
        { id: 'structure_beam', name: '梁架', color: '#1e293b' }
      ],
      hvac: [
        { id: 'hvac_duct', name: '通风管道', color: '#f97316' },
        { id: 'hvac_equip', name: '空调设备', color: '#ea580c' },
        { id: 'hvac_diffuser', name: '出风口', color: '#fb923c' }
      ],
      plumbing: [
        { id: 'plumbing_water', name: '给水管道', color: '#06b6d4' },
        { id: 'plumbing_drain', name: '排水管道', color: '#0891b2' },
        { id: 'plumbing_fixture', name: '卫生器具', color: '#22d3ee' }
      ],
      electrical: [
        { id: 'electrical_cable', name: '电缆桥架', color: '#eab308' },
        { id: 'electrical_panel', name: '配电箱', color: '#ca8a04' },
        { id: 'electrical_light', name: '照明灯具', color: '#facc15' }
      ],
      fire: [
        { id: 'fire_pipe', name: '消防管道', color: '#ef4444' },
        { id: 'fire_sprink', name: '喷淋头', color: '#dc2626' },
        { id: 'fire_hydrant', name: '消火栓', color: '#f87171' }
      ]
    };

    return { systems, systemNames, layers };
  }

  async request(endpoint, options = {}) {
    if (this.useMock) {
      return this.mockRequest(endpoint, options);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async mockRequest(endpoint, options) {
    await this.delay(300 + Math.random() * 500);

    if (endpoint.includes('/api/project')) {
      return this.getMockProjectInfo();
    }
    if (endpoint.includes('/api/components')) {
      return this.getMockComponents();
    }
    if (endpoint.includes('/api/layers')) {
      return this.getMockLayers();
    }
    if (endpoint.includes('/api/collisions')) {
      return this.getMockCollisions();
    }
    if (endpoint.includes('/api/component/')) {
      const id = endpoint.split('/').pop();
      return this.getMockComponentDetail(id);
    }

    return { success: true };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getProjectInfo() {
    return this.request('/api/project');
  }

  async getComponents(options = {}) {
    const params = new URLSearchParams(options).toString();
    return this.request(`/api/components?${params}`);
  }

  async getComponentDetail(componentId) {
    return this.request(`/api/component/${componentId}`);
  }

  async getLayers() {
    return this.request('/api/layers');
  }

  async getCollisions(options = {}) {
    const params = new URLSearchParams(options).toString();
    return this.request(`/api/collisions?${params}`);
  }

  async exportReport(options = {}) {
    if (this.useMock) {
      await this.delay(1000);
      return {
        success: true,
        downloadUrl: '#',
        filename: 'collision-report.pdf'
      };
    }
    return this.request('/api/export/report', {
      method: 'POST',
      body: JSON.stringify(options)
    });
  }

  getMockProjectInfo() {
    return {
      id: 'proj_001',
      name: '国家会展中心（上海）',
      location: '上海市青浦区',
      area: 1470000,
      floors: 3,
      status: 'in_progress',
      progress: 68,
      createdAt: '2024-01-15',
      updatedAt: '2024-12-10'
    };
  }

  getMockLayers() {
    return this.mockData.layers;
  }

  getMockComponents() {
    const components = [];
    let id = 1;

    const systems = this.mockData.systems;
    const layers = this.mockData.layers;

    systems.forEach(system => {
      const systemLayers = layers[system] || [];
      
      systemLayers.forEach(layer => {
        const count = this.getComponentCount(system, layer.id);
        for (let i = 0; i < count; i++) {
          components.push(this.generateComponent(id++, system, layer));
        }
      });
    });

    return components;
  }

  getComponentCount(system, layerId) {
    const counts = {
      structure_floor: 12,
      structure_column: 48,
      structure_wall: 36,
      structure_beam: 32,
      hvac_duct: 85,
      hvac_equip: 12,
      hvac_diffuser: 120,
      plumbing_water: 65,
      plumbing_drain: 45,
      plumbing_fixture: 78,
      electrical_cable: 95,
      electrical_panel: 18,
      electrical_light: 156,
      fire_pipe: 55,
      fire_sprink: 145,
      fire_hydrant: 24
    };
    return counts[layerId] || 10;
  }

  generateComponent(id, system, layer) {
    const types = {
      structure_floor: 'floor',
      structure_column: 'column',
      structure_wall: 'wall',
      structure_beam: 'beam',
      hvac_duct: 'duct',
      hvac_equip: 'ahu',
      hvac_diffuser: 'diffuser',
      plumbing_water: 'pipe_water',
      plumbing_drain: 'pipe_drain',
      plumbing_fixture: 'fixture',
      electrical_cable: 'cable_tray',
      electrical_panel: 'panel',
      electrical_light: 'light',
      fire_pipe: 'pipe_fire',
      fire_sprink: 'sprinkler',
      fire_hydrant: 'hydrant'
    };

    const names = {
      floor: '楼板',
      column: '结构柱',
      wall: '墙体',
      beam: '梁',
      duct: '通风管道',
      ahu: '空调机组',
      diffuser: '出风口',
      pipe_water: '给水管道',
      pipe_drain: '排水管道',
      fixture: '卫生器具',
      cable_tray: '电缆桥架',
      panel: '配电箱',
      light: '照明灯具',
      pipe_fire: '消防管道',
      sprinkler: '喷淋头',
      hydrant: '消火栓'
    };

    const type = types[layer.id] || 'generic';
    const position = this.generatePosition(system, type);

    return {
      componentId: `comp_${String(id).padStart(6, '0')}`,
      name: `${names[type]} ${id}`,
      type: type,
      system: system,
      layer: layer.id,
      layerName: layer.name,
      color: layer.color,
      position: position,
      rotation: this.generateRotation(type),
      dimensions: this.generateDimensions(type),
      material: this.generateMaterial(system),
      properties: this.generateProperties(system, type),
      status: Math.random() > 0.1 ? 'approved' : 'pending'
    };
  }

  generatePosition(system, type) {
    const baseY = {
      structure: 0,
      hvac: 4 + Math.random() * 2,
      plumbing: 3.5 + Math.random() * 1.5,
      electrical: 4.5 + Math.random() * 1,
      fire: 3.8 + Math.random() * 1.5
    };

    const y = baseY[system] || 3;
    
    return {
      x: (Math.random() - 0.5) * 80,
      y: y,
      z: (Math.random() - 0.5) * 80
    };
  }

  generateRotation(type) {
    if (type.includes('pipe') || type === 'duct' || type === 'cable_tray') {
      const rotations = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: Math.PI / 2, z: 0 },
        { x: Math.PI / 2, y: 0, z: 0 }
      ];
      return rotations[Math.floor(Math.random() * rotations.length)];
    }
    return { x: 0, y: 0, z: 0 };
  }

  generateDimensions(type) {
    const dimensions = {
      floor: { width: 30 + Math.random() * 20, height: 0.3, depth: 20 + Math.random() * 15 },
      column: { width: 0.6 + Math.random() * 0.3, height: 6 + Math.random() * 2, depth: 0.6 + Math.random() * 0.3 },
      wall: { width: 10 + Math.random() * 15, height: 4 + Math.random() * 2, depth: 0.2 + Math.random() * 0.1 },
      beam: { width: 8 + Math.random() * 12, height: 0.6 + Math.random() * 0.3, depth: 0.4 + Math.random() * 0.2 },
      duct: { width: 0.8 + Math.random() * 1.2, height: 0.3 + Math.random() * 0.4, depth: 5 + Math.random() * 10 },
      ahu: { width: 2 + Math.random() * 2, height: 1.5 + Math.random() * 1, depth: 3 + Math.random() * 2 },
      diffuser: { width: 0.4 + Math.random() * 0.2, height: 0.1, depth: 0.4 + Math.random() * 0.2 },
      pipe_water: { width: 0.1 + Math.random() * 0.15, height: 0.1 + Math.random() * 0.15, depth: 3 + Math.random() * 8 },
      pipe_drain: { width: 0.15 + Math.random() * 0.2, height: 0.15 + Math.random() * 0.2, depth: 3 + Math.random() * 8 },
      pipe_fire: { width: 0.1 + Math.random() * 0.15, height: 0.1 + Math.random() * 0.15, depth: 3 + Math.random() * 8 },
      fixture: { width: 0.5 + Math.random() * 0.3, height: 0.8 + Math.random() * 0.4, depth: 0.4 + Math.random() * 0.2 },
      cable_tray: { width: 0.3 + Math.random() * 0.4, height: 0.1 + Math.random() * 0.05, depth: 4 + Math.random() * 10 },
      panel: { width: 0.6 + Math.random() * 0.4, height: 1 + Math.random() * 0.5, depth: 0.2 + Math.random() * 0.1 },
      light: { width: 0.3 + Math.random() * 0.2, height: 0.1, depth: 0.6 + Math.random() * 0.3 },
      sprinkler: { width: 0.1, height: 0.15, depth: 0.1 },
      hydrant: { width: 0.7, height: 1.2, depth: 0.5 }
    };
    return dimensions[type] || { width: 1, height: 1, depth: 1 };
  }

  generateMaterial(system) {
    const materials = {
      structure: '混凝土 C30',
      hvac: '镀锌钢板',
      plumbing: 'PPR 塑料管',
      electrical: '镀锌钢板',
      fire: '无缝钢管'
    };
    return materials[system] || '未知材料';
  }

  generateProperties(system, type) {
    const props = {};

    if (system === 'structure') {
      props.loadCapacity = `${(200 + Math.random() * 300).toFixed(0)} kN/m²`;
      props.concreteGrade = 'C30';
      props.reinforcement = 'HRB400';
    } else if (system === 'hvac') {
      if (type === 'duct') {
        props.airflow = `${(500 + Math.random() * 1500).toFixed(0)} m³/h`;
        props.pressure = `${(100 + Math.random() * 200).toFixed(0)} Pa`;
        props.insulation = '岩棉 25mm';
      } else if (type === 'ahu') {
        props.capacity = `${(10 + Math.random() * 30).toFixed(0)} kW`;
        props.flowRate = `${(2000 + Math.random() * 5000).toFixed(0)} m³/h`;
      }
    } else if (system === 'plumbing') {
      if (type.includes('pipe')) {
        props.diameter = `${(50 + Math.random() * 150).toFixed(0)} mm`;
        props.pressure = `${(1 + Math.random() * 1.5).toFixed(1)} MPa`;
        props.flowRate = `${(2 + Math.random() * 8).toFixed(1)} L/s`;
      }
    } else if (system === 'electrical') {
      if (type === 'cable_tray') {
        props.cableCount = Math.floor(10 + Math.random() * 30);
        props.maxCurrent = `${(100 + Math.random() * 200).toFixed(0)} A`;
      } else if (type === 'panel') {
        props.voltage = '380V';
        props.power = `${(50 + Math.random() * 150).toFixed(0)} kW`;
      }
    } else if (system === 'fire') {
      props.pressure = `${(1 + Math.random() * 0.5).toFixed(1)} MPa`;
      props.standard = 'GB 50084-2017';
    }

    return props;
  }

  getMockComponentDetail(id) {
    return {
      componentId: id,
      name: '通风管道 D-01-001',
      type: 'duct',
      system: 'hvac',
      layer: 'hvac_duct',
      description: '主通风管道 - 一层东区',
      manufacturer: '某通风设备有限公司',
      model: 'VD-800-400',
      installationDate: '2024-06-15',
      warranty: '2年',
      properties: {
        material: '镀锌钢板',
        thickness: '1.2mm',
        width: '800mm',
        height: '400mm',
        length: '12.5m',
        airflow: '2500 m³/h',
        velocity: '2.1 m/s',
        pressure: '150 Pa',
        insulation: '岩棉 25mm',
        fireRating: 'A级不燃'
      },
      technical: {
        designPressure: '1000 Pa',
        operatingTemp: '-10°C ~ 70°C',
        noiseLevel: '<35 dB(A)',
        leakageRate: '<1%'
      },
      maintenance: {
        lastInspection: '2024-11-01',
        nextInspection: '2025-05-01',
        inspectionCycle: '6个月'
      }
    };
  }

  getMockCollisions() {
    return [
      {
        id: 'col_001',
        type: 'hard',
        depth: 156,
        componentA: { id: 'comp_000125', name: '通风管道 25', system: 'hvac' },
        componentB: { id: 'comp_000234', name: '电缆桥架 45', system: 'electrical' },
        position: { x: 12.5, y: 4.2, z: -8.3 },
        description: '严重碰撞 - 通风管道穿过电缆桥架'
      },
      {
        id: 'col_002',
        type: 'hard',
        depth: 98,
        componentA: { id: 'comp_000078', name: '结构柱 32', system: 'structure' },
        componentB: { id: 'comp_000156', name: '给水管道 23', system: 'plumbing' },
        position: { x: -25.1, y: 2.8, z: 15.7 },
        description: '严重碰撞 - 给水管道穿结构柱'
      },
      {
        id: 'col_003',
        type: 'soft',
        depth: 42,
        componentA: { id: 'comp_000289', name: '消防管道 34', system: 'fire' },
        componentB: { id: 'comp_000067', name: '梁 21', system: 'structure' },
        position: { x: 35.2, y: 5.1, z: 22.4 },
        description: '轻微碰撞 - 净距不足'
      },
      {
        id: 'col_004',
        type: 'hard',
        depth: 125,
        componentA: { id: 'comp_000189', name: '空调机组 5', system: 'hvac' },
        componentB: { id: 'comp_000312', name: '喷淋主管 12', system: 'fire' },
        position: { x: -15.8, y: 3.5, z: -30.2 },
        description: '严重碰撞 - 设备上方管线冲突'
      },
      {
        id: 'col_005',
        type: 'soft',
        depth: 35,
        componentA: { id: 'comp_000234', name: '电缆桥架 45', system: 'electrical' },
        componentB: { id: 'comp_000267', name: '照明灯具 89', system: 'electrical' },
        position: { x: 5.5, y: 4.8, z: 10.1 },
        description: '轻微碰撞 - 安装空间不足'
      }
    ];
  }
}

export default ApiService;
