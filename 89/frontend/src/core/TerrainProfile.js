import * as THREE from 'three'
import { calculateHaversineDistance, formatDistance, formatArea } from '../utils/coordinateTransform'

export class TerrainProfile {
  constructor(scene, terrainMesh, centerLon, centerLat) {
    this.scene = scene
    this.terrainMesh = terrainMesh
    this.centerLon = centerLon
    this.centerLat = centerLat

    this.isActive = false
    this.points = []
    this.profileObjects = []
    this.profileLine = null

    this.onProfileComplete = null

    this.raycaster = new THREE.Raycaster()
  }

  start() {
    this.clear()
    this.isActive = true
    this.points = []
  }

  addPoint(localPoint, lon, lat) {
    if (!this.isActive) return

    const pointData = {
      local: localPoint.clone(),
      lon: lon,
      lat: lat,
      height: localPoint.y
    }

    this.points.push(pointData)

    const marker = this.createMarker(localPoint, this.points.length)
    this.scene.add(marker)
    this.profileObjects.push(marker)

    if (this.points.length === 2) {
      this.complete()
    } else if (this.points.length > 1) {
      this.updateTempLine()
    }
  }

  cancel() {
    this.clear()
    this.isActive = false
  }

  clear() {
    this.profileObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.profileObjects = []
    this.points = []
    this.profileLine = null
  }

