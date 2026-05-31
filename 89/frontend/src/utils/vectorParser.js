import * as turf from '@turf/turf'
import { wgs84ToLocal } from './coordinateTransform'

export function parseGeoJson(geoJson, centerLon, centerLat) {
  if (!geoJson) return []

  const features = geoJson.type === 'FeatureCollection' ? geoJson.features : [geoJson]
  const result = []

  features.forEach((feature, index) => {
    const parsed = parseFeature(feature, centerLon, centerLat)
    if (parsed) {
      parsed.id = feature.id || index
      result.push(parsed)
    }
  })

  return result
}

export function parseFeature(feature, centerLon, centerLat) {
  if (!feature || !feature.geometry) return null

  const geometry = feature.geometry
  const properties = feature.properties || {}

  const localCoords = geometryToLocal(geometry, centerLon, centerLat)
  if (!localCoords) return null

  return {
    id: feature.id,
    type: geometry.type,
    geometry: geometry,
    localCoordinates: localCoords,
    properties: properties,
    name: properties.name || `Feature_${Date.now()}`,
    layerName: properties.layerName || 'default'
  }
}

export function geometryToLocal(geometry, centerLon, centerLat) {
  if (!geometry || !geometry.coordinates) return null

  switch (geometry.type) {
    case 'Point':
      return pointToLocal(geometry.coordinates, centerLon, centerLat)

    case 'MultiPoint':
      return multiPointToLocal(geometry.coordinates, centerLon, centerLat)

    case 'LineString':
      return lineStringToLocal(geometry.coordinates, centerLon, centerLat)

    case 'MultiLineString':
      return multiLineStringToLocal(geometry.coordinates, centerLon, centerLat)

    case 'Polygon':
      return polygonToLocal(geometry.coordinates, centerLon, centerLat)

    case 'MultiPolygon':
      return multiPolygonToLocal(geometry.coordinates, centerLon, centerLat)

    default:
      console.warn(`Unsupported geometry type: ${geometry.type}`)
      return null
  }
}

function pointToLocal(coords, centerLon, centerLat) {
  const local = wgs84ToLocal(coords[0], coords[1], centerLon, centerLat)
  return {
    type: 'Point',
    coordinates: [local.x, coords[2] || 0, local.y]
  }
}

function multiPointToLocal(coords, centerLon, centerLat) {
  return {
    type: 'MultiPoint',
    coordinates: coords.map((c) => {
      const local = wgs84ToLocal(c[0], c[1], centerLon, centerLat)
      return [local.x, c[2] || 0, local.y]
    })
  }
}

function lineStringToLocal(coords, centerLon, centerLat) {
  return {
    type: 'LineString',
    coordinates: coords.map((c) => {
      const local = wgs84ToLocal(c[0], c[1], centerLon, centerLat)
      return [local.x, c[2] || 0, local.y]
    })
  }
}

function multiLineStringToLocal(coords, centerLon, centerLat) {
  return {
    type: 'MultiLineString',
    coordinates: coords.map((line) =>
      line.map((c) => {
        const local = wgs84ToLocal(c[0], c[1], centerLon, centerLat)
        return [local.x, c[2] || 0, local.y]
      })
    )
  }
}

function polygonToLocal(coords, centerLon, centerLat) {
  return {
    type: 'Polygon',
    coordinates: coords.map((ring) =>
      ring.map((c) => {
        const local = wgs84ToLocal(c[0], c[1], centerLon, centerLat)
        return [local.x, c[2] || 0, local.y]
      })
    )
  }
}

function multiPolygonToLocal(coords, centerLon, centerLat) {
  return {
    type: 'MultiPolygon',
    coordinates: coords.map((polygon) =>
      polygon.map((ring) =>
        ring.map((c) => {
          const local = wgs84ToLocal(c[0], c[1], centerLon, centerLat)
          return [local.x, c[2] || 0, local.y]
        })
      )
    )
  }
}

export function createGridData(bbox, resolution = 10) {
  const { minX, minY, maxX, maxY } = bbox
  const width = maxX - minX
  const height = maxY - minY
  const cols = Math.ceil(width / resolution)
  const rows = Math.ceil(height / resolution)

  const vertices = []
  const indices = []

  for (let z = 0; z <= rows; z++) {
    for (let x = 0; x <= cols; x++) {
      const px = minX + x * resolution
      const py = minY + z * resolution
      const height = generateTerrainHeight(px, py)

      vertices.push(px, height, py)
    }
  }

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const topLeft = z * (cols + 1) + x
      const topRight = topLeft + 1
      const bottomLeft = (z + 1) * (cols + 1) + x
      const bottomRight = bottomLeft + 1

      indices.push(topLeft, bottomLeft, topRight)
      indices.push(topRight, bottomLeft, bottomRight)
    }
  }

  return { vertices, indices, cols, rows, width, height }
}

function generateTerrainHeight(x, y) {
  const noise1 = Math.sin(x * 0.001) * Math.cos(y * 0.001) * 50
  const noise2 = Math.sin(x * 0.005 + 1) * Math.cos(y * 0.005 + 0.5) * 20
  const noise3 = Math.sin(x * 0.02 + 2) * Math.cos(y * 0.02 + 1) * 5
  return noise1 + noise2 + noise3 + 10
}

export function generateDemData(centerLon, centerLat, size = 2000, resolution = 10) {
  const halfSize = size / 2
  const bbox = {
    minX: -halfSize,
    minY: -halfSize,
    maxX: halfSize,
    maxY: halfSize
  }

  const gridData = createGridData(bbox, resolution)

  const colors = []
  const vertexCount = gridData.vertices.length / 3

  for (let i = 0; i < vertexCount; i++) {
    const height = gridData.vertices[i * 3 + 1]
    const color = heightToColor(height)
    colors.push(color.r, color.g, color.b)
  }

  return {
    ...gridData,
    colors,
    centerLon,
    centerLat,
    size,
    resolution
  }
}

function heightToColor(height) {
  const normalizedHeight = (height + 100) / 200
  let r, g, b

  if (normalizedHeight < 0.2) {
    r = 0.2
    g = 0.4
    b = 0.8
  } else if (normalizedHeight < 0.4) {
    r = 0.4
    g = 0.7
    b = 0.4
  } else if (normalizedHeight < 0.6) {
    r = 0.7
    g = 0.8
    b = 0.4
  } else if (normalizedHeight < 0.8) {
    r = 0.8
    g = 0.6
    b = 0.3
  } else {
    r = 0.95
    g = 0.95
    b = 0.95
  }

  return { r, g, b }
}

export function getGeometryCenter(geometry) {
  if (!geometry || !geometry.coordinates) return null

  switch (geometry.type) {
    case 'Point':
      return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] }

    case 'Polygon':
      const center = turf.center(geometry)
      return {
        lon: center.geometry.coordinates[0],
        lat: center.geometry.coordinates[1]
      }

    default:
      const bbox = turf.bbox(geometry)
      return {
        lon: (bbox[0] + bbox[2]) / 2,
        lat: (bbox[1] + bbox[3]) / 2
      }
  }
}

export function getGeometryBounds(geometry) {
  if (!geometry || !geometry.coordinates) return null
  return turf.bbox(geometry)
}

export function simplifyGeometry(geometry, tolerance = 0.001) {
  if (!geometry) return null
  return turf.simplify(geometry, { tolerance, highQuality: true })
}
