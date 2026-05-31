export class CoordinateConverter {
    constructor() {
        this.bounds = {
            minX: -100,
            maxX: 100,
            minY: -100,
            maxY: 100,
            minZ: -50,
            maxZ: 100
        };

        this.originLng = 116.4074;
        this.originLat = 39.9042;
        this.scale = 0.0001;
    }

    setBounds(bounds) {
        this.bounds = { ...bounds };
        
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;
        
        const size = Math.max(
            bounds.maxX - bounds.minX,
            bounds.maxZ - bounds.minZ
        );
        this.scale = size > 0 ? 0.001 / (size / 100) : 0.0001;
    }

    sceneToGeo(sceneX, sceneZ) {
        const lng = this.originLng + (sceneX * this.scale);
        const lat = this.originLat + (sceneZ * this.scale);
        
        return {
            lng: this.round(lng, 8),
            lat: this.round(lat, 8)
        };
    }

    geoToScene(lng, lat) {
        const x = (lng - this.originLng) / this.scale;
        const y = (lat - this.originLat) / this.scale;
        
        return {
            x: this.round(x, 3),
            y: this.round(y, 3)
        };
    }

    wgs84ToMercator(lng, lat) {
        const x = lng * 20037508.34 / 180;
        let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        y = y * 20037508.34 / 180;
        
        return { x, y };
    }

    mercatorToWgs84(x, y) {
        const lng = x / 20037508.34 * 180;
        let lat = y / 20037508.34 * 180;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
        
        return { lng, lat };
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }

    calculateArea(coordinates) {
        if (coordinates.length < 3) return 0;

        let area = 0;
        const n = coordinates.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const p1 = coordinates[i];
            const p2 = coordinates[j];

            area += this.toRad(p2[0] - p1[0]) * 
                    (2 + Math.sin(this.toRad(p1[1])) + Math.sin(this.toRad(p2[1])));
        }

        area = area * 6378137 * 6378137 / 2;

        return Math.abs(area);
    }

    toRad(degrees) {
        return degrees * Math.PI / 180;
    }

    toDegrees(radians) {
        return radians * 180 / Math.PI;
    }

    round(value, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    formatCoordinate(lng, lat) {
        const formatDegrees = (deg, isLng) => {
            const direction = isLng ? (deg >= 0 ? 'E' : 'W') : (deg >= 0 ? 'N' : 'S');
            const absDeg = Math.abs(deg);
            const d = Math.floor(absDeg);
            const m = Math.floor((absDeg - d) * 60);
            const s = Math.round(((absDeg - d) * 60 - m) * 60 * 100) / 100;
            return `${d}°${m}'${s}"${direction}`;
        };

        return `${formatDegrees(lat, false)}, ${formatDegrees(lng, true)}`;
    }
}
