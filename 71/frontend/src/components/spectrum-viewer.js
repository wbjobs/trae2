/**
 * 光谱图谱查看组件
 * Spectrum viewer component for displaying and interacting with spectrum charts.
 */

class SpectrumViewer {
    constructor() {
        this.chart = null;
        this.currentData = null;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-chart-zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('btn-chart-zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('btn-chart-reset').addEventListener('click', () => this.resetZoom());
        document.getElementById('btn-chart-export').addEventListener('click', () => this.exportData());
    }

    updateChart(simulationResult) {
        if (!simulationResult || !simulationResult.spectrum) {
            this.showPlaceholder();
            return;
        }

        const spectrum = simulationResult.spectrum;
        const wavelengths = spectrum.wavelengths || [];
        const intensities = spectrum.intensities || [];
        const calibratedWavelengths = spectrum.wavelengths_calibrated || wavelengths;
        const calibratedIntensities = spectrum.intensities_calibrated || intensities;

        this.currentData = {
            wavelengths,
            intensities,
            calibratedWavelengths,
            calibratedIntensities,
            peaks: simulationResult.peaks || [],
            metadata: spectrum.metadata || {}
        };

        this.hidePlaceholder();
        this.renderChart(wavelengths, intensities, calibratedWavelengths, calibratedIntensities);
        this.updatePeakList(simulationResult.peaks || []);
        this.updateSpectrumInfo(spectrum);
    }

    renderChart(wavelengths, intensities, calibratedWavelengths, calibratedIntensities) {
        const ctx = document.getElementById('spectrum-chart');
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const hasCalibrated = calibratedWavelengths && calibratedWavelengths.length > 0 &&
            calibratedIntensities && calibratedIntensities.length > 0 &&
            JSON.stringify(calibratedWavelengths) !== JSON.stringify(wavelengths);

        const datasets = [{
            label: '原始光谱',
            data: wavelengths.map((wl, i) => ({ x: wl, y: intensities[i] })),
            borderColor: 'rgba(102, 126, 234, 1)',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.3
        }];

        if (hasCalibrated) {
            datasets.push({
                label: '标定后光谱',
                data: calibratedWavelengths.map((wl, i) => ({ x: wl, y: calibratedIntensities[i] })),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.3
            });
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#a0a0c0',
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: '#242442',
                        titleColor: '#ffffff',
                        bodyColor: '#a0a0c0',
                        borderColor: '#3a3a5c',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            title: (items) => `波长: ${items[0].parsed.x.toFixed(2)} nm`,
                            label: (item) => `强度: ${item.parsed.y.toFixed(4)}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: '波长 (nm)',
                            color: '#a0a0c0',
                            font: { size: 12 }
                        },
                        grid: {
                            color: 'rgba(58, 58, 92, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#6c6c8a',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '归一化强度',
                            color: '#a0a0c0',
                            font: { size: 12 }
                        },
                        grid: {
                            color: 'rgba(58, 58, 92, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#6c6c8a',
                            font: { size: 11 }
                        },
                        min: 0,
                        max: 1.05
                    }
                }
            }
        });
    }

    updatePeakList(peaks) {
        const container = document.getElementById('peak-list');
        if (!container) return;

        if (!peaks || peaks.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无峰值数据</div>';
            return;
        }

        container.innerHTML = peaks.slice(0, 20).map((peak, index) => `
            <div class="peak-item">
                <span class="peak-wavelength">${peak.wavelength.toFixed(2)} nm</span>
                <span class="peak-intensity">I: ${peak.intensity.toFixed(4)}</span>
            </div>
        `).join('');
    }

    updateSpectrumInfo(spectrum) {
        const wavelengths = spectrum.wavelengths || [];
        const metadata = spectrum.metadata || {};

        document.getElementById('info-wl-range').textContent = wavelengths.length > 0
            ? `${wavelengths[0].toFixed(1)} - ${wavelengths[wavelengths.length - 1].toFixed(1)} nm`
            : '--';
        document.getElementById('info-pixels').textContent = wavelengths.length;
        document.getElementById('info-resolution').textContent = wavelengths.length > 1
            ? ((wavelengths[wavelengths.length - 1] - wavelengths[0]) / wavelengths.length).toFixed(3) + ' nm'
            : '--';
        document.getElementById('info-source').textContent = metadata.source_type || '--';
        document.getElementById('info-noise').textContent = metadata.noise_level || '--';
    }

    zoomIn() {
        if (!this.chart) return;
        const xScale = this.chart.scales.x;
        const range = xScale.max - xScale.min;
        const center = (xScale.min + xScale.max) / 2;
        xScale.options.min = center - range * 0.35;
        xScale.options.max = center + range * 0.35;
        this.chart.update();
    }

    zoomOut() {
        if (!this.chart) return;
        const xScale = this.chart.scales.x;
        const range = xScale.max - xScale.min;
        const center = (xScale.min + xScale.max) / 2;
        xScale.options.min = center - range * 0.75;
        xScale.options.max = center + range * 0.75;
        this.chart.update();
    }

    resetZoom() {
        if (!this.chart) return;
        this.chart.scales.x.options.min = undefined;
        this.chart.scales.x.options.max = undefined;
        this.chart.update();
    }

    exportData() {
        if (!this.currentData) {
            showToast('没有可导出的数据', 'warning');
            return;
        }

        const data = {
            wavelengths: this.currentData.wavelengths,
            intensities: this.currentData.intensities,
            calibratedWavelengths: this.currentData.calibratedWavelengths,
            calibratedIntensities: this.currentData.calibratedIntensities,
            peaks: this.currentData.peaks,
            metadata: this.currentData.metadata,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spectrum_data_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('光谱数据已导出', 'success');
    }

    showPlaceholder() {
        const placeholder = document.getElementById('chart-placeholder');
        if (placeholder) placeholder.style.display = 'block';
    }

    hidePlaceholder() {
        const placeholder = document.getElementById('chart-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    }
}

const spectrumViewer = new SpectrumViewer();
