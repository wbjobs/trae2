import type { Borehole, GeoLayer, Annotation } from '../../src/types/index.js';

const boreholeStore = new Map<string, Borehole>();
const layerStore = new Map<string, GeoLayer>();
const annotationStore = new Map<string, Annotation>();

const initialBoreholes: Borehole[] = [
  {
    id: 'bh-001',
    name: 'ZK-01 钻孔',
    longitude: 116.3975,
    latitude: 39.9087,
    elevation: 45.2,
    depth: 120.5,
    coordinateSystem: 'WGS84',
    layers: [
      {
        id: 'layer-001',
        boreholeId: 'bh-001',
        layerName: '人工填土层',
        topDepth: 0,
        bottomDepth: 3.5,
        layerType: 'fill',
        color: '#d4a574',
        description: '黄褐色，稍湿，松散，主要由粘性土组成，含少量碎石和植物根系'
      },
      {
        id: 'layer-002',
        boreholeId: 'bh-001',
        layerName: '粉质粘土层',
        topDepth: 3.5,
        bottomDepth: 18.2,
        layerType: 'clay',
        color: '#8b6914',
        description: '黄褐色-灰褐色，可塑，切面稍有光泽，无摇震反应，干强度中等'
      },
      {
        id: 'layer-003',
        boreholeId: 'bh-001',
        layerName: '粉砂层',
        topDepth: 18.2,
        bottomDepth: 45.6,
        layerType: 'sand',
        color: '#e6c88a',
        description: '浅黄色，饱和，中密，矿物成分以石英、长石为主，颗粒级配良好'
      },
      {
        id: 'layer-004',
        boreholeId: 'bh-001',
        layerName: '圆砾层',
        topDepth: 45.6,
        bottomDepth: 82.3,
        layerType: 'gravel',
        color: '#7a6c5d',
        description: '杂色，饱和，密实，砾石成分以花岗岩、砂岩为主，亚圆形'
      },
      {
        id: 'layer-005',
        boreholeId: 'bh-001',
        layerName: '强风化岩',
        topDepth: 82.3,
        bottomDepth: 120.5,
        layerType: 'rock',
        color: '#5d4e37',
        description: '灰褐色，岩体风化破碎，岩芯呈碎块状，手捏易碎，属极软岩'
      }
    ]
  },
  {
    id: 'bh-002',
    name: 'ZK-02 钻孔',
    longitude: 116.4025,
    latitude: 39.9120,
    elevation: 48.6,
    depth: 150.0,
    coordinateSystem: 'WGS84',
    layers: [
      {
        id: 'layer-006',
        boreholeId: 'bh-002',
        layerName: '人工填土层',
        topDepth: 0,
        bottomDepth: 4.2,
        layerType: 'fill',
        color: '#d4a574',
        description: '黄褐色，稍湿，松散-稍密，含建筑垃圾和生活垃圾'
      },
      {
        id: 'layer-007',
        boreholeId: 'bh-002',
        layerName: '粉土层',
        topDepth: 4.2,
        bottomDepth: 15.8,
        layerType: 'silt',
        color: '#c9a86c',
        description: '褐黄色，稍湿，中密，摇震反应中等，无光泽反应，干强度低'
      },
      {
        id: 'layer-008',
        boreholeId: 'bh-002',
        layerName: '粉质粘土层',
        topDepth: 15.8,
        bottomDepth: 38.5,
        layerType: 'clay',
        color: '#8b6914',
        description: '灰褐色，可塑-硬塑，切面光滑，有铁锰结核'
      },
      {
        id: 'layer-009',
        boreholeId: 'bh-002',
        layerName: '细砂层',
        topDepth: 38.5,
        bottomDepth: 68.2,
        layerType: 'sand',
        color: '#e6c88a',
        description: '灰白色，饱和，中密-密实，矿物成分以石英为主'
      },
      {
        id: 'layer-010',
        boreholeId: 'bh-002',
        layerName: '卵石层',
        topDepth: 68.2,
        bottomDepth: 110.5,
        layerType: 'gravel',
        color: '#7a6c5d',
        description: '杂色，饱和，密实，卵石成分以火成岩为主，磨圆度较好'
      },
      {
        id: 'layer-011',
        boreholeId: 'bh-002',
        layerName: '中风化岩',
        topDepth: 110.5,
        bottomDepth: 150.0,
        layerType: 'rock',
        color: '#5d4e37',
        description: '青灰色，岩体较完整，岩芯呈柱状，节理裂隙较发育'
      }
    ]
  },
  {
    id: 'bh-003',
    name: 'ZK-03 钻孔',
    longitude: 116.3920,
    latitude: 39.9150,
    elevation: 52.3,
    depth: 95.8,
    coordinateSystem: 'WGS84',
    layers: [
      {
        id: 'layer-012',
        boreholeId: 'bh-003',
        layerName: '杂填土层',
        topDepth: 0,
        bottomDepth: 2.8,
        layerType: 'fill',
        color: '#a08060',
        description: '杂色，稍湿，松散，含大量砖块、碎石等建筑垃圾'
      },
      {
        id: 'layer-013',
        boreholeId: 'bh-003',
        layerName: '粘土层',
        topDepth: 2.8,
        bottomDepth: 22.5,
        layerType: 'clay',
        color: '#6b4423',
        description: '棕红色，可塑，切面光滑，含铁锰氧化物斑点'
      },
      {
        id: 'layer-014',
        boreholeId: 'bh-003',
        layerName: '中砂层',
        topDepth: 22.5,
        bottomDepth: 55.2,
        layerType: 'sand',
        color: '#f0d090',
        description: '浅黄色，饱和，中密，颗粒级配良好，含少量砾石'
      },
      {
        id: 'layer-015',
        boreholeId: 'bh-003',
        layerName: '强风化岩',
        topDepth: 55.2,
        bottomDepth: 95.8,
        layerType: 'rock',
        color: '#4a3728',
        description: '红褐色，岩体风化强烈，岩芯呈砂土状，手可碾碎'
      }
    ]
  },
  {
    id: 'bh-004',
    name: 'ZK-04 钻孔',
    longitude: 116.4080,
    latitude: 39.9050,
    elevation: 42.8,
    depth: 135.2,
    coordinateSystem: 'WGS84',
    layers: [
      {
        id: 'layer-016',
        boreholeId: 'bh-004',
        layerName: '素填土层',
        topDepth: 0,
        bottomDepth: 5.5,
        layerType: 'fill',
        color: '#c4a060',
        description: '黄褐色，稍湿，稍密，以粘性土为主，含少量碎石'
      },
      {
        id: 'layer-017',
        boreholeId: 'bh-004',
        layerName: '粉质粘土层',
        topDepth: 5.5,
        bottomDepth: 28.3,
        layerType: 'clay',
        color: '#8b6914',
        description: '褐灰色，可塑，稍有光泽，含腐殖质和螺壳'
      },
      {
        id: 'layer-018',
        boreholeId: 'bh-004',
        layerName: '粉土层',
        topDepth: 28.3,
        bottomDepth: 48.6,
        layerType: 'silt',
        color: '#c9a86c',
        description: '褐黄色，湿，中密，摇震反应明显，干强度低'
      },
      {
        id: 'layer-019',
        boreholeId: 'bh-004',
        layerName: '粗砂层',
        topDepth: 48.6,
        bottomDepth: 75.8,
        layerType: 'sand',
        color: '#d4a85a',
        description: '灰白色，饱和，密实，颗粒级配良好，含少量圆砾'
      },
      {
        id: 'layer-020',
        boreholeId: 'bh-004',
        layerName: '圆砾层',
        topDepth: 75.8,
        bottomDepth: 105.2,
        layerType: 'gravel',
        color: '#6b5a4a',
        description: '杂色，饱和，密实，砾石成分复杂，磨圆度一般'
      },
      {
        id: 'layer-021',
        boreholeId: 'bh-004',
        layerName: '中风化岩',
        topDepth: 105.2,
        bottomDepth: 135.2,
        layerType: 'rock',
        color: '#4a3f35',
        description: '青灰色，岩体较完整，岩芯呈短柱状，局部有溶蚀痕迹'
      }
    ]
  },
  {
    id: 'bh-005',
    name: 'ZK-05 钻孔',
    longitude: 116.3950,
    latitude: 39.9200,
    elevation: 55.6,
    depth: 88.5,
    coordinateSystem: 'WGS84',
    layers: [
      {
        id: 'layer-022',
        boreholeId: 'bh-005',
        layerName: '人工填土层',
        topDepth: 0,
        bottomDepth: 3.2,
        layerType: 'fill',
        color: '#b8956a',
        description: '黄褐色，稍湿，松散，含植物根系和少量碎石'
      },
      {
        id: 'layer-023',
        boreholeId: 'bh-005',
        layerName: '粉质粘土层',
        topDepth: 3.2,
        bottomDepth: 25.6,
        layerType: 'clay',
        color: '#7a5a28',
        description: '棕黄色，可塑-硬塑，切面光滑，有铁锰结核和钙质结核'
      },
      {
        id: 'layer-024',
        boreholeId: 'bh-005',
        layerName: '粉细砂层',
        topDepth: 25.6,
        bottomDepth: 52.3,
        layerType: 'sand',
        color: '#e8d090',
        description: '浅黄色，饱和，中密，矿物成分以石英、长石为主'
      },
      {
        id: 'layer-025',
        boreholeId: 'bh-005',
        layerName: '砾砂层',
        topDepth: 52.3,
        bottomDepth: 72.8,
        layerType: 'sand',
        color: '#c8a060',
        description: '杂色，饱和，密实，含约20%的砾石，颗粒级配良好'
      },
      {
        id: 'layer-026',
        boreholeId: 'bh-005',
        layerName: '全风化岩',
        topDepth: 72.8,
        bottomDepth: 88.5,
        layerType: 'rock',
        color: '#5a4a3a',
        description: '黄褐色，岩体风化成砂土状，原岩结构已破坏，手可捏碎'
      }
    ]
  }
];

