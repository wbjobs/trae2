import * as THREE from 'three'

export class VectorRenderer {
  constructor(scene, centerLon, centerLat) {
    this.scene = scene
    this.centerLon = centerLon
    this.centerLat = centerLat
    this.layerStyles = this.getDefaultStyles()
  }

  getDefaultStyles() {
    return {
      landmark: {
        pointColor: 0xff6b6b,
        pointSize: 15,
        lineColor: 0xff6b6b,
        lineWidth: 3,
        polygonColor: 0xff6b6b,
        polygonOpacity: 0.3
      },
      road: {
        pointColor: 0xfeca57,
        pointSize: 10,
        lineColor: 0xfeca57,
        lineWidth: 5,
        polygonColor: 0xfeca57,
        polygonOpacity: 0.2
      },
      district: {
        pointColor: 0x48dbfb,
        pointSize: 10,
        lineColor: 0x48dbfb,
        lineWidth: 2,
        polygonColor: 0x48dbfb,
        polygonOpacity: 0.25
      },
      transport: {
        pointColor: 0x1dd1a1,
        pointSize: 12,
        lineColor: 0x1dd1a1,
        lineWidth: 2,
        polygonColor: 0x1dd1a1,
        polygonOpacity: 0.3
      },
      default: {
        pointColor: 0xff9ff3,
        pointSize: 10,
        lineColor: 0xff9ff3,
        lineWidth: 2,
        polygonColor: 0xff9ff3,
        polygonOpacity: 0.3
      }
    }
  }

  setLayerStyle(layerName, style) {
    this.layerStyles[layerName] = { ...this.layerStyles[layerName] || this.layerStyles.default, ...style }
  }

  renderVectorData(features, layerName) {
    const objects = []
    const style = this.layerStyles[layerName] || this.layerStyles.default

    features.forEach((feature) => {
      const objs = this.renderFeature(feature, style, layerName)
      objects.push(...objs)
    })

    return objects
  }

  renderFeature(feature, style, layerName) {
    const objects = []
    const geometry = feature.localCoordinates

    if (!geometry) return objects

    switch (geometry.type) {
      case 'Point':
        objects.push(this.renderPoint(geometry.coordinates, style, feature))
        break

      case 'MultiPoint':
        geometry.coordinates.forEach((coord) => {
          objects.push(this.renderPoint(coord, style, feature))
        })
        break

      case 'LineString':
        objects.push(this.renderLineString(geometry.coordinates, style, feature))
        break

      case 'MultiLineString':
        geometry.coordinates.forEach((line) => {
          objects.push(this.renderLineString(line, style, feature))
        })
        break

      case 'Polygon':
        objects.push(...this.renderPolygon(geometry.coordinates, style, feature))
        break

      case 'MultiPolygon':
        geometry.coordinates.forEach((polygon) => {
          objects.push(...this.renderPolygon(polygon, style, feature))
        })
        break

      default:
        console.warn(`Unsupported geometry type: ${geometry.type}`)
    }

    objects.forEach((obj) => {
      obj.userData = {
        featureId: feature.id,
        layerName: layerName,
        feature: feature
      }
    })

    return objects
  }

  renderPoint(coordinates, style, feature) {
    const [x, y, z] = coordinates

    const geometry = new THREE.SphereGeometry(style.pointSize || 10, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color: style.pointColor,
      emissive: style.pointColor,
      emissiveIntensity: 0.3,
      metalness: 0.3,
      roughness: 0.7
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, (y || 0) + (style.pointSize || 10), z)
    mesh.castShadow = true

    const labelCanvas = this.createLabelCanvas(feature.name || '')
    const labelTexture = new THREE.CanvasTexture(labelCanvas)
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true
    })
    const label = new THREE.Sprite(labelMaterial)
    label.position.set(x, (y || 0) + (style.pointSize || 10) + 30, z)
    label.scale.set(100, 30, 1)

    const group = new THREE.Group()
    group.add(mesh)
    group.add(label)

    return group
  }

  renderLineString(coordinates, style, feature) {
    const points = coordinates.map((coord) =>
      new THREE.Vector3(coord[0], coord[1] || 0, coord[2])
    )

    const curve = new THREE.CatmullRomCurve3(points)
    const curvePoints = curve.getPoints(points.length * 2)
    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints)

    const material = new THREE.LineBasicMaterial({
      color: style.lineColor,
      linewidth: style.lineWidth || 2,
      transparent: true,
      opacity: 0.9
    })

    const line = new THREE.Line(geometry, material)

    const tubeGeometry = new THREE.TubeGeometry(curve, points.length * 2, 5, 8, false)
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: style.lineColor,
      emissive: style.lineColor,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.7
    })
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)

    const group = new THREE.Group()
    group.add(line)
    group.add(tube)

    return group
  }

  renderPolygon(coordinates, style, feature) {
    const objects = []

    if (coordinates.length > 0) {
      const outerRing = coordinates[0]
      const vertices = []

      outerRing.forEach((coord) => {
        vertices.push(coord[0], coord[1] || 0, coord[2])
      })

      const shape = new THREE.Shape()
      const points = outerRing.map((coord) => new THREE.Vector2(coord[0], coord[2]))

      shape.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y)
      }
      shape.closePath()

      const holeShapes = []
      for (let i = 1; i < coordinates.length; i++) {
        const holeRing = coordinates[i]
        const holeShape = new THREE.Path()
        const holePoints = holeRing.map((coord) => new THREE.Vector2(coord[0], coord[2]))

        holeShape.moveTo(holePoints[0].x, holePoints[0].y)
        for (let j = 1; j < holePoints.length; j++) {
          holeShape.lineTo(holePoints[j].x, holePoints[j].y)
        }
        holeShape.closePath()
        holeShapes.push(holeShape)
      }

      if (holeShapes.length > 0) {
        shape.holes = holeShapes
      }

      const extrudeSettings = {
        steps: 1,
        depth: 20,
        bevelEnabled: false
      }

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      geometry.rotateX(-Math.PI / 2)

      const material = new THREE.MeshStandardMaterial({
        color: style.polygonColor,
        transparent: true,
        opacity: style.polygonOpacity || 0.3,
        side: THREE.DoubleSide,
        metalness: 0.1,
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      objects.push(mesh)

      const outlinePoints = outerRing.map((coord) =>
        new THREE.Vector3(coord[0], 25, coord[2])
      )
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints)
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: style.lineColor,
        linewidth: style.lineWidth || 2
      })
      const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial)
      objects.push(outline)
    }

    return objects
  }

  createLabelCanvas(text) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const padding = 10

    ctx.font = 'bold 24px Arial'
    const textWidth = ctx.measureText(text).width

    canvas.width = textWidth + padding * 2
    canvas.height = 36

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.font = 'bold 24px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)

    return canvas
  }

  createLabelSprite(text, position, color = '#ffffff') {
    const canvas = this.createLabelCanvas(text)
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.set(canvas.width * 0.5, canvas.height * 0.5, 1)
    return sprite
  }
}
