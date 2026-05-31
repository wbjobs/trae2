class App {
    constructor() {
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.dataStore = null;
        this.modeler = null;
        this.detector = null;
        this.sectionAnalyzer = null;
        this.annotator = null;
        this.dataQuery = null;
        this.clock = new THREE.Clock();
        this.pipelineData = [];
        this.sectionData = [];
        this.activePanel = null;
        this.frustumCullingEnabled = true;
        this.frustumCullInterval = 500;
        this.lastCullTime = 0;
        this.fpsCounter = 0;
        this.lastFpsTime = 0;
        this.currentFps = 0;
    }

    async init() {
        this.container = document.getElementById('viewer-container');
        this.initScene();
        this.initLights();
        this.initControls();
        this.initGrid();

        this.dataStore = new PipelineDataStore();
        this.modeler = new PipelineModeler(this.scene, this.camera, this.renderer, this.dataStore);
        this.detector = new CollisionDetector(this.scene, this.dataStore, this.modeler);
        this.sectionAnalyzer = new SectionAnalyzer(this.scene, this.renderer, this.dataStore, this.modeler);
        this.annotator = new DimensionAnnotator(this.scene, this.modeler);
        this.dataQuery = new DataQuery();

        this.initUI();
        this.initEventListeners();

        await this.loadData();
        this.animate();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 200, 400);

        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
        this.camera.position.set(80, 50, 60);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.localClippingEnabled = false;
        this.container.appendChild(this.renderer.domElement);
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 80, 30);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const pointLight = new THREE.PointLight(0x4FC3F7, 0.4, 200);
        pointLight.position.set(60, 5, 0);
        this.scene.add(pointLight);
    }

    initControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.maxDistance = 300;
        this.controls.minDistance = 5;
        this.controls.target.set(60, 1.5, 0);
    }

    initGrid() {
        const grid = new THREE.GridHelper(300, 60, 0x444466, 0x333355);
        grid.position.y = -0.01;
        this.scene.add(grid);

        const axes = new THREE.AxesHelper(5);
        axes.position.set(0, 0, 0);
        this.scene.add(axes);
    }

    async loadData() {
        try {
            const [pipelines, sections] = await Promise.all([
                this.dataQuery.fetchPipelines(),
                this.dataQuery.fetchSections()
            ]);
            this.pipelineData = pipelines;
            this.sectionData = sections;
            this.dataStore.setPipelines(pipelines);
            this.dataStore.setSections(sections);
            this.updateStats();
            this.updatePipelineList();
            this.showToast(`已加载 ${pipelines.length} 条管线，${sections.length} 个区段`);
        } catch (e) {
            console.error('数据加载失败:', e);
            this.showToast('数据加载失败', 'error');
        }
    }

    initUI() {
        this.initToolbar();
        this.initSidebar();
        this.initBottomBar();
        this.initModals();
    }

    initToolbar() {
        document.getElementById('btn-home').addEventListener('click', () => this.resetView());
        document.getElementById('btn-collision').addEventListener('click', () => this.runCollisionDetection());
        document.getElementById('btn-section').addEventListener('click', () => this.toggleSectionPanel());
        document.getElementById('btn-measure').addEventListener('click', () => this.toggleMeasureMode());
        document.getElementById('btn-query').addEventListener('click', () => this.toggleQueryPanel());
        document.getElementById('btn-filter').addEventListener('click', () => this.toggleFilterPanel());
        document.getElementById('btn-opacity').addEventListener('click', () => this.toggleOpacityPanel());
        document.getElementById('btn-perf').addEventListener('click', () => this.togglePerformancePanel());
        document.getElementById('btn-clear-anno').addEventListener('click', () => this.annotator.clearAll());
    }

    initSidebar() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarContent = document.getElementById('sidebar-content');
    }

    initBottomBar() {
        this.bottomBar = document.getElementById('bottom-bar');
    }

    initModals() {
        this.detailModal = document.getElementById('detail-modal');
    }

    initEventListeners() {
        window.addEventListener('resize', () => this.onResize());

        this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.annotator.stopMeasure();
                this.closeSidebar();
                this.closeModal();
                document.querySelectorAll('.btn-tool.active').forEach(b => b.classList.remove('active'));
            }
        });
    }

    onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    onCanvasClick(event) {
        if (this.annotator.isMeasuring) {
            const handled = this.annotator.handleClick(event, this.camera, this.container);
            if (handled) return;
        }

        const rect = this.container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const pipelineGroup = this.scene.getObjectByName('pipelines');
        if (!pipelineGroup) return;

        const intersects = raycaster.intersectObjects(pipelineGroup.children, true);
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.pipelineData) {
                obj = obj.parent;
            }
            if (obj.userData.pipelineData) {
                this.selectPipeline(obj.userData.pipelineData);
            }
        }
    }

    onCanvasMouseMove(event) {
        if (this.annotator.isMeasuring) {
            this.annotator.handleMouseMove(event, this.camera, this.container);
        }

        const rect = this.container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const pipelineGroup = this.scene.getObjectByName('pipelines');
        if (!pipelineGroup) return;

        const intersects = raycaster.intersectObjects(pipelineGroup.children, true);
        this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    }

    selectPipeline(data) {
        this.modeler.showAll();
        this.modeler.highlightPipeline(data.id, true);

        this.openSidebar('管线详情', this.renderPipelineDetail(data));
        this.updateBottomBar(`选中: ${data.name} | 类型: ${this.dataQuery.getTypeLabel(data.type)} | 长度: ${data.length}m`);
    }

    renderPipelineDetail(data) {
        return `
            <div class="detail-section">
                <h4>基本信息</h4>
                <div class="detail-row"><span class="label">编号</span><span class="value">${data.id}</span></div>
                <div class="detail-row"><span class="label">名称</span><span class="value">${data.name}</span></div>
                <div class="detail-row"><span class="label">类型</span><span class="value">${this.dataQuery.getTypeLabel(data.type)}</span></div>
                <div class="detail-row"><span class="label">区段</span><span class="value">${data.section}</span></div>
                <div class="detail-row"><span class="label">材质</span><span class="value">${data.material}</span></div>
                <div class="detail-row"><span class="label">状态</span><span class="value">${this.dataQuery.getStatusLabel(data.status)}</span></div>
            </div>
            <div class="detail-section">
                <h4>几何参数</h4>
                <div class="detail-row"><span class="label">长度</span><span class="value">${data.length} m</span></div>
                <div class="detail-row"><span class="label">半径</span><span class="value">${data.radius} m</span></div>
                <div class="detail-row"><span class="label">起点</span><span class="value">(${data.startX}, ${data.startY}, ${data.startZ})</span></div>
                <div class="detail-row"><span class="label">终点</span><span class="value">(${data.endX}, ${data.endY}, ${data.endZ})</span></div>
            </div>
            <div class="detail-section">
                <h4>运行参数</h4>
                <div class="detail-row"><span class="label">压力</span><span class="value">${data.pressure} Pa</span></div>
                <div class="detail-row"><span class="label">温度</span><span class="value">${data.temperature} ℃</span></div>
            </div>
            <div class="detail-actions">
                <button class="btn-sm btn-primary" onclick="app.focusPipeline('${data.id}')">聚焦</button>
                <button class="btn-sm btn-warning" onclick="app.isolatePipeline('${data.id}')">隔离</button>
            </div>
        `;
    }

    focusPipeline(id) {
        const entry = this.modeler.pipelines.get(id);
        if (!entry) return;
        const box = new THREE.Box3().setFromObject(entry.group);
        const center = box.getCenter(new THREE.Vector3());
        this.controls.target.copy(center);
        this.camera.position.copy(center).add(new THREE.Vector3(10, 8, 10));
        this.controls.update();
    }

    isolatePipeline(id) {
        this.modeler.isolatePipeline(id);
    }

    resetView() {
        this.modeler.showAll();
        this.camera.position.set(80, 50, 60);
        this.controls.target.set(60, 1.5, 0);
        this.controls.update();
        this.closeSidebar();
        this.updateBottomBar('视角已重置');
    }

    async runCollisionDetection() {
        this.updateBottomBar('正在执行碰撞检测...');
        const results = await this.detector.detectCollisions(null, 0.1);
        const stats = this.detector.getStats();

        let methodsHtml = '';
        if (stats.methods) {
            const methodLabels = {
                segment: '线段检测',
                capsule_sampling: '胶囊体采样',
                endpoint: '端点检测',
                endpoint_to_line: '点线检测',
                gjk_epa: 'GJK/EPA算法',
                local_gjk: '本地GJK算法'
            };
            methodsHtml = '<div class="method-stats" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">检测方法分布:</div><div style="display:flex;flex-wrap:wrap;gap:4px;">';
            for (const [m, c] of Object.entries(stats.methods)) {
                methodsHtml += `<span style="padding:2px 6px;background:var(--bg-card);border-radius:4px;font-size:10px;">${methodLabels[m] || m}: ${c}</span>`;
            }
            methodsHtml += '</div></div>';
        }

        this.openSidebar('碰撞检测结果', `
            <div class="collision-stats">
                <div class="stat-item stat-hard">
                    <div class="stat-num">${stats.hard}</div>
                    <div class="stat-label">硬碰撞</div>
                </div>
                <div class="stat-item stat-soft">
                    <div class="stat-num">${stats.soft}</div>
                    <div class="stat-label">软碰撞</div>
                </div>
                <div class="stat-item stat-total">
                    <div class="stat-num">${stats.total}</div>
                    <div class="stat-label">总计</div>
                </div>
            </div>
            ${methodsHtml}
            <div class="collision-list" style="margin-top:16px;">
                ${results.map((c, i) => {
                    const methodLabels = {
                        segment: '线段检测',
                        capsule_sampling: '胶囊体采样',
                        endpoint: '端点检测',
                        endpoint_to_line: '点线检测',
                        gjk_epa: 'GJK/EPA算法',
                        local_gjk: '本地GJK算法'
                    };
                    const method = c.detectionMethod ? ` <span style="font-size:10px;color:var(--accent);background:rgba(79,195,247,0.15);padding:1px 5px;border-radius:3px;">${methodLabels[c.detectionMethod] || c.detectionMethod}</span>` : '';
                    return `
                    <div class="collision-item severity-${c.severity}" onclick="app.focusCollisionPoint(${c.collisionPoint.x}, ${c.collisionPoint.y}, ${c.collisionPoint.z})">
                        <div class="collision-badge ${c.severity}">${c.severity === 'hard' ? '硬' : '软'}</div>
                        <div class="collision-info">
                            <div class="collision-pair">${c.pipelineA.name} ↔ ${c.pipelineB.name} ${method}</div>
                            <div class="collision-dist">间距: ${c.distance.toFixed(4)}m | 最小要求: ${c.minDistance.toFixed(3)}m | 偏差: ${(c.minDistance - c.distance).toFixed(4)}m</div>
                            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">碰撞点: (${c.collisionPoint.x.toFixed(2)}, ${c.collisionPoint.y.toFixed(2)}, ${c.collisionPoint.z.toFixed(2)})</div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        `);

        this.updateBottomBar(`碰撞检测完成: 硬碰撞 ${stats.hard} 处, 软碰撞 ${stats.soft} 处`);
        this.showToast(`检测到 ${stats.total} 处碰撞`);
    }

    focusCollisionPoint(x, y, z) {
        this.controls.target.set(x, y, z);
        this.camera.position.set(x + 8, y + 5, z + 8);
        this.controls.update();
    }

    toggleSectionPanel() {
        if (this.activePanel === 'section') {
            this.sectionAnalyzer.deactivate();
            this.closeSidebar();
            this.activePanel = null;
            return;
        }
        this.activePanel = 'section';
        this.sectionAnalyzer.activate();

        this.openSidebar('三维剖切分析', `
            <div class="section-controls">
                <div class="control-group">
                    <label>剖切轴向</label>
                    <div class="axis-btns">
                        <button class="btn-sm" onclick="app.setSectionAxis('X')">X 轴</button>
                        <button class="btn-sm" onclick="app.setSectionAxis('Y')">Y 轴</button>
                        <button class="btn-sm" onclick="app.setSectionAxis('Z')">Z 轴</button>
                    </div>
                </div>
                <div class="control-group">
                    <label>X 位置: <span id="sec-x-val">60.0</span></label>
                    <input type="range" id="sec-x" min="0" max="150" step="0.5" value="60" oninput="app.updateSectionPos('X', this.value)">
                </div>
                <div class="control-group">
                    <label>Y 位置: <span id="sec-y-val">1.5</span></label>
                    <input type="range" id="sec-y" min="0" max="3.5" step="0.1" value="1.5" oninput="app.updateSectionPos('Y', this.value)">
                </div>
                <div class="control-group">
                    <label>Z 位置: <span id="sec-z-val">0.0</span></label>
                    <input type="range" id="sec-z" min="-2" max="2" step="0.1" value="0" oninput="app.updateSectionPos('Z', this.value)">
                </div>
                <div class="control-group">
                    <label>导出选项</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" id="export-grid" checked> 显示网格</label>
                        <label><input type="checkbox" id="export-dims" checked> 显示尺寸</label>
                        <label><input type="checkbox" id="export-legend" checked> 显示图例</label>
                    </div>
                </div>
                <button class="btn-sm btn-primary" onclick="app.generateSectionView()">生成剖面图</button>
                <button class="btn-sm" onclick="app.downloadSectionSVG()">导出 SVG</button>
                <button class="btn-sm" onclick="app.downloadSectionPNG()">导出 PNG</button>
                <button class="btn-sm" onclick="app.toggleSectionPanel()">关闭剖切</button>
            </div>
        `);
    }

    setSectionAxis(axis) {
        this.sectionAnalyzer.setAxis(axis);
    }

    updateSectionPos(axis, value) {
        const v = parseFloat(value);
        document.getElementById(`sec-${axis.toLowerCase()}-val`).textContent = v.toFixed(1);
        this.sectionAnalyzer.updateFromSlider(v, axis);
    }

    generateSectionView() {
        this.sectionAnalyzer.generateSectionView();
        const stats = this.sectionAnalyzer.getSectionStats();
        if (stats) {
            this.showToast(`剖面图已生成，包含 ${stats.totalPipelines} 条管线`);
        } else {
            this.showToast('剖面图已生成');
        }
    }

    getExportOptions() {
        return {
            showGrid: document.getElementById('export-grid')?.checked !== false,
            showDimensions: document.getElementById('export-dims')?.checked !== false,
            showLegend: document.getElementById('export-legend')?.checked !== false
        };
    }

    downloadSectionSVG() {
        const options = this.getExportOptions();
        const filename = `section_${new Date().toISOString().slice(0, 10)}.svg`;
        this.sectionAnalyzer.downloadSVG(filename, options);
        this.showToast('剖面图纸 SVG 已导出');
    }

    async downloadSectionPNG() {
        const options = this.getExportOptions();
        const filename = `section_${new Date().toISOString().slice(0, 10)}.png`;
        await this.sectionAnalyzer.downloadPNG(filename, options);
        this.showToast('剖面图纸 PNG 已导出');
    }

    toggleOpacityPanel() {
        if (this.activePanel === 'opacity') {
            this.closeSidebar();
            this.activePanel = null;
            return;
        }
        this.activePanel = 'opacity';

        const types = this.dataStore.getTypes();
        const typeOptions = types.map(t => {
            const label = this.dataStore.getTypeLabel(t);
            const color = '#' + this.dataStore.getTypeColor(t).toString(16).padStart(6, '0');
            const currentOpacity = this.modeler.typeOpacity[t] !== undefined ? this.modeler.typeOpacity[t] : 1.0;
            return `
                <div class="control-group">
                    <label>
                        <span class="legend-dot" style="background:${color};display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;"></span>
                        ${label}: <span id="op-${t}-val">${(currentOpacity * 100).toFixed(0)}%</span>
                    </label>
                    <input type="range" id="op-${t}" min="10" max="100" step="5" value="${currentOpacity * 100}" oninput="app.setTypeOpacity('${t}', this.value)">
                </div>
            `;
        }).join('');

        this.openSidebar('透明度调节', `
            <div class="opacity-controls">
                <div class="control-group">
                    <label>全局透明度: <span id="op-global-val">${(this.modeler.globalOpacity * 100).toFixed(0)}%</span></label>
                    <input type="range" id="op-global" min="10" max="100" step="5" value="${this.modeler.globalOpacity * 100}" oninput="app.setGlobalOpacity(this.value)">
                </div>
                <div class="divider"></div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">按类型调节:</div>
                ${typeOptions}
                <div class="divider"></div>
                <button class="btn-sm" onclick="app.resetOpacity()">重置透明度</button>
            </div>
        `);
    }

    setGlobalOpacity(val) {
        const opacity = parseInt(val) / 100;
        this.modeler.setGlobalOpacity(opacity);
        document.getElementById('op-global-val').textContent = `${(opacity * 100).toFixed(0)}%`;
    }

    setTypeOpacity(type, val) {
        const opacity = parseInt(val) / 100;
        this.modeler.setTypeOpacity(type, opacity);
        document.getElementById(`op-${type}-val`).textContent = `${(opacity * 100).toFixed(0)}%`;
    }

    resetOpacity() {
        this.modeler.resetTypeOpacity();
        if (this.activePanel === 'opacity') {
            this.toggleOpacityPanel();
            this.toggleOpacityPanel();
        }
    }

    togglePerformancePanel() {
        if (this.activePanel === 'performance') {
            this.closeSidebar();
            this.activePanel = null;
            return;
        }
        this.activePanel = 'performance';

        this.updatePerformancePanel();

        this.openSidebar('性能监控', `
            <div class="performance-panel">
                <div class="perf-grid">
                    <div class="perf-card">
                        <div class="perf-num" id="perf-fps">--</div>
                        <div class="perf-label">帧率 (FPS)</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-meshes">--</div>
                        <div class="perf-label">网格数</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-vertices">--</div>
                        <div class="perf-label">顶点数</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-triangles">--</div>
                        <div class="perf-label">三角形</div>
                    </div>
                </div>
                <div class="perf-grid" style="margin-top:12px;">
                    <div class="perf-card">
                        <div class="perf-num" id="perf-visible">--</div>
                        <div class="perf-label">可见管线</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-culled">--</div>
                        <div class="perf-label">剔除管线</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-geo-cache">--</div>
                        <div class="perf-label">几何缓存</div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-num" id="perf-mat-cache">--</div>
                        <div class="perf-label">材质缓存</div>
                    </div>
                </div>
                <div class="control-group" style="margin-top:16px;">
                    <label>性能优化</label>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="perf-frustum" ${this.frustumCullingEnabled ? 'checked' : ''} onchange="app.toggleFrustumCulling(this.checked)">
                            视锥体剔除
                        </label>
                        <label>
                            <input type="checkbox" id="perf-lod" ${this.modeler.lodEnabled ? 'checked' : ''} onchange="app.toggleLOD(this.checked)">
                            LOD 细节层次
                        </label>
                    </div>
                </div>
                <div class="control-group">
                    <label>碰撞检测</label>
                    <div class="checkbox-group">
                        <label>
                            <input type="radio" name="detect-mode" value="server" checked onchange="app.setDetectionMode('server')">
                            服务器检测
                        </label>
                        <label>
                            <input type="radio" name="detect-mode" value="local" onchange="app.setDetectionMode('local')">
                            本地检测
                        </label>
                    </div>
                </div>
                <button class="btn-sm" onclick="app.refreshPerformance()">刷新数据</button>
            </div>
        `);
    }

    updatePerformancePanel() {
        if (this.activePanel !== 'performance') return;

        const perf = this.modeler.getPerformanceStats();

        const fpsEl = document.getElementById('perf-fps');
        if (fpsEl) fpsEl.textContent = this.currentFps;

        const meshesEl = document.getElementById('perf-meshes');
        if (meshesEl) meshesEl.textContent = perf.totalMeshes.toLocaleString();

        const verticesEl = document.getElementById('perf-vertices');
        if (verticesEl) verticesEl.textContent = perf.totalVertices.toLocaleString();

        const trianglesEl = document.getElementById('perf-triangles');
        if (trianglesEl) trianglesEl.textContent = perf.totalTriangles.toLocaleString();

        const visibleEl = document.getElementById('perf-visible');
        if (visibleEl) visibleEl.textContent = perf.visiblePipelines.toLocaleString();

        const culledEl = document.getElementById('perf-culled');
        if (culledEl) culledEl.textContent = perf.culledPipelines.toLocaleString();

        const geoCacheEl = document.getElementById('perf-geo-cache');
        if (geoCacheEl) geoCacheEl.textContent = perf.geometryCacheSize;

        const matCacheEl = document.getElementById('perf-mat-cache');
        if (matCacheEl) matCacheEl.textContent = perf.materialCacheSize;
    }

    refreshPerformance() {
        this.modeler.updatePerformanceStats();
        this.updatePerformancePanel();
    }

    toggleFrustumCulling(enabled) {
        this.frustumCullingEnabled = enabled;
        this.modeler.frustumCulling = enabled;
        if (!enabled) {
            this.modeler.showAll();
        }
        this.showToast(`视锥体剔除 ${enabled ? '已启用' : '已禁用'}`);
    }

    toggleLOD(enabled) {
        this.modeler.lodEnabled = enabled;
        this.showToast(`LOD 细节层次 ${enabled ? '已启用' : '已禁用'}`);
    }

    setDetectionMode(mode) {
        this.detector.setDetectionMode(mode);
        this.showToast(`碰撞检测模式: ${mode === 'server' ? '服务器' : '本地'}`);
    }

    toggleMeasureMode() {
        const btn = document.getElementById('btn-measure');
        if (this.annotator.isMeasuring) {
            this.annotator.stopMeasure();
            btn.classList.remove('active');
            this.updateBottomBar('测量模式已关闭');
        } else {
            this.annotator.startMeasure();
            btn.classList.add('active');
            this.updateBottomBar('测量模式: 点击管线表面设置测量起点和终点');
        }
    }

    toggleQueryPanel() {
        if (this.activePanel === 'query') {
            this.closeSidebar();
            this.activePanel = null;
            return;
        }
        this.activePanel = 'query';
        this.openSidebar('设计数据查询', `
            <div class="query-controls">
                <div class="control-group">
                    <label>管线类型</label>
                    <select id="query-type" onchange="app.queryPipelines()">
                        ${this.dataQuery.getTypeOptions().map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                    </select>
                </div>
                <div class="control-group">
                    <label>关键词搜索</label>
                    <input type="text" id="query-keyword" placeholder="输入管线名称..." oninput="app.queryPipelines()">
                </div>
            </div>
            <div id="query-results" class="query-results"></div>
        `);
        this.queryPipelines();
    }

    async queryPipelines() {
        const type = document.getElementById('query-type')?.value || '';
        const keyword = document.getElementById('query-keyword')?.value || '';
        let results = await this.dataQuery.fetchPipelines(type ? { type } : {});

        if (keyword) {
            results = results.filter(p =>
                p.name.toLowerCase().includes(keyword.toLowerCase()) ||
                p.id.toLowerCase().includes(keyword.toLowerCase())
            );
        }

        const container = document.getElementById('query-results');
        if (container) {
            container.innerHTML = results.map(p => `
                <div class="query-item" onclick="app.selectPipeline(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                    <div class="query-item-header">
                        <span class="pipeline-type-badge type-${p.type}">${this.dataQuery.getTypeLabel(p.type)}</span>
                        <span class="query-item-name">${p.name}</span>
                    </div>
                    <div class="query-item-meta">
                        ${p.section} | ${p.length}m | ⌀${(p.radius * 2).toFixed(3)}m
                    </div>
                </div>
            `).join('');
        }
    }

    toggleFilterPanel() {
        if (this.activePanel === 'filter') {
            this.modeler.filterByType(null);
            this.closeSidebar();
            this.activePanel = null;
            return;
        }
        this.activePanel = 'filter';
        this.openSidebar('管线过滤', `
            <div class="filter-controls">
                <button class="btn-sm btn-primary" onclick="app.filterByType(null)">全部显示</button>
                ${this.dataQuery.getTypeOptions().filter(o => o.value).map(o => `
                    <button class="btn-sm" onclick="app.filterByType('${o.value}')">${o.label}</button>
                `).join('')}
            </div>
        `);
    }

    filterByType(type) {
        this.modeler.filterByType(type);
        if (type) {
            const label = this.dataQuery.getTypeLabel(type);
            this.updateBottomBar(`已过滤: 仅显示 ${label} 管线`);
            this.showToast(`显示 ${label} 管线`);
        } else {
            this.updateBottomBar('已显示全部管线');
            this.showToast('显示全部管线');
        }
    }

    openSidebar(title, content) {
        this.sidebar.classList.add('open');
        this.sidebar.querySelector('.sidebar-title').textContent = title;
        this.sidebarContent.innerHTML = content;
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
        this.activePanel = null;
    }

    closeModal() {
        if (this.detailModal) {
            this.detailModal.classList.remove('open');
        }
    }

    updateBottomBar(text) {
        this.bottomBar.querySelector('.status-text').textContent = text;
    }

    updateStats() {
        const statsEl = document.getElementById('stats-panel');
        if (!statsEl) return;
        const types = {};
        this.pipelineData.forEach(p => { types[p.type] = (types[p.type] || 0) + 1; });

        statsEl.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-num">${this.pipelineData.length}</div><div class="stat-label">管线总数</div></div>
                <div class="stat-card"><div class="stat-num">${this.sectionData.length}</div><div class="stat-label">区段数</div></div>
                <div class="stat-card"><div class="stat-num">${this.pipelineData.reduce((s, p) => s + (p.length || 0), 0).toFixed(0)}</div><div class="stat-label">总长度(m)</div></div>
                <div class="stat-card"><div class="stat-num">${Object.keys(types).length}</div><div class="stat-label">管线类型</div></div>
            </div>
            <div class="type-legend">
                ${Object.entries(types).map(([t, c]) => `
                    <div class="legend-item" onclick="app.filterByType('${t}')">
                        <span class="legend-dot" style="background:${this.getTypeColorHex(t)}"></span>
                        <span>${this.dataQuery.getTypeLabel(t)} (${c})</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getTypeColorHex(type) {
        const colors = {
            ventilation: '#4FC3F7', fire_water: '#EF5350', fire_sprinkler: '#FF7043',
            electrical: '#FDD835', communication: '#66BB6A', water_supply: '#42A5F5',
            drainage: '#7E57C2', gas: '#FFA726', smoke_exhaust: '#8D6E63'
        };
        return colors[type] || '#CCCCCC';
    }

    updatePipelineList() {
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type || 'info'}`;
        toast.textContent = message;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const time = this.clock.getElapsedTime();

        this.fpsCounter++;
        if (time - this.lastFpsTime >= 1.0) {
            this.currentFps = this.fpsCounter;
            this.fpsCounter = 0;
            this.lastFpsTime = time;
        }

        this.controls.update();

        if (this.frustumCullingEnabled && time - this.lastCullTime >= this.frustumCullInterval / 1000) {
            this.modeler.updateFrustumCulling();
            this.lastCullTime = time;
        }

        this.modeler.updateLOD();
        this.detector.animateCollisions(time);
        this.annotator.animate(time);

        if (this.activePanel === 'performance' && time % 0.5 < 0.016) {
            this.updatePerformancePanel();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new App();
    app.init();
});