  updateTempLine() {
    const existing = this.profileObjects.find(o => o.userData.isTempLine)
    if (existing) {
      this.scene.remove(existing)
      this.profileObjects = this.profileObjects.filter(o => o !== existing)
    }

    const points = this.points.map(p => p.local.clone())
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: 0x00ffff,
      linewidth: 3,
      dashSize: 20,
      gapSize: 10
    })
    const line = new THREE.Line(geometry, material)
    line.computeLineDistances()
    line.userData.isTempLine = true

    this.scene.add(line)
    this.profileObjects.push(line)
  }

  complete() {
    if (this.points.length < 2) return

    this.isActive = false

    const p1 = this.points[0]
    const p2 = this.points[1]

    const profileData = this.generateProfileData(p1, p2, 100)

    this.createProfileLine3D(profileData)
    this.createProfilePlane(profileData)

    const horizontalDistance = calculateHaversineDistance(
      p1.lon, p1.lat,
      p2.lon, p2.lat
    )

    const elevations = profileData.map(p => p.height)
    const minElevation = Math.min(...elevations)
    const maxElevation = Math.max(...elevations)
    const elevationDiff = maxElevation - minElevation

    const slope = Math.atan2(elevationDiff, horizontalDistance) * (180 / Math.PI)

    const result = {
      type: 'profile',
      startPoint: p1,
      endPoint: p2,
      horizontalDistance: horizontalDistance,
      minElevation: minElevation,
      maxElevation: maxElevation,
      elevationDiff: elevationDiff,
      averageElevation: elevations.reduce((a, b) => a + b, 0) / elevations.length,
      slope: Math.abs(slope),
      profileData: profileData,
      formatted: {
        distance: formatDistance(horizontalDistance),
        minElevation: `${minElevation.toFixed(1)} m`,
        maxElevation: `${maxElevation.toFixed(1)} m`,
        elevationDiff: `${elevationDiff.toFixed(1)} m`,
        slope: `${slope.toFixed(2)}°`
      }
    }

    if (this.onProfileComplete) {
      this.onProfileComplete(result)
    }

    return result
  }

  generateProfileData(p1, p2, sampleCount = 100) {
    const profileData = []

    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount

      const x = p1.local.x + (p2.local.x - p1.local.x) * t
      const z = p1.local.z + (p2.local.z - p1.local.z) * t

      const height = this.getTerrainHeightAt(x, z)

      const lon = p1.lon + (p2.lon - p1.lon) * t
      const lat = p1.lat + (p2.lat - p1.lat) * t

      const distance = calculateHaversineDistance(p1.lon, p1.lat, lon, lat)

      profileData.push({
        index: i,
        t: t,
        x: x,
        z: z,
        height: height,
        lon: lon,
        lat: lat,
        distance: distance
      })
    }

    return profileData
  }

  getTerrainHeightAt(x, z) {
    if (!this.terrainMesh) return 0

    const geometry = this.terrainMesh.geometry
    const positions = geometry.attributes.position.array
    const indices = geometry.index ? geometry.index.array : null

    const gridSize = Math.sqrt(positions.length / 3)

    const halfSize = 2000
    const resolution = 200

    const nx = (x + halfSize) / (halfSize * 2)
    const nz = (z + halfSize) / (halfSize * 2)

    const col = Math.floor(nx * (resolution))
    const row = Math.floor(nz * (resolution))

    const clampedCol = Math.max(0, Math.min(resolution, col))
    const clampedRow = Math.max(0, Math.min(resolution, row))

    const vertexIndex = clampedRow * (resolution + 1) + clampedCol
    if (vertexIndex * 3 + 1 < positions.length) {
      return positions[vertexIndex * 3 + 1]
    }

    return 0
  }

  createProfileLine3D(profileData) {
    const existing = this.profileObjects.find(o => o.userData.isProfileLine)
    if (existing) {
      this.scene.remove(existing)
      this.profileObjects = this.profileObjects.filter(o => o !== existing)
    }

    const points = profileData.map(p => new THREE.Vector3(p.x, p.height + 2, p.z))
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 4
    })
    const line = new THREE.Line(geometry, material)
    line.userData.isProfileLine = true

    this.scene.add(line)
    this.profileObjects.push(line)
  }

  createProfilePlane(profileData) {
    if (profileData.length < 2) return

    const minHeight = Math.min(...profileData.map(p => p.height)) - 20
    const maxHeight = Math.max(...profileData.map(p => p.height)) + 50

    const shape = new THREE.Shape()
    shape.moveTo(profileData[0].x, minHeight)

    profileData.forEach((p, i) => {
      if (i === 0) return
      shape.lineTo(p.x, p.height + 2)
    })

    const lastPoint = profileData[profileData.length - 1]
    shape.lineTo(lastPoint.x, minHeight)
    shape.lineTo(profileData[0].x, minHeight)

    const points = []
    profileData.forEach(p => {
      points.push(new THREE.Vector3(p.x, minHeight, p.z))
      points.push(new THREE.Vector3(p.x, p.height + 2, p.z))
    })

    const geometry = new THREE.BufferGeometry()
    const vertices = []
    const colors = []

    for (let i = 0; i < profileData.length - 1; i++) {
      const p1 = profileData[i]
      const p2 = profileData[i + 1]

      vertices.push(
        p1.x, minHeight, p1.z,
        p2.x, minHeight, p2.z,
        p1.x, p1.height + 2, p1.z
      )
      vertices.push(
        p2.x, minHeight, p2.z,
        p2.x, p2.height + 2, p2.z,
        p1.x, p1.height + 2, p1.z
      )

      const heightRatio1 = (p1.height - minHeight) / (maxHeight - minHeight)
      const heightRatio2 = (p2.height - minHeight) / (maxHeight - minHeight)

      const color1 = this.heightToColor(heightRatio1)
      const color2 = this.heightToColor(heightRatio2)

      for (let j = 0; j < 3; j++) {
        colors.push(color1.r, color1.g, color1.b)
      }
      for (let j = 0; j < 3; j++) {
        colors.push(color2.r, color2.g, color2.b)
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    })

    const plane = new THREE.Mesh(geometry, material)
    plane.userData.isProfilePlane = true

    this.scene.add(plane)
    this.profileObjects.push(plane)
  }

  heightToColor(ratio) {
    if (ratio < 0.2) {
      return { r: 0.2, g: 0.4, b: 0.8 }
    } else if (ratio < 0.4) {
      return { r: 0.3, g: 0.7, b: 0.4 }
    } else if (ratio < 0.6) {
      return { r: 0.8, g: 0.8, b: 0.3 }
    } else if (ratio < 0.8) {
      return { r: 0.8, g: 0.5, b: 0.2 }
    } else {
      return { r: 0.95, g: 0.95, b: 0.95 }
    }
  }

  createMarker(position, index) {
    const group = new THREE.Group()

    const geometry = new THREE.ConeGeometry(15, 40, 8)
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.5
    })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(position)
    marker.position.y += 30
    marker.rotation.x = Math.PI
    group.add(marker)

    const ringGeo = new THREE.RingGeometry(18, 25, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(position)
    group.add(ring)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 60
    canvas.height = 40
    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)'
    ctx.beginPath()
    ctx.arc(30, 20, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(index.toString(), 30, 20)

    const texture = new THREE.CanvasTexture(canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.copy(position)
    sprite.position.y += 60
    sprite.scale.set(50, 35, 1)
    group.add(sprite)

    return group
  }

  generateProfileSvg(profileData, width = 600, height = 300) {
    const distances = profileData.map(p => p.distance)
    const heights = profileData.map(p => p.height)

    const maxDist = Math.max(...distances)
    const minHeight = Math.min(...heights)
    const maxHeight = Math.max(...heights)
    const heightRange = maxHeight - minHeight || 1

    const padding = { top: 30, right: 30, bottom: 50, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    let svg = `<?xml version="1.0" encoding="UTF-8"?>`
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`

    svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#1a1a2e"/>`

    const gridLines = 5
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartHeight
      const h = maxHeight - (i / gridLines) * heightRange
      svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" stroke="#444" stroke-width="1"/>`
      svg += `<text x="${padding.left - 10}" y="${y + 4}" fill="#aaa" font-size="12" text-anchor="end">${h.toFixed(0)}m</text>`
    }

    for (let i = 0; i <= gridLines; i++) {
      const x = padding.left + (i / gridLines) * chartWidth
      const d = (i / gridLines) * maxDist
      svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + chartHeight}" stroke="#444" stroke-width="1"/>`
      svg += `<text x="${x}" y="${padding.top + chartHeight + 20}" fill="#aaa" font-size="12" text-anchor="middle">${(d / 1000).toFixed(1)}km</text>`
    }

    let pathD = ''
    profileData.forEach((p, i) => {
      const x = padding.left + (p.distance / maxDist) * chartWidth
      const y = padding.top + chartHeight - ((p.height - minHeight) / heightRange) * chartHeight
      if (i === 0) {
        pathD += `M ${x} ${y}`
      } else {
        pathD += ` L ${x} ${y}`
      }
    })

    const areaPath = pathD + ` L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`
    svg += `<path d="${areaPath}" fill="url(#gradient)" opacity="0.5"/>`

    svg += `<defs><linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">`
    svg += `<stop offset="0%" style="stop-color:#00ffff;stop-opacity:1" />`
    svg += `<stop offset="100%" style="stop-color:#00ffff;stop-opacity:0.2" />`
    svg += `</linearGradient></defs>`

    svg += `<path d="${pathD}" stroke="#00ffff" stroke-width="3" fill="none"/>`

    svg += `<text x="${width / 2}" y="20" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">地形剖面图</text>`
    svg += `<text x="${padding.left + chartWidth / 2}" y="${height - 10}" fill="#aaa" font-size="12" text-anchor="middle">水平距离</text>`

    svg += `</svg>`

    return svg
  }
}
