const API_BASE = '/api/v1';
let token = localStorage.getItem('token') || '';
let currentUser = null;
let documentsCache = [];
let searchCount = 0;
let pendingTaskType = '';
let pendingDocIds = [];
let wsConnections = {};

function headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function api(method, path, body = null) {
    const opts = { method, headers: headers(!!body && !(body instanceof FormData)) };
    if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
    const resp = await fetch(`${API_BASE}${path}`, opts);
    if (resp.status === 401) {
        token = '';
        localStorage.removeItem('token');
        currentUser = null;
        showLoginPage();
        throw new Error('Unauthorized');
    }
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || JSON.stringify(err));
    }
    const ct = resp.headers.get('content-type');
    if (ct && ct.includes('application/json')) return resp.json();
    if (ct && (ct.includes('octet-stream') || ct.includes('csv') || ct.includes('excel') || ct.includes('spreadsheet'))) {
        const blob = await resp.blob();
        const cd = resp.headers.get('content-disposition');
        let fname = 'export';
        if (cd) {
            const m = cd.match(/filename="?([^"]+)"?/);
            if (m) fname = m[1];
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
        return null;
    }
    return resp.json();
}

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function showLoginPage() {
    document.getElementById('login-page').style.display = 'block';
    document.querySelectorAll('.page').forEach(p => { if (p.id !== 'login-page') p.style.display = 'none'; });
    document.querySelector('.navbar').style.display = 'none';
}

function showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.querySelector('.navbar').style.display = 'flex';
    switchPage('dashboard');
}

function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const el = document.getElementById(`${page}-page`);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    if (page === 'dashboard') loadDashboard();
    if (page === 'documents') loadDocuments();
    if (page === 'tasks') loadTasks();
    if (page === 'export') loadExportOptions();
}

function connectTaskWS(taskId) {
    if (wsConnections[taskId]) return;
    const wsBase = `ws://${window.location.host}/ws/tasks/${taskId}/progress?token=${token}`;
    try {
        const ws = new WebSocket(wsBase);
        wsConnections[taskId] = ws;

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWSMessage(taskId, data);
            } catch (e) { }
        };

        ws.onclose = () => {
            delete wsConnections[taskId];
        };

        ws.onerror = () => {
            delete wsConnections[taskId];
        };
    } catch (e) { }
}

function handleWSMessage(taskId, data) {
    if (data.type === 'progress') {
        const progressEl = document.getElementById(`task-progress-${taskId}`);
        if (progressEl) {
            progressEl.querySelector('.progress-bar-fill').style.width = `${data.progress}%`;
            progressEl.querySelector('.progress-text').textContent = `${data.progress}% (${data.completed_count}/${data.total_count})`;
        }
        if (data.current_document) {
            const docEl = document.getElementById(`task-current-doc-${taskId}`);
            if (docEl) docEl.textContent = data.current_document;
        }
    } else if (data.type === 'document_result') {
        const indicator = data.status === 'completed' ? '✅' : '❌';
        showToast(`${indicator} ${data.document_name}: ${statusText(data.status)}`, data.status === 'completed' ? 'success' : 'error');
    } else if (data.type === 'task_complete') {
        showToast(`任务${statusText(data.status)}: 完成${data.completed_count}个, 失败${data.failed_count}个`, data.status === 'completed' ? 'success' : 'warning');
        if (wsConnections[taskId]) {
            wsConnections[taskId].close();
            delete wsConnections[taskId];
        }
        loadTasks();
    }
}

