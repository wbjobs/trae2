import { SceneManager } from './SceneManager.js';
import { PointCloudLoader } from './PointCloudLoader.js';
import { TerrainReconstructor } from './TerrainReconstructor.js';
import { AnnotationTool } from './AnnotationTool.js';
import { CoordinateConverter } from './CoordinateConverter.js';
import { APIService } from './APIService.js';
import { TerrainSlicer } from './TerrainSlicer.js';
import { LayerManager } from './LayerManager.js';
import { PerformanceOptimizer } from './PerformanceOptimizer.js';

class Application {
    constructor() {
        this.sceneManager = null;
        this.pointCloudLoader = null;
        this.terrainReconstructor = null;
        this.annotationTool = null;
        this.coordinateConverter = null;
        this.apiService = null;
        this.terrainSlicer = null;
        this.layerManager = null;
        this.performanceOptimizer = null;
        this.currentMineId = 'mine_001';
        this.currentMode = 'browse';
        this.miningAreas = [];
        this.isPointCloudLoaded = false;
        this.isTerrainCreated = false;
        this.unitsPerMeter = 1;
        this.init();
    }

    init() {
        const canvas = document.getElementById('renderCanvas');

        this.sceneManager = new SceneManager(canvas);
        this.sceneManager.init();

        this.terrainReconstructor = new TerrainReconstructor(this.sceneManager);
        this.pointCloudLoader = new PointCloudLoader(this.sceneManager);
        this.annotationTool = new AnnotationTool(this.sceneManager, this.terrainReconstructor);
        this.coordinateConverter = new CoordinateConverter();
        this.apiService = new APIService();

        this.terrainSlicer = new TerrainSlicer(this.sceneManager, this.terrainReconstructor);
        this.layerManager = new LayerManager(this.sceneManager);
        this.performanceOptimizer = new PerformanceOptimizer(this.sceneManager);

        this.setupEventListeners();
        this.setupPanelTabs();
        this.layerManager.renderLayerPanel();
        this.loadMiningAreas();
        this.startFPSCounter();

        console.log('🏔️ 矿山地形3D重构标注系统已启动');
    }

