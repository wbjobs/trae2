class CoordinateTransform {
  constructor(options = {}) {
    this.sourceCRS = options.sourceCRS || 'EPSG:4326';
    this.targetCRS = options.targetCRS || 'EPSG:3857';
    this.offset = options.offset || { x: 0, y: 0, z: 0 };
    this.scale = options.scale || { x: 1, y: 1, z: 1 };
    this.rotation = options.rotation || { x: 0, y: 0, z: 0 };
    this._proj4Available = typeof proj4 !== 'undefined';
    
    this._initProjections();
  }

  _initProjections() {
    if (this._proj4Available) {
      proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
      proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs');
      proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs');
      proj4.defs('EPSG:4547', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    }
  }

  transformPoint(point, sourceCRS, targetCRS) {
    const src = sourceCRS || this.sourceCRS;
    const tgt = targetCRS || this.targetCRS;
    
    let result = { ...point };
    
    if (this._proj4Available && src !== tgt) {
      try {
        const transformed = proj4(src, tgt, [point.x, point.y]);
        result.x = transformed[0];
        result.y = transformed[1];
        result.z = point.z !== undefined ? point.z : 0;
      } catch (e) {
        console.warn(`Projection transform failed: ${e.message}`);
      }
    }
    
    result = this.applyScale(result);
    result = this.applyRotation(result);
    result = this.applyOffset(result);
    
    return result;
  }

  transformPoints(points, sourceCRS, targetCRS) {
    return points.map(point => this.transformPoint(point, sourceCRS, targetCRS));
  }

  transformArray(coordinates, sourceCRS, targetCRS, stride = 3) {
    const result = new Float32Array(coordinates.length);
    
    for (let i = 0; i < coordinates.length; i += stride) {
      const point = {
        x: coordinates[i],
        y: coordinates[i + 1],
        z: stride > 2 ? coordinates[i + 2] : 0
      };
      
      const transformed = this.transformPoint(point, sourceCRS, targetCRS);
      result[i] = transformed.x;
      result[i + 1] = transformed.y;
      if (stride > 2) {
        result[i + 2] = transformed.z;
      }
    }
    
    return result;
  }

  inverseTransformPoint(point, sourceCRS, targetCRS) {
    const src = sourceCRS || this.targetCRS;
    const tgt = targetCRS || this.sourceCRS;
    
    let result = { ...point };
    
    result = this.inverseOffset(result);
    result = this.inverseRotation(result);
    result = this.inverseScale(result);
    
    if (this._proj4Available && src !== tgt) {
      try {
        const transformed = proj4(src, tgt, [result.x, result.y]);
        result.x = transformed[0];
        result.y = transformed[1];
      } catch (e) {
        console.warn(`Inverse projection transform failed: ${e.message}`);
      }
    }
    
    return result;
  }

  inverseTransformPoints(points, sourceCRS, targetCRS) {
    return points.map(point => this.inverseTransformPoint(point, sourceCRS, targetCRS));
  }

  applyOffset(point) {
    return {
      x: point.x + this.offset.x,
      y: point.y + this.offset.y,
      z: (point.z !== undefined ? point.z : 0) + this.offset.z
    };
  }

  inverseOffset(point) {
    return {
      x: point.x - this.offset.x,
      y: point.y - this.offset.y,
      z: (point.z !== undefined ? point.z : 0) - this.offset.z
    };
  }

  applyScale(point) {
    return {
      x: point.x * this.scale.x,
      y: point.y * this.scale.y,
      z: (point.z !== undefined ? point.z : 0) * this.scale.z
    };
  }

  inverseScale(point) {
    return {
      x: point.x / this.scale.x,
      y: point.y / this.scale.y,
      z: (point.z !== undefined ? point.z : 0) / this.scale.z
    };
  }

  applyRotation(point) {
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);
    const cosZ = Math.cos(this.rotation.z);
    const sinZ = Math.sin(this.rotation.z);

    let { x, y, z } = point;
    z = z !== undefined ? z : 0;

    let y1 = y * cosX - z * sinX;
    let z1 = y * sinX + z * cosX;

    let x2 = x * cosY + z1 * sinY;
    let z2 = -x * sinY + z1 * cosY;

    let x3 = x2 * cosZ - y1 * sinZ;
    let y3 = x2 * sinZ + y1 * cosZ;

    return { x: x3, y: y3, z: z2 };
  }

  inverseRotation(point) {
    const cosX = Math.cos(-this.rotation.x);
    const sinX = Math.sin(-this.rotation.x);
    const cosY = Math.cos(-this.rotation.y);
    const sinY = Math.sin(-this.rotation.y);
    const cosZ = Math.cos(-this.rotation.z);
    const sinZ = Math.sin(-this.rotation.z);

    let { x, y, z } = point;
    z = z !== undefined ? z : 0;

    let x1 = x * cosZ - y * sinZ;
    let y1 = x * sinZ + y * cosZ;

    let x2 = x1 * cosY + z * sinY;
    let z2 = -x1 * sinY + z * cosY;

    let y3 = y1 * cosX - z2 * sinX;
    let z3 = y1 * sinX + z2 * cosX;

    return { x: x2, y: y3, z: z3 };
  }

  setOffset(x, y, z = 0) {
    this.offset = { x, y, z };
  }

  setScale(x, y, z = 1) {
    this.scale = { x, y, z };
  }

  setRotation(x, y, z = 0) {
    this.rotation = { x, y, z };
  }

  setSourceCRS(crs) {
    this.sourceCRS = crs;
  }

  setTargetCRS(crs) {
    this.targetCRS = crs;
  }

  wgs84ToMercator(lon, lat, height = 0) {
    if (this._proj4Available) {
      const result = proj4('EPSG:4326', 'EPSG:3857', [lon, lat]);
      return { x: result[0], y: result[1], z: height };
    }
    
    const x = lon * 20037508.34 / 180;
    let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    y = y * 20037508.34 / 180;
    return { x, y, z: height };
  }

  mercatorToWgs84(x, y, z = 0) {
    if (this._proj4Available) {
      const result = proj4('EPSG:3857', 'EPSG:4326', [x, y]);
      return { lon: result[0], lat: result[1], height: z };
    }
    
    const lon = x / 20037508.34 * 180;
    let lat = y / 20037508.34 * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return { lon, lat, height: z };
  }

  lonLatToLocal(lon, lat, originLon, originLat) {
    const R = 6378137;
    const dLon = (lon - originLon) * Math.PI / 180;
    const dLat = (lat - originLat) * Math.PI / 180;
    const latRad = originLat * Math.PI / 180;
    
    const x = R * dLon * Math.cos(latRad);
    const y = R * dLat;
    
    return { x, y };
  }

  localToLonLat(x, y, originLon, originLat) {
    const R = 6378137;
    const latRad = originLat * Math.PI / 180;
    
    const dLon = x / (R * Math.cos(latRad));
    const dLat = y / R;
    
    const lon = originLon + dLon * 180 / Math.PI;
    const lat = originLat + dLat * 180 / Math.PI;
    
    return { lon, lat };
  }

  boundsTransform(bounds, sourceCRS, targetCRS) {
    const minPoint = this.transformPoint(
      { x: bounds.minX, y: bounds.minY, z: bounds.minZ },
      sourceCRS, targetCRS
    );
    const maxPoint = this.transformPoint(
      { x: bounds.maxX, y: bounds.maxY, z: bounds.maxZ },
      sourceCRS, targetCRS
    );
    
    return {
      minX: Math.min(minPoint.x, maxPoint.x),
      minY: Math.min(minPoint.y, maxPoint.y),
      minZ: Math.min(minPoint.z, maxPoint.z),
      maxX: Math.max(minPoint.x, maxPoint.x),
      maxY: Math.max(minPoint.y, maxPoint.y),
      maxZ: Math.max(minPoint.z, maxPoint.z)
    };
  }

  distance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const dz = (point2.z || 0) - (point1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  area(polygon) {
    if (polygon.length < 3) return 0;
    
    let area = 0;
    const n = polygon.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  centerOfBounds(bounds) {
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2
    };
  }

  expandBounds(bounds, factor = 1.1) {
    const center = this.centerOfBounds(bounds);
    const halfSize = {
      x: (bounds.maxX - bounds.minX) / 2 * factor,
      y: (bounds.maxY - bounds.minY) / 2 * factor,
      z: (bounds.maxZ - bounds.minZ) / 2 * factor
    };
    
    return {
      minX: center.x - halfSize.x,
      minY: center.y - halfSize.y,
      minZ: center.z - halfSize.z,
      maxX: center.x + halfSize.x,
      maxY: center.y + halfSize.y,
      maxZ: center.z + halfSize.z
    };
  }
}

export default CoordinateTransform;