function disconnectTaskWS(taskId) {
    if (wsConnections[taskId]) {
        wsConnections[taskId].close();
        delete wsConnections[taskId];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-link').forEach(l => {
        l.addEventListener('click', e => { e.preventDefault(); switchPage(l.dataset.page); });
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) return showToast('请输入用户名和密码', 'error');
        try {
            const data = await api('POST', '/auth/login', { username, password });
            token = data.access_token;
            localStorage.setItem('token', token);
            await loadUserInfo();
            showApp();
            showToast('登录成功', 'success');
        } catch (e) { showToast(`登录失败: ${e.message}`, 'error'); }
    });

    document.getElementById('register-btn').addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        if (!username || !email || !password) return showToast('请填写所有字段', 'error');
        try {
            const data = await api('POST', '/auth/register', { username, email, password });
            if (data.data && data.data.tokens) {
                token = data.data.tokens.access_token;
                localStorage.setItem('token', token);
                await loadUserInfo();
                showApp();
                showToast('注册成功', 'success');
            }
        } catch (e) { showToast(`注册失败: ${e.message}`, 'error'); }
    });

    document.getElementById('show-register').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('login-card').style.display = 'none';
        document.getElementById('register-card').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('register-card').style.display = 'none';
        document.getElementById('login-card').style.display = 'block';
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        token = '';
        localStorage.removeItem('token');
        currentUser = null;
        Object.keys(wsConnections).forEach(disconnectTaskWS);
        showLoginPage();
    });

    document.getElementById('upload-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', async e => {
        const files = e.target.files;
        if (!files.length) return;
        const fd = new FormData();
        for (const f of files) fd.append('files', f);
        const prog = document.getElementById('upload-progress');
        prog.style.display = 'block';
        document.getElementById('upload-progress-fill').style.width = '30%';
        document.getElementById('upload-progress-text').textContent = '上传中...';
        try {
            const data = await api('POST', '/documents/upload', fd);
            document.getElementById('upload-progress-fill').style.width = '100%';
            document.getElementById('upload-progress-text').textContent = '上传完成';
            showToast(`成功上传 ${data.uploaded.length} 个文件`, 'success');
            if (data.errors.length) showToast(`${data.errors.length} 个文件上传失败`, 'error');
            setTimeout(() => { prog.style.display = 'none'; }, 2000);
            loadDocuments();
        } catch (e) {
            showToast(`上传失败: ${e.message}`, 'error');
            prog.style.display = 'none';
        }
        e.target.value = '';
    });

    document.getElementById('select-all-docs').addEventListener('change', e => {
        document.querySelectorAll('.doc-checkbox').forEach(cb => { cb.checked = e.target.checked; });
        updateBatchActions();
    });

    document.getElementById('search-btn').addEventListener('click', doSearch);
    document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    document.getElementById('export-btn').addEventListener('click', doExport);

    document.getElementById('confirm-task-btn').addEventListener('click', confirmCreateTask);

    if (token) {
        loadUserInfo().then(() => showApp()).catch(() => showLoginPage());
    } else {
        showLoginPage();
    }
});

async function loadUserInfo() {
    try {
        currentUser = await api('GET', '/auth/me');
        document.getElementById('user-info').textContent = `${currentUser.username} (${currentUser.role})`;
        document.getElementById('logout-btn').style.display = 'inline-flex';
    } catch (e) { throw e; }
}

async function loadDashboard() {
    try {
        const docs = await api('GET', '/documents?limit=1000');
        const tasks = await api('GET', '/tasks?limit=1000');
        documentsCache = docs;
        document.getElementById('stat-docs').textContent = docs.length;
        document.getElementById('stat-processed').textContent = docs.filter(d => ['processed','summarized','keyworded','corrected','classified','translated'].includes(d.status)).length;
        document.getElementById('stat-tasks').textContent = tasks.length;
        document.getElementById('stat-searches').textContent = searchCount;
    } catch (e) { showToast('加载仪表盘失败', 'error'); }
}

async function loadDocuments() {
    try {
        const docs = await api('GET', '/documents?limit=100');
        documentsCache = docs;
        const tbody = document.getElementById('docs-table-body');
        if (!docs.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无文档</td></tr>';
            return;
        }
        tbody.innerHTML = docs.map(d => `
            <tr>
                <td><input type="checkbox" class="doc-checkbox" data-id="${d.id}" onchange="updateBatchActions()"></td>
                <td>${escHtml(d.original_name)}</td>
                <td><span class="status-badge">${d.file_type.toUpperCase()}</span></td>
                <td>${formatSize(d.file_size)}</td>
                <td><span class="status-badge status-${d.status}">${statusText(d.status)}</span></td>
                <td>${new Date(d.created_at).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="viewDoc('${d.id}')">查看</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDoc('${d.id}')">删除</button>
                </td>
            </tr>
        `).join('');
    } catch (e) { showToast('加载文档列表失败', 'error'); }
}

function updateBatchActions() {
    const selected = document.querySelectorAll('.doc-checkbox:checked');
    const el = document.getElementById('batch-actions');
    if (selected.length > 0) {
        el.style.display = 'flex';
        document.getElementById('selected-count').textContent = selected.length;
    } else {
        el.style.display = 'none';
    }
}

function getSelectedDocIds() {
    return Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.dataset.id);
}

function createBatchTask(type) {
    const ids = getSelectedDocIds();
    if (!ids.length) return showToast('请先选择文档', 'error');
    pendingTaskType = type;
    pendingDocIds = ids;
    const typeNames = {
        summary: '摘要提取', keywords: '关键词标注', correction: '内容纠错',
        classify: '分类打标', translate: '多语言翻译', full: '全部处理'
    };
    document.getElementById('task-type-display').textContent = typeNames[type] || type;
    document.getElementById('task-doc-count-display').textContent = ids.length;
    document.getElementById('task-name-input').value = `${typeNames[type]} - ${ids.length}个文档`;

    const langRow = document.getElementById('translate-lang-row');
    langRow.style.display = type === 'translate' ? 'flex' : 'none';

    document.getElementById('task-create-modal').style.display = 'flex';
}

