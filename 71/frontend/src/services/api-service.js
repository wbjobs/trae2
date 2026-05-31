/**
 * API 服务 - 与后端通信
 * API Service for communication with the backend Flask server.
 */

class ApiService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:5000';
        this.initialized = false;
    }

    async init() {
        if (window.electronAPI) {
            try {
                const config = await window.electronAPI.getBackendConfig();
                this.baseUrl = `http://${config.host}:${config.port}`;
                this.initialized = true;
            } catch (e) {
                console.warn('Failed to get backend config from Electron:', e);
                this.initialized = true;
            }
        } else {
            this.initialized = true;
        }
    }

    async request(endpoint, options = {}) {
        if (!this.initialized) {
            await this.init();
        }

        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const mergedOptions = { ...defaultOptions, ...options };

        if (options.body) {
            mergedOptions.body = typeof options.body === 'string'
                ? options.body
                : JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, mergedOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: body
        });
    }

    async healthCheck() {
        return this.get('/api/health');
    }

    async loadParameters(params) {
        return this.post('/api/parameters', params);
    }

    async loadParametersFromFile(filepath) {
        return this.post('/api/parameters/file', { filepath });
    }

    async validateParameters(params) {
        return this.post('/api/parameters/validate', params);
    }

    async getDevicePresets() {
        return this.get('/api/parameters/presets/device');
    }

    async getOpticalPresets() {
        return this.get('/api/parameters/presets/optical');
    }

    async getWavelengthAxis() {
        return this.get('/api/wavelength-axis');
    }

    async simulateOpticalPath(wavelength, opticalParams, deviceParams) {
        return this.post('/api/simulate/optical-path', {
            wavelength_nm: wavelength,
            optical_params: opticalParams,
            device_params: deviceParams
        });
    }

    async simulateSpectrum(options = {}) {
        return this.post('/api/simulate/spectrum', options);
    }

    async calibrateWavelength(referenceLines) {
        return this.post('/api/calibrate/wavelength', {
            reference_lines: referenceLines
        });
    }

    async calibrateIntensity(measured, reference, wavelengths) {
        return this.post('/api/calibrate/intensity', {
            measured_intensities: measured,
            reference_intensities: reference,
            wavelengths: wavelengths
        });
    }

    async calibrateFull(referenceLines) {
        return this.post('/api/calibrate/full', {
            reference_lines: referenceLines
        });
    }

    async getCalibratedSpectrum() {
        return this.get('/api/calibrated-spectrum');
    }

    async validateCalibration(testLines, tolerance) {
        return this.post('/api/calibration/validate', {
            test_reference_lines: testLines,
            tolerance_pct: tolerance
        });
    }

    async generateReport(data) {
        return this.post('/api/report/generate', data);
    }

    async exportReport(reportData, format, filename) {
        return this.post('/api/report/export', {
            report_data: reportData,
            format: format,
            filename: filename
        });
    }

    async previewReport(data) {
        return this.post('/api/report/preview', data);
    }

    async runFullPipeline(options = {}) {
        return this.post('/api/pipeline/full', options);
    }

    async resetService() {
        return this.post('/api/reset');
    }

    async listScenarios(tag, status) {
        let endpoint = '/api/scenarios';
        const params = [];
        if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
        if (status) params.push(`status=${encodeURIComponent(status)}`);
        if (params.length) endpoint += `?${params.join('&')}`;
        return this.get(endpoint);
    }

    async createScenario(data) {
        return this.post('/api/scenarios', data);
    }

    async getScenario(scenarioId) {
        return this.get(`/api/scenarios/${scenarioId}`);
    }

    async updateScenario(scenarioId, data) {
        return this.request(`/api/scenarios/${scenarioId}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteScenario(scenarioId) {
        return this.request(`/api/scenarios/${scenarioId}`, {
            method: 'DELETE'
        });
    }

    async duplicateScenario(scenarioId, newName) {
        return this.post(`/api/scenarios/${scenarioId}/duplicate`, { new_name: newName });
    }

    async runScenario(scenarioId) {
        return this.post(`/api/scenarios/${scenarioId}/run`);
    }

    async runBatchScenarios(scenarioIds, stopOnError = false) {
        return this.post('/api/scenarios/batch/run', {
            scenario_ids: scenarioIds,
            stop_on_error: stopOnError
        });
    }

    async compareScenarios(scenarioIds, metricNames = null) {
        return this.post('/api/scenarios/compare', {
            scenario_ids: scenarioIds,
            metric_names: metricNames
        });
    }

    async clearScenarioResult(scenarioId) {
        return this.post(`/api/scenarios/${scenarioId}/clear-result`);
    }

    async getRecordingStatus() {
        return this.get('/api/recording/status');
    }

    async startRecording(name, description = '', fps = 30, initialParams = {}) {
        return this.post('/api/recording/start', {
            name,
            description,
            fps,
            initial_parameters: initialParams
        });
    }

    async stopRecording() {
        return this.post('/api/recording/stop');
    }

    async pauseRecording() {
        return this.post('/api/recording/pause');
    }

    async resumeRecording() {
        return this.post('/api/recording/resume');
    }

    async recordFrame(wavelength, intensity, opticalPathState = {}, parameterSnapshot = {}, metrics = {}) {
        return this.post('/api/recording/frame', {
            wavelength,
            intensity,
            optical_path_state: opticalPathState,
            parameter_snapshot: parameterSnapshot,
            metrics
        });
    }

    async listRecordings() {
        return this.get('/api/recordings');
    }

    async getRecording(recordingId) {
        return this.get(`/api/recordings/${recordingId}`);
    }

    async getRecordingFrames(recordingId, start = 0, end = null, stride = 1) {
        let endpoint = `/api/recordings/${recordingId}/frames?start=${start}&stride=${stride}`;
        if (end !== null) endpoint += `&end=${end}`;
        return this.get(endpoint);
    }

    async getPlaybackData(recordingId, speed = 1.0) {
        return this.get(`/api/recordings/${recordingId}/playback?speed=${speed}`);
    }

    async getRecordingStats(recordingId) {
        return this.get(`/api/recordings/${recordingId}/stats`);
    }

    async computeFrameDiff(recordingId, frame1Index, frame2Index) {
        return this.post(`/api/recordings/${recordingId}/diff`, {
            frame1_index: frame1Index,
            frame2_index: frame2Index
        });
    }

    async deleteRecording(recordingId) {
        return this.request(`/api/recordings/${recordingId}`, {
            method: 'DELETE'
        });
    }
}

const apiService = new ApiService();
