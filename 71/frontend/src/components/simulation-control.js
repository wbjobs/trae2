/**
 * 仿真控制组件
 * Simulation control component for managing spectrum simulation.
 */

class SimulationControl {
    constructor() {
        this.lastSimulationResult = null;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-run-simulation').addEventListener('click', () => this.runSimulation());
    }

    async runSimulation() {
        try {
            showLoading('正在运行光谱仿真...');

            const params = parameterImport.getCurrentParams();
            const sourceType = document.getElementById('sim-source').value;
            const addEmissionLines = document.getElementById('sim-add-lines').checked;
            const useOptical = document.getElementById('sim-optical').checked;
            const seed = parseInt(document.getElementById('sim-seed').value) || null;

            const result = await apiService.simulateSpectrum({
                parameters: params,
                source_type: sourceType,
                add_emission_lines: addEmissionLines,
                seed: seed
            });

            if (result.status === 'success') {
                this.lastSimulationResult = result;
                this.updateUI(result);
                spectrumViewer.updateChart(result);
                showToast(`仿真完成 (耗时: ${result.computation_time_ms}ms)`, 'success');
            } else {
                showToast(result.error || '仿真失败', 'error');
            }
        } catch (e) {
            console.error('Simulation error:', e);
            showToast('仿真失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    updateUI(result) {
        const spectrum = result.spectrum || {};
        const peaks = result.peaks || [];
        const metadata = spectrum.metadata || {};

        const wavelengths = spectrum.wavelengths || [];
        const intensities = spectrum.intensities || [];

        document.getElementById('metric-pixels').textContent = wavelengths.length;
        document.getElementById('metric-peaks').textContent = peaks.length;
        document.getElementById('metric-max-intensity').textContent =
            intensities.length > 0 ? Math.max(...intensities).toFixed(4) : '--';
        document.getElementById('metric-avg-intensity').textContent =
            intensities.length > 0 ? (intensities.reduce((a, b) => a + b, 0) / intensities.length).toFixed(4) : '--';

        document.getElementById('sim-computation-time').textContent =
            result.computation_time_ms ? `耗时: ${result.computation_time_ms}ms` : '';

        this.updateOpticalStatus(result);
    }

    updateOpticalStatus(result) {
        const sampleWl = 550.0;
        const params = parameterImport.getCurrentParams();

        apiService.simulateOpticalPath(
            sampleWl,
            params.optical,
            params.device
        ).then(optResult => {
            if (optResult.total_transmission !== undefined) {
                document.getElementById('st-grating-angle').textContent =
                    (optResult.grating_angle_rad * 180 / Math.PI).toFixed(3) + '°';
                document.getElementById('st-grating-eff').textContent =
                    (optResult.grating_efficiency * 100).toFixed(1) + '%';
                document.getElementById('st-fiber').textContent =
                    (optResult.fiber_transmission * 100).toFixed(1) + '%';
                document.getElementById('st-mirror').textContent =
                    (optResult.mirror_reflection * 100).toFixed(1) + '%';
                document.getElementById('st-slit').textContent =
                    (optResult.slit_transmission * 100).toFixed(1) + '%';
                document.getElementById('st-detector').textContent =
                    (optResult.detector_response * 100).toFixed(1) + '%';
                document.getElementById('st-total').textContent =
                    (optResult.total_transmission * 100).toFixed(2) + '%';
                document.getElementById('st-temp-shift').textContent =
                    (params.device.temperature_c - 25).toFixed(1) + '°C';
            }
        }).catch(e => {
            console.warn('Optical path simulation failed:', e);
        });
    }

    getLastResult() {
        return this.lastSimulationResult;
    }
}

const simulationControl = new SimulationControl();