async function confirmCreateTask() {
    const name = document.getElementById('task-name-input').value.trim();
    if (!name) return showToast('请输入任务名称', 'error');
    try {
        const body = { name, task_type: pendingTaskType, document_ids: pendingDocIds };
        if (pendingTaskType === 'translate') {
            body.target_lang = document.getElementById('target-lang-select').value;
            const srcLang = document.getElementById('source-lang-select').value;
            if (srcLang && srcLang !== 'auto') body.source_lang = srcLang;
        }
        const task = await api('POST', '/tasks', body);
        showToast('任务创建成功', 'success');
        closeTaskModal();
        if (task.id) connectTaskWS(task.id);
        switchPage('tasks');
    } catch (e) { showToast(`创建任务失败: ${e.message}`, 'error'); }
}

async function viewDoc(id) {
    try {
        const doc = await api('GET', `/documents/${id}`);
        document.getElementById('modal-title').textContent = doc.original_name;
        let html = `
            <p><strong>类型:</strong> ${doc.file_type.toUpperCase()} | <strong>大小:</strong> ${formatSize(doc.file_size)} | <strong>状态:</strong> ${statusText(doc.status)}</p>
        `;
        if (doc.summary) {
            html += `<div class="doc-summary-section"><div class="doc-section-label">摘要</div><p>${escHtml(doc.summary)}</p></div>`;
        }
        if (doc.keywords) {
            html += `<div class="doc-summary-section"><div class="doc-section-label">关键词</div><p>${escHtml(doc.keywords)}</p></div>`;
        }
        if (doc.correction) {
            html += `<div class="doc-summary-section"><div class="doc-section-label">纠错结果</div><pre style="white-space:pre-wrap;font-size:13px;">${escHtml(doc.correction)}</pre></div>`;
        }
        if (doc.classification) {
            html += `<div class="doc-summary-section"><div class="doc-section-label">分类标签</div><pre style="white-space:pre-wrap;font-size:13px;">${escHtml(doc.classification)}</pre></div>`;
        }
        if (doc.translation) {
            html += `<div class="doc-summary-section"><div class="doc-section-label">翻译结果</div><p style="white-space:pre-wrap;">${escHtml(doc.translation)}</p></div>`;
        }
        if (doc.content) {
            const preview = doc.content.length > 2000 ? doc.content.substring(0, 2000) + '...' : doc.content;
            html += `<div class="doc-summary-section"><div class="doc-section-label">原文预览</div><p style="white-space:pre-wrap;font-size:13px;">${escHtml(preview)}</p></div>`;
        }
        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('doc-detail-modal').style.display = 'flex';
    } catch (e) { showToast('加载文档详情失败', 'error'); }
}

function closeModal() { document.getElementById('doc-detail-modal').style.display = 'none'; }
function closeTaskModal() { document.getElementById('task-create-modal').style.display = 'none'; }

async function deleteDoc(id) {
    if (!confirm('确定要删除此文档吗？')) return;
    try {
        await api('DELETE', `/documents/${id}`);
        showToast('文档已删除', 'success');
        loadDocuments();
    } catch (e) { showToast(`删除失败: ${e.message}`, 'error'); }
}

async function loadTasks() {
    try {
        const tasks = await api('GET', '/tasks?limit=100');
        const tbody = document.getElementById('tasks-table-body');
        if (!tasks.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无任务</td></tr>';
            return;
        }
        tbody.innerHTML = tasks.map(t => {
            const isActive = ['queued', 'processing', 'retrying'].includes(t.status);
            if (isActive) connectTaskWS(t.id);
            return `
            <tr>
                <td>${escHtml(t.name)}</td>
                <td><span class="status-badge">${taskTypeText(t.task_type)}</span></td>
                <td><span class="status-badge status-${t.status}">${statusText(t.status)}</span></td>
                <td>
                    <div class="progress-bar" id="task-progress-${t.id}">
                        <div class="progress-bar-fill" style="width:${t.progress}%"></div>
                        <span class="progress-text">${t.progress.toFixed(1)}%</span>
                    </div>
                </td>
                <td>${t.completed_count}/${t.total_count}${t.failed_count ? ` (失败${t.failed_count})` : ''}</td>
                <td>${new Date(t.created_at).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="refreshTask('${t.id}')">刷新</button>
                    ${isActive ? `<button class="btn btn-sm btn-danger" onclick="cancelTask('${t.id}')">取消</button>` : ''}
                    ${['failed', 'partial', 'dead_letter'].includes(t.status) && t.retry_count < (t.max_retries || 3) ? `<button class="btn btn-sm btn-warning" onclick="retryTask('${t.id}')">重试</button>` : ''}
                </td>
            </tr>
        `}).join('');
    } catch (e) { showToast('加载任务列表失败', 'error'); }
}

