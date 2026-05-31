class TimelineManager {
    constructor(operationManager) {
        this.operationManager = operationManager;
        this.isPlaying = false;
        this.playInterval = null;
        this.playbackSpeed = 1;
        this.timeRange = { start: Date.now(), end: Date.now() };
        this.exportStartTime = null;
        this.exportEndTime = null;

        this.setupElements();
        this.setupEventListeners();
        this.setupOperationCallbacks();
    }

    setupElements() {
        this.container = document.getElementById('timelineContainer');
        this.slider = document.getElementById('timelineSlider');
        this.currentTimeEl = document.getElementById('timelineCurrentTime');
        this.startTimeEl = document.getElementById('timelineStart');
        this.endTimeEl = document.getElementById('timelineEnd');
        this.marksContainer = document.getElementById('timelineMarks');
        this.toggle = document.getElementById('timelineToggle');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetTimelineBtn');
        this.showExportBtn = document.getElementById('showExportBtn');
        this.exportSection = document.getElementById('timelineExportSection');
        this.closeExportBtn = document.getElementById('closeExportBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.exportStartSlider = document.getElementById('exportStartSlider');
        this.exportEndSlider = document.getElementById('exportEndSlider');
        this.exportStartTimeEl = document.getElementById('exportStartTime');
        this.exportEndTimeEl = document.getElementById('exportEndTime');
        this.exportFps = document.getElementById('exportFps');
        this.exportResolution = document.getElementById('exportResolution');
        this.exportProgress = document.getElementById('exportProgress');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
    }

    setupEventListeners() {
        this.toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.enterHistoryMode();
            } else {
                this.exitHistoryMode();
            }
        });

        this.slider.addEventListener('input', (e) => {
            this.handleSliderInput(e.target.value);
        });

        this.slider.addEventListener('change', (e) => {
            this.handleSliderChange(e.target.value);
        });

        this.playBtn.addEventListener('click', () => this.startPlayback());
        this.pauseBtn.addEventListener('click', () => this.stopPlayback());
        this.resetBtn.addEventListener('click', () => this.resetToLatest());

        this.showExportBtn.addEventListener('click', () => {
            this.exportSection.classList.toggle('hidden');
        });

        this.closeExportBtn.addEventListener('click', () => {
            this.exportSection.classList.add('hidden');
        });

        this.exportStartSlider.addEventListener('input', (e) => {
            this.updateExportTimeRange();
        });

        this.exportEndSlider.addEventListener('input', (e) => {
            this.updateExportTimeRange();
        });

        this.exportBtn.addEventListener('click', () => this.requestExport());
    }

    setupOperationCallbacks() {
        this.operationManager.onLog(() => {
            this.updateTimelineRange();
            this.updateMarks();
        });

        this.operationManager.onHistoryStateChange((isInHistory) => {
            if (!isInHistory) {
                this.toggle.checked = false;
                this.stopPlayback();
                this.slider.value = '100';
                this.updateSliderProgress(100);
            }
        });

        this.operationManager.onHistoryRollback((time, geomCount) => {
            this.updateCurrentTimeDisplay(time);
        });

        this.operationManager.onExportProgress((progress, status) => {
            this.updateExportProgress(progress, status);
        });

        this.operationManager.onExportComplete((downloadUrl, filename, duration) => {
            this.showExportComplete(downloadUrl, filename, duration);
        });

        this.operationManager.onExportError((error) => {
            this.showExportError(error);
        });
    }

    show() {
        this.container.classList.remove('hidden');
        this.updateTimelineRange();
        this.updateMarks();
    }

    hide() {
        this.container.classList.add('hidden');
    }

    enterHistoryMode() {
        this.operationManager.enterHistoryMode();
        this.slider.disabled = false;
        this.playBtn.disabled = false;
        this.resetBtn.disabled = false;
    }

    exitHistoryMode() {
        this.stopPlayback();
        this.operationManager.exitHistoryMode();
        this.slider.disabled = true;
        this.playBtn.disabled = true;
        this.resetBtn.disabled = true;
        this.slider.value = '100';
        this.updateSliderProgress(100);
        this.updateCurrentTimeDisplay(this.timeRange.end);
    }

    updateTimelineRange() {
        this.timeRange = this.operationManager.getTimeRange();
        const { start, end } = this.timeRange;

        this.startTimeEl.textContent = this.formatTime(start);
        this.endTimeEl.textContent = this.formatTime(end);
        this.updateCurrentTimeDisplay(end);

        this.exportStartSlider.min = 0;
        this.exportStartSlider.max = 100;
        this.exportEndSlider.min = 0;
        this.exportEndSlider.max = 100;
        this.exportStartSlider.value = 0;
        this.exportEndSlider.value = 100;
        this.exportStartTime = start;
        this.exportEndTime = end;
        this.exportStartTimeEl.textContent = this.formatTime(start);
        this.exportEndTimeEl.textContent = this.formatTime(end);
    }

    updateMarks() {
        this.marksContainer.innerHTML = '';
        const ops = this.operationManager.getSortedOperations();
        const { start, end } = this.timeRange;
        const range = end - start;

        if (range === 0) return;

        ops.forEach(op => {
            const position = ((op.timestamp - start) / range) * 100;
            const mark = document.createElement('div');
            mark.className = `timeline-mark ${op.type.toLowerCase()}`;
            mark.style.left = `${position}%`;
            mark.title = `${op.type} by ${op.userId} - ${this.formatTime(op.timestamp)}`;
            mark.addEventListener('click', () => {
                this.slider.value = position;
                this.handleSliderChange(position);
            });
            this.marksContainer.appendChild(mark);
        });
    }

    handleSliderInput(value) {
        this.updateSliderProgress(value);
        const time = this.percentToTime(parseFloat(value));
        this.updateCurrentTimeDisplay(time);
    }

    handleSliderChange(value) {
        const time = this.percentToTime(parseFloat(value));
        this.operationManager.rollbackToTime(time);
    }

    updateSliderProgress(value) {
        this.slider.style.setProperty('--progress', `${value}%`);
    }

    percentToTime(percent) {
        const { start, end } = this.timeRange;
        const range = end - start;
        return start + (range * percent / 100);
    }

    timeToPercent(time) {
        const { start, end } = this.timeRange;
        const range = end - start;
        if (range === 0) return 100;
        return Math.min(100, Math.max(0, ((time - start) / range) * 100));
    }

    updateCurrentTimeDisplay(time) {
        this.currentTimeEl.textContent = this.formatTime(time);
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    startPlayback() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.playBtn.classList.add('hidden');
        this.pauseBtn.classList.remove('hidden');

        let currentValue = parseFloat(this.slider.value);
        const step = 0.5 * this.playbackSpeed;

        this.playInterval = setInterval(() => {
            currentValue += step;
            if (currentValue >= 100) {
                currentValue = 100;
                this.stopPlayback();
            }
            this.slider.value = currentValue;
            this.updateSliderProgress(currentValue);
            this.handleSliderChange(currentValue);
        }, 50);
    }

    stopPlayback() {
        this.isPlaying = false;
        this.playBtn.classList.remove('hidden');
        this.pauseBtn.classList.add('hidden');

        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    resetToLatest() {
        this.stopPlayback();
        this.slider.value = '100';
        this.updateSliderProgress(100);
        this.handleSliderChange(100);
    }

    updateExportTimeRange() {
        let startVal = parseInt(this.exportStartSlider.value);
        let endVal = parseInt(this.exportEndSlider.value);

        if (startVal > endVal) {
            startVal = endVal;
            this.exportStartSlider.value = startVal;
        }

        this.exportStartTime = this.percentToTime(startVal);
        this.exportEndTime = this.percentToTime(endVal);
        this.exportStartTimeEl.textContent = this.formatTime(this.exportStartTime);
        this.exportEndTimeEl.textContent = this.formatTime(this.exportEndTime);
    }

    async requestExport() {
        if (!this.exportStartTime || !this.exportEndTime) {
            this.showExportError('请选择有效的时间范围');
            return;
        }

        if (this.exportEndTime <= this.exportStartTime) {
            this.showExportError('结束时间必须晚于开始时间');
            return;
        }

        this.exportBtn.disabled = true;
        this.exportProgress.classList.remove('hidden');
        this.updateExportProgress(0, '正在准备导出...');

        const options = {
            startTime: this.exportStartTime,
            endTime: this.exportEndTime,
            fps: parseInt(this.exportFps.value),
            resolution: this.exportResolution.value
        };

        try {
            await this.operationManager.requestExport(options);
        } catch (error) {
            this.showExportError(error.message);
        }
    }

    updateExportProgress(progress, status) {
        this.progressFill.style.width = `${progress}%`;
        this.progressText.textContent = status || `导出中... ${Math.round(progress)}%`;
    }

    showExportComplete(downloadUrl, filename, duration) {
        this.exportBtn.disabled = false;
        this.updateExportProgress(100, `导出完成！耗时 ${duration.toFixed(1)} 秒`);

        const existingLink = this.exportProgress.querySelector('.export-download-link');
        if (existingLink) existingLink.remove();

        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.className = 'export-download-link';
        downloadLink.download = filename;
        downloadLink.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            下载 ${filename}
        `;
        this.exportProgress.appendChild(downloadLink);
    }

    showExportError(error) {
        this.exportBtn.disabled = false;
        this.updateExportProgress(0, `导出失败: ${error}`);
        this.progressFill.style.background = 'linear-gradient(90deg, #ff6b81, #ff4757)';
        
        setTimeout(() => {
            this.progressFill.style.background = 'linear-gradient(90deg, #00ff88, #00d4ff)';
        }, 2000);
    }
}
