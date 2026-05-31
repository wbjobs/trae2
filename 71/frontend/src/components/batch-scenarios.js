/**
 * 批量方案管理组件
 * Batch Scenarios Management Component
 */

class BatchScenariosComponent {
    constructor() {
        this.scenarios = [];
        this.selectedScenarios = new Set();
        this.currentScenario = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadScenarios();
    }

    bindEvents() {
        document.getElementById('btn-create-scenario')?.addEventListener('click', () => this.createScenario());
        document.getElementById('btn-edit-scenario')?.addEventListener('click', () => this.editScenario());
        document.getElementById('btn-run-scenario')?.addEventListener('click', () => this.runCurrentScenario());
        document.getElementById('btn-duplicate-scenario')?.addEventListener('click', () => this.duplicateScenario());
        document.getElementById('btn-delete-scenario')?.addEventListener('click', () => this.deleteScenario());
        document.getElementById('btn-batch-run')?.addEventListener('click', () => this.batchRun());
        document.getElementById('btn-compare-scenarios')?.addEventListener('click', () => this.compareScenarios());
    }

    async loadScenarios() {
        try {
            const result = await apiService.listScenarios();
            if (result.status === 'success') {
                this.scenarios = result.scenarios || [];
                this.renderScenarioList();
            }
        } catch (error) {
            console.error('加载方案列表失败:', error);
            showToast('加载方案列表失败', 'error');
        }
    }

