const fs = require('fs');
const path = require('path');

function generateHTMLReport(data, outputPath = 'report.html', config = {}) {
  const { systemInfo, dependencies, diskSpace, portScan, portProcesses, timestamp } = data;
  
  const openPorts = portScan.filter(p => p.status === 'open');
  const closedPorts = portScan.filter(p => p.status === 'closed');
  const installedDeps = dependencies.filter(d => d.installed);
  const missingDeps = dependencies.filter(d => !d.installed);
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统检测报告 - ${timestamp}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        :root {
            --primary: #667eea;
            --secondary: #764ba2;
            --success: #28a745;
            --danger: #dc3545;
            --warning: #ffc107;
            --info: #17a2b8;
            --light: #f8f9fa;
            --dark: #343a40;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            background-attachment: fixed;
            padding: 20px;
            color: #333;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 40px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
        }
        .header h1 {
            font-size: 36px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 15px;
        }
        .header p {
            color: #666;
            font-size: 16px;
        }
        .header .export-btn {
            margin-top: 20px;
            display: inline-flex;
            gap: 10px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-success {
            background: var(--success);
            color: white;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
        }
        .stat-card .icon {
            font-size: 40px;
            margin-bottom: 10px;
        }
        .stat-card .value {
            font-size: 28px;
            font-weight: 700;
            color: var(--primary);
        }
        .stat-card .label {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }
        .section {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 25px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: var(--primary);
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 2px solid #eee;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .section h2::before {
            content: '';
            width: 4px;
            height: 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 2px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }
        .info-item {
            background: #f8f9fa;
            padding: 18px;
            border-radius: 10px;
            border-left: 4px solid var(--primary);
        }
        .info-item .label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-item .value {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            word-break: break-all;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 14px 16px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #555;
            position: sticky;
            top: 0;
        }
        tr:hover {
            background: #f8f9fa;
        }
        tbody tr:last-child td {
            border-bottom: none;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-success {
            background: #d4edda;
            color: var(--success);
        }
        .badge-danger {
            background: #f8d7da;
            color: var(--danger);
        }
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        .progress-container {
            margin-top: 20px;
        }
        .progress-label {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
            color: #666;
        }
        .progress-bar {
            background: #e9ecef;
            height: 24px;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 10px;
            color: white;
            font-size: 12px;
            font-weight: 600;
        }
        .progress-fill.warning {
            background: linear-gradient(90deg, #ffc107, #ff9800);
        }
        .progress-fill.danger {
            background: linear-gradient(90deg, #dc3545, #c82333);
        }
        .chart-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .chart-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
        }
        .chart-box h4 {
            margin-bottom: 15px;
            color: #555;
        }
        .pie-chart {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            margin: 0 auto;
            position: relative;
        }
        .pie-center {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        }
        .pie-center .number {
            font-size: 24px;
            font-weight: 700;
            color: var(--primary);
        }
        .pie-center .label {
            font-size: 12px;
            color: #666;
        }
        .legend {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
        }
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        .filter-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .filter-btn {
            padding: 8px 16px;
            border: 2px solid #e9ecef;
            background: white;
            border-radius: 20px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.3s ease;
        }
        .filter-btn:hover, .filter-btn.active {
            border-color: var(--primary);
            color: var(--primary);
            background: #f0f3ff;
        }
        .search-box {
            margin-left: auto;
            position: relative;
        }
        .search-box input {
            padding: 8px 16px 8px 36px;
            border: 2px solid #e9ecef;
            border-radius: 20px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.3s ease;
        }
        .search-box input:focus {
            border-color: var(--primary);
        }
        .search-box::before {
            content: '🔍';
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 14px;
        }
        .footer {
            text-align: center;
            padding: 30px;
            color: rgba(255,255,255,0.8);
            font-size: 14px;
        }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .btn, .filter-bar, .search-box {
                display: none;
            }
            .section, .header, .stat-card {
                box-shadow: none;
                border: 1px solid #eee;
            }
        }
        .collapsible {
            cursor: pointer;
            user-select: none;
        }
        .collapsible::after {
            content: '▼';
            float: right;
            transition: transform 0.3s ease;
        }
        .collapsible.collapsed::after {
            transform: rotate(-90deg);
        }
        .collapsible-content {
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 系统检测报告</h1>
            <p>生成时间: ${timestamp}</p>
            <div class="export-btn">
                <button class="btn btn-primary" onclick="window.print()">📄 打印报告</button>
                <button class="btn btn-success" onclick="exportAsJSON()">💾 导出 JSON</button>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="icon">💻</div>
                <div class="value">${systemInfo.cpu.cores}</div>
                <div class="label">CPU 核心数</div>
            </div>
            <div class="stat-card">
                <div class="icon">🧠</div>
                <div class="value">${systemInfo.memory.total}</div>
                <div class="label">总内存</div>
            </div>
            <div class="stat-card">
                <div class="icon">📦</div>
                <div class="value">${installedDeps.length}/${dependencies.length}</div>
                <div class="label">已安装依赖</div>
            </div>
            <div class="stat-card">
                <div class="icon">🔌</div>
                <div class="value">${openPorts.length}</div>
                <div class="label">开放端口</div>
            </div>
        </div>

        <div class="section">
            <h2 class="collapsible" onclick="toggleSection(this)">💻 系统信息</h2>
            <div class="collapsible-content">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="label">操作系统</div>
                        <div class="value">${systemInfo.type} ${systemInfo.release}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">平台/架构</div>
                        <div class="value">${systemInfo.platform} / ${systemInfo.arch}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">主机名</div>
                        <div class="value">${systemInfo.hostname}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">运行时间</div>
                        <div class="value">${systemInfo.uptime}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">CPU 型号</div>
                        <div class="value">${systemInfo.cpu.model}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">CPU 频率</div>
                        <div class="value">${systemInfo.cpu.speed}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">当前用户</div>
                        <div class="value">${systemInfo.userInfo}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">主目录</div>
                        <div class="value">${systemInfo.homedir}</div>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-label">
                        <span>内存使用</span>
                        <span>${systemInfo.memory.used} / ${systemInfo.memory.total}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${parseFloat(systemInfo.memory.usagePercent) > 80 ? 'danger' : parseFloat(systemInfo.memory.usagePercent) > 60 ? 'warning' : ''}" style="width: ${systemInfo.memory.usagePercent}">
                            ${systemInfo.memory.usagePercent}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="collapsible" onclick="toggleSection(this)">📦 依赖检测</h2>
            <div class="collapsible-content">
                <div class="chart-container">
                    <div class="chart-box">
                        <h4>依赖安装情况</h4>
                        <div class="pie-chart" style="background: conic-gradient(#28a745 0% ${(installedDeps.length/dependencies.length)*100}%, #dc3545 ${(installedDeps.length/dependencies.length)*100}% 100%)">
                            <div class="pie-center">
                                <div class="number">${installedDeps.length}</div>
                                <div class="label">已安装</div>
                            </div>
                        </div>
                        <div class="legend">
                            <div class="legend-item">
                                <span class="legend-color" style="background: #28a745"></span>
                                <span>已安装 (${installedDeps.length})</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-color" style="background: #dc3545"></span>
                                <span>未安装 (${missingDeps.length})</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="filter-bar">
                    <button class="filter-btn active" onclick="filterDeps('all')">全部</button>
                    <button class="filter-btn" onclick="filterDeps('installed')">已安装</button>
                    <button class="filter-btn" onclick="filterDeps('missing')">未安装</button>
                    <div class="search-box">
                        <input type="text" id="depSearch" placeholder="搜索依赖..." oninput="searchDeps()">
                    </div>
                </div>
                <table id="depsTable">
                    <thead>
                        <tr>
                            <th>依赖名称</th>
                            <th>状态</th>
                            <th>版本</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dependencies.map((dep, idx) => `
                        <tr class="dep-row" data-status="${dep.installed ? 'installed' : 'missing'}" data-name="${dep.name.toLowerCase()}" data-index="${idx}">
                            <td>${dep.name}</td>
                            <td>
                                <span class="badge ${dep.installed ? 'badge-success' : 'badge-danger'}">
                                    ${dep.installed ? '✓ 已安装' : '✗ 未安装'}
                                </span>
                            </td>
                            <td>${dep.version}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2 class="collapsible" onclick="toggleSection(this)">💾 磁盘空间</h2>
            <div class="collapsible-content">
                <table>
                    <thead>
                        <tr>
                            <th>驱动器</th>
                            <th>总容量</th>
                            <th>已使用</th>
                            <th>可用</th>
                            <th>使用率</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${diskSpace.map(disk => `
                        <tr>
                            <td><strong>${disk.name}</strong></td>
                            <td>${disk.total}</td>
                            <td>${disk.used}</td>
                            <td>${disk.free}</td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="flex: 1; max-width: 150px;">
                                        <div class="progress-bar" style="height: 12px;">
                                            <div class="progress-fill ${parseFloat(disk.usagePercent) > 80 ? 'danger' : parseFloat(disk.usagePercent) > 60 ? 'warning' : ''}" style="width: ${disk.usagePercent}"></div>
                                        </div>
                                    </div>
                                    <span>${disk.usagePercent}</span>
                                </div>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2 class="collapsible" onclick="toggleSection(this)">🔌 端口扫描</h2>
            <div class="collapsible-content">
                <div class="chart-container">
                    <div class="chart-box">
                        <h4>端口状态统计</h4>
                        <div class="pie-chart" style="background: conic-gradient(#28a745 0% ${(openPorts.length/portScan.length)*100}%, #6c757d ${(openPorts.length/portScan.length)*100}% 100%)">
                            <div class="pie-center">
                                <div class="number">${openPorts.length}</div>
                                <div class="label">开放</div>
                            </div>
                        </div>
                        <div class="legend">
                            <div class="legend-item">
                                <span class="legend-color" style="background: #28a745"></span>
                                <span>开放 (${openPorts.length})</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-color" style="background: #6c757d"></span>
                                <span>关闭 (${closedPorts.length})</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="filter-bar">
                    <button class="filter-btn active" onclick="filterPorts('all')">全部</button>
                    <button class="filter-btn" onclick="filterPorts('open')">开放</button>
                    <button class="filter-btn" onclick="filterPorts('closed')">关闭</button>
                    <div class="search-box">
                        <input type="text" id="portSearch" placeholder="搜索端口..." oninput="searchPorts()">
                    </div>
                </div>
                <table id="portsTable">
                    <thead>
                        <tr>
                            <th>端口号</th>
                            <th>服务名称</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${portScan.map((port, idx) => `
                        <tr class="port-row" data-status="${port.status}" data-name="${port.name.toLowerCase()} ${port.port}" data-index="${idx}">
                            <td><strong>${port.port}</strong></td>
                            <td>${port.name}</td>
                            <td>
                                <span class="badge ${port.status === 'open' ? 'badge-success' : 'badge-warning'}">
                                    ${port.status === 'open' ? '✓ 开放' : '✗ 关闭'}
                                </span>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2 class="collapsible" onclick="toggleSection(this)">🔧 端口进程详情</h2>
            <div class="collapsible-content">
                <table>
                    <thead>
                        <tr>
                            <th>端口号</th>
                            <th>协议</th>
                            <th>PID</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${portProcesses.map(proc => `
                        <tr>
                            <td><strong>${proc.port}</strong></td>
                            <td>${proc.proto || '-'}</td>
                            <td>${proc.pid || '-'}</td>
                            <td>${proc.state || '-'}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>生成者: sys-tool | 报告生成于 ${timestamp}</p>
    </div>

    <script>
        const reportData = ${JSON.stringify(data)};
        
        function toggleSection(element) {
            element.classList.toggle('collapsed');
            const content = element.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        }
        
        function filterDeps(status) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            document.querySelectorAll('.dep-row').forEach(row => {
                if (status === 'all' || row.dataset.status === status) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        
        function searchDeps() {
            const query = document.getElementById('depSearch').value.toLowerCase();
            document.querySelectorAll('.dep-row').forEach(row => {
                if (row.dataset.name.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        
        function filterPorts(status) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            document.querySelectorAll('.port-row').forEach(row => {
                if (status === 'all' || row.dataset.status === status) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        
        function searchPorts() {
            const query = document.getElementById('portSearch').value.toLowerCase();
            document.querySelectorAll('.port-row').forEach(row => {
                if (row.dataset.name.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        
        function exportAsJSON() {
            const dataStr = JSON.stringify(reportData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'system-report.json';
            a.click();
            URL.revokeObjectURL(url);
        }
        
        document.querySelectorAll('.collapsible-content').forEach(content => {
            content.style.maxHeight = content.scrollHeight + 'px';
        });
    </script>
</body>
</html>
  `;
  
  const fullPath = path.resolve(outputPath);
  fs.writeFileSync(fullPath, html);
  return fullPath;
}

function generateTextReport(data, outputPath = 'report.txt') {
  const { systemInfo, dependencies, diskSpace, portScan, portProcesses, timestamp } = data;
  
  let text = `
═══════════════════════════════════════════════════════════════
                    系统检测报告
═══════════════════════════════════════════════════════════════
生成时间: ${timestamp}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【系统信息】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  操作系统: ${systemInfo.type} ${systemInfo.release}
  平台架构: ${systemInfo.platform} / ${systemInfo.arch}
  主机名:   ${systemInfo.hostname}
  运行时间: ${systemInfo.uptime}
  CPU:      ${systemInfo.cpu.model} (${systemInfo.cpu.cores} 核)
  内存:     ${systemInfo.memory.used} / ${systemInfo.memory.total} (${systemInfo.memory.usagePercent})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【依赖检测】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dependencies.map(dep => `  [${dep.installed ? '✓' : '✗'}] ${dep.name.padEnd(12)} ${dep.version}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【磁盘空间】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${diskSpace.map(disk => `  ${disk.name.padEnd(8)} 总: ${disk.total.padEnd(12)} 已用: ${disk.used.padEnd(12)} 可用: ${disk.free.padEnd(12)} (${disk.usagePercent})`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【端口扫描】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${portScan.map(port => `  ${String(port.port).padEnd(8)} ${port.name.padEnd(15)} ${port.status === 'open' ? '✓ 开放' : '✗ 关闭'}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【端口进程】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${portProcesses.map(proc => `  ${String(proc.port).padEnd(8)} ${(proc.proto || '-').padEnd(8)} PID: ${(proc.pid || '-').padEnd(10)} ${proc.state || ''}`).join('\n')}

═══════════════════════════════════════════════════════════════
`;
  
  const fullPath = path.resolve(outputPath);
  fs.writeFileSync(fullPath, text);
  return fullPath;
}

function generateJSONReport(data, outputPath = 'report.json') {
  const fullPath = path.resolve(outputPath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  return fullPath;
}

module.exports = {
  generateHTMLReport,
  generateTextReport,
  generateJSONReport
};
