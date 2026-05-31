/**
 * 录制回放组件
 * Recording and Playback Component
 */

class RecordingPlaybackComponent {
    constructor() {
        this.recordings = [];
        this.currentRecording = null;
        this.currentFrames = [];
        this.isRecording = false;
        this.isPaused = false;
        this.isPlaying = false;
        this.playbackFrame = 0;
        this.playbackInterval = null;
        this.recordingStartTime = 0;
        this.frameCount = 0;
        this.playbackChart = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadRecordings();
        this.initPlaybackChart();
    }

    bindEvents() {
        document.getElementById('btn-start-recording')?.addEventListener('click', () => this.startRecording());
        document.getElementById('btn-pause-recording')?.addEventListener('click', () => this.pauseRecording());
        document.getElementById('btn-stop-recording')?.addEventListener('click', () => this.stopRecording());
        document.getElementById('btn-refresh-recordings')?.addEventListener('click', () => this.loadRecordings());
        document.getElementById('btn-play-recording')?.addEventListener('click', () => this.play());
        document.getElementById('btn-pause-playback')?.addEventListener('click', () => this.pausePlayback());
        document.getElementById('btn-stop-playback')?.addEventListener('click', () => this.stopPlayback());
        document.getElementById('playback-slider')?.addEventListener('input', (e) => this.seekTo(parseInt(e.target.value)));
        document.getElementById('playback-speed')?.addEventListener('change', () => this.updatePlaybackSpeed());
    }

    initPlaybackChart() {
        const canvas = document.getElementById('playback-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        this.playbackChart = {
            ctx,
            canvas,
            data: null
        };
    }

    async startRecording() {
        const name = document.getElementById('rec-name')?.value || '';
        if (!name.trim()) {
            showToast('请输入录制名称', 'warning');
            return;
        }

        const fps = parseInt(document.getElementById('rec-fps')?.value) || 30;
        const description = document.getElementById('rec-description')?.value || '';

        try {
            const result = await apiService.startRecording(name, description, fps);
            if (result.status === 'success') {
                this.isRecording = true;
                this.isPaused = false;
                this.recordingStartTime = Date.now();
                this.frameCount = 0;
                this.updateRecordingUI();
                showToast('录制已开始', 'success');
                this.startRecordingUpdate();
            } else {
                showToast(result.error || '开始录制失败', 'error');
            }
        } catch (error) {
            console.error('开始录制失败:', error);
            showToast('开始录制失败', 'error');
        }
    }

    startRecordingUpdate() {
        this.recordingUpdateInterval = setInterval(() => {
            if (this.isRecording && !this.isPaused) {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                document.getElementById('rec-duration').textContent = `${elapsed}s`;
                document.getElementById('rec-frame-count').textContent = this.frameCount;
            }
        }, 500);
    }

    async pauseRecording() {
        try {
            const result = await apiService.pauseRecording();
            if (result.status === 'success') {
                this.isPaused = true;
                this.updateRecordingUI();
                showToast('录制已暂停', 'info');
            } else {
                showToast(result.error || '暂停失败', 'error');
            }
        } catch (error) {
            console.error('暂停录制失败:', error);
            showToast('暂停录制失败', 'error');
        }
    }

    async stopRecording() {
        try {
            const result = await apiService.stopRecording();
            if (result.status === 'success') {
                this.isRecording = false;
                this.isPaused = false;
                clearInterval(this.recordingUpdateInterval);
                this.updateRecordingUI();
                showToast(`录制已停止，共 ${result.frame_count} 帧`, 'success');
                this.loadRecordings();
            } else {
                showToast(result.error || '停止失败', 'error');
            }
        } catch (error) {
            console.error('停止录制失败:', error);
            showToast('停止录制失败', 'error');
        }
    }

