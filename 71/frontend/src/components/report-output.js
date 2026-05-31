/**
 * 报告输出组件
 * Report output component for generating and exporting calibration reports.
 */

class ReportOutput {
    constructor() {
        this.lastReportData = null;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-generate-report').addEventListener('click', () => this.generateReport());
        document.getElementById('btn-preview-report').addEventListener('click', () => this.previewReport());
        document.getElementById('btn-export-report').addEventListener('click', () => this.exportReport());
    }

    async generateReport() {
        try {
            showLoading('正在生成标定报告...');

            const simResult = simulationControl.getLastResult();
            if (!simResult) {
                showToast('请先运行光谱仿真', 'warning');
                return;
            }

            const params = parameterImport.getCurrentParams();

            const format = document.getElementById('report-format').value;

            const calWl = document.getElementById('wl-cal-result');
            const calInt = document.getElementById('int-cal-result');

            let calibrationResults = {};
            if (calWl.dataset.result) {
                try {
                    calibrationResults.wavelength_calibration = JSON.parse(calWl.dataset.result);
                } catch (e) {}
            }
            if (calInt.dataset.result) {
                try {
                    calibrationResults.intensity_calibration = JSON.parse(calInt.dataset.result);
                } catch (e) {}
            }

            const result = await apiService.generateReport({
                calibration_results: calibrationResults,
                spectrum_data: simResult,
                parameters: params,
                format: format
            });

            if (result.status === 'success') {
                this.lastReportData = result.report_data;
                this.renderPreview(result.report_data);
                showToast('报告生成成功', 'success');
            } else {
                showToast(result.error || '报告生成失败', 'error');
            }
        } catch (e) {
            console.error('Report generation error:', e);
            showToast('报告生成失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async previewReport() {
        if (!this.lastReportData) {
            showToast('请先生成报告', 'warning');
            return;
        }

        this.renderPreview(this.lastReportData);
        showToast('报告已刷新', 'info');
    }

    async exportReport() {
        if (!this.lastReportData) {
            showToast('请先生成报告', 'warning');
            return;
        }

        if (window.electronAPI) {
            try {
                const filepath = await window.electronAPI.saveFileDialog();
                if (!filepath) return;

                const format = document.getElementById('report-format').value;
                const content = format === 'html'
                    ? this.renderHTMLReport(this.lastReportData)
                    : JSON.stringify(this.lastReportData, null, 2);

                const result = await window.electronAPI.writeFile(filepath, content);
                if (result.success) {
                    showToast('报告已导出', 'success');
                } else {
                    showToast('导出失败: ' + result.error, 'error');
                }
            } catch (e) {
                showToast('导出失败: ' + e.message, 'error');
            }
        } else {
            const format = document.getElementById('report-format').value;
            const content = format === 'html'
                ? this.renderHTMLReport(this.lastReportData)
                : JSON.stringify(this.lastReportData, null, 2);

            const blob = new Blob([content], {
                type: format === 'html' ? 'text/html' : 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `calibration_report_${Date.now()}.${format}`;
            a.click();
            URL.revokeObjectURL(url);

            showToast('报告已下载', 'success');
        }
    }

    renderPreview(reportData) {
        const container = document.getElementById('report-preview');
        if (!container || !reportData) return;

        const info = reportData.report_info || {};
        const device = reportData.device_info || {};
        const spectrum = reportData.spectrum_summary || {};
        const metrics = reportData.performance_metrics || {};
        const conclusions = reportData.conclusions || [];
        const recommendations = reportData.recommendations || [];
        const calResults = reportData.calibration_results || {};

        container.innerHTML = `
            <div class="report-section">
                <h3>📋 报告信息</h3>
                <div class="report-item"><span class="ri-label">报告编号</span><span class="ri-value">${info.report_id || 'N/A'}</span></div>
                <div class="report-item"><span class="ri-label">生成时间</span><span class="ri-value">${info.generated_at || 'N/A'}</span></div>
                <div class="report-item"><span class="ri-label">设备ID</span><span class="ri-value">${device.device_id || 'N/A'}</span></div>
            </div>

            <div class="report-section">
                <h3>📊 性能指标</h3>
                <div class="report-item"><span class="ri-label">波长精度</span><span class="ri-value">${metrics.wavelength_accuracy_nm ? metrics.wavelength_accuracy_nm.toFixed(4) + ' nm' : '--'}</span></div>
                <div class="report-item"><span class="ri-label">强度精度</span><span class="ri-value">${metrics.intensity_accuracy_pct ? metrics.intensity_accuracy_pct.toFixed(2) + ' %' : '--'}</span></div>
                <div class="report-item"><span class="ri-label">线性度 R²</span><span class="ri-value">${metrics.linearity_r2 ? metrics.linearity_r2.toFixed(4) : '--'}</span></div>
                <div class="report-item"><span class="ri-label">信噪比</span><span class="ri-value">${metrics.snr ? metrics.snr.toFixed(1) + ' dB' : '--'}</span></div>
            </div>

            <div class="report-section">
                <h3>🔬 标定结果</h3>
                <div class="report-item"><span class="ri-label">波长标定</span><span class="ri-value">${calResults.wavelength_calibration?.status === 'success' ? '✓ 成功' : '✗ 未执行'}</span></div>
                <div class="report-item"><span class="ri-label">强度标定</span><span class="ri-value">${calResults.intensity_calibration?.status === 'success' ? '✓ 成功' : '✗ 未执行'}</span></div>
                <div class="report-item"><span class="ri-label">检测峰值</span><span class="ri-value">${spectrum.peak_count || 0} 个</span></div>
            </div>

            <div class="report-section">
                <h3>✅ 标定结论</h3>
                ${conclusions.length > 0
                    ? `<ul style="list-style: none; padding: 0;">${conclusions.map(c => `<li style="padding: 6px 0; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); font-size: 13px;">• ${c}</li>`).join('')}</ul>`
                    : '<p style="color: var(--text-muted);">暂无结论</p>'
                }
            </div>

            <div class="report-section">
                <h3>💡 建议</h3>
                ${recommendations.length > 0
                    ? `<ul style="list-style: none; padding: 0;">${recommendations.map(r => `<li style="padding: 6px 0; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); font-size: 13px;">• ${r}</li>`).join('')}</ul>`
                    : '<p style="color: var(--text-muted);">暂无建议</p>'
                }
            </div>
        `;
    }

    renderHTMLReport(reportData) {
        const info = reportData.report_info || {};
        const device = reportData.device_info || {};
        const spectrum = reportData.spectrum_summary || {};
        const metrics = reportData.performance_metrics || {};
        const conclusions = reportData.conclusions || [];
        const recommendations = reportData.recommendations || [];
        const calResults = reportData.calibration_results || {};

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${info.title || '标定报告'}</title>
    <style>
        body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #f5f7fa; color: #333; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; }
        .section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .section h2 { color: #2c3e50; margin-bottom: 16px; font-size: 18px; border-bottom: 2px solid #eef; padding-bottom: 8px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
        .item { padding: 12px; background: #f8f9fa; border-radius: 8px; }
        .label { font-size: 12px; color: #888; }
        .value { font-size: 16px; font-weight: 600; color: #2c3e50; margin-top: 4px; }
        .metric { background: linear-gradient(135deg, #f093fb, #f5576c); color: white; padding: 20px; border-radius: 10px; text-align: center; }
        ul { list-style: none; padding: 0; }
        ul li { padding: 10px 16px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
        ul.recommendations li { background: #fff3e0; border-left-color: #ff9800; }
        .success { color: #28a745; font-weight: 600; }
        .failed { color: #dc3545; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${info.title || '光谱分析仪参数标定报告'}</h1>
            <p>报告编号: ${info.report_id || 'N/A'} | 生成时间: ${info.generated_at || 'N/A'}</p>
        </div>

        <div class="section">
            <h2>设备信息</h2>
            <div class="grid">
                <div class="item"><div class="label">设备ID</div><div class="value">${device.device_id || 'N/A'}</div></div>
                <div class="item"><div class="label">设备名称</div><div class="value">${device.device_name || 'N/A'}</div></div>
                <div class="item"><div class="label">波长范围</div><div class="value">${device.wavelength_range_nm ? device.wavelength_range_nm.join(' ~ ') + ' nm' : 'N/A'}</div></div>
                <div class="item"><div class="label">分辨率</div><div class="value">${device.resolution_nm || 'N/A'} nm</div></div>
            </div>
        </div>

        <div class="section">
            <h2>性能指标</h2>
            <div class="grid">
                <div class="metric"><div class="label">波长精度</div><div style="font-size:28px;font-weight:700;margin:8px 0;">${metrics.wavelength_accuracy_nm ? metrics.wavelength_accuracy_nm.toFixed(4) : '--'}</div><div>nm</div></div>
                <div class="metric"><div class="label">强度精度</div><div style="font-size:28px;font-weight:700;margin:8px 0;">${metrics.intensity_accuracy_pct ? metrics.intensity_accuracy_pct.toFixed(2) : '--'}</div><div>%</div></div>
                <div class="metric"><div class="label">线性度 R²</div><div style="font-size:28px;font-weight:700;margin:8px 0;">${metrics.linearity_r2 ? metrics.linearity_r2.toFixed(4) : '--'}</div></div>
                <div class="metric"><div class="label">信噪比</div><div style="font-size:28px;font-weight:700;margin:8px 0;">${metrics.snr ? metrics.snr.toFixed(1) : '--'}</div><div>dB</div></div>
            </div>
        </div>

        <div class="section">
            <h2>标定结果</h2>
            <div class="grid">
                <div class="item"><div class="label">波长标定</div><div class="value ${calResults.wavelength_calibration?.status === 'success' ? 'success' : 'failed'}">${calResults.wavelength_calibration?.status === 'success' ? '✓ 成功' : '✗ 未执行'}</div></div>
                <div class="item"><div class="label">强度标定</div><div class="value ${calResults.intensity_calibration?.status === 'success' ? 'success' : 'failed'}">${calResults.intensity_calibration?.status === 'success' ? '✓ 成功' : '✗ 未执行'}</div></div>
                <div class="item"><div class="label">检测峰值</div><div class="value">${spectrum.peak_count || 0} 个</div></div>
            </div>
        </div>

        <div class="section">
            <h2>标定结论</h2>
            <ul>${conclusions.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>

        <div class="section">
            <h2>建议</h2>
            <ul class="recommendations">${recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
        </div>
    </div>
</body>
</html>`;
    }

    getLastReportData() {
        return this.lastReportData;
    }
}

const reportOutput = new ReportOutput();
