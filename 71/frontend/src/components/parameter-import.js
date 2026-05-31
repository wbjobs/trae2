/**
 * 参数导入组件
 * Parameter import component for managing device and optical parameters.
 */

class ParameterImport {
    constructor() {
        this.currentParams = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadPresets();
    }

    bindEvents() {
        document.getElementById('btn-import-file').addEventListener('click', () => this.importFromFile());
        document.getElementById('btn-export-file').addEventListener('click', () => this.exportToFile());
        document.getElementById('btn-validate').addEventListener('click', () => this.validate());
        document.getElementById('btn-reset-params').addEventListener('click', () => this.resetParams());
        document.getElementById('device-preset').addEventListener('change', (e) => this.applyDevicePreset(e.target.value));
        document.getElementById('optical-preset').addEventListener('change', (e) => this.applyOpticalPreset(e.target.value));
    }

    async loadPresets() {
        try {
            const devicePresets = await apiService.getDevicePresets();
            const opticalPresets = await apiService.getOpticalPresets();

            this.populatePresetSelect('device-preset', devicePresets);
            this.populatePresetSelect('optical-preset', opticalPresets);
        } catch (e) {
            console.warn('Failed to load presets:', e);
        }
    }

    populatePresetSelect(selectId, presets) {
        const select = document.getElementById(selectId);
        if (!presets || typeof presets !== 'object') return;

        for (const [name, config] of Object.entries(presets)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = this.getPresetDisplayName(name, config);
            select.appendChild(option);
        }
    }

    getPresetDisplayName(name, config) {
        const info = config.info || config;
        return `${name} - ${info.device_name || name}`;
    }

    collectParameters() {
        return {
            device: {
                device_id: document.getElementById('dev-id').value,
                device_name: document.getElementById('dev-name').value,
                wavelength_range_nm: [
                    parseFloat(document.getElementById('dev-wl-start').value),
                    parseFloat(document.getElementById('dev-wl-end').value)
                ],
                resolution_nm: parseFloat(document.getElementById('dev-res').value),
                sampling_rate_hz: parseFloat(document.getElementById('dev-sr').value),
                integration_time_ms: parseFloat(document.getElementById('dev-it').value),
                detector_type: document.getElementById('dev-detector').value,
                pixel_count: parseInt(document.getElementById('dev-pixels').value),
                temperature_c: parseFloat(document.getElementById('dev-temp').value),
                humidity_pct: parseFloat(document.getElementById('dev-hum').value)
            },
            optical: {
                light_source_type: document.getElementById('opt-source').value,
                source_power_mw: parseFloat(document.getElementById('opt-power').value),
                focal_length_mm: parseFloat(document.getElementById('opt-focal').value),
                grating_density_lpm: parseFloat(document.getElementById('opt-grating').value),
                slit_width_um: parseFloat(document.getElementById('opt-slit').value),
                mirror_reflectivity: parseFloat(document.getElementById('opt-mirror').value),
                fiber_core_um: parseFloat(document.getElementById('opt-fiber-core').value),
                fiber_na: parseFloat(document.getElementById('opt-fiber-na').value),
                calibration_source_wl_nm: parseFloat(document.getElementById('opt-cal-wl').value),
                calibration_source_power_mw: parseFloat(document.getElementById('opt-cal-power').value)
            },
            calibration: {
                target_wavelengths_nm: document.getElementById('cal-wavelengths').value
                    .split(',').map(v => parseFloat(v.trim())),
                target_intensities: document.getElementById('cal-intensities').value
                    .split(',').map(v => parseFloat(v.trim())),
                tolerance_pct: parseFloat(document.getElementById('cal-tolerance').value)
            }
        };
    }

    async applyParameters(params) {
        if (!params) return;

        const dev = params.device || {};
        if (dev.device_id) document.getElementById('dev-id').value = dev.device_id;
        if (dev.device_name) document.getElementById('dev-name').value = dev.device_name;
        if (dev.wavelength_range_nm) {
            document.getElementById('dev-wl-start').value = dev.wavelength_range_nm[0];
            document.getElementById('dev-wl-end').value = dev.wavelength_range_nm[1];
        }
        if (dev.resolution_nm) document.getElementById('dev-res').value = dev.resolution_nm;
        if (dev.sampling_rate_hz) document.getElementById('dev-sr').value = dev.sampling_rate_hz;
        if (dev.integration_time_ms) document.getElementById('dev-it').value = dev.integration_time_ms;
        if (dev.detector_type) document.getElementById('dev-detector').value = dev.detector_type;
        if (dev.pixel_count) document.getElementById('dev-pixels').value = dev.pixel_count;
        if (dev.temperature_c) document.getElementById('dev-temp').value = dev.temperature_c;
        if (dev.humidity_pct) document.getElementById('dev-hum').value = dev.humidity_pct;

        const opt = params.optical || {};
        if (opt.light_source_type) document.getElementById('opt-source').value = opt.light_source_type;
        if (opt.source_power_mw) document.getElementById('opt-power').value = opt.source_power_mw;
        if (opt.focal_length_mm) document.getElementById('opt-focal').value = opt.focal_length_mm;
        if (opt.grating_density_lpm) document.getElementById('opt-grating').value = opt.grating_density_lpm;
        if (opt.slit_width_um) document.getElementById('opt-slit').value = opt.slit_width_um;
        if (opt.mirror_reflectivity) document.getElementById('opt-mirror').value = opt.mirror_reflectivity;
        if (opt.fiber_core_um) document.getElementById('opt-fiber-core').value = opt.fiber_core_um;
        if (opt.fiber_na) document.getElementById('opt-fiber-na').value = opt.fiber_na;
        if (opt.calibration_source_wl_nm) document.getElementById('opt-cal-wl').value = opt.calibration_source_wl_nm;
        if (opt.calibration_source_power_mw) document.getElementById('opt-cal-power').value = opt.calibration_source_power_mw;

        const cal = params.calibration || {};
        if (cal.target_wavelengths_nm) {
            document.getElementById('cal-wavelengths').value = cal.target_wavelengths_nm.join(',');
        }
        if (cal.target_intensities) {
            document.getElementById('cal-intensities').value = cal.target_intensities.join(',');
        }
        if (cal.tolerance_pct) document.getElementById('cal-tolerance').value = cal.tolerance_pct;

        this.currentParams = params;
    }