async function refreshTask(id) {
    try {
        const data = await api('GET', `/tasks/${id}/progress`);
        showToast(`任务状态: ${statusText(data.status)} (${data.progress.toFixed(1)}%)`, 'info');
        loadTasks();
    } catch (e) { showToast('刷新失败', 'error'); }
}

async function cancelTask(id) {
    try {
        await api('POST', `/tasks/${id}/cancel`);
        disconnectTaskWS(id);
        showToast('任务已取消', 'success');
        loadTasks();
    } catch (e) { showToast(`取消失败: ${e.message}`, 'error'); }
}

async function retryTask(id) {
    try {
        const data = await api('POST', `/tasks/${id}/retry`);
        showToast(data.message || '重试已提交', 'success');
        connectTaskWS(id);
        loadTasks();
    } catch (e) { showToast(`重试失败: ${e.message}`, 'error'); }
}

async function doSearch() {
    const query = document.getElementById('search-input').value.trim();
    const type = document.getElementById('search-type').value;
    if (!query) return showToast('请输入搜索内容', 'error');
    try {
        const data = await api('POST', '/search', { query, top_k: 20, search_type: type });
        searchCount++;
        const container = document.getElementById('search-results');
        if (!data.results.length) {
            container.innerHTML = '<p class="text-center text-muted">未找到相关结果</p>';
            return;
        }
        container.innerHTML = `<p class="text-muted">找到 ${data.total} 个结果</p>` + data.results.map(r => `
            <div class="search-result-item">
                <div class="search-result-title">${escHtml(r.original_name)}</div>
                <div class="search-result-score">相关度: ${(r.score).toFixed(2)}</div>
                ${r.summary ? `<div class="search-result-highlight"><strong>摘要:</strong> ${escHtml(r.summary)}</div>` : ''}
                ${r.highlight ? `<div class="search-result-highlight">${r.highlight}</div>` : ''}
            </div>
        `).join('');
    } catch (e) { showToast(`搜索失败: ${e.message}`, 'error'); }
}

async function loadExportOptions() {
    try {
        const docs = await api('GET', '/documents?limit=1000');
        const sel = document.getElementById('export-doc-select');
        sel.innerHTML = docs.map(d => `<option value="${d.id}">${escHtml(d.original_name)} [${statusText(d.status)}]</option>`).join('');
    } catch (e) { showToast('加载文档列表失败', 'error'); }
}

async function doExport() {
    const sel = document.getElementById('export-doc-select');
    const ids = Array.from(sel.selectedOptions).map(o => o.value);
    if (!ids.length) return showToast('请选择要导出的文档', 'error');
    const format = document.getElementById('export-format').value;
    try {
        await api('POST', '/export', {
            document_ids: ids,
            export_format: format,
            include_content: document.getElementById('export-content').checked,
            include_summary: document.getElementById('export-summary').checked,
            include_keywords: document.getElementById('export-keywords').checked,
            include_correction: document.getElementById('export-correction').checked,
            include_classification: document.getElementById('export-classification')?.checked ?? true,
            include_translation: document.getElementById('export-translation')?.checked ?? false,
        });
        showToast('导出成功', 'success');
    } catch (e) { showToast(`导出失败: ${e.message}`, 'error'); }
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function statusText(s) {
    const m = {
        uploaded: '已上传', parsed: '已解析', parse_failed: '解析失败',
        summarised: '已摘要', summarized: '已摘要', keyworded: '已标注',
        corrected: '已纠错', classified: '已分类', translated: '已翻译',
        encrypted: '加密文档', processed: '已处理', pending: '等待中',
        queued: '队列中', processing: '处理中', completed: '已完成',
        failed: '失败', partial: '部分完成', cancelled: '已取消',
        queue_failed: '队列失败', retrying: '重试中', dead_letter: '死信'
    };
    return m[s] || s;
}

function taskTypeText(t) {
    const m = {
        summary: '摘要提取', keywords: '关键词标注', correction: '内容纠错',
        classify: '分类打标', translate: '多语言翻译', full: '全部处理'
    };
    return m[t] || t;
}