const initialLayers: GeoLayer[] = [
  {
    id: 'geo-layer-001',
    name: '粉质粘土层分布',
    type: 'polygon',
    color: '#8b6914',
    opacity: 0.7,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [116.390, 39.900],
          [116.410, 39.900],
          [116.410, 39.920],
          [116.390, 39.920],
          [116.390, 39.900]
        ]
      ]
    },
    properties: {
      formation: 'Q4',
      averageThickness: 15.5,
      soilType: '粉质粘土',
      compressibility: '中等'
    }
  },
  {
    id: 'geo-layer-002',
    name: '砂层分布范围',
    type: 'polygon',
    color: '#e6c88a',
    opacity: 0.6,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [116.385, 39.905],
          [116.415, 39.905],
          [116.415, 39.925],
          [116.385, 39.925],
          [116.385, 39.905]
        ]
      ]
    },
    properties: {
      formation: 'Q3',
      averageThickness: 30.2,
      soilType: '粉细砂',
      permeability: '中等'
    }
  },
  {
    id: 'geo-layer-003',
    name: '基岩面等高线',
    type: 'linestring',
    color: '#ff6b6b',
    opacity: 0.9,
    geometry: {
      type: 'LineString',
      coordinates: [
        [116.388, 39.902],
        [116.395, 39.908],
        [116.402, 39.912],
        [116.408, 39.918],
        [116.412, 39.922]
      ]
    },
    properties: {
      elevation: 50.0,
      contourInterval: 5.0,
      bedrockType: '沉积岩'
    }
  },
  {
    id: 'geo-layer-004',
    name: '断层构造线',
    type: 'linestring',
    color: '#ff0000',
    opacity: 0.9,
    geometry: {
      type: 'LineString',
      coordinates: [
        [116.380, 39.910],
        [116.395, 39.915],
        [116.410, 39.920]
      ]
    },
    properties: {
      faultName: 'F1 正断层',
      strike: 'NE45°',
      dip: '75°',
      dipDirection: 'NW'
    }
  },
  {
    id: 'geo-layer-005',
    name: '卵石层富集区',
    type: 'polygon',
    color: '#7a6c5d',
    opacity: 0.5,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [116.392, 39.908],
          [116.408, 39.908],
          [116.408, 39.918],
          [116.392, 39.918],
          [116.392, 39.908]
        ]
      ]
    },
    properties: {
      formation: 'Q2',
      averageDepth: 70.5,
      averageThickness: 35.0,
      soilType: '卵石',
      bearingCapacity: '高'
    }
  }
];

