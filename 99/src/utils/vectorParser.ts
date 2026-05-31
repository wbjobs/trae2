import * as THREE from 'three';
import type { Feature, FeatureCollection, Geometry, Point, LineString, Polygon, Position } from 'geojson';
import { transformCoordinate } from './coordinateTransform';

export interface ParsedGeometry {
  type: string;
  coordinates: number[][];
  threeShape?: THREE.Shape;
  threePoints?: THREE.Vector3[];
}

export function parseGeoJSON(geojson: Feature | FeatureCollection | Geometry): ParsedGeometry[] {
  const results: ParsedGeometry[] = [];

  if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features) {
      results.push(...parseFeature(feature));
    }
  } else if (geojson.type === 'Feature') {
    results.push(...parseFeature(geojson));
  } else {
    results.push(parseGeometry(geojson));
  }

  return results;
}

function parseFeature(feature: Feature): ParsedGeometry[] {
  return [parseGeometry(feature.geometry)];
}

function parseGeometry(geometry: Geometry): ParsedGeometry {
  switch (geometry.type) {
    case 'Point':
      return parsePoint(geometry as Point);
    case 'LineString':
      return parseLineString(geometry as LineString);
    case 'Polygon':
      return parsePolygon(geometry as Polygon);
    case 'MultiPoint':
      return parseMultiPoint(geometry);
    case 'MultiLineString':
      return parseMultiLineString(geometry);
    case 'MultiPolygon':
      return parseMultiPolygon(geometry);
    default:
      return { type: 'Unknown', coordinates: [] };
  }
}

function parsePoint(geometry: Point): ParsedGeometry {
  return {
    type: 'Point',
    coordinates: [geometry.coordinates as number[]],
    threePoints: [new THREE.Vector3(geometry.coordinates[0], 0, geometry.coordinates[1])],
  };
}

function parseLineString(geometry: LineString): ParsedGeometry {
  const coords = geometry.coordinates as number[][];
  return {
    type: 'LineString',
    coordinates: coords,
    threePoints: coords.map(c => new THREE.Vector3(c[0], 0, c[1])),
  };
}

function parsePolygon(geometry: Polygon): ParsedGeometry {
  const coords = geometry.coordinates[0] as number[][];
  const shape = polygonToShape(coords);
  return {
    type: 'Polygon',
    coordinates: coords,
    threeShape: shape,
    threePoints: coords.map(c => new THREE.Vector3(c[0], 0, c[1])),
  };
}

function parseMultiPoint(geometry: Geometry): ParsedGeometry {
  const coords = (geometry as { coordinates: Position[] }).coordinates;
  return {
    type: 'MultiPoint',
    coordinates: coords.map(c => c as number[]),
    threePoints: coords.map(c => new THREE.Vector3(c[0], 0, c[1])),
  };
}

function parseMultiLineString(geometry: Geometry): ParsedGeometry {
  const coords = (geometry as { coordinates: Position[][] }).coordinates;
  const flatCoords = coords.flat() as number[][];
  return {
    type: 'MultiLineString',
    coordinates: flatCoords,
    threePoints: flatCoords.map(c => new THREE.Vector3(c[0], 0, c[1])),
  };
}

function parseMultiPolygon(geometry: Geometry): ParsedGeometry {
  const coords = (geometry as { coordinates: Position[][][] }).coordinates;
  const flatCoords = coords.flat(2) as number[][];
  const shape = polygonToShape(flatCoords);
  return {
    type: 'MultiPolygon',
    coordinates: flatCoords,
    threeShape: shape,
    threePoints: flatCoords.map(c => new THREE.Vector3(c[0], 0, c[1])),
  };
}

export function polygonToShape(coordinates: number[][]): THREE.Shape {
  const shape = new THREE.Shape();

  if (coordinates.length === 0) return shape;

  shape.moveTo(coordinates[0][0], coordinates[0][1]);

  for (let i = 1; i < coordinates.length; i++) {
    shape.lineTo(coordinates[i][0], coordinates[i][1]);
  }

  shape.closePath();

  return shape;
}

export function wfsResponseParser(response: string): FeatureCollection | null {
  try {
    if (response.includes('<?xml') || response.includes('<wfs:')) {
      return parseWFSXML(response);
    }
    return JSON.parse(response);
  } catch {
    return null;
  }
}

