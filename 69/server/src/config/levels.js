const Levels = {
  'steam-engine-basic': {
    id: 'steam-engine-basic',
    name: '基础蒸汽机',
    description: '学习基础蒸汽机械结构的装配与拆解',
    difficulty: 1,
    parts: [
      {
        id: 'boiler',
        name: '锅炉',
        type: 'boiler',
        model: 'cylinder',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 0, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'boiler-top', position: { x: 0, y: 2, z: 0 }, connectsTo: 'pipe-bottom' }
        ],
        connections: ['pipe'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#8B4513', size: { x: 3, y: 4, z: 3 } }
      },
      {
        id: 'pipe',
        name: '蒸汽管道',
        type: 'pipe',
        model: 'cylinder',
        position: { x: 5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 2, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'pipe-bottom', position: { x: 0, y: -1, z: 0 }, connectsTo: 'boiler-top' },
          { id: 'pipe-top', position: { x: 0, y: 1, z: 0 }, connectsTo: 'cylinder-bottom' }
        ],
        connections: ['boiler', 'cylinder'],
        initialState: 'disassembled',
        properties: { color: '#708090', size: { x: 1, y: 2, z: 1 } }
      },
      {
        id: 'cylinder',
        name: '汽缸',
        type: 'cylinder',
        model: 'box',
        position: { x: 5, y: 5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 5, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'cylinder-bottom', position: { x: 0, y: -1.5, z: 0 }, connectsTo: 'pipe-top' },
          { id: 'cylinder-side', position: { x: 2, y: 0, z: 0 }, connectsTo: 'piston-left' }
        ],
        connections: ['pipe', 'piston'],
        initialState: 'disassembled',
        properties: { color: '#4682B4', size: { x: 4, y: 3, z: 3 } }
      },
      {
        id: 'piston',
        name: '活塞',
        type: 'piston',
        model: 'cylinder',
        position: { x: 10, y: 5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 2, y: 5, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'piston-left', position: { x: -1, y: 0, z: 0 }, connectsTo: 'cylinder-side' },
          { id: 'piston-right', position: { x: 1, y: 0, z: 0 }, connectsTo: 'flywheel-center' }
        ],
        connections: ['cylinder', 'flywheel'],
        initialState: 'disassembled',
        properties: { color: '#A9A9A9', size: { x: 2, y: 1, z: 1 } }
      },
      {
        id: 'flywheel',
        name: '飞轮',
        type: 'flywheel',
        model: 'cylinder',
        position: { x: 10, y: 5, z: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 4, y: 5, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'flywheel-center', position: { x: 0, y: 0, z: 0 }, connectsTo: 'piston-right' }
        ],
        connections: ['piston'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#2F4F4F', size: { x: 3, y: 0.5, z: 3 } }
      }
    ]
  },

  'gear-train-advanced': {
    id: 'gear-train-advanced',
    name: '齿轮传动系统',
    description: '复杂齿轮传动系统的装配与联动测试',
    difficulty: 2,
    parts: [
      {
        id: 'base-frame',
        name: '底座框架',
        type: 'frame',
        model: 'box',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 0, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'frame-1', position: { x: -3, y: 2, z: 0 }, connectsTo: 'shaft1-bottom' },
          { id: 'frame-2', position: { x: 0, y: 2, z: 0 }, connectsTo: 'shaft2-bottom' },
          { id: 'frame-3', position: { x: 3, y: 2, z: 0 }, connectsTo: 'shaft3-bottom' }
        ],
        connections: ['shaft1', 'shaft2', 'shaft3'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#696969', size: { x: 10, y: 1, z: 4 } }
      },
      {
        id: 'shaft1',
        name: '主动轴',
        type: 'shaft',
        model: 'cylinder',
        position: { x: -8, y: 0, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: -3, y: 2, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'shaft1-bottom', position: { x: 0, y: -2, z: 0 }, connectsTo: 'frame-1' },
          { id: 'shaft1-gear', position: { x: 0, y: 0, z: 0 }, connectsTo: 'gear1-center' }
        ],
        connections: ['base-frame', 'gear1'],
        initialState: 'disassembled',
        properties: { color: '#C0C0C0', size: { x: 0.5, y: 4, z: 0.5 } }
      },
      {
        id: 'gear1',
        name: '主动齿轮',
        type: 'gear',
        model: 'cylinder',
        position: { x: -8, y: 5, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: -3, y: 4, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'gear1-center', position: { x: 0, y: 0, z: 0 }, connectsTo: 'shaft1-gear' }
        ],
        connections: ['shaft1', 'gear2'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#CD853F', size: { x: 2, y: 0.5, z: 2 }, teeth: 20 }
      },
      {
        id: 'shaft2',
        name: '中间轴',
        type: 'shaft',
        model: 'cylinder',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 0, y: 2, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'shaft2-bottom', position: { x: 0, y: -2, z: 0 }, connectsTo: 'frame-2' },
          { id: 'shaft2-gear1', position: { x: 0, y: 0, z: 0 }, connectsTo: 'gear2-center' },
          { id: 'shaft2-gear2', position: { x: 0, y: 1, z: 0 }, connectsTo: 'gear3-center' }
        ],
        connections: ['base-frame', 'gear2', 'gear3'],
        initialState: 'disassembled',
        properties: { color: '#C0C0C0', size: { x: 0.5, y: 5, z: 0.5 } }
      },
      {
        id: 'gear2',
        name: '传动齿轮',
        type: 'gear',
        model: 'cylinder',
        position: { x: 0, y: 5, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 0, y: 4, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'gear2-center', position: { x: 0, y: 0, z: 0 }, connectsTo: 'shaft2-gear1' }
        ],
        connections: ['gear1', 'shaft2'],
        initialState: 'disassembled',
        properties: { color: '#CD853F', size: { x: 1.5, y: 0.5, z: 1.5 }, teeth: 15 }
      },
      {
        id: 'gear3',
        name: '小齿轮',
        type: 'gear',
        model: 'cylinder',
        position: { x: 3, y: 5, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 0, y: 5, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'gear3-center', position: { x: 0, y: 0, z: 0 }, connectsTo: 'shaft2-gear2' }
        ],
        connections: ['shaft2', 'gear4'],
        initialState: 'disassembled',
        properties: { color: '#CD853F', size: { x: 1, y: 0.5, z: 1 }, teeth: 10 }
      },
      {
        id: 'shaft3',
        name: '从动轴',
        type: 'shaft',
        model: 'cylinder',
        position: { x: 8, y: 0, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 3, y: 2, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'shaft3-bottom', position: { x: 0, y: -2, z: 0 }, connectsTo: 'frame-3' },
          { id: 'shaft3-gear', position: { x: 0, y: 0, z: 0 }, connectsTo: 'gear4-center' }
        ],
        connections: ['base-frame', 'gear4'],
        initialState: 'disassembled',
        properties: { color: '#C0C0C0', size: { x: 0.5, y: 4, z: 0.5 } }
      },
      {
        id: 'gear4',
        name: '从动齿轮',
        type: 'gear',
        model: 'cylinder',
        position: { x: 8, y: 5, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 3, y: 4, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'gear4-center', position: { x: 0, y: 0, z: 0 }, connectsTo: 'shaft3-gear' }
        ],
        connections: ['gear3', 'shaft3'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#CD853F', size: { x: 1.8, y: 0.5, z: 1.8 }, teeth: 18 }
      }
    ]
  },

  'steam-locomotive': {
    id: 'steam-locomotive',
    name: '蒸汽机车',
    description: '完整蒸汽机车动力系统的装配挑战',
    difficulty: 3,
    parts: [
      {
        id: 'chassis',
        name: '机车底盘',
        type: 'chassis',
        model: 'box',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 0, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'chassis-boiler', position: { x: 0, y: 3, z: 0 }, connectsTo: 'main-boiler-bottom' },
          { id: 'chassis-wheel1', position: { x: -4, y: 0.5, z: 0 }, connectsTo: 'wheel-axle1' },
          { id: 'chassis-wheel2', position: { x: 4, y: 0.5, z: 0 }, connectsTo: 'wheel-axle2' }
        ],
        connections: ['main-boiler', 'wheel1', 'wheel2'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#2F2F2F', size: { x: 12, y: 2, z: 3 } }
      },
      {
        id: 'main-boiler',
        name: '主锅炉',
        type: 'boiler',
        model: 'cylinder',
        position: { x: 0, y: 8, z: 0 },
        rotation: { x: 0, y: 0, z: 90 },
        targetPosition: { x: 0, y: 3, z: 0 },
        targetRotation: { x: 0, y: 0, z: 90 },
        snapPoints: [
          { id: 'main-boiler-bottom', position: { x: 0, y: -1.5, z: 0 }, connectsTo: 'chassis-boiler' },
          { id: 'main-boiler-stack', position: { x: 0, y: 1.5, z: 0 }, connectsTo: 'smoke-stack-bottom' },
          { id: 'main-boiler-dome', position: { x: 3, y: 1.5, z: 0 }, connectsTo: 'steam-dome-bottom' }
        ],
        connections: ['chassis', 'smoke-stack', 'steam-dome'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#8B0000', size: { x: 8, y: 3, z: 3 } }
      },
      {
        id: 'smoke-stack',
        name: '烟囱',
        type: 'stack',
        model: 'cylinder',
        position: { x: 5, y: 12, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: 0, y: 6, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'smoke-stack-bottom', position: { x: 0, y: -2, z: 0 }, connectsTo: 'main-boiler-stack' }
        ],
        connections: ['main-boiler'],
        initialState: 'disassembled',
        properties: { color: '#1C1C1C', size: { x: 1, y: 4, z: 1 } }
      },
      {
        id: 'steam-dome',
        name: '汽包',
        type: 'dome',
        model: 'cylinder',
        position: { x: 8, y: 10, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        targetPosition: { x: 3, y: 6, z: 0 },
        targetRotation: { x: 90, y: 0, z: 0 },
        snapPoints: [
          { id: 'steam-dome-bottom', position: { x: 0, y: -0.8, z: 0 }, connectsTo: 'main-boiler-dome' }
        ],
        connections: ['main-boiler'],
        initialState: 'disassembled',
        properties: { color: '#B8860B', size: { x: 1.2, y: 1.6, z: 1.2 } }
      },
      {
        id: 'wheel1',
        name: '前轮组',
        type: 'wheel',
        model: 'cylinder',
        position: { x: -8, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 90 },
        targetPosition: { x: -4, y: 0.5, z: 0 },
        targetRotation: { x: 0, y: 0, z: 90 },
        snapPoints: [
          { id: 'wheel-axle1', position: { x: 0, y: 0, z: 0 }, connectsTo: 'chassis-wheel1' }
        ],
        connections: ['chassis'],
        initialState: 'disassembled',
        properties: { color: '#4A4A4A', size: { x: 2, y: 2, z: 2 } }
      },
      {
        id: 'wheel2',
        name: '后轮组',
        type: 'wheel',
        model: 'cylinder',
        position: { x: 8, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 90 },
        targetPosition: { x: 4, y: 0.5, z: 0 },
        targetRotation: { x: 0, y: 0, z: 90 },
        snapPoints: [
          { id: 'wheel-axle2', position: { x: 0, y: 0, z: 0 }, connectsTo: 'chassis-wheel2' }
        ],
        connections: ['chassis'],
        initialState: 'disassembled',
        properties: { color: '#4A4A4A', size: { x: 2, y: 2, z: 2 } }
      },
      {
        id: 'piston-assembly',
        name: '活塞组件',
        type: 'piston',
        model: 'box',
        position: { x: -6, y: 8, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: -4, y: 3, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'piston-cyl', position: { x: 2, y: 0, z: 0 }, connectsTo: 'main-boiler-cyl' },
          { id: 'piston-rod', position: { x: -1, y: 0, z: 0 }, connectsTo: 'connecting-rod-left' }
        ],
        connections: ['main-boiler', 'connecting-rod'],
        initialState: 'disassembled',
        isKey: true,
        properties: { color: '#708090', size: { x: 3, y: 1.5, z: 1.5 } }
      },
      {
        id: 'connecting-rod',
        name: '连杆',
        type: 'rod',
        model: 'box',
        position: { x: -10, y: 5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        targetPosition: { x: -4, y: 1, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        snapPoints: [
          { id: 'connecting-rod-left', position: { x: -1.5, y: 0, z: 0 }, connectsTo: 'piston-rod' },
          { id: 'connecting-rod-right', position: { x: 1.5, y: 0, z: 0 }, connectsTo: 'crank-pin' }
        ],
        connections: ['piston-assembly', 'wheel2'],
        initialState: 'disassembled',
        properties: { color: '#A9A9A9', size: { x: 3, y: 0.5, z: 0.5 } }
      }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Levels;
}
