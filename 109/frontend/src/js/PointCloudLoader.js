export class PointCloudLoader {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.points = [];
        this.pointCloudMesh = null;
        this.bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity
        };
        this.offsetX = 0;
        this.offsetZ = 0;
        this.scale = 1;
    }

    loadPoints(pointData) {
        this.clear();
        this.points = [];
        
        const positions = [];
        const colors = [];

        let sumX = 0, sumZ = 0;
        let tempPoints = [];

        for (const point of pointData) {
            const x = point.x || 0;
            const y = point.z || point.y || 0;
            const z = point.y !== undefined ? point.y : (point.z || 0);

            tempPoints.push({ x, y, z });
            sumX += x;
            sumZ += z;
        }

        if (tempPoints.length > 0) {
            this.offsetX = sumX / tempPoints.length;
            this.offsetZ = sumZ / tempPoints.length;
            this.scale = this.calculateOptimalScale(tempPoints);
        }

        for (const point of tempPoints) {
            const normalizedX = (point.x - this.offsetX) * this.scale;
            const normalizedZ = (point.z - this.offsetZ) * this.scale;
            const normalizedY = point.y * this.scale;

            this.points.push({ x: normalizedX, y: normalizedY, z: normalizedZ });

            positions.push(normalizedX, normalizedY, normalizedZ);

            if (point.r !== undefined && point.g !== undefined && point.b !== undefined) {
                colors.push(point.r / 255, point.g / 255, point.b / 255, 1);
            } else {
                const heightRatio = Math.max(0, Math.min(1, (normalizedY + 20) / 100));
                const color = this.getHeightColor(heightRatio);
                colors.push(color.r, color.g, color.b, 1);
            }

            this.updateBounds(normalizedX, normalizedY, normalizedZ);
        }

        this.createPointCloudMesh(positions, colors);
        return this.points;
    }

    calculateOptimalScale(points) {
        let maxAbs = 0;
        for (const point of points) {
            maxAbs = Math.max(maxAbs, Math.abs(point.x), Math.abs(point.z));
        }
        return maxAbs > 500 ? 50 / maxAbs : (maxAbs > 0 ? 100 / (maxAbs * 2) : 1);
    }

    generateDemoTerrain(pointCount = 20000) {
        this.clear();
        this.points = [];
        this.offsetX = 0;
        this.offsetZ = 0;
        this.scale = 1;
        
        const positions = [];
        const colors = [];

        const centerX = 0;
        const centerZ = 0;
        const radius = 80;

        for (let i = 0; i < pointCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * radius;
            
            const x = centerX + Math.cos(angle) * dist;
            const z = centerZ + Math.sin(angle) * dist;

            let y = this.generateTerrainHeight(x, z);

            this.points.push({ x, y, z });
            positions.push(x, y, z);

            const heightRatio = Math.max(0, Math.min(1, (y + 20) / 80));
            const color = this.getHeightColor(heightRatio);
            colors.push(color.r, color.g, color.b, 1);

            this.updateBounds(x, y, z);
        }

        this.createPointCloudMesh(positions, colors);
        return this.points;
    }

    generateTerrainHeight(x, z) {
        const distFromCenter = Math.sqrt(x * x + z * z);
        
        let height = 0;
        
        height += Math.sin(x * 0.05) * 10;
        height += Math.cos(z * 0.05) * 10;
        height += Math.sin((x + z) * 0.03) * 15;
        
        if (distFromCenter < 30) {
            height += (30 - distFromCenter) * 0.5;
        }
        
        if (distFromCenter > 50 && distFromCenter < 70) {
            height += Math.sin((distFromCenter - 50) * 0.3) * 5;
        }
        
        height += (Math.random() - 0.5) * 2;
        
        return height;
    }

    getHeightColor(ratio) {
        if (ratio < 0.2) {
            return { r: 0.3, g: 0.2, b: 0.1 };
        } else if (ratio < 0.4) {
            return { r: 0.4, g: 0.35, b: 0.2 };
        } else if (ratio < 0.6) {
            return { r: 0.35, g: 0.4, b: 0.25 };
        } else if (ratio < 0.8) {
            return { r: 0.3, g: 0.5, b: 0.3 };
        } else {
            return { r: 0.8, g: 0.8, b: 0.75 };
        }
    }

    createPointCloudMesh(positions, colors) {
        this.pointCloudMesh = new BABYLON.PointsSystem('pointCloud', positions.length / 3, this.scene);
        
        const colors4 = [];
        for (let i = 0; i < colors.length; i += 4) {
            colors4.push(new BABYLON.Color4(
                colors[i],
                colors[i + 1],
                colors[i + 2],
                colors[i + 3]
            ));
        }

        for (let i = 0; i < positions.length; i += 3) {
            this.pointCloudMesh.points.push(new BABYLON.Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            ));
        }
        this.pointCloudMesh.colors = colors4;

        this.pointCloudMesh.buildMesh();
        this.pointCloudMesh.mesh.material.pointSize = 2;
        this.pointCloudMesh.mesh.isPickable = true;

        return this.pointCloudMesh.mesh;
    }

    updateBounds(x, y, z) {
        this.bounds.minX = Math.min(this.bounds.minX, x);
        this.bounds.maxX = Math.max(this.bounds.maxX, x);
        this.bounds.minY = Math.min(this.bounds.minY, y);
        this.bounds.maxY = Math.max(this.bounds.maxY, y);
        this.bounds.minZ = Math.min(this.bounds.minZ, z);
        this.bounds.maxZ = Math.max(this.bounds.maxZ, z);
    }

    getBounds() {
        return { ...this.bounds };
    }

    getPoints() {
        return [...this.points];
    }

    getPointCount() {
        return this.points.length;
    }

    sceneToOriginal(sceneX, sceneZ) {
        return {
            x: sceneX / this.scale + this.offsetX,
            z: sceneZ / this.scale + this.offsetZ
        };
    }

    originalToScene(origX, origZ) {
        return {
            x: (origX - this.offsetX) * this.scale,
            z: (origZ - this.offsetZ) * this.scale
        };
    }

    clear() {
        if (this.pointCloudMesh) {
            if (this.pointCloudMesh.mesh) {
                this.pointCloudMesh.mesh.dispose();
            }
            this.pointCloudMesh.dispose();
            this.pointCloudMesh = null;
        }
        this.points = [];
        this.bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity
        };
    }
}
