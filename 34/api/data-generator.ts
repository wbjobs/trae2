import type { StationInfo, StationFlow } from './types.js';

const stationNames = [
  '人民广场', '南京路', '外滩', '陆家嘴', '世纪大道', '静安寺', '徐家汇', '漕河泾',
  '虹桥火车站', '虹桥2号航站楼', '虹桥1号航站楼', '上海火车站', '上海南站', '上海西站',
  '中山公园', '陕西南路', '黄陂南路', '老西门', '大世界', '豫园',
  '东昌路', '世纪公园', '龙阳路', '张江高科', '金科路', '广兰路', '唐镇',
  '华夏东路', '华泾西站', '东体中心'
];

const lineNames: Record<string, string> = {
  'L1': '1号线',
  'L2': '2号线',
  'L3': '3号线',
  'L4': '4号线',
  'L5': '5号线'
};

function generateStations(): StationInfo[] {
  const stations: StationInfo[] = [];
  for (let i = 0; i < stationNames.length; i++) {
    const lineId = `L${(i % 5) + 1}`;
    const col = i % 6;
    const row = Math.floor(i / 6);
    stations.push({
      stationId: `ST${String(i + 1).padStart(3, '0')}`,
      stationName: stationNames[i],
      lineId,
      lineName: lineNames[lineId],
      position: {
        x: 80 + col * 150,
        y: 80 + row * 100
      }
    });
  }
  return stations;
}

const stations = generateStations();

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function getHourOfDay(timestamp: Date): number {
  return timestamp.getHours();
}

function getBaseFlowByHour(hour: number): { inflow: number; outflow: number } {
  let baseInflow = 100;
  let baseOutflow = 100;

  if (hour >= 6 && hour < 9) {
    baseInflow = 800;
    baseOutflow = 200;
  } else if (hour >= 9 && hour < 12) {
    baseInflow = 400;
    baseOutflow = 300;
  } else if (hour >= 12 && hour < 14) {
    baseInflow = 500;
    baseOutflow = 500;
  } else if (hour >= 14 && hour < 17) {
    baseInflow = 350;
    baseOutflow = 350;
  } else if (hour >= 17 && hour < 20) {
    baseInflow = 200;
    baseOutflow = 800;
  } else if (hour >= 20 && hour < 23) {
    baseInflow = 200;
    baseOutflow = 200;
  } else {
    baseInflow = 50;
    baseOutflow = 50;
  }

  return { inflow: baseInflow, outflow: baseOutflow };
}

export function generateFlowData(timestamp: Date): StationFlow[] {
  const hour = getHourOfDay(timestamp);
  const baseFlows = getBaseFlowByHour(hour);
  const rand = seededRandom(timestamp.getTime());

  return stations.map(station => {
    const stationFactor = 0.6 + rand() * 0.8;
    const variation = 0.8 + rand() * 0.4;
    const isMajorStation = station.stationName === '人民广场' ||
                          station.stationName === '陆家嘴' ||
                          station.stationName === '徐家汇' ||
                          station.stationName === '虹桥火车站';
    const majorFactor = isMajorStation ? 1.8 : 1;

    const inflow = Math.round(baseFlows.inflow * stationFactor * variation * majorFactor);
    const outflow = Math.round(baseFlows.outflow * stationFactor * variation * majorFactor);

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      timestamp: timestamp.toISOString(),
      inflow,
      outflow,
      totalFlow: inflow + outflow,
      lineId: station.lineId
    };
  });
}

export function generateHistoricalFlowData(hours: number = 24): Record<string, StationFlow[]> {
  const result: Record<string, StationFlow[]> = {};
  const now = new Date();

  for (let h = hours; h >= 0; h--) {
    const timestamp = new Date(now.getTime() - h * 60 * 60 * 1000);
    const key = timestamp.toISOString();
    result[key] = generateFlowData(timestamp);
  }

  return result;
}

export function getStations(): StationInfo[] {
  return stations;
}

export function getStationById(stationId: string): StationInfo | undefined {
  return stations.find(s => s.stationId === stationId);
}

export function getStationsByLine(lineId: string): StationInfo[] {
  return stations.filter(s => s.lineId === lineId);
}