    updateRecordingUI() {
        const statusBadge = document.getElementById('recording-status-badge');
        const statusText = statusBadge?.querySelector('.status-text');
        const startBtn = document.getElementById('btn-start-recording');
        const pauseBtn = document.getElementById('btn-pause-recording');
        const stopBtn = document.getElementById('btn-stop-recording');

        if (this.isRecording) {
            if (this.isPaused) {
                statusBadge?.classList.remove('status-idle', 'status-recording');
                statusBadge?.classList.add('status-paused');
                statusText.textContent = '已暂停';
                pauseBtn.textContent = '继续';
            } else {
                statusBadge?.classList.remove('status-idle', 'status-paused');
                statusBadge?.classList.add('status-recording');
                statusText.textContent = '录制中';
                pauseBtn.textContent = '暂停';
            }
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
        } else {
            statusBadge?.classList.remove('status-recording', 'status-paused');
            statusBadge?.classList.add('status-idle');
            statusText.textContent = '空闲';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            pauseBtn.textContent = '暂停';
        }
    }

    async loadRecordings() {
        try {
            const result = await apiService.listRecordings();
            if (result.status === 'success') {
                this.recordings = result.recordings || [];
                this.renderRecordingList();
            }
        } catch (error) {
            console.error('加载录制列表失败:', error);
        }
    }

    renderRecordingList() {
        const container = document.getElementById('recording-list');
        if (!container) return;

        if (this.recordings.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无录制</div>';
            return;
        }

        container.innerHTML = this.recordings.map(rec => `
            <div class="recording-item ${this.currentRecording?.id === rec.id ? 'active' : ''}" data-id="${rec.id}">
                <div class="recording-info">
                    <h4 class="recording-name">${escapeHtml(rec.name)}</h4>
                    <p class="recording-meta">
                        ${rec.frame_count || 0} 帧 · ${this.formatDuration(rec)} · ${this.formatDate(rec.start_time)}
                    </p>
                </div>
                <div class="recording-actions">
                    <button class="btn btn-sm" onclick="recordingPlayback.loadRecording('${rec.id}')">加载</button>
                    <button class="btn btn-danger btn-sm" onclick="recordingPlayback.deleteRecording('${rec.id}')">删除</button>
                </div>
            </div>
        `).join('');
    }

    formatDuration(rec) {
        if (!rec.frame_count || !rec.fps) return '0s';
        return `${Math.floor(rec.frame_count / rec.fps)}s`;
    }

