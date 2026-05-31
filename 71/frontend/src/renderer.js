/**
 * 渲染进程主入口
 * Main renderer process for Spectrum Calibration desktop client.
 */

let lastCalibrationResult = null;
let lastFullCalibrationData = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabNavigation();
    initCalibration();
    initBackendStatus();
    initGlobalEvents();
    apiService.init();
});

function initTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`panel-${targetTab}`).classList.add('active');
        });
    });
}

function initCalibration() {
    document.getElementById('btn-cal-wavelength').addEventListener('click', runWavelengthCalibration);
    document.getElementById('btn-cal-intensity').addEventListener('click', runIntensityCalibration);
    document.getElementById('btn-cal-full').addEventListener('click', runFullCalibration);
    document.getElementById('btn-cal-validate').addEventListener('click', validateCalibrationResult);
}

async function runWavelengthCalibration() {
    try {
        showLoading('正在执行波长标定...');
        const params = parameterImport.getCurrentParams();
        const calLines = params.calibration.target_wavelengths_nm.map(
            (wl, i) => [wl, params.calibration.target_intensities[i]]
        );

        const result = await apiService.calibrateWavelength(calLines);
        lastCalibrationResult = result;

        const container = document.getElementById('wl-cal-result');
        renderCalibrationResult(container, result, '波长');

        if (result.status === 'success') {
            showToast('波长标定完成', 'success');
        } else {
            showToast('波长标定失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (e) {
        showToast('波长标定失败: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function runIntensityCalibration() {
    try {
        showLoading('正在执行强度标定...');

        const simResult = simulationControl.getLastResult();
        if (!simResult) {
            showToast('请先运行光谱仿真', 'warning');
            return;
        }

        const params = parameterImport.getCurrentParams();
        const wavelengths = params.calibration.target_wavelengths_nm;
        const refIntensities = params.calibration.target_intensities;

        const spectrum = simResult.spectrum || {};
        const specWavelengths = spectrum.wavelengths || [];
        const specIntensities = spectrum.intensities || [];

        const measuredIntensities = wavelengths.map(wl => {
            const idx = specWavelengths.findIndex(w => Math.abs(w - wl) < 2);
            return idx >= 0 ? specIntensities[idx] : 0.5;
        });

        const result = await apiService.calibrateIntensity(
            measuredIntensities, refIntensities, wavelengths
        );

        const container = document.getElementById('int-cal-result');
        renderCalibrationResult(container, result, '强度');

        if (result.status === 'success') {
            showToast('强度标定完成', 'success');
        } else {
            showToast('强度标定失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (e) {
        showToast('强度标定失败: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function runFullCalibration() {
    try {
        showLoading('正在执行完整标定...');

        const params = parameterImport.getCurrentParams();
        const calLines = params.calibration.target_wavelengths_nm.map(
            (wl, i) => [wl, params.calibration.target_intensities[i]]
        );

        const result = await apiService.calibrateFull(calLines);
        lastFullCalibrationData = result;

        if (result.status === 'success') {
            const wlCal = result.wavelength_calibration || {};
            const intCal = result.intensity_calibration || {};
            const metrics = result.metrics || {};

            const wlContainer = document.getElementById('wl-cal-result');
            const intContainer = document.getElementById('int-cal-result');

            renderCalibrationResult(wlContainer, {
                status: wlCal.status,
                calibration: wlCal
            }, '波长');

            renderCalibrationResult(intContainer, {
                status: intCal.status,
                calibration: intCal
            }, '强度');

            updateCalibrationMetrics(metrics, wlCal);
            renderCalibrationDetails(result);

            showToast('完整标定完成', 'success');
        } else {
            showToast('标定失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (e) {
        showToast('标定失败: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function validateCalibrationResult() {
    try {
        showLoading('正在验证标定结果...');

        const params = parameterImport.getCurrentParams();
        const testLines = params.calibration.target_wavelengths_nm.map(
            (wl, i) => [wl, params.calibration.target_intensities[i]]
        );
        const tolerance = params.calibration.tolerance_pct;

        const result = await apiService.validateCalibration(testLines, tolerance);

        const detailsContainer = document.getElementById('calibration-details');
        const validation = result.validation || {};

        let html = '<h4>标定验证结果</h4>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><span class="di-label">总体质量</span><span class="di-value">${validation.overall_quality || '--'}</span></div>`;
        html += `<div class="detail-item"><span class="di-label">验证通过</span><span class="di-value">${validation.valid ? '✓ 是' : '✗ 否'}</span></div>`;
        html += `<div class="detail-item"><span class="di-label">失败点数</span><span class="di-value">${validation.failed_points?.length || 0}</span></div>`;

        if (validation.wavelength_errors?.length > 0) {
            html += `<div class="detail-item"><span class="di-label">最大波长误差</span><span class="di-value">${Math.max(...validation.wavelength_errors).toFixed(2)}%</span></div>`;
        }
        if (validation.intensity_errors?.length > 0) {
            html += `<div class="detail-item"><span class="di-label">最大强度误差</span><span class="di-value">${Math.max(...validation.intensity_errors).toFixed(2)}%</span></div>`;
        }

        html += '</div>';
        detailsContainer.innerHTML = html;

        if (validation.valid) {
            showToast('标定验证通过', 'success');
        } else {
            showToast('标定验证失败', 'warning');
        }
    } catch (e) {
        showToast('验证失败: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderCalibrationResult(container, result, type) {
    const cal = result.calibration || {};

    if (result.status === 'success' || cal.status === 'success') {
        let html = '<div class="success">';
        html += `<strong>✓ ${type}标定成功</strong>`;

        if (cal.wavelength_rmse !== undefined) {
            html += `<div class="result-item"><span>RMSE:</span><span>${cal.wavelength_rmse.toFixed(4)} nm</span></div>`;
        }
        if (cal.intensity_rmse !== undefined) {
            html += `<div class="result-item"><span>RMSE:</span><span>${cal.intensity_rmse.toFixed(4)}</span></div>`;
        }
        if (cal.wavelength_coeffs?.length > 0) {
            html += `<div class="result-item"><span>标定系数:</span><span>${cal.wavelength_coeffs.map(c => c.toFixed(6)).join(', ')}</span></div>`;
        }
        if (cal.calibration_points?.length > 0) {
            html += `<div class="result-item"><span>标定点数:</span><span>${cal.calibration_points.length}</span></div>`;
        }

        html += '</div>';
        container.innerHTML = html;
        container.dataset.result = JSON.stringify(cal);
    } else {
        container.innerHTML = `<div class="failed"><strong>✗ ${type}标定失败</strong><br>${cal.error_message || result.error || '未知错误'}</div>`;
        container.dataset.result = '';
    }
}

function updateCalibrationMetrics(metrics, wlCal) {
    if (!metrics) return;

    if (metrics.wavelength_accuracy_nm !== undefined) {
        document.getElementById('cal-wl-accuracy').textContent =
            metrics.wavelength_accuracy_nm.toFixed(4);
    }
    if (wlCal?.wavelength_rmse !== undefined) {
        document.getElementById('cal-wl-rmse').textContent =
            wlCal.wavelength_rmse.toFixed(4);
    }
    if (metrics.intensity_accuracy_pct !== undefined) {
        document.getElementById('cal-int-accuracy').textContent =
            metrics.intensity_accuracy_pct.toFixed(2);
    }
    if (metrics.linearity_r2 !== undefined) {
        document.getElementById('cal-r2').textContent =
            metrics.linearity_r2.toFixed(4);
    }
    if (metrics.snr !== undefined) {
        document.getElementById('cal-snr').textContent =
            metrics.snr.toFixed(1);
    }
    document.getElementById('cal-status').textContent = '成功';
}

function renderCalibrationDetails(data) {
    const container = document.getElementById('calibration-details');
    if (!container || !data) return;

    const wlCal = data.wavelength_calibration || {};
    const points = wlCal.calibration_points || [];

    if (points.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<h4>标定点详情</h4>';
    html += '<div class="detail-grid">';
    points.forEach((point, i) => {
        html += `
            <div class="detail-item">
                <span class="di-label">点 ${i + 1}</span>
                <span class="di-value">
                    λ_ref: ${point.wavelength_reference?.toFixed(2) || '--'} nm<br>
                    λ_meas: ${point.wavelength_measured?.toFixed(2) || '--'} nm
                </span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function initBackendStatus() {
    const statusEl = document.getElementById('backend-status');
    const statusText = statusEl.querySelector('.status-text');
    const statusDot = statusEl.querySelector('.status-dot');

    async function checkStatus() {
        try {
            const health = await apiService.healthCheck();
            if (health.status === 'healthy') {
                statusEl.className = 'status-badge status-connected';
                statusText.textContent = '已连接';
            } else {
                statusEl.className = 'status-badge status-disconnected';
                statusText.textContent = '连接失败';
            }
        } catch (e) {
            statusEl.className = 'status-badge status-disconnected';
            statusText.textContent = '未连接';
        }
    }

    checkStatus();
    setInterval(checkStatus, 5000);
}

function initGlobalEvents() {
    document.getElementById('btn-restart-backend').addEventListener('click', async () => {
        if (window.electronAPI) {
            await window.electronAPI.restartBackend();
            showToast('正在重启后端服务...', 'info');
        }
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showLoading(text = '处理中...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    textEl.textContent = text;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
}