function parseWFSXML(xmlString: string): FeatureCollection | null {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  const errorNode = xmlDoc.querySelector('parsererror');
  if (errorNode) {
    return null;
  }

  const features: Feature[] = [];
  const featureNodes = xmlDoc.querySelectorAll('gml\\:featureMember, featureMember, wfs\\:member');

  featureNodes.forEach((node) => {
    const feature = parseWFSFeatureNode(node);
    if (feature) {
      features.push(feature);
    }
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

function parseWFSFeatureNode(node: Element): Feature | null {
  const children = Array.from(node.children);
  if (children.length === 0) return null;

  const featureElement = children[0];
  const properties: Record<string, unknown> = {};

  Array.from(featureElement.children).forEach((child) => {
    const tagName = child.tagName.replace(/^.*:/, '');
    if (tagName === 'geom' || tagName === 'geometry' || tagName.includes('Point') || tagName.includes('Polygon')) {
      return;
    }
    properties[tagName] = child.textContent;
  });

  const pointNodes = featureElement.querySelectorAll('gml\\:Point, Point');
  const polygonNodes = featureElement.querySelectorAll('gml\\:Polygon, Polygon');
  const lineStringNodes = featureElement.querySelectorAll('gml\\:LineString, LineString');

  let geometry: Geometry | null = null;

  if (polygonNodes.length > 0) {
    geometry = parseXMLPolygon(polygonNodes[0]);
  } else if (lineStringNodes.length > 0) {
    geometry = parseXMLLineString(lineStringNodes[0]);
  } else if (pointNodes.length > 0) {
    geometry = parseXMLPoint(pointNodes[0]);
  }

  if (!geometry) return null;

  return {
    type: 'Feature',
    geometry,
    properties,
  };
}

function parseXMLPoint(node: Element): Point | null {
  const posNode = node.querySelector('gml\\:pos, pos');
  if (!posNode?.textContent) return null;

  const coords = posNode.textContent.trim().split(/\s+/).map(Number);
  if (coords.length < 2) return null;

  return {
    type: 'Point',
    coordinates: [coords[0], coords[1]],
  };
}

function parseXMLLineString(node: Element): LineString | null {
  const posListNode = node.querySelector('gml\\:posList, posList');
  if (!posListNode?.textContent) return null;

  const values = posListNode.textContent.trim().split(/\s+/).map(Number);
  const coordinates: number[][] = [];

  for (let i = 0; i < values.length - 1; i += 2) {
    coordinates.push([values[i], values[i + 1]]);
  }

  if (coordinates.length < 2) return null;

  return {
    type: 'LineString',
    coordinates,
  };
}

function parseXMLPolygon(node: Element): Polygon | null {
  const posListNode = node.querySelector('gml\\:posList, posList');
  if (!posListNode?.textContent) return null;

  const values = posListNode.textContent.trim().split(/\s+/).map(Number);
  const coordinates: number[][] = [];

  for (let i = 0; i < values.length - 1; i += 2) {
    coordinates.push([values[i], values[i + 1]]);
  }

  if (coordinates.length < 3) return null;

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}

export function transformGeometryCoordinates(
  geometry: Geometry,
  fromCRS: string,
  toCRS: string
): Geometry {
  const transform = (coord: number[]): number[] => {
    const [lon, lat] = transformCoordinate(
      [coord[0], coord[1]],
      fromCRS as 'WGS84' | 'GCJ02' | 'BD09' | 'XIAN80' | 'BJ54',
      toCRS as 'WGS84' | 'GCJ02' | 'BD09' | 'XIAN80' | 'BJ54'
    );
    return coord.length > 2 ? [lon, lat, coord[2]] : [lon, lat];
  };

  switch (geometry.type) {
    case 'Point':
      return {
        ...geometry,
        coordinates: transform(geometry.coordinates),
      };
    case 'LineString':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(transform),
      };
    case 'Polygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) => ring.map(transform)),
      };
    case 'MultiPoint':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(transform),
      };
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((line) => line.map(transform)),
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((poly) =>
          poly.map((ring) => ring.map(transform))
        ),
      };
    default:
      return geometry;
  }
}

export function simplifyGeometry(geometry: Geometry, tolerance: number = 0.0001): Geometry {
  const simplifyRing = (coords: number[][]): number[][] => {
    if (coords.length <= 2) return coords;
    return douglasPeucker(coords, tolerance);
  };

  switch (geometry.type) {
    case 'LineString':
      return {
        ...geometry,
        coordinates: simplifyRing(geometry.coordinates as number[][]),
      };
    case 'Polygon':
      return {
        ...geometry,
        coordinates: (geometry.coordinates as number[][][]).map(simplifyRing),
      };
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: (geometry.coordinates as number[][][]).map(simplifyRing),
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: (geometry.coordinates as number[][][][]).map((poly) =>
          poly.map(simplifyRing)
        ),
      };
    default:
      return geometry;
  }
}

function douglasPeucker(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
}

function perpendicularDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) {
    return Math.sqrt(
      Math.pow(point[0] - lineStart[0], 2) + Math.pow(point[1] - lineStart[1], 2)
    );
  }

  const u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag);

  if (u <= 0 || u >= 1) {
    const d1 = Math.sqrt(
      Math.pow(point[0] - lineStart[0], 2) + Math.pow(point[1] - lineStart[1], 2)
    );
    const d2 = Math.sqrt(
      Math.pow(point[0] - lineEnd[0], 2) + Math.pow(point[1] - lineEnd[1], 2)
    );
    return Math.min(d1, d2);
  }

  const ix = lineStart[0] + u * dx;
  const iy = lineStart[1] + u * dy;

  return Math.sqrt(Math.pow(point[0] - ix, 2) + Math.pow(point[1] - iy, 2));
}

export function generateMockWFSResponse(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: '勘探区A',
          area: 125000,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [116.395, 39.905],
              [116.400, 39.905],
              [116.400, 39.910],
              [116.395, 39.910],
              [116.395, 39.905],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          name: '断层线F1',
          length: 2500,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [116.392, 39.908],
            [116.397, 39.912],
            [116.402, 39.915],
          ],
        },
      },
    ],
  };
}
