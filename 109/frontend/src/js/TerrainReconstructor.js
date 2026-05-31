export class TerrainReconstructor {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.getScene();
        this.terrainMesh = null;
        this.ground = sceneManager.getGround();
    }

    createTerrainMesh(points, resolution = 64) {
        this.clear();

        if (points.length < 3) {
            console.warn('Not enough points to create terrain');
            return null;
        }

        const bounds = this.calculateBounds(points);
        const gridData = this.createGridFromPoints(points, bounds, resolution);
        
        this.terrainMesh = this.createTerrainMeshFromGrid(gridData, bounds, resolution);
        
        return this.terrainMesh;
    }

    calculateBounds(points) {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        const padding = 10;
        return {
            minX: minX - padding,
            maxX: maxX + padding,
            minZ: minZ - padding,
            maxZ: maxZ + padding,
            minY,
            maxY,
            width: maxX - minX + padding * 2,
            depth: maxZ - minZ + padding * 2
        };
    }

    createGridFromPoints(points, bounds, resolution) {
        const grid = [];
        const cellWidth = bounds.width / resolution;
        const cellDepth = bounds.depth / resolution;

        for (let i = 0; i <= resolution; i++) {
            grid[i] = [];
            for (let j = 0; j <= resolution; j++) {
                grid[i][j] = {
                    height: 0,
                    count: 0
                };
            }
        }

        for (const point of points) {
            const i = Math.floor((point.x - bounds.minX) / cellWidth);
            const j = Math.floor((point.z - bounds.minZ) / cellDepth);

            if (i >= 0 && i <= resolution && j >= 0 && j <= resolution) {
                grid[i][j].height += point.y;
                grid[i][j].count++;
            }
        }

        for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i <= resolution; i++) {
                for (let j = 0; j <= resolution; j++) {
                    if (grid[i][j].count === 0) {
                        grid[i][j].height = this.interpolateHeight(grid, i, j, resolution);
                        grid[i][j].count = -1;
                    }
                }
            }
        }

        this.smoothHeights(grid, resolution, 2);

        return grid;
    }

    interpolateHeight(grid, i, j, resolution) {
        let totalHeight = 0;
        let totalWeight = 0;
        const radius = 5;

        for (let di = -radius; di <= radius; di++) {
            for (let dj = -radius; dj <= radius; dj++) {
                const ni = i + di;
                const nj = j + dj;

                if (ni >= 0 && ni <= resolution && nj >= 0 && nj <= resolution) {
                    if (grid[ni][nj].count > 0) {
                        const distance = Math.sqrt(di * di + dj * dj);
                        const weight = 1 / (distance * distance + 0.1);
                        totalHeight += grid[ni][nj].height * weight;
                        totalWeight += weight;
                    }
                }
            }
        }

        return totalWeight > 0 ? totalHeight / totalWeight : 0;
    }

    smoothHeights(grid, resolution, iterations = 1) {
        for (let iter = 0; iter < iterations; iter++) {
            const newGrid = [];
            
            for (let i = 0; i <= resolution; i++) {
                newGrid[i] = [];
                for (let j = 0; j <= resolution; j++) {
                    newGrid[i][j] = { height: grid[i][j].height, count: grid[i][j].count };
                }
            }

            for (let i = 1; i < resolution; i++) {
                for (let j = 1; j < resolution; j++) {
                    let sum = grid[i][j].height * 2;
                    let count = 2;

                    for (let di = -1; di <= 1; di++) {
                        for (let dj = -1; dj <= 1; dj++) {
                            if (di !== 0 || dj !== 0) {
                                sum += grid[i + di][j + dj].height;
                                count++;
                            }
                        }
                    }

                    newGrid[i][j].height = sum / count;
                }
            }

            for (let i = 0; i <= resolution; i++) {
                for (let j = 0; j <= resolution; j++) {
                    grid[i][j].height = newGrid[i][j].height;
                }
            }
        }
    }

    createTerrainMeshFromGrid(grid, bounds, resolution) {
        const mesh = new BABYLON.Mesh('terrainMesh', this.scene);

        const positions = [];
        const normals = [];
        const colors = [];
        const uvs = [];
        const indices = [];

        const cellWidth = bounds.width / resolution;
        const cellDepth = bounds.depth / resolution;

        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const x = bounds.minX + i * cellWidth;
                const z = bounds.minZ + j * cellDepth;
                const y = grid[i][j].height;

                positions.push(x, y, z);

                const u = i / resolution;
                const v = j / resolution;
                uvs.push(u, v);

                const heightRatio = Math.max(0, Math.min(1, (y - bounds.minY) / (bounds.maxY - bounds.minY + 1)));
                const color = this.getTerrainColor(heightRatio);
                colors.push(color.r, color.g, color.b, 1);
            }
        }

        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const topLeft = i * (resolution + 1) + j;
                const topRight = (i + 1) * (resolution + 1) + j;
                const bottomLeft = i * (resolution + 1) + (j + 1);
                const bottomRight = (i + 1) * (resolution + 1) + (j + 1);

                indices.push(topLeft, bottomLeft, topRight);
                indices.push(topRight, bottomLeft, bottomRight);
            }
        }

        BABYLON.VertexData.ComputeNormals(positions, indices, normals);

        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.normals = normals;
        vertexData.colors = colors;
        vertexData.uvs = uvs;
        vertexData.indices = indices;

        vertexData.applyToMesh(mesh, true);

        const material = new BABYLON.StandardMaterial('terrainMaterial', this.scene);
        material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        material.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        material.backFaceCulling = true;
        material.freeze();
        mesh.material = material;

        mesh.isPickable = true;
        mesh.onBeforeRenderObservable.add(() => {
            this.scene.getEngine().setDepthWrite(true);
        });

        return mesh;
    }

    getTerrainColor(ratio) {
        if (ratio < 0.15) {
            return { r: 0.35, g: 0.25, b: 0.15 };
        } else if (ratio < 0.35) {
            return { r: 0.45, g: 0.38, b: 0.22 };
        } else if (ratio < 0.55) {
            return { r: 0.4, g: 0.45, b: 0.28 };
        } else if (ratio < 0.75) {
            return { r: 0.32, g: 0.5, b: 0.32 };
        } else {
            return { r: 0.7, g: 0.7, b: 0.65 };
        }
    }

    getHeightAt(x, z) {
        if (!this.terrainMesh) return 0;
        
        const ray = new BABYLON.Ray(
            new BABYLON.Vector3(x, 1000, z),
            new BABYLON.Vector3(0, -1, 0),
            2000
        );
        
        const hit = this.scene.pickWithRay(ray, (mesh) => mesh === this.terrainMesh);
        
        if (hit && hit.hit) {
            return hit.pickedPoint.y;
        }
        
        return 0;
    }

    getTerrainMesh() {
        return this.terrainMesh;
    }

    clear() {
        if (this.terrainMesh) {
            this.terrainMesh.dispose();
            this.terrainMesh = null;
        }
    }
}