    renderScenarioList() {
        const container = document.getElementById('scenario-list');
        if (!container) return;

        if (this.scenarios.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无标定方案</div>';
            return;
        }

        container.innerHTML = this.scenarios.map(scenario => `
            <div class="scenario-item ${this.selectedScenarios.has(scenario.id) ? 'selected' : ''} ${this.currentScenario?.id === scenario.id ? 'active' : ''}"
                 data-id="${scenario.id}">
                <div class="scenario-header">
                    <label class="scenario-checkbox">
                        <input type="checkbox" ${this.selectedScenarios.has(scenario.id) ? 'checked' : ''}
                               onchange="batchScenarios.toggleScenarioSelection('${scenario.id}', this.checked)">
                    </label>
                    <div class="scenario-info">
                        <h4 class="scenario-name">${escapeHtml(scenario.name)}</h4>
                        <p class="scenario-desc">${escapeHtml(scenario.description || '无描述')}</p>
                    </div>
                    <span class="scenario-status status-${scenario.status}">${this.getStatusText(scenario.status)}</span>
                </div>
                <div class="scenario-meta">
                    <span>更新: ${this.formatDate(scenario.updated_at)}</span>
                    ${scenario.tags?.length ? `<span class="tags">${scenario.tags.slice(0, 2).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>` : ''}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.scenario-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('input[type="checkbox"]')) {
                    this.selectScenario(item.dataset.id);
                }
            });
        });

        this.updateCompareButton();
    }

    getStatusText(status) {
        const statusMap = {
            'pending': '待执行',
            'running': '执行中',
            'completed': '已完成',
            'failed': '失败'
        };
        return statusMap[status] || status;
    }

    formatDate(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    toggleScenarioSelection(id, checked) {
        if (checked) {
            this.selectedScenarios.add(id);
        } else {
            this.selectedScenarios.delete(id);
        }
        this.renderScenarioList();
        this.updateCompareButton();
    }

    updateCompareButton() {
        const btn = document.getElementById('btn-compare-scenarios');
        if (btn) {
            btn.disabled = this.selectedScenarios.size < 2;
        }
    }

    async selectScenario(id) {
        const scenario = this.scenarios.find(s => s.id === id);
        if (!scenario) return;

        this.currentScenario = scenario;
        this.renderScenarioList();
        this.renderScenarioDetail();
        this.updateActionButtons(true);
    }

    renderScenarioDetail() {
        const container = document.getElementById('scenario-detail');
        if (!container || !this.currentScenario) return;

        const s = this.currentScenario;
        const params = s.parameters || {};
        const result = s.result;

        let metricsHtml = '';
        if (result?.metrics) {
            metricsHtml = `
                <div class="detail-section">
                    <h5>性能指标</h5>
                    <div class="metrics-mini">
                        <div class="metric-mini">
                            <span class="label">波长精度</span>
                            <span class="value">${result.metrics.wavelength_accuracy_nm?.toFixed(4) || '--'} nm</span>
                        </div>
                        <div class="metric-mini">
                            <span class="label">R²</span>
                            <span class="value">${result.metrics.linearity_r2?.toFixed(4) || '--'}</span>
                        </div>
                        <div class="metric-mini">
                            <span class="label">信噪比</span>
                            <span class="value">${result.metrics.snr?.toFixed(2) || '--'} dB</span>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="detail-section">
                <h5>基本信息</h5>
                <div class="detail-grid">
                    <div class="detail-item"><span class="label">ID:</span> <span class="value">${s.id}</span></div>
                    <div class="detail-item"><span class="label">名称:</span> <span class="value">${escapeHtml(s.name)}</span></div>
                    <div class="detail-item"><span class="label">状态:</span> <span class="value status-${s.status}">${this.getStatusText(s.status)}</span></div>
                    <div class="detail-item"><span class="label">创建时间:</span> <span class="value">${this.formatDate(s.created_at)}</span></div>
                </div>
            </div>
            <div class="detail-section">
                <h5>参数摘要</h5>
                <div class="detail-grid">
                    <div class="detail-item"><span class="label">光栅密度:</span> <span class="value">${params.optical?.grating_density_lpm || '--'} l/mm</span></div>
                    <div class="detail-item"><span class="label">狭缝宽度:</span> <span class="value">${params.optical?.slit_width_um || '--'} μm</span></div>
                    <div class="detail-item"><span class="label">焦距:</span> <span class="value">${params.optical?.focal_length_mm || '--'} mm</span></div>
                    <div class="detail-item"><span class="label">探测器:</span> <span class="value">${params.device?.detector_type || '--'}</span></div>
                </div>
            </div>
            ${metricsHtml}
            ${s.description ? `<div class="detail-section"><h5>描述</h5><p>${escapeHtml(s.description)}</p></div>` : ''}
        `;
    }

    updateActionButtons(enabled) {
        const buttons = ['btn-edit-scenario', 'btn-run-scenario', 'btn-duplicate-scenario', 'btn-delete-scenario'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
    }

    createScenario() {
        const name = prompt('请输入方案名称:', `方案_${new Date().toLocaleDateString()}`);
        if (!name) return;

        const deviceParams = this.collectDeviceParams();
        const opticalParams = this.collectOpticalParams();
        const referenceLines = this.collectReferenceLines();

        apiService.createScenario({
            name,
            description: '',
            parameters: { device: deviceParams, optical: opticalParams },
            reference_lines: referenceLines,
            tags: []
        }).then(result => {
            if (result.status === 'success') {
                showToast('方案创建成功', 'success');
                this.loadScenarios();
            } else {
                showToast(result.error || '创建失败', 'error');
            }
        }).catch(error => {
            console.error('创建方案失败:', error);
            showToast('创建方案失败', 'error');
        });
    }

    collectDeviceParams() {
        return {
            id: document.getElementById('dev-id')?.value || '',
            name: document.getElementById('dev-name')?.value || '',
            detector_type: document.getElementById('dev-detector')?.value || 'CCD',
            temperature_c: parseFloat(document.getElementById('dev-temp')?.value) || 25,
            wavelength_start: parseFloat(document.getElementById('dev-wl-start')?.value) || 400,
            wavelength_end: parseFloat(document.getElementById('dev-wl-end')?.value) || 1100,
            resolution_nm: parseFloat(document.getElementById('dev-res')?.value) || 0.5,
            sampling_rate_hz: parseFloat(document.getElementById('dev-sr')?.value) || 1000,
            integration_time_ms: parseFloat(document.getElementById('dev-it')?.value) || 10,
            pixels: parseInt(document.getElementById('dev-pixels')?.value) || 2048,
            humidity_pct: parseFloat(document.getElementById('dev-hum')?.value) || 45
        };
    }

    collectOpticalParams() {
        return {
            light_source_type: document.getElementById('opt-source')?.value || 'White_LED',
            source_power_mw: parseFloat(document.getElementById('opt-power')?.value) || 5,
            focal_length_mm: parseFloat(document.getElementById('opt-focal')?.value) || 75,
            grating_density_lpm: parseFloat(document.getElementById('opt-grating')?.value) || 600,
            slit_width_um: parseFloat(document.getElementById('opt-slit')?.value) || 50,
            mirror_reflectivity: parseFloat(document.getElementById('opt-mirror')?.value) || 0.95,
            fiber_core_um: parseFloat(document.getElementById('opt-fiber-core')?.value) || 200,
            fiber_na: parseFloat(document.getElementById('opt-fiber-na')?.value) || 0.22,
            blaze_wavelength_nm: parseFloat(document.getElementById('opt-cal-wl')?.value) || 632.8,
            calibration_power_mw: parseFloat(document.getElementById('opt-cal-power')?.value) || 1
        };
    }

    collectReferenceLines() {
        try {
            const wlStr = document.getElementById('cal-wavelengths')?.value || '';
            const intStr = document.getElementById('cal-intensities')?.value || '';
            const wavelengths = wlStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            const intensities = intStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            return wavelengths.map((wl, i) => [wl, intensities[i] || 1.0]);
        } catch {
            return [];
        }
    }

    editScenario() {
        if (!this.currentScenario) return;
        const newName = prompt('请输入新的方案名称:', this.currentScenario.name);
        if (!newName) return;

        apiService.updateScenario(this.currentScenario.id, {
            name: newName
        }).then(result => {
            if (result.status === 'success') {
                showToast('方案更新成功', 'success');
                this.loadScenarios();
            } else {
                showToast(result.error || '更新失败', 'error');
            }
        }).catch(error => {
            console.error('更新方案失败:', error);
            showToast('更新方案失败', 'error');
        });
    }

    async runCurrentScenario() {
        if (!this.currentScenario) return;

        showLoading('正在执行方案...');
        try {
            const result = await apiService.runScenario(this.currentScenario.id);
            hideLoading();

            if (result.status === 'success') {
                showToast('方案执行成功', 'success');
                await this.loadScenarios();
                await this.selectScenario(this.currentScenario.id);
            } else {
                showToast(result.error || '执行失败', 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('执行方案失败:', error);
            showToast('执行方案失败', 'error');
        }
    }

    duplicateScenario() {
        if (!this.currentScenario) return;
        const newName = prompt('请输入新方案名称:', `${this.currentScenario.name} (副本)`);
        if (!newName) return;

        apiService.duplicateScenario(this.currentScenario.id, newName)
            .then(result => {
                if (result.status === 'success') {
                    showToast('方案复制成功', 'success');
                    this.loadScenarios();
                } else {
                    showToast(result.error || '复制失败', 'error');
                }
            }).catch(error => {
                console.error('复制方案失败:', error);
                showToast('复制方案失败', 'error');
            });
    }

    deleteScenario() {
        if (!this.currentScenario) return;
        if (!confirm(`确定要删除方案 "${this.currentScenario.name}" 吗？`)) return;

        apiService.deleteScenario(this.currentScenario.id)
            .then(result => {
                if (result) {
                    showToast('方案已删除', 'success');
                    this.currentScenario = null;
                    this.selectedScenarios.delete(this.currentScenario?.id);
                    this.updateActionButtons(false);
                    this.loadScenarios();
                    document.getElementById('scenario-detail').innerHTML = '<div class="empty-state">请选择一个方案查看详情</div>';
                } else {
                    showToast('删除失败', 'error');
                }
            }).catch(error => {
                console.error('删除方案失败:', error);
                showToast('删除方案失败', 'error');
            });
    }

    async batchRun() {
        if (this.selectedScenarios.size === 0) {
            showToast('请先选择要执行的方案', 'warning');
            return;
        }

        const stopOnError = document.getElementById('batch-stop-on-error')?.checked || false;

        showLoading(`正在批量执行 ${this.selectedScenarios.size} 个方案...`);
        try {
            const result = await apiService.runBatchScenarios(Array.from(this.selectedScenarios), stopOnError);
            hideLoading();

            if (result.status === 'success') {
                const r = result.result;
                showToast(`执行完成: ${r.completed?.length || 0} 成功, ${r.failed?.length || 0} 失败`, 'success');
                this.loadScenarios();
            } else {
                showToast(result.error || '批量执行失败', 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('批量执行失败:', error);
            showToast('批量执行失败', 'error');
        }
    }

    async compareScenarios() {
        if (this.selectedScenarios.size < 2) {
            showToast('请至少选择 2 个方案进行比对', 'warning');
            return;
        }

        showLoading('正在比对方案...');
        try {
            const result = await apiService.compareScenarios(Array.from(this.selectedScenarios));
            hideLoading();

            if (result.status === 'success') {
                this.renderComparisonResults(result.comparison);
            } else {
                showToast(result.error || '比对失败', 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('方案比对失败:', error);
            showToast('方案比对失败', 'error');
        }
    }

    renderComparisonResults(comparison) {
        const container = document.getElementById('comparison-results');
        if (!container || !comparison) return;

        const scenarios = comparison.scenarios || {};
        const summary = comparison.summary || {};
        const names = summary.scenario_names || {};

        if (Object.keys(scenarios).length === 0) {
            container.innerHTML = '<div class="empty-state">没有可比对的有效方案结果</div>';
            return;
        }

        const metrics = Object.keys(summary.best || {});
        const scenarioIds = Object.keys(scenarios);

        container.innerHTML = `
            <div class="comparison-table-container">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th>指标</th>
                            ${scenarioIds.map(id => `<th>${escapeHtml(names[id] || id)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${metrics.map(metric => `
                            <tr>
                                <td class="metric-name">${this.formatMetricName(metric)}</td>
                                ${scenarioIds.map(id => {
                                    const value = scenarios[id]?.metrics?.[metric];
                                    const isBest = summary.best?.[metric]?.scenario_id === id;
                                    const isWorst = summary.worst?.[metric]?.scenario_id === id;
                                    return `<td class="${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">
                                        ${this.formatMetricValue(metric, value)}
                                        ${isBest ? '<span class="badge-best">最佳</span>' : ''}
                                        ${isWorst ? '<span class="badge-worst">最差</span>' : ''}
                                    </td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="comparison-legend">
                <span class="legend-item"><span class="badge-best">最佳</span> 最优值</span>
                <span class="legend-item"><span class="badge-worst">最差</span> 最差值</span>
            </div>
        `;
    }

    formatMetricName(metric) {
        const names = {
            'wavelength_accuracy_nm': '波长精度 (nm)',
            'wavelength_rmse': '波长 RMSE (nm)',
            'intensity_accuracy_pct': '强度精度 (%)',
            'linearity_r2': '线性度 R²',
            'snr': '信噪比 (dB)'
        };
        return names[metric] || metric;
    }

    formatMetricValue(metric, value) {
        if (value === undefined || value === null) return '--';
        if (metric.includes('r2') || metric.includes('rmse') || metric.includes('accuracy')) {
            return value.toFixed(4);
        }
        if (metric.includes('snr')) {
            return value.toFixed(2);
        }
        return value.toString();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const batchScenarios = new BatchScenariosComponent();