const initialAnnotations: Annotation[] = [
  {
    id: 'anno-001',
    type: 'label',
    name: '地层分界点',
    description: '粉质粘土与粉砂层分界处，岩性变化明显',
    position: [116.3975, 39.9087, 18.2],
    color: '#e87c3e',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'anno-002',
    type: 'pin',
    name: '水位观测点',
    description: '初见水位埋深 3.5m，稳定水位埋深 2.8m',
    position: [116.4025, 39.9120, 2.8],
    color: '#4299e1',
    createdAt: '2024-01-16T14:20:00Z'
  },
  {
    id: 'anno-003',
    type: 'area',
    name: '岩溶发育区',
    description: '该区域灰岩地层岩溶发育，注意施工风险',
    position: [116.4080, 39.9050, 105.0],
    color: '#ff6b6b',
    createdAt: '2024-01-17T09:15:00Z'
  },
  {
    id: 'anno-004',
    type: 'label',
    name: '风化壳界面',
    description: '全风化与强风化岩分界，标贯击数突变点',
    position: [116.3950, 39.9200, 72.8],
    color: '#38a169',
    createdAt: '2024-01-18T16:45:00Z'
  },
  {
    id: 'anno-005',
    type: 'pin',
    name: '取芯位置',
    description: '采取原状土样位置，用于室内土工试验',
    position: [116.3920, 39.9150, 25.0],
    color: '#9f7aea',
    createdAt: '2024-01-19T11:00:00Z'
  }
];

initialBoreholes.forEach(bh => boreholeStore.set(bh.id, bh));
initialLayers.forEach(layer => layerStore.set(layer.id, layer));
initialAnnotations.forEach(anno => annotationStore.set(anno.id, anno));

export { boreholeStore, layerStore, annotationStore };
