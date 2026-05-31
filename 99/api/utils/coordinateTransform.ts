import proj4 from 'proj4';

type CRS = 'WGS84' | 'GCJ02' | 'BD09' | 'XIAN80' | 'BJ54';

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

proj4.defs('WGS84', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('XIAN80', '+proj=longlat +a=6378140 +b=6356755.288157528 +no_defs');
proj4.defs('BJ54', '+proj=longlat +a=6378245 +b=6356863.018773047 +no_defs');

function outOfChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function delta(lon: number, lat: number): [number, number] {
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [dLon, dLat];
}

export function wgs84ToGcj02(wgsLon: number, wgsLat: number): [number, number] {
  if (outOfChina(wgsLon, wgsLat)) {
    return [wgsLon, wgsLat];
  }
  const [dLon, dLat] = delta(wgsLon, wgsLat);
  return [wgsLon + dLon, wgsLat + dLat];
}

export function gcj02ToWgs84(gcjLon: number, gcjLat: number): [number, number] {
  if (outOfChina(gcjLon, gcjLat)) {
    return [gcjLon, gcjLat];
  }
  const [dLon, dLat] = delta(gcjLon, gcjLat);
  return [gcjLon - dLon, gcjLat - dLat];
}

export function gcj02ToBd09(gcjLon: number, gcjLat: number): [number, number] {
  const z = Math.sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * PI * 3000.0 / 180.0);
  const theta = Math.atan2(gcjLat, gcjLon) + 0.000003 * Math.cos(gcjLon * PI * 3000.0 / 180.0);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function bd09ToGcj02(bdLon: number, bdLat: number): [number, number] {
  const x = bdLon - 0.0065;
  const y = bdLat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI * 3000.0 / 180.0);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function transformCoordinate(
  coords: [number, number],
  from: CRS,
  to: CRS
): [number, number] {
  if (from === to) return coords;

  let wgsCoords: [number, number];

  switch (from) {
    case 'WGS84':
      wgsCoords = coords;
      break;
    case 'GCJ02':
      wgsCoords = gcj02ToWgs84(coords[0], coords[1]);
      break;
    case 'BD09':
      wgsCoords = bd09ToGcj02(coords[0], coords[1]);
      wgsCoords = gcj02ToWgs84(wgsCoords[0], wgsCoords[1]);
      break;
    case 'XIAN80':
    case 'BJ54':
      wgsCoords = proj4(from, 'WGS84', coords) as [number, number];
      break;
    default:
      return coords;
  }

  switch (to) {
    case 'WGS84':
      return wgsCoords;
    case 'GCJ02':
      return wgs84ToGcj02(wgsCoords[0], wgsCoords[1]);
    case 'BD09': {
      const gcj = wgs84ToGcj02(wgsCoords[0], wgsCoords[1]);
      return gcj02ToBd09(gcj[0], gcj[1]);
    }
    case 'XIAN80':
    case 'BJ54':
      return proj4('WGS84', to, wgsCoords) as [number, number];
    default:
      return wgsCoords;
  }
}

export type { CRS };