    formatDate(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async loadRecording(recordingId) {
        try {
            showLoading('加载录制数据...');
            const [recResult, framesResult] = await Promise.all([
                apiService.getRecording(recordingId),
                apiService.getRecordingFrames(recordingId, 0, null, 1)
            ]);
            hideLoading();

            if (recResult.status === 'success' && framesResult.status === 'success') {
                this.currentRecording = recResult.recording;
                this.currentFrames = framesResult.frames || [];
                this.renderRecordingList();
                this.setupPlayback();
                showToast('录制已加载', 'success');
            } else {
                showToast('加载录制失败', 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('加载录制失败:', error);
            showToast('加载录制失败', 'error');
        }
    }

    setupPlayback() {
        const slider = document.getElementById('playback-slider');
        const playBtn = document.getElementById('btn-play-recording');
        const pauseBtn = document.getElementById('btn-pause-playback');
        const stopBtn = document.getElementById('btn-stop-playback');

        if (this.currentFrames.length > 0) {
            slider.max = this.currentFrames.length - 1;
            slider.disabled = false;
            playBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = false;

            this.playbackFrame = 0;
            this.drawFrame(0);
            this.updatePlaybackTime();
        }
    }

    play() {
        if (this.currentFrames.length === 0) return;

        this.isPlaying = true;
        const speed = parseFloat(document.getElementById('playback-speed')?.value) || 1;
        const fps = this.currentRecording?.fps || 30;
        const interval = 1000 / (fps * speed);

        document.getElementById('btn-play-recording').disabled = true;
        document.getElementById('btn-pause-playback').disabled = false;

        this.playbackInterval = setInterval(() => {
            if (this.playbackFrame < this.currentFrames.length - 1) {
                this.playbackFrame++;
                this.drawFrame(this.playbackFrame);
                document.getElementById('playback-slider').value = this.playbackFrame;
                this.updatePlaybackTime();
            } else {
                this.stopPlayback();
            }
        }, interval);
    }

    pausePlayback() {
        this.isPlaying = false;
        clearInterval(this.playbackInterval);
        document.getElementById('btn-play-recording').disabled = false;
        document.getElementById('btn-pause-playback').disabled = true;
    }

    stopPlayback() {
        this.isPlaying = false;
        clearInterval(this.playbackInterval);
        this.playbackFrame = 0;
        this.drawFrame(0);
        document.getElementById('playback-slider').value = 0;
        document.getElementById('btn-play-recording').disabled = false;
        document.getElementById('btn-pause-playback').disabled = true;
        this.updatePlaybackTime();
    }

    seekTo(frameIndex) {
        this.playbackFrame = frameIndex;
        this.drawFrame(frameIndex);
        this.updatePlaybackTime();
    }

    updatePlaybackSpeed() {
        if (this.isPlaying) {
            this.pausePlayback();
            this.play();
        }
    }

    updatePlaybackTime() {
        const timeEl = document.getElementById('playback-time');
        if (timeEl) {
            const fps = this.currentRecording?.fps || 30;
            const currentTime = this.playbackFrame / fps;
            const totalTime = this.currentFrames.length / fps;
            timeEl.textContent = `${currentTime.toFixed(1)}s / ${totalTime.toFixed(1)}s`;
        }
    }

    drawFrame(frameIndex) {
        if (!this.playbackChart || !this.currentFrames[frameIndex]) return;

        const { ctx, canvas } = this.playbackChart;
        const frame = this.currentFrames[frameIndex];
        const intensity = frame.intensity || [];
        const wavelength = frame.wavelength || [];

        const placeholder = canvas.parentElement?.querySelector('.chart-placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const padding = 40;

        ctx.clearRect(0, 0, width, height);

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();

        if (intensity.length === 0 || wavelength.length === 0) return;

        const minWl = Math.min(...wavelength);
        const maxWl = Math.max(...wavelength);
        const maxInt = Math.max(...intensity, 0.001);

        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < intensity.length; i++) {
            const x = padding + ((wavelength[i] - minWl) / (maxWl - minWl)) * (width - 2 * padding);
            const y = height - padding - (intensity[i] / maxInt) * (height - 2 * padding);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.fillStyle = '#888';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`波长 (nm) - 帧 ${frameIndex + 1}/${this.currentFrames.length}`, width / 2, height - 10);

        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('强度', 0, 0);
        ctx.restore();
    }

    async deleteRecording(recordingId) {
        if (!confirm('确定要删除这个录制吗？')) return;

        try {
            await apiService.deleteRecording(recordingId);
            showToast('录制已删除', 'success');

            if (this.currentRecording?.id === recordingId) {
                this.currentRecording = null;
                this.currentFrames = [];
                this.stopPlayback();
                document.getElementById('playback-slider').disabled = true;
                document.getElementById('btn-play-recording').disabled = true;
                document.getElementById('btn-pause-playback').disabled = true;
                document.getElementById('btn-stop-playback').disabled = true;
                const placeholder = document.querySelector('#playback-chart .chart-placeholder');
                if (placeholder) placeholder.style.display = 'flex';
            }

            this.loadRecordings();
        } catch (error) {
            console.error('删除录制失败:', error);
            showToast('删除录制失败', 'error');
        }
    }

    async recordSimulationFrame(wavelength, intensity, opticalState = {}, params = {}, metrics = {}) {
        if (!this.isRecording || this.isPaused) return;

        try {
            await apiService.recordFrame(wavelength, intensity, opticalState, params, metrics);
            this.frameCount++;
        } catch (error) {
            console.error('录制帧失败:', error);
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const recordingPlayback = new RecordingPlaybackComponent();