    async importFromFile() {
        if (!window.electronAPI) {
            showToast('文件选择仅在桌面端可用', 'warning');
            return;
        }

        try {
            const filepath = await window.electronAPI.openFileDialog();
            if (!filepath) return;

            showLoading('正在导入参数文件...');
            const result = await apiService.loadParametersFromFile(filepath);

            if (result.parameters) {
                this.applyParameters(result.parameters);
                showToast('参数文件导入成功', 'success');
            } else if (result.error) {
                showToast(result.error, 'error');
            }
        } catch (e) {
            showToast('导入失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async exportToFile() {
        if (!window.electronAPI) {
            showToast('文件保存仅在桌面端可用', 'warning');
            return;
        }

        try {
            const filepath = await window.electronAPI.saveFileDialog();
            if (!filepath) return;

            const params = this.collectParameters();
            const content = JSON.stringify(params, null, 2);
            const result = await window.electronAPI.writeFile(filepath, content);

            if (result.success) {
                showToast('参数文件导出成功', 'success');
            } else {
                showToast('导出失败: ' + result.error, 'error');
            }
        } catch (e) {
            showToast('导出失败: ' + e.message, 'error');
        }
    }

    async validate() {
        try {
            const params = this.collectParameters();
            showLoading('正在验证参数...');

            const result = await apiService.validateParameters(params);

            const validationResult = document.getElementById('param-validation-result');
            validationResult.innerHTML = '';
            validationResult.className = 'validation-result show';

            if (result.validation && result.validation.valid) {
                validationResult.classList.add('success');
                validationResult.innerHTML = `
                    <strong>✓ 参数验证通过</strong>
                    ${result.validation.warnings && result.validation.warnings.length > 0
                        ? `<br><span style="color: var(--accent-warning);">警告: ${result.validation.warnings.join('; ')}</span>`
                        : ''
                    }
                `;
                showToast('参数验证通过', 'success');
                this.currentParams = params;
            } else {
                validationResult.classList.add('error');
                validationResult.innerHTML = `
                    <strong>✗ 参数验证失败</strong>
                    <br>${result.validation.errors.join('<br>')}
                `;
                showToast('参数验证失败', 'error');
            }
        } catch (e) {
            showToast('验证失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    resetParams() {
        document.getElementById('dev-id').value = 'SA-2026-001';
        document.getElementById('dev-name').value = 'Spectrum Analyzer Pro';
        document.getElementById('dev-wl-start').value = '400';
        document.getElementById('dev-wl-end').value = '1100';
        document.getElementById('dev-res').value = '0.5';
        document.getElementById('dev-sr').value = '1000';
        document.getElementById('dev-it').value = '10';
        document.getElementById('dev-detector').value = 'CCD';
        document.getElementById('dev-pixels').value = '2048';
        document.getElementById('dev-temp').value = '25';
        document.getElementById('dev-hum').value = '45';
        document.getElementById('opt-source').value = 'White_LED';
        document.getElementById('opt-power').value = '5';
        document.getElementById('opt-focal').value = '75';
        document.getElementById('opt-grating').value = '600';
        document.getElementById('opt-slit').value = '50';
        document.getElementById('opt-mirror').value = '0.95';
        document.getElementById('opt-fiber-core').value = '200';
        document.getElementById('opt-fiber-na').value = '0.22';
        document.getElementById('opt-cal-wl').value = '632.8';
        document.getElementById('opt-cal-power').value = '1';
        document.getElementById('cal-wavelengths').value = '450,520,632.8,700,850';
        document.getElementById('cal-intensities').value = '0.8,0.9,1.0,0.85,0.7';
        document.getElementById('cal-tolerance').value = '2';

        const validationResult = document.getElementById('param-validation-result');
        validationResult.className = 'validation-result';
        validationResult.innerHTML = '';

        showToast('参数已重置', 'info');
    }

    async applyDevicePreset(presetName) {
        if (!presetName) return;

        try {
            showLoading('正在应用设备预设...');
            const presets = await apiService.getDevicePresets();
            const preset = presets[presetName];

            if (preset) {
                this.applyParameters({ device: preset });
                showToast(`已应用设备预设: ${presetName}`, 'success');
            }
        } catch (e) {
            showToast('应用预设失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async applyOpticalPreset(presetName) {
        if (!presetName) return;

        try {
            showLoading('正在应用光学预设...');
            const presets = await apiService.getOpticalPresets();
            const preset = presets[presetName];

            if (preset) {
                this.applyParameters({ optical: preset });
                showToast(`已应用光学预设: ${presetName}`, 'success');
            }
        } catch (e) {
            showToast('应用预设失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    getCurrentParams() {
        if (!this.currentParams) {
            this.currentParams = this.collectParameters();
        }
        return this.currentParams;
    }
}

const parameterImport = new ParameterImport();