    setupPanelTabs() {
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`).classList.add('active');
            });
        });
    }

    setupEventListeners() {
        document.getElementById('btnLoadPointCloud').addEventListener('click', () => {
            this.loadPointCloudDataPaginated();
        });

        document.getElementById('btnCreateTerrain').addEventListener('click', () => {
            this.createTerrain();
        });

        document.getElementById('btnAnnotate').addEventListener('click', () => {
            this.toggleAnnotationMode();
        });

        document.getElementById('btnClear').addEventListener('click', () => {
            this.clearAnnotations();
        });

        document.getElementById('btnReset').addEventListener('click', () => {
            this.sceneManager.resetCamera();
        });

        document.getElementById('mineSelector').addEventListener('change', (e) => {
            this.currentMineId = e.target.value;
            this.clearAll();
            this.loadMiningAreas();
        });

        document.getElementById('sliceHeightSlider').addEventListener('input', (e) => {
            document.getElementById('sliceHeightValue').textContent = parseFloat(e.target.value).toFixed(1);
        });

        document.getElementById('btnAddSlice').addEventListener('click', () => {
            this.addSlice();
        });

        document.getElementById('btnMultiSlice').addEventListener('click', () => {
            this.createMultiLayerSlices();
        });

        document.getElementById('btnClipAbove').addEventListener('click', () => {
            const height = parseFloat(document.getElementById('sliceHeightSlider').value);
            this.terrainSlicer.applyClippingAtHeight(height, 'above');
        });

        document.getElementById('btnClipBelow').addEventListener('click', () => {
            const height = parseFloat(document.getElementById('sliceHeightSlider').value);
            this.terrainSlicer.applyClippingAtHeight(height, 'below');
        });

        document.getElementById('btnClearClip').addEventListener('click', () => {
            this.terrainSlicer.removeClipping();
        });

        document.getElementById('btnOptimize').addEventListener('click', () => {
            this.performanceOptimizer.enableOptimizations();
            this.updatePerformanceMetrics();
        });

        document.getElementById('btnFreeze').addEventListener('click', () => {
            this.performanceOptimizer.freezeStaticMeshes();
            this.updatePerformanceMetrics();
        });

        this.sceneManager.onPointClicked = (point) => {
            if (this.currentMode === 'annotate') {
                this.addAnnotationPoint(point);
            }
        };

        const canvas = document.getElementById('renderCanvas');
        canvas.addEventListener('mousemove', (e) => {
            if (this.currentMode === 'annotate') {
                const rect = canvas.getBoundingClientRect();
                this.annotationTool.updateDynamicPoint(
                    e.clientX - rect.left,
                    e.clientY - rect.top
                );
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelAnnotation();
            } else if (e.key === 'Enter' && this.currentMode === 'annotate') {
                e.preventDefault();
                this.finishAnnotation();
            }
        });
    }

    async loadPointCloudDataPaginated() {
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loadingText');
        const progressFill = document.getElementById('progressFill');

        loading.classList.add('active');
        loadingText.textContent = '正在分页加载点云数据...';
        progressFill.style.width = '0%';

        try {
            const result = await this.apiService.loadAllPages(
                this.currentMineId,
                10000,
                (progress) => {
                    loadingText.textContent = `加载中 ${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()} 点 (${progress.progress}%)`;
                    progressFill.style.width = `${progress.progress}%`;
                }
            );

            if (result.points && result.points.length > 0) {
                this.pointCloudLoader.loadPoints(result.points);
                this.isPointCloudLoaded = true;

                const bounds = this.pointCloudLoader.getBounds();
                this.coordinateConverter.setBounds(bounds);
                this.sceneManager.fitCameraToBounds(bounds);

                this.unitsPerMeter = 1;
                this.annotationTool.setScale(this.unitsPerMeter);

                document.getElementById('pointCount').textContent = result.total.toLocaleString();

                this.layerManager.addMeshToLayer('pointcloud', this.pointCloudLoader.pointCloudMesh);
                this.layerManager.renderLayerPanel();
            } else {
                this.generateDemoPointCloud();
            }
        } catch (error) {
            console.error('分页加载点云失败，使用演示数据:', error);
            this.generateDemoPointCloud();
        } finally {
            loading.classList.remove('active');
        }
    }

    generateDemoPointCloud() {
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loadingText');

        loading.classList.add('active');
        loadingText.textContent = '生成演示点云数据...';

        setTimeout(() => {
            const points = this.pointCloudLoader.generateDemoTerrain(20000);
            this.isPointCloudLoaded = true;

            const bounds = this.pointCloudLoader.getBounds();
            this.coordinateConverter.setBounds(bounds);
            this.sceneManager.fitCameraToBounds(bounds);

            this.unitsPerMeter = 1;
            this.annotationTool.setScale(this.unitsPerMeter);

            document.getElementById('pointCount').textContent = points.length;

            if (this.pointCloudLoader.pointCloudMesh) {
                this.layerManager.addMeshToLayer('pointcloud', this.pointCloudLoader.pointCloudMesh);
            }
            this.layerManager.renderLayerPanel();
            loading.classList.remove('active');
        }, 500);
    }

    createTerrain() {
        if (!this.isPointCloudLoaded) {
            alert('请先加载点云数据');
            return;
        }

        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loadingText');

        loading.classList.add('active');
        loadingText.textContent = '正在重建地形表面...';

        setTimeout(() => {
            try {
                const points = this.pointCloudLoader.getPoints();
                this.terrainReconstructor.createTerrainMesh(points, 64);
                this.isTerrainCreated = true;

                this.layerManager.addMeshToLayer('terrain', this.terrainReconstructor.terrainMesh);
                this.layerManager.renderLayerPanel();
            } catch (error) {
                console.error('地形重建失败:', error);
            } finally {
                loading.classList.remove('active');
            }
        }, 100);
    }

    addSlice() {
        if (!this.isTerrainCreated) {
            alert('请先重建地形表面');
            return;
        }

        const height = parseFloat(document.getElementById('sliceHeightSlider').value);
        this.terrainSlicer.createHorizontalSlice(height);

        const sliceGroup = this.terrainSlicer.slicePlanes[this.terrainSlicer.slicePlanes.length - 1].group;
        this.layerManager.addGroupToLayer('slice', sliceGroup);
        this.layerManager.renderLayerPanel();

        document.getElementById('sliceCount').textContent = this.terrainSlicer.slicePlanes.length;
    }

    createMultiLayerSlices() {
        if (!this.isTerrainCreated) {
            alert('请先重建地形表面');
            return;
        }

        const slices = this.terrainSlicer.createMultiLayerSlices(-20, 60, 10);

        for (const slice of slices) {
            this.layerManager.addGroupToLayer('slice', slice.group);
        }
        this.layerManager.renderLayerPanel();

        document.getElementById('sliceCount').textContent = slices.length;
    }

    toggleAnnotationMode() {
        if (this.currentMode === 'annotate') {
            this.finishAnnotation();
        } else {
            this.enterAnnotationMode();
        }
    }

    enterAnnotationMode() {
        this.currentMode = 'annotate';
        this.sceneManager.setPickingEnabled(true);
        this.annotationTool.startAnnotation();

        document.getElementById('btnAnnotate').classList.add('active');
        document.getElementById('currentMode').textContent = '标注模式';
        document.getElementById('annotationPoints').textContent = '0';
    }

    addAnnotationPoint(point) {
        if (this.currentMode !== 'annotate') return;
        const count = this.annotationTool.addPoint(point);
        document.getElementById('annotationPoints').textContent = count;
    }

    async finishAnnotation() {
        const points = this.annotationTool.getPoints();

        if (points.length < 3) {
            alert('请至少添加3个顶点来创建多边形');
            return;
        }

        const area = this.annotationTool.calculateArea();
        const name = prompt('请输入开采区域名称:', `开采区域-${Date.now().toString().slice(-6)}`);
        if (!name) return;

        const geoCoordinates = points.map(p => {
            const sceneOrig = this.pointCloudLoader.sceneToOriginal(p.x, p.z);
            const geo = this.coordinateConverter.sceneToGeo(sceneOrig.x, sceneOrig.z);
            return [geo.lng, geo.lat, p.y];
        });

        try {
            const result = await this.apiService.createMiningArea({
                mineId: this.currentMineId, name, description: '',
                coordinates: geoCoordinates, area, status: 'active', operator: 'admin'
            });

            if (result.success) {
                this.annotationTool.finishAnnotation(name, area);

                const lastArea = this.annotationTool.areaMeshes[this.annotationTool.areaMeshes.length - 1];
                if (lastArea) {
                    this.layerManager.addGroupToLayer('annotation', lastArea);
                }

                this.loadMiningAreas();
            }
        } catch (error) {
            console.error('保存标注失败:', error);
            this.annotationTool.finishAnnotation(name, area);
        }

        this.exitAnnotationMode();
    }

    cancelAnnotation() {
        if (this.currentMode === 'annotate') {
            this.annotationTool.cancelAnnotation();
            this.exitAnnotationMode();
        }
    }

    exitAnnotationMode() {
        this.currentMode = 'browse';
        this.sceneManager.setPickingEnabled(false);
        document.getElementById('btnAnnotate').classList.remove('active');
        document.getElementById('currentMode').textContent = '浏览模式';
        document.getElementById('annotationPoints').textContent = '0';
    }

    clearAnnotations() {
        this.annotationTool.clearAll();
        this.terrainSlicer.clearAllSlices();
        this.layerManager.clearLayer('annotation');
        this.layerManager.clearLayer('slice');
        this.layerManager.renderLayerPanel();
        document.getElementById('sliceCount').textContent = '0';
    }

    clearAll() {
        this.pointCloudLoader.clear();
        this.terrainReconstructor.clear();
        this.annotationTool.clearAll();
        this.terrainSlicer.clearAllSlices();
        this.layerManager.clearLayer('pointcloud');
        this.layerManager.clearLayer('terrain');
        this.layerManager.clearLayer('annotation');
        this.layerManager.clearLayer('slice');
        this.layerManager.renderLayerPanel();
        this.isPointCloudLoaded = false;
        this.isTerrainCreated = false;
        document.getElementById('pointCount').textContent = '0';
        document.getElementById('sliceCount').textContent = '0';
    }

    async loadMiningAreas() {
        try {
            const areas = await this.apiService.getMiningAreas(this.currentMineId);
            this.miningAreas = areas || [];
            this.renderMiningAreas();
        } catch (error) {
            console.error('加载开采区域失败:', error);
            this.miningAreas = [];
        }
        this.updateAreaList();
    }

    renderMiningAreas() {
        this.annotationTool.clearAreas();
        this.layerManager.clearLayer('annotation');

        for (const area of this.miningAreas) {
            if (area.coordinates && area.coordinates.length > 0) {
                const scenePoints = area.coordinates.map(coord => {
                    const scene = this.coordinateConverter.geoToScene(coord[0], coord[1]);
                    const sceneScaled = this.pointCloudLoader.originalToScene(scene.x, scene.y);
                    return new BABYLON.Vector3(sceneScaled.x, coord[2] || 0, sceneScaled.z);
                });
                const areaGroup = this.annotationTool.renderArea(area.name, scenePoints, area.area);
                if (areaGroup) {
                    this.layerManager.addGroupToLayer('annotation', areaGroup);
                }
            }
        }
        this.layerManager.renderLayerPanel();
    }

    updateAreaList() {
        const container = document.getElementById('areaList');

        if (this.miningAreas.length === 0) {
            container.innerHTML = '<div class="area-info" style="text-align: center; padding: 20px; color: #94a3b8;">暂无标注数据</div>';
            return;
        }

        container.innerHTML = this.miningAreas.map(area => `
            <div class="area-item" data-id="${area.id}">
                <div class="area-name">${area.name}</div>
                <div class="area-info">
                    面积: ${area.area ? area.area.toFixed(2) : '0.00'} ㎡ | ${area.status === 'active' ? '进行中' : '已完成'}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.area-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                this.focusOnArea(id);
            });
        });
    }

    focusOnArea(id) {
        const area = this.miningAreas.find(a => a.id === id);
        if (area) {
            document.getElementById('selectedArea').textContent = area.name;
            if (area.coordinates && area.coordinates.length > 0) {
                const scene = this.coordinateConverter.geoToScene(area.coordinates[0][0], area.coordinates[0][1]);
                const sceneScaled = this.pointCloudLoader.originalToScene(scene.x, scene.y);
                this.sceneManager.focusOnPosition(new BABYLON.Vector3(sceneScaled.x, 50, sceneScaled.z));
            }
        }
    }

    updatePerformanceMetrics() {
        const metrics = this.performanceOptimizer.getPerformanceMetrics();

        const fpsEl = document.getElementById('perfFPS');
        fpsEl.textContent = metrics.fps;
        fpsEl.className = 'perf-value' + (parseFloat(metrics.fps) < 30 ? ' critical' : parseFloat(metrics.fps) < 50 ? ' warning' : '');

        document.getElementById('perfMeshes').textContent = metrics.activeMeshes;
        document.getElementById('perfVertices').textContent = parseInt(metrics.totalVertices).toLocaleString();
        document.getElementById('perfFrozen').textContent = metrics.frozenMeshes;
        document.getElementById('perfScaling').textContent = metrics.hardwareScaling + 'x';
        document.getElementById('perfPointCount').textContent = this.pointCloudLoader.getPointCount().toLocaleString();
    }

    startFPSCounter() {
        setInterval(() => {
            if (this.sceneManager.engine) {
                const fps = this.sceneManager.engine.getFps().toFixed(0);
                document.getElementById('fpsValue').textContent = fps;
                this.updatePerformanceMetrics();
            }
        }, 2000);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Application();
});
