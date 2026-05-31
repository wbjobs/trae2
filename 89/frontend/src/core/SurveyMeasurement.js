import * as THREE from 'three'
import {
  calculateHaversineDistance,
  calculateVincentyDistance,
  calculateGeodeticArea,
  formatDistance,
  formatArea,
  wgs84ToLocal,
  localToWgs84
} from '../utils/coordinateTransform'

export class SurveyMeasurement {
  constructor(scene, centerLon, centerLat) {
    this.scene = scene
    this.centerLon = centerLon
    this.centerLat = centerLat

    this.mode = null
    this.isMeasuring = false
    this.points = []
    this.measureObjects = []
    this.tempObjects = []

    this.onMeasureComplete = null
  }

  startDistanceMeasurement() {
    this.clear()
    this.mode = 'distance'
    this.isMeasuring = true
    this.points = []
  }

  startAreaMeasurement() {
    this.clear()
    this.mode = 'area'
    this.isMeasuring = true
    this.points = []
  }

  addPoint(localPoint, lon, lat, height) {
    if (!this.isMeasuring) return

    const pointData = {
      local: localPoint.clone(),
      lon: lon,
      lat: lat,
      height: height
    }

    this.points.push(pointData)

    const marker = this.createPointMarker(localPoint)
    this.scene.add(marker)
    this.measureObjects.push(marker)

    if (this.points.length > 1) {
      this.updateTempLine()

      if (this.mode === 'distance') {
        this.completeDistanceMeasurement()
      }
    }

    if (this.mode === 'area' && this.points.length >= 3) {
      this.updateAreaPolygon()
    }
  }

