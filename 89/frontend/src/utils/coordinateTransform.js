import proj4 from 'proj4'

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs')
proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs')
proj4.defs('EPSG:4549', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +units=m +no_defs')

export const EARTH_RADIUS = 6378137.0
export const EARTH_MEAN_RADIUS = 6371008.8
export const EARTH_POLAR_RADIUS = 6356752.3142
export const EARTH_FLATTENING = 1 / 298.257223563

export function transform(coords, fromSRID, toSRID) {
  const from = `EPSG:${fromSRID}`
  const to = `EPSG:${toSRID}`
  return proj4(from, to, coords)
}

export function wgs84ToWebMercator(lon, lat) {
  const result = proj4('EPSG:4326', 'EPSG:3857', [lon, lat])
  return { x: result[0], y: result[1] }
}

export function webMercatorToWgs84(x, y) {
  const result = proj4('EPSG:3857', 'EPSG:4326', [x, y])
  return { lon: result[0], lat: result[1] }
}

export function wgs84ToLocal(lon, lat, centerLon, centerLat) {
  const center = wgs84ToWebMercator(centerLon, centerLat)
  const point = wgs84ToWebMercator(lon, lat)

  const x = point.x - center.x
  const y = point.y - center.y

  return { x, y }
}

export function localToWgs84(x, y, centerLon, centerLat) {
  const center = wgs84ToWebMercator(centerLon, centerLat)
  const mercatorLon = center.x + x
  const mercatorLat = center.y + y

  return webMercatorToWgs84(mercatorLon, mercatorLat)
}

export function calculateHaversineDistance(lon1, lat1, lon2, lat2) {
  const radLat1 = (lat1 * Math.PI) / 180
  const radLat2 = (lat2 * Math.PI) / 180
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_MEAN_RADIUS * c
}

export function calculateVincentyDistance(lon1, lat1, lon2, lat2) {
  const a = EARTH_RADIUS
  const b = EARTH_POLAR_RADIUS
  const f = EARTH_FLATTENING

  const L = ((lon2 - lon1) * Math.PI) / 180
  const U1 = Math.atan((1 - f) * Math.tan((lat1 * Math.PI) / 180))
  const U2 = Math.atan((1 - f) * Math.tan((lat2 * Math.PI) / 180))
  const sinU1 = Math.sin(U1)
  const cosU1 = Math.cos(U1)
  const sinU2 = Math.sin(U2)
  const cosU2 = Math.cos(U2)

  let lambda = L
  let lambdaP = 0
  let iterLimit = 100
  let sinLambda = 0
  let cosLambda = 0
  let sinSigma = 0
  let cosSigma = 0
  let sigma = 0
  let sinAlpha = 0
  let cosSqAlpha = 0
  let cos2SigmaM = 0

  do {
    sinLambda = Math.sin(lambda)
    cosLambda = Math.cos(lambda)
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    )
    if (sinSigma === 0) return 0
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSqAlpha = 1 - sinAlpha * sinAlpha
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
    lambdaP = lambda
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0)

  if (iterLimit === 0) return NaN

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
  const deltaSigma = B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))

  return b * A * (sigma - deltaSigma)
}

export function calculatePlanarDistance(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

export function calculateDistance(p1, p2, srid = 4326, useHighPrecision = false) {
  if (srid === 4326) {
    if (useHighPrecision) {
      const dist = calculateVincentyDistance(p1.lon, p1.lat, p2.lon, p2.lat)
      return isNaN(dist) ? calculateHaversineDistance(p1.lon, p1.lat, p2.lon, p2.lat) : dist
    }
    return calculateHaversineDistance(p1.lon, p1.lat, p2.lon, p2.lat)
  } else {
    return calculatePlanarDistance(p1.x, p1.y, p2.x, p2.y)
  }
}

export function calculatePolygonArea(coordinates) {
  if (!coordinates || coordinates.length < 3) return 0

  let area = 0
  const n = coordinates.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p1 = coordinates[i]
    const p2 = coordinates[j]
    area += p1[0] * p2[1] - p2[0] * p1[1]
  }

  return Math.abs(area / 2)
}

export function calculateGeodeticArea(coordinates) {
  if (!coordinates || coordinates.length < 3) return 0

  const R = EARTH_MEAN_RADIUS
  const n = coordinates.length
  let area = 0

  const ring = coordinates.map(c => [
    (c[0] * Math.PI) / 180,
    (c[1] * Math.PI) / 180
  ])

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const k = (i + 2) % n

    const lon1 = ring[i][0]
    const lat1 = ring[i][1]
    const lon2 = ring[j][0]
    const lat2 = ring[j][1]
    const lon3 = ring[k][0]
    const lat3 = ring[k][1]

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }

  return Math.abs((area * R * R) / 2.0)
}

export function calculatePlanarPolygonArea(coordinates) {
  if (!coordinates || coordinates.length < 3) return 0

  const mercatorCoords = coordinates.map(c => {
    const merc = wgs84ToWebMercator(c[0], c[1])
    return [merc.x, merc.y]
  })

  return calculatePolygonArea(mercatorCoords)
}

export function formatDistance(distance) {
  if (distance < 1000) {
    return `${distance.toFixed(2)} 米`
  } else {
    return `${(distance / 1000).toFixed(2)} 公里`
  }
}

export function formatArea(area) {
  if (area < 1000000) {
    return `${area.toFixed(2)} 平方米`
  } else {
    return `${(area / 1000000).toFixed(2)} 平方公里`
  }
}

export function getBboxFromGeometry(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  function processCoords(coords) {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0])
      minY = Math.min(minY, coords[1])
      maxX = Math.max(maxX, coords[0])
      maxY = Math.max(maxY, coords[1])
    } else {
      coords.forEach(processCoords)
    }
  }

  if (geometry && geometry.coordinates) {
    processCoords(geometry.coordinates)
  }

  return { minX, minY, maxX, maxY }
}

export function getCenterFromBbox(bbox) {
  return {
    lon: (bbox.minX + bbox.maxX) / 2,
    lat: (bbox.minY + bbox.maxY) / 2
  }
}