  completeDistanceMeasurement() {
    if (this.points.length < 2) return

    const p1 = this.points[0]
    const p2 = this.points[1]

    const vincentyDistance = calculateVincentyDistance(
      p1.lon, p1.lat,
      p2.lon, p2.lat
    )

    const distance = isNaN(vincentyDistance)
      ? calculateHaversineDistance(p1.lon, p1.lat, p2.lon, p2.lat)
      : vincentyDistance

    const localDistance = p1.local.distanceTo(p2.local)

    const midPoint = new THREE.Vector3()
      .addVectors(p1.local, p2.local)
      .multiplyScalar(0.5)

    const midHeight = Math.max(p1.local.y, p2.local.y)

    const label = this.createLabel(
      formatDistance(distance),
      new THREE.Vector3(midPoint.x, midHeight + 80, midPoint.z)
    )
    this.scene.add(label)
    this.measureObjects.push(label)

    const linePoints = [
      new THREE.Vector3(p1.local.x, p1.local.y + 5, p1.local.z),
      new THREE.Vector3(p2.local.x, p2.local.y + 5, p2.local.z)
    ]
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 3
    })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    this.scene.add(line)
    this.measureObjects.push(line)

    this.isMeasuring = false

    if (this.onMeasureComplete) {
      this.onMeasureComplete({
        type: 'distance',
        distance: distance,
        haversineDistance: calculateHaversineDistance(p1.lon, p1.lat, p2.lon, p2.lat),
        localDistance: localDistance,
        formatted: formatDistance(distance),
        points: this.points
      })
    }

    return distance
  }

  completeAreaMeasurement() {
    if (this.points.length < 3) return

    const coordinates = this.points.map(p => [p.lon, p.lat])
    coordinates.push([this.points[0].lon, this.points[0].lat])

    const area = calculateGeodeticArea(coordinates)

    const centroid = new THREE.Vector3()
    this.points.forEach(p => {
      centroid.add(p.local)
    })
    centroid.divideScalar(this.points.length)

    const label = this.createLabel(
      formatArea(area),
      new THREE.Vector3(centroid.x, centroid.y + 50, centroid.z)
    )
    this.scene.add(label)
    this.measureObjects.push(label)

    this.closeAreaPolygon()

    this.isMeasuring = false

    if (this.onMeasureComplete) {
      this.onMeasureComplete({
        type: 'area',
        area: area,
        formatted: formatArea(area),
        points: this.points
      })
    }

    return area
  }

  cancel() {
    this.clear()
    this.mode = null
    this.isMeasuring = false
  }

  clear() {
    this.measureObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.measureObjects = []

    this.tempObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.tempObjects = []

    this.points = []
  }

  updateTempLine() {
    this.clearTempObjects()

    if (this.points.length < 2) return

    const points = this.points.map(p => p.local.clone())
    const geometry = new THREE.BufferGeometry().setFromPoints(points)

    const material = new THREE.LineDashedMaterial({
      color: 0xffff00,
      linewidth: 3,
      dashSize: 20,
      gapSize: 10
    })

    const line = new THREE.Line(geometry, material)
    line.computeLineDistances()

    this.scene.add(line)
    this.tempObjects.push(line)
  }

  updateAreaPolygon() {
    this.clearTempObjects()

    if (this.points.length < 3) return

    const points = this.points.map(p =>
      new THREE.Vector3(p.local.x, 5, p.local.z)
    )
    points.push(points[0])

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: 0x00ff00,
      linewidth: 3,
      dashSize: 20,
      gapSize: 10
    })

    const line = new THREE.LineLoop(geometry, material)
    line.computeLineDistances()

    this.scene.add(line)
    this.tempObjects.push(line)
  }

  closeAreaPolygon() {
    this.clearTempObjects()

    if (this.points.length < 3) return

    const points = this.points.map(p =>
      new THREE.Vector3(p.local.x, 5, p.local.z)
    )
    points.push(points[0])

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 3
    })

    const line = new THREE.LineLoop(geometry, material)

    this.scene.add(line)
    this.measureObjects.push(line)

    const shapePoints = this.points.map(p =>
      new THREE.Vector2(p.local.x, p.local.z)
    )

    const shape = new THREE.Shape()
    shape.moveTo(shapePoints[0].x, shapePoints[0].y)
    for (let i = 1; i < shapePoints.length; i++) {
      shape.lineTo(shapePoints[i].x, shapePoints[i].y)
    }
    shape.closePath()

    const extrudeSettings = {
      steps: 1,
      depth: 1,
      bevelEnabled: false
    }

    const polygonGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    polygonGeometry.rotateX(-Math.PI / 2)

    const polygonMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    })

    const polygon = new THREE.Mesh(polygonGeometry, polygonMaterial)
    this.scene.add(polygon)
    this.measureObjects.push(polygon)
  }

  createPointMarker(position) {
    const group = new THREE.Group()

    const geometry = new THREE.SphereGeometry(15, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5
    })

    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(position)
    marker.position.y += 15
    group.add(marker)

    const ringGeometry = new THREE.RingGeometry(18, 22, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    })

    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(position)
    group.add(ring)

    return group
  }

  createLabel(text, position) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const padding = 15

    ctx.font = 'bold 28px Arial'
    const textWidth = ctx.measureText(text).width

    canvas.width = textWidth + padding * 2
    canvas.height = 48

    ctx.fillStyle = 'rgba(255, 100, 100, 0.9)'
    this.roundRect(ctx, 0, 0, canvas.width, canvas.height, 8)
    ctx.fill()

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.font = 'bold 28px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    })

    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.set(canvas.width * 0.8, canvas.height * 0.8, 1)

    return sprite
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  clearTempObjects() {
    this.tempObjects.forEach(obj => {
      this.scene.remove(obj)
    })
    this.tempObjects = []
  }

  createAnnotation(localPoint, lon, lat, label, type = 'point') {
    const group = new THREE.Group()

    const color = type === 'important' ? 0xff0000 :
                  type === 'warning' ? 0xffaa00 :
                  type === 'info' ? 0x00aaff : 0x00ff00

    const geometry = new THREE.ConeGeometry(12, 30, 8)
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.3
    })

    const marker = new THREE.Mesh(geometry, material)
    marker.position.set(localPoint.x, localPoint.y + 15, localPoint.z)
    marker.rotation.x = Math.PI
    group.add(marker)

    const ballGeometry = new THREE.SphereGeometry(10, 16, 16)
    const ballMaterial = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5
    })
    const ball = new THREE.Mesh(ballGeometry, ballMaterial)
    ball.position.set(localPoint.x, localPoint.y + 35, localPoint.z)
    group.add(ball)

    if (label) {
      const labelSprite = this.createLabel(label, new THREE.Vector3(
        localPoint.x,
        localPoint.y + 70,
        localPoint.z
      ))
      group.add(labelSprite)
    }

    group.userData = {
      type: 'annotation',
      annotationType: type,
      lon: lon,
      lat: lat,
      label: label
    }

    this.scene.add(group)
    this.measureObjects.push(group)

    return group
  }

  getMeasureResults() {
    return {
      mode: this.mode,
      isMeasuring: this.isMeasuring,
      points: this.points,
      objectCount: this.measureObjects.length
    }
  }
}
