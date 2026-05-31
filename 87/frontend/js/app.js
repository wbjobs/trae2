const { createApp, ref, reactive, onMounted, watch, nextTick, onUnmounted } = Vue;

const app = createApp({
    setup() {
        const isLoggedIn = ref(false);
        const currentUser = ref(null);
        const currentView = ref('dashboard');

        const loginForm = reactive({
            username: 'admin',
            password: 'admin123'
        });

        const factories = ref([]);
        const devices = ref([]);
        const metrics = ref([]);
        const selectedFactory = ref('');
        const dateRange = ref([]);
        const realtimeRange = ref(10);
        const selectedMetrics = ref([]);

        const dashboardSummary = reactive({
            device_count: 0,
            metric_count: 0,
            total_data_points: 0,
            quality_rate: 0
        });

        const trendFilter = reactive({
            factory: '',
            devices: [],
            metrics: [],
            aggregation: '1hour'
        });
        const trendDevices = ref([]);
        const statisticsData = ref([]);

        const qualityFilter = reactive({
            factory: '',
            days: 7
        });
        const qualityReport = ref([]);
        const cleaningTasks = ref([]);

        const reportFilter = reactive({
            factory: '',
            name: '工况分析报告',
            dateRange: []
        });
        const reportTasks = ref([]);

        const users = ref([]);
        const showUserDialog = ref(false);
        const newUser = reactive({
            username: '',
            email: '',
            password: '',
            full_name: '',
            role: 'viewer'
        });

        const comparisonFilter = reactive({
            factory: '',
            metrics: [],
            compareType: 'mom',
            periodType: 'day',
            metricType: 'avg_value',
            periods: 12
        });
        const comparisonData = ref([]);
        const comparisonChartRefs = ref([]);
        const comparisonBarChart = ref(null);
        let comparisonChartInstances = {};
        let comparisonBarInstance = null;

        const alertFilter = reactive({
            factory: '',
            status: null,
            severity: null
        });
        const thresholdConfigs = ref([]);
        const alertRecords = ref([]);
        const alertSummary = reactive({ total_alerts: 0, active_alerts: 0, alert_summary: [] });
        const currentViolations = ref([]);
        const detecting = ref(false);
        const showThresholdDialog = ref(false);
        let alertPieInstance = null;
        const alertPieChart = ref(null);
        const newThreshold = reactive({
            factory_id: '',
            device_id: '',
            metric_name: '',
            threshold_type: 'range',
            min_value: 0,
            max_value: 100,
            warning_value: 80,
            critical_value: 95,
            severity: 'warning',
            enabled: true,
            notification_channels: [],
            duration_threshold: 60
        });

        const startLayoutEdit = ref(false);
        const savedLayouts = ref([]);
        const showLayoutDialog = ref(false);
        const currentLayoutId = ref(null);
        const newLayout = reactive({
            layout_name: '',
            is_default: false,
            is_public: false
        });
        const defaultLayout = {
            widgets: [
                { id: 'realtime', title: '实时工况趋势', height: 350 },
                { id: 'stats', title: '指标统计分布', height: 350 },
                { id: 'trend', title: '多指标对比分析', height: 400 },
                { id: 'device_status', title: '设备状态监控', height: 400 }
            ]
        };
        const dashboardLayout = reactive({ ...defaultLayout, widgets: JSON.parse(JSON.stringify(defaultLayout.widgets)) });
        const originalLayout = JSON.parse(JSON.stringify(defaultLayout.widgets));
        const availableWidgets = [
            { id: 'realtime', title: '实时工况趋势', type: 'chart' },
            { id: 'stats', title: '指标统计分布', type: 'chart' },
            { id: 'trend', title: '多指标对比分析', type: 'chart' },
            { id: 'device_status', title: '设备状态监控', type: 'table' },
            { id: 'alerts', title: '告警信息面板', type: 'info' },
            { id: 'kpi_cards', title: 'KPI统计卡片', type: 'info' },
            { id: 'comparison', title: '同比环比分析', type: 'chart' },
            { id: 'quality', title: '数据质量分析', type: 'info' }
        ];

        const realtimeChart = ref(null);
        const statsChart = ref(null);
        const trendChart = ref(null);
        const analysisChart = ref(null);
        let realtimeChartInstance = null;
        let statsChartInstance = null;
        let trendChartInstance = null;
        let analysisChartInstance = null;
        let connectedCharts = [];

        const API_BASE = 'http://localhost:8000/api';

        const axiosInstance = axios.create({
            baseURL: API_BASE,
            timeout: 120000
        });

        axiosInstance.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        axiosInstance.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    isLoggedIn.value = false;
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
                return Promise.reject(error);
            }
        );

        const handleLogin = async () => {
            try {
                const formData = new FormData();
                formData.append('username', loginForm.username);
                formData.append('password', loginForm.password);

                const response = await axiosInstance.post('/auth/login', formData);
                const { access_token, user } = response.data;

                localStorage.setItem('token', access_token);
                localStorage.setItem('user', JSON.stringify(user));

                currentUser.value = user;
                isLoggedIn.value = true;

                ElementPlus.ElMessage.success('登录成功');

                await loadInitialData();
            } catch (error) {
                ElementPlus.ElMessage.error('登录失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const handleLogout = () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            isLoggedIn.value = false;
            currentUser.value = null;
            ElementPlus.ElMessage.success('已退出登录');
        };

        const handleViewChange = async (view) => {
            if (view === 'cleaning') {
                await loadQualityReport();
                await loadCleaningTasks();
            } else if (view === 'reports') {
                await loadReportTasks();
            } else if (view === 'users') {
                await loadUsers();
            } else if (view === 'comparison') {
                if (factories.value.length > 0 && !comparisonFilter.factory) {
                    comparisonFilter.factory = selectedFactory.value;
                }
                if (metrics.value.length > 0 && comparisonFilter.metrics.length === 0) {
                    comparisonFilter.metrics = metrics.value.slice(0, 2).map(m => m.metric_name);
                }
                await loadComparisonData();
            } else if (view === 'alerts') {
                if (factories.value.length > 0 && !alertFilter.factory) {
                    alertFilter.factory = selectedFactory.value;
                }
                if (newThreshold.factory_id === '') {
                    newThreshold.factory_id = selectedFactory.value;
                }
                await Promise.all([
                    loadThresholds(),
                    loadAlertRecords(),
                    loadAlertSummary()
                ]);
            } else if (view === 'layouts') {
                await loadLayouts();
            }
        };

        const loadInitialData = async () => {
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateRange.value = [sevenDaysAgo, now];
            reportFilter.dateRange = [sevenDaysAgo, now];

            await loadFactories();

            if (factories.value.length > 0) {
                selectedFactory.value = factories.value[0].factory_id;
                trendFilter.factory = factories.value[0].factory_id;
                qualityFilter.factory = factories.value[0].factory_id;
                reportFilter.factory = factories.value[0].factory_id;
                comparisonFilter.factory = factories.value[0].factory_id;
                alertFilter.factory = factories.value[0].factory_id;
                newThreshold.factory_id = factories.value[0].factory_id;

                await loadDashboardData();
                await loadMetrics();
                await loadDevices();
                await loadLayouts();
            }
        };

        const loadFactories = async () => {
            try {
                const response = await axiosInstance.get('/timeseries/factories');
                factories.value = response.data.factories || [];
            } catch (error) {
                console.error('Load factories error:', error);
            }
        };

        const loadDevices = async () => {
            try {
                const response = await axiosInstance.get('/timeseries/devices', {
                    params: { factory_id: selectedFactory.value }
                });
                devices.value = response.data.devices || [];
            } catch (error) {
                console.error('Load devices error:', error);
            }
        };

        const loadTrendDevices = async () => {
            try {
                const response = await axiosInstance.get('/timeseries/devices', {
                    params: { factory_id: trendFilter.factory }
                });
                trendDevices.value = response.data.devices || [];
            } catch (error) {
                console.error('Load trend devices error:', error);
            }
        };

        const loadMetrics = async () => {
            try {
                const response = await axiosInstance.get('/timeseries/metrics', {
                    params: { factory_id: selectedFactory.value }
                });
                metrics.value = response.data.metrics || [];
                if (metrics.value.length > 0) {
                    selectedMetrics.value = metrics.value.slice(0, 3).map(m => m.metric_name);
                    comparisonFilter.metrics = metrics.value.slice(0, 2).map(m => m.metric_name);
                }
            } catch (error) {
                console.error('Load metrics error:', error);
            }
        };

        const loadDashboardData = async () => {
            if (!selectedFactory.value) return;

            try {
                const [start, end] = dateRange.value || [new Date(Date.now() - 7*86400000), new Date()];
                const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

                const response = await axiosInstance.get('/dashboard/overview', {
                    params: { factory_id: selectedFactory.value, days }
                });

                const summary = response.data.summary || {};
                dashboardSummary.device_count = summary.device_count || 0;
                dashboardSummary.metric_count = summary.metric_count || 0;
                dashboardSummary.total_data_points = summary.total_data_points || 0;
                dashboardSummary.quality_rate = summary.quality_rate || 0;

                devices.value = response.data.devices || [];

                await Promise.all([
                    loadRealtimeData(),
                    loadTrendData(),
                    loadStatsData()
                ]);
            } catch (error) {
                console.error('Load dashboard error:', error);
            }
        };

        const refreshDashboard = () => {
            loadDashboardData();
        };

        const loadRealtimeData = async () => {
            try {
                const response = await axiosInstance.get('/dashboard/realtime', {
                    params: {
                        factory_id: selectedFactory.value,
                        metric_names: selectedMetrics.value.join(',')
                    }
                });

                await nextTick();
                renderRealtimeChart(response.data.data || []);
            } catch (error) {
                console.error('Load realtime data error:', error);
            }
        };

        const loadTrendData = async () => {
            try {
                const [start, end] = dateRange.value || [new Date(Date.now() - 7*86400000), new Date()];

                const response = await axiosInstance.post('/timeseries/query', null, {
                    params: {
                        factory_id: selectedFactory.value,
                        metric_names: selectedMetrics.value,
                        start_time: start.toISOString(),
                        end_time: end.toISOString()
                    }
                });

                await nextTick();
                renderTrendChart(response.data.data || []);
            } catch (error) {
                console.error('Load trend data error:', error);
            }
        };

        const loadStatsData = async () => {
            try {
                const [start, end] = dateRange.value || [new Date(Date.now() - 7*86400000), new Date()];

                const response = await axiosInstance.post('/timeseries/statistics', {
                    factory_id: selectedFactory.value,
                    metric_names: selectedMetrics.value,
                    start_time: start.toISOString(),
                    end_time: end.toISOString()
                });

                await nextTick();
                renderStatsChart(response.data.statistics || []);
            } catch (error) {
                console.error('Load stats data error:', error);
            }
        };

        const loadAnalysisData = async () => {
            try {
                const [start, end] = dateRange.value || [new Date(Date.now() - 7*86400000), new Date()];

                const [trendRes, statsRes] = await Promise.all([
                    axiosInstance.post('/timeseries/query', null, {
                        params: {
                            factory_id: trendFilter.factory,
                            device_ids: trendFilter.devices,
                            metric_names: trendFilter.metrics,
                            start_time: start.toISOString(),
                            end_time: end.toISOString(),
                            aggregation: trendFilter.aggregation
                        }
                    }),
                    axiosInstance.post('/timeseries/statistics', {
                        factory_id: trendFilter.factory,
                        device_ids: trendFilter.devices,
                        metric_names: trendFilter.metrics,
                        start_time: start.toISOString(),
                        end_time: end.toISOString()
                    })
                ]);

                statisticsData.value = statsRes.data.statistics || [];

                await nextTick();
                renderAnalysisChart(trendRes.data.data || []);
            } catch (error) {
                console.error('Load analysis data error:', error);
            }
        };

        const loadQualityReport = async () => {
            try {
                const response = await axiosInstance.get('/cleaning/quality', {
                    params: {
                        factory_id: qualityFilter.factory,
                        days: qualityFilter.days
                    }
                });
                qualityReport.value = response.data.quality_report || [];
            } catch (error) {
                console.error('Load quality report error:', error);
            }
        };

        const loadCleaningTasks = async () => {
            try {
                const response = await axiosInstance.get('/cleaning/tasks');
                cleaningTasks.value = response.data.tasks || [];
            } catch (error) {
                console.error('Load cleaning tasks error:', error);
            }
        };

        const loadReportTasks = async () => {
            try {
                const response = await axiosInstance.get('/reports/tasks');
                reportTasks.value = response.data.tasks || [];
            } catch (error) {
                console.error('Load report tasks error:', error);
            }
        };

        const generateReport = async (type) => {
            try {
                const [start, end] = reportFilter.dateRange || [new Date(Date.now() - 7*86400000), new Date()];

                const response = await axiosInstance.post(`/reports/generate/${type}`, null, {
                    params: {
                        factory_id: reportFilter.factory,
                        report_name: reportFilter.name,
                        start_time: start.toISOString(),
                        end_time: end.toISOString()
                    }
                });

                ElementPlus.ElMessage.success(`${type.toUpperCase()}报表生成成功`);
                await loadReportTasks();
            } catch (error) {
                ElementPlus.ElMessage.error('报表生成失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const downloadReport = (fileName) => {
            if (!fileName) return;
            window.open(`${API_BASE}/reports/download/${fileName}`, '_blank');
        };

        const loadUsers = async () => {
            try {
                const response = await axiosInstance.get('/auth/users');
                users.value = response.data.users || [];
            } catch (error) {
                console.error('Load users error:', error);
            }
        };

        const createUser = async () => {
            try {
                await axiosInstance.post('/auth/users', {
                    ...newUser,
                    permissions: newUser.role === 'admin' ? ['read', 'write', 'admin'] :
                                 newUser.role === 'editor' ? ['read', 'write'] : ['read'],
                    factories: ['*']
                });

                ElementPlus.ElMessage.success('用户创建成功');
                showUserDialog.value = false;
                Object.assign(newUser, { username: '', email: '', password: '', full_name: '', role: 'viewer' });
                await loadUsers();
            } catch (error) {
                ElementPlus.ElMessage.error('创建失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const loadComparisonData = async () => {
            try {
                const response = await axiosInstance.get('/analysis/comparison/yoy-mom', {
                    params: {
                        factory_id: comparisonFilter.factory,
                        metric_names: comparisonFilter.metrics.join(','),
                        compare_type: comparisonFilter.compareType,
                        period_type: comparisonFilter.periodType,
                        metric_type: comparisonFilter.metricType,
                        periods: comparisonFilter.periods
                    }
                });

                comparisonData.value = response.data.comparison || [];
                await nextTick();

                comparisonChartInstances = {};
                comparisonData.value.forEach((item, idx) => {
                    renderComparisonChart(item, idx);
                });

                renderComparisonBarChart(comparisonData.value);
            } catch (error) {
                console.error('Load comparison data error:', error);
                ElementPlus.ElMessage.error('加载同比环比数据失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const _safeValue = (val) => {
            if (val === null || val === undefined || val === '' || Number.isNaN(val)) return null;
            const num = Number(val);
            if (!Number.isFinite(num)) return null;
            return num;
        };

        const _buildSeriesMap = (data) => {
            const seriesData = {};
            data.forEach(item => {
                const v = _safeValue(item.value);
                if (v === null) return;
                const key = `${item.device_id || ''}-${item.metric_name || ''}`;
                if (!seriesData[key]) {
                    seriesData[key] = { name: key, data: [] };
                }
                const ts = new Date(item.timestamp).getTime();
                if (!Number.isNaN(ts)) {
                    seriesData[key].data.push([ts, v]);
                }
            });
            Object.values(seriesData).forEach(s => {
                s.data.sort((a, b) => a[0] - b[0]);
            });
            return seriesData;
        };

        const _calcAxisPrecision = (seriesDataMap) => {
            let allValues = [];
            Object.values(seriesDataMap).forEach(s => {
                s.data.forEach(d => {
                    if (d[1] !== null && d[1] !== undefined && Number.isFinite(d[1])) {
                        allValues.push(d[1]);
                    }
                });
            });
            if (allValues.length === 0) return { min: 0, max: 100, precision: 0 };
            const min = Math.min(...allValues);
            const max = Math.max(...allValues);
            const range = max - min;
            let precision = 0;
            if (range > 0 && range < 1) precision = 2;
            else if (range > 0 && range < 100) precision = 1;
            else precision = 0;
            return { min: Math.floor(min * Math.pow(10, precision)) / Math.pow(10, precision), max: Math.ceil(max * Math.pow(10, precision)) / Math.pow(10, precision), precision };
        };

        const _setupChart = (chartRef, chartInstanceVar) => {
            if (!chartRef) return null;
            let instance = chartInstanceVar;
            if (!instance) {
                instance = echarts.init(chartRef);
            }
            return instance;
        };

        const _connectCharts = () => {
            if (connectedCharts.length > 0) {
                echarts.disconnect('dashboard-group');
            }
            connectedCharts = [];
            if (realtimeChartInstance) connectedCharts.push(realtimeChartInstance);
            if (trendChartInstance) connectedCharts.push(trendChartInstance);
            if (connectedCharts.length > 1) {
                echarts.connect('dashboard-group', connectedCharts);
            }
        };

        const renderRealtimeChart = (data) => {
            if (!realtimeChart.value) return;

            realtimeChartInstance = _setupChart(realtimeChart.value, realtimeChartInstance);

            const seriesData = _buildSeriesMap(data);
            const axisInfo = _calcAxisPrecision(seriesData);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: function(params) {
                        let html = `<div style="font-weight:bold">${new Date(params[0].value[0]).toLocaleString()}</div>`;
                        params.forEach(p => {
                            if (p.value[1] !== null && p.value[1] !== undefined) {
                                html += `<div>${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(axisInfo.precision + 1)}</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { top: 10 },
                grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'time',
                    axisLabel: {
                        formatter: '{HH}:{mm}:{ss}'
                    }
                },
                yAxis: {
                    type: 'value',
                    min: axisInfo.min,
                    max: axisInfo.max,
                    axisLabel: {
                        formatter: function(val) {
                            return Number(val).toFixed(axisInfo.precision);
                        }
                    },
                    scale: true
                },
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0 }
                ],
                series: Object.values(seriesData).map(s => ({
                    name: s.name,
                    type: 'line',
                    smooth: true,
                    data: s.data,
                    symbol: 'none',
                    connectNulls: true,
                    lineStyle: { width: 2 }
                }))
            };

            realtimeChartInstance.setOption(option, true);
            _connectCharts();

            window.addEventListener('resize', () => {
                realtimeChartInstance && realtimeChartInstance.resize();
            }, { once: false });
        };

        const renderTrendChart = (data) => {
            if (!trendChart.value) return;

            trendChartInstance = _setupChart(trendChart.value, trendChartInstance);

            const seriesData = _buildSeriesMap(data);
            const axisInfo = _calcAxisPrecision(seriesData);

            const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'];

            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: function(params) {
                        let html = `<div style="font-weight:bold">${new Date(params[0].value[0]).toLocaleString()}</div>`;
                        params.forEach(p => {
                            if (p.value[1] !== null && p.value[1] !== undefined) {
                                html += `<div>${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(axisInfo.precision + 1)}</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { top: 10, type: 'scroll' },
                grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'time',
                    axisLabel: {
                        formatter: function(val) {
                            const d = new Date(val);
                            return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                        }
                    }
                },
                yAxis: {
                    type: 'value',
                    min: axisInfo.min,
                    max: axisInfo.max,
                    axisLabel: {
                        formatter: function(val) {
                            return Number(val).toFixed(axisInfo.precision);
                        }
                    },
                    scale: true
                },
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0 },
                    { type: 'slider', xAxisIndex: 0, bottom: 10 }
                ],
                color: colors,
                series: Object.values(seriesData).map((s, i) => ({
                    name: s.name,
                    type: 'line',
                    smooth: true,
                    data: s.data,
                    symbol: 'none',
                    connectNulls: true,
                    lineStyle: { width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: colors[i % colors.length] + '40' },
                            { offset: 1, color: colors[i % colors.length] + '05' }
                        ])
                    }
                }))
            };

            trendChartInstance.setOption(option, true);
            _connectCharts();
        };

        const renderStatsChart = (data) => {
            if (!statsChart.value) return;

            statsChartInstance = _setupChart(statsChart.value, statsChartInstance);

            const validData = data.filter(d =>
                d.avg_value !== null && d.avg_value !== undefined && Number.isFinite(Number(d.avg_value))
            );

            const allValues = validData.flatMap(d => [Number(d.avg_value), Number(d.min_value), Number(d.max_value)].filter(v => Number.isFinite(v)));
            let precision = 0;
            if (allValues.length > 0) {
                const range = Math.max(...allValues) - Math.min(...allValues);
                if (range > 0 && range < 1) precision = 2;
                else if (range > 0 && range < 100) precision = 1;
            }

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        let html = `<div style="font-weight:bold">${params[0].name}</div>`;
                        params.forEach(p => {
                            if (p.value !== null && p.value !== undefined && Number.isFinite(p.value)) {
                                html += `<div>${p.marker} ${p.seriesName}: <b>${Number(p.value).toFixed(precision + 1)}</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { top: 10 },
                grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: validData.map(d => {
                        const label = `${d.device_id || ''}-${d.metric_name || ''}`;
                        return label.length > 15 ? label.substring(0, 15) + '...' : label;
                    }),
                    axisLabel: { rotate: 30 }
                },
                yAxis: {
                    type: 'value',
                    axisLabel: {
                        formatter: function(val) {
                            return Number(val).toFixed(precision);
                        }
                    },
                    scale: true
                },
                series: [
                    {
                        name: '平均值',
                        type: 'bar',
                        data: validData.map(d => _safeValue(d.avg_value)),
                        itemStyle: { color: '#5470c6' }
                    },
                    {
                        name: '最大值',
                        type: 'bar',
                        data: validData.map(d => _safeValue(d.max_value)),
                        itemStyle: { color: '#91cc75' }
                    },
                    {
                        name: '最小值',
                        type: 'bar',
                        data: validData.map(d => _safeValue(d.min_value)),
                        itemStyle: { color: '#fac858' }
                    }
                ]
            };

            statsChartInstance.setOption(option, true);
        };

        const renderAnalysisChart = (data) => {
            if (!analysisChart.value) return;

            analysisChartInstance = _setupChart(analysisChart.value, analysisChartInstance);

            const seriesData = _buildSeriesMap(data);
            const axisInfo = _calcAxisPrecision(seriesData);

            const option = {
                title: { text: '时序趋势分析', left: 'center' },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'cross' },
                    formatter: function(params) {
                        let html = `<div style="font-weight:bold">${new Date(params[0].value[0]).toLocaleString()}</div>`;
                        params.forEach(p => {
                            if (p.value && p.value[1] !== null && p.value[1] !== undefined && Number.isFinite(p.value[1])) {
                                html += `<div>${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(axisInfo.precision + 1)}</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { top: 30, type: 'scroll' },
                grid: { left: '3%', right: '4%', bottom: '15%', top: 80, containLabel: true },
                xAxis: {
                    type: 'time',
                    axisLabel: {
                        formatter: function(val) {
                            const d = new Date(val);
                            return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                        }
                    }
                },
                yAxis: {
                    type: 'value',
                    min: axisInfo.min,
                    max: axisInfo.max,
                    axisLabel: {
                        formatter: function(val) {
                            return Number(val).toFixed(axisInfo.precision);
                        }
                    },
                    scale: true
                },
                dataZoom: [
                    { type: 'inside', start: 0, end: 100 },
                    { type: 'slider', start: 0, end: 100 }
                ],
                series: Object.values(seriesData).map(s => ({
                    name: s.name,
                    type: 'line',
                    smooth: true,
                    data: s.data,
                    symbol: 'circle',
                    symbolSize: 4,
                    connectNulls: true,
                    lineStyle: { width: 2 }
                }))
            };

            analysisChartInstance.setOption(option, true);
        };

        const renderComparisonChart = (item, idx) => {
            const chartEl = comparisonChartRefs.value[idx];
            if (!chartEl) return;

            let instance = comparisonChartInstances[idx];
            if (!instance) {
                instance = echarts.init(chartEl);
                comparisonChartInstances[idx] = instance;
            }

            const currentData = item.current_series.map(d => [new Date(d.timestamp).getTime(), _safeValue(d.value)]).filter(d => d[1] !== null);
            const compareData = item.compare_series.map((d, i) => {
                const offsetIdx = currentData.length > 0 ? i % currentData.length : i;
                const offset = currentData.length > 0 ? currentData[0][0] - (compareData.length > 0 ? new Date(item.compare_series[0]?.timestamp).getTime() || 0 : 0) : 0;
                return [new Date(d.timestamp).getTime() + offset, _safeValue(d.value)];
            }).filter(d => d[1] !== null);

            const allValues = [...currentData, ...compareData].map(d => d[1]).filter(v => v !== null);
            const precision = allValues.length > 0 ? (Math.max(...allValues) - Math.min(...allValues) < 1 ? 2 : 1) : 0;

            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: function(params) {
                        let html = `<div style="font-weight:bold">${new Date(params[0].value[0]).toLocaleString()}</div>`;
                        params.forEach(p => {
                            if (p.value[1] !== null && p.value[1] !== undefined) {
                                html += `<div>${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(precision + 1)}</b></div>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { top: 10 },
                grid: { left: '3%', right: '4%', bottom: '10%', top: '15%', containLabel: true },
                xAxis: { type: 'time' },
                yAxis: {
                    type: 'value',
                    axisLabel: {
                        formatter: function(val) {
                            return Number(val).toFixed(precision);
                        }
                    },
                    scale: true
                },
                series: [
                    {
                        name: '本期',
                        type: 'line',
                        smooth: true,
                        data: currentData,
                        itemStyle: { color: '#5470c6' },
                        lineStyle: { width: 3 },
                        symbol: 'none',
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: '#5470c640' },
                                { offset: 1, color: '#5470c605' }
                            ])
                        }
                    },
                    {
                        name: '同期',
                        type: 'line',
                        smooth: true,
                        data: compareData,
                        itemStyle: { color: '#91cc75' },
                        lineStyle: { width: 2, type: 'dashed' },
                        symbol: 'none'
                    }
                ]
            };

            instance.setOption(option, true);

            window.addEventListener('resize', () => {
                instance && instance.resize();
            }, { once: false });
        };

        const renderComparisonBarChart = (data) => {
            if (!comparisonBarChart.value) return;

            comparisonBarInstance = _setupChart(comparisonBarChart.value, comparisonBarInstance);

            const barData = data.map(d => ({
                name: `${d.device_id}-${d.metric_name}`.substring(0, 20),
                value: d.change_rate
            }));

            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: function(params) {
                        const p = params[0];
                        const color = p.value >= 0 ? '#f56c6c' : '#67c23a';
                        return `<div>${p.name}: <b style="color:${color}">${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%</b></div>`;
                    }
                },
                grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: barData.map(d => d.name),
                    axisLabel: { rotate: 30, fontSize: 11 }
                },
                yAxis: {
                    type: 'value',
                    axisLabel: {
                        formatter: '{value}%'
                    }
                },
                series: [{
                    type: 'bar',
                    data: barData.map(d => ({
                        value: d.value,
                        itemStyle: {
                            color: d.value >= 0 ? '#f56c6c' : '#67c23a'
                        }
                    })),
                    label: {
                        show: true,
                        position: 'top',
                        formatter: function(p) {
                            return `${p.value >= 0 ? '+' : ''}${p.value.toFixed(1)}%`;
                        }
                    }
                }]
            };

            comparisonBarInstance.setOption(option, true);
        };

        const loadThresholds = async () => {
            try {
                const response = await axiosInstance.get('/analysis/thresholds', {
                    params: { factory_id: alertFilter.factory }
                });
                thresholdConfigs.value = response.data.thresholds || [];
            } catch (error) {
                console.error('Load thresholds error:', error);
            }
        };

        const createThreshold = async () => {
            try {
                await axiosInstance.post('/analysis/thresholds', {
                    ...newThreshold
                });
                ElementPlus.ElMessage.success('阈值配置保存成功');
                showThresholdDialog.value = false;
                await loadThresholds();
            } catch (error) {
                ElementPlus.ElMessage.error('保存失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const toggleThreshold = async (row) => {
            try {
                const updated = { ...row, enabled: row.enabled };
                await axiosInstance.post('/analysis/thresholds', updated);
                ElementPlus.ElMessage.success('阈值状态已更新');
            } catch (error) {
                row.enabled = !row.enabled;
                ElementPlus.ElMessage.error('更新失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const deleteThreshold = async (row) => {
            try {
                await ElementPlus.ElMessageBox.confirm('确定要删除该阈值配置吗？', '确认删除', {
                    type: 'warning'
                });
                await axiosInstance.delete(`/analysis/thresholds/${row.threshold_id}`);
                ElementPlus.ElMessage.success('删除成功');
                await loadThresholds();
            } catch (error) {
                if (error !== 'cancel') {
                    ElementPlus.ElMessage.error('删除失败: ' + (error.response?.data?.detail || '未知错误'));
                }
            }
        };

        const detectAlerts = async () => {
            detecting.value = true;
            try {
                const response = await axiosInstance.get('/analysis/thresholds/detect', {
                    params: { factory_id: alertFilter.factory, lookback_minutes: 5 }
                });
                currentViolations.value = response.data.violations || [];
                if (currentViolations.value.length > 0) {
                    ElementPlus.ElMessage.warning(`检测到 ${currentViolations.value.length} 个异常`);
                } else {
                    ElementPlus.ElMessage.success('当前无异常');
                }
                await Promise.all([loadAlertRecords(), loadAlertSummary()]);
            } catch (error) {
                ElementPlus.ElMessage.error('检测失败: ' + (error.response?.data?.detail || '未知错误'));
            } finally {
                detecting.value = false;
            }
        };

        const loadAlertRecords = async () => {
            try {
                const response = await axiosInstance.get('/analysis/alerts/records', {
                    params: {
                        factory_id: alertFilter.factory,
                        status: alertFilter.status,
                        severity: alertFilter.severity,
                        days: 7,
                        limit: 200
                    }
                });
                alertRecords.value = response.data.records || [];
            } catch (error) {
                console.error('Load alert records error:', error);
            }
        };

        const loadAlertSummary = async () => {
            try {
                const response = await axiosInstance.get('/analysis/alerts/summary', {
                    params: { factory_id: alertFilter.factory, days: 30 }
                });
                alertSummary.total_alerts = response.data.total_alerts || 0;
                alertSummary.active_alerts = response.data.active_alerts || 0;
                alertSummary.alert_summary = response.data.alert_summary || [];

                await nextTick();
                renderAlertPieChart(response.data.alert_summary || []);
            } catch (error) {
                console.error('Load alert summary error:', error);
            }
        };

        const renderAlertPieChart = (data) => {
            if (!alertPieChart.value) return;

            alertPieInstance = _setupChart(alertPieChart.value, alertPieInstance);

            const severityData = {};
            data.forEach(d => {
                const sev = d.severity || 'info';
                severityData[sev] = (severityData[sev] || 0) + (d.alert_count || 0);
            });

            const pieData = [];
            if (severityData.critical) pieData.push({ name: '危急', value: severityData.critical, itemStyle: { color: '#f56c6c' } });
            if (severityData.warning) pieData.push({ name: '警告', value: severityData.warning, itemStyle: { color: '#e6a23c' } });
            if (severityData.info) pieData.push({ name: '信息', value: severityData.info, itemStyle: { color: '#409eff' } });
            if (pieData.length === 0) pieData.push({ name: '无告警', value: 1, itemStyle: { color: '#909399' } });

            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)'
                },
                legend: { bottom: 10 },
                series: [{
                    type: 'pie',
                    radius: ['40%', '70%'],
                    avoidLabelOverlap: false,
                    label: {
                        show: true,
                        formatter: '{b}: {d}%'
                    },
                    data: pieData
                }]
            };

            alertPieInstance.setOption(option, true);
        };

        const acknowledgeAlert = async (row) => {
            try {
                await ElementPlus.ElMessageBox.prompt('请输入备注（可选）', '确认告警', {
                    inputPlaceholder: '输入备注信息...',
                    inputValue: ''
                }).then(async ({ value }) => {
                    await axiosInstance.post(`/analysis/alerts/${row.alert_id}/acknowledge`, { notes: value || '' });
                    ElementPlus.ElMessage.success('告警已确认');
                    await loadAlertRecords();
                    await loadAlertSummary();
                });
            } catch (error) {
                if (error !== 'cancel') {
                    ElementPlus.ElMessage.error('操作失败: ' + (error.response?.data?.detail || '未知错误'));
                }
            }
        };

        const resolveAlert = async (row) => {
            try {
                await ElementPlus.ElMessageBox.prompt('请输入解决说明（可选）', '解决告警', {
                    inputPlaceholder: '输入解决说明...',
                    inputValue: ''
                }).then(async ({ value }) => {
                    await axiosInstance.post(`/analysis/alerts/${row.alert_id}/resolve`, { notes: value || '' });
                    ElementPlus.ElMessage.success('告警已解决');
                    await loadAlertRecords();
                    await loadAlertSummary();
                });
            } catch (error) {
                if (error !== 'cancel') {
                    ElementPlus.ElMessage.error('操作失败: ' + (error.response?.data?.detail || '未知错误'));
                }
            }
        };

        const loadLayouts = async () => {
            try {
                const response = await axiosInstance.get('/analysis/layouts', {
                    params: { layout_type: 'dashboard', factory_id: selectedFactory.value }
                });
                savedLayouts.value = response.data.layouts || [];

                const defaultLayoutItem = savedLayouts.value.find(l => l.is_default);
                if (defaultLayoutItem) {
                    try {
                        const config = JSON.parse(defaultLayoutItem.layout_config);
                        dashboardLayout.widgets = config.widgets || JSON.parse(JSON.stringify(defaultLayout.widgets));
                        originalLayout.widgets = JSON.parse(JSON.stringify(dashboardLayout.widgets));
                        currentLayoutId.value = defaultLayoutItem.layout_id;
                    } catch (e) {
                        console.error('Parse layout config error:', e);
                    }
                }
            } catch (error) {
                console.error('Load layouts error:', error);
            }
        };

        const saveCurrentLayout = async () => {
            try {
                await ElementPlus.ElMessageBox.prompt('请输入布局名称', '保存布局', {
                    inputPlaceholder: '输入布局名称...',
                    inputValue: '自定义布局_' + new Date().toLocaleDateString()
                }).then(async ({ value }) => {
                    await axiosInstance.post('/analysis/layouts', {
                        layout_name: value,
                        factory_id: selectedFactory.value,
                        layout_type: 'dashboard',
                        layout_config: { widgets: dashboardLayout.widgets },
                        is_default: false,
                        is_public: false
                    });
                    ElementPlus.ElMessage.success('布局保存成功');
                    startLayoutEdit.value = false;
                    await loadLayouts();
                });
            } catch (error) {
                if (error !== 'cancel') {
                    ElementPlus.ElMessage.error('保存失败: ' + (error.response?.data?.detail || '未知错误'));
                }
            }
        };

        const saveLayoutConfig = async () => {
            try {
                const layoutData = {
                    ...newLayout,
                    factory_id: selectedFactory.value,
                    layout_type: 'dashboard',
                    layout_config: { widgets: dashboardLayout.widgets }
                };
                await axiosInstance.post('/analysis/layouts', layoutData);
                ElementPlus.ElMessage.success('布局保存成功');
                showLayoutDialog.value = false;
                newLayout.layout_name = '';
                newLayout.is_default = false;
                newLayout.is_public = false;
                await loadLayouts();
            } catch (error) {
                ElementPlus.ElMessage.error('保存失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const applyLayout = async (layout) => {
            try {
                const config = JSON.parse(layout.layout_config);
                dashboardLayout.widgets = config.widgets || JSON.parse(JSON.stringify(defaultLayout.widgets));
                currentLayoutId.value = layout.layout_id;
                ElementPlus.ElMessage.success(`已应用布局: ${layout.layout_name}`);
            } catch (e) {
                ElementPlus.ElMessage.error('布局格式错误');
            }
        };

        const setDefaultLayout = async (layout) => {
            try {
                await axiosInstance.post('/analysis/layouts', {
                    layout_id: layout.layout_id,
                    layout_name: layout.layout_name,
                    factory_id: layout.factory_id,
                    layout_type: layout.layout_type,
                    layout_config: JSON.parse(layout.layout_config),
                    is_default: true,
                    is_public: layout.is_public
                });
                ElementPlus.ElMessage.success('已设为默认布局');
                await loadLayouts();
            } catch (error) {
                ElementPlus.ElMessage.error('设置失败: ' + (error.response?.data?.detail || '未知错误'));
            }
        };

        const deleteLayout = async (layout) => {
            try {
                await ElementPlus.ElMessageBox.confirm('确定要删除该布局吗？', '确认删除', {
                    type: 'warning'
                });
                await axiosInstance.delete(`/analysis/layouts/${layout.layout_id}`);
                ElementPlus.ElMessage.success('删除成功');
                await loadLayouts();
            } catch (error) {
                if (error !== 'cancel') {
                    ElementPlus.ElMessage.error('删除失败: ' + (error.response?.data?.detail || '未知错误'));
                }
            }
        };

        const addWidget = (widget) => {
            if (dashboardLayout.widgets.find(w => w.id === widget.id)) {
                ElementPlus.ElMessage.warning('该组件已在布局中');
                return;
            }
            dashboardLayout.widgets.push({ ...widget, height: 350 });
        };

        const removeWidget = (widget) => {
            const idx = dashboardLayout.widgets.findIndex(w => w.id === widget.id);
            if (idx > -1) {
                dashboardLayout.widgets.splice(idx, 1);
            }
        };

        const resetLayout = () => {
            dashboardLayout.widgets = JSON.parse(JSON.stringify(originalLayout.widgets));
        };

        const loadCurrentLayoutToEditor = () => {
            originalLayout.widgets = JSON.parse(JSON.stringify(dashboardLayout.widgets));
        };

        const getWidgetType = (id) => {
            const widget = availableWidgets.find(w => w.id === id);
            if (!widget) return '';
            const typeMap = { chart: 'primary', table: 'success', info: 'warning' };
            return typeMap[widget.type] || 'info';
        };

        watch(selectedFactory, async (newVal, oldVal) => {
            if (newVal && newVal !== oldVal) {
                await Promise.all([
                    loadMetrics(),
                    loadDevices(),
                    loadDashboardData()
                ]);
            }
        });

        watch(selectedMetrics, async (newVal, oldVal) => {
            if (JSON.stringify(newVal) !== JSON.stringify(oldVal) && newVal.length > 0) {
                await Promise.all([
                    loadTrendData(),
                    loadStatsData(),
                    loadRealtimeData()
                ]);
            }
        }, { deep: true });

        watch(dateRange, async (newVal, oldVal) => {
            if (newVal && JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
                await loadDashboardData();
            }
        }, { deep: true });

        const formatNumber = (num) => {
            if (num === null || num === undefined || Number.isNaN(num)) return '0';
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        };

        const formatFileSize = (bytes) => {
            if (!bytes) return '-';
            if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return bytes + ' B';
        };

        const getStatusType = (status) => {
            const types = {
                'completed': 'success',
                'pending': 'warning',
                'running': 'primary',
                'failed': 'danger',
                'online': 'success',
                'offline': 'danger'
            };
            return types[status] || 'info';
        };

        onMounted(() => {
            const token = localStorage.getItem('token');
            const user = localStorage.getItem('user');

            if (token && user) {
                currentUser.value = JSON.parse(user);
                isLoggedIn.value = true;
                loadInitialData();
            }
        });

        return {
            isLoggedIn,
            currentUser,
            currentView,
            loginForm,
            factories,
            devices,
            metrics,
            selectedFactory,
            dateRange,
            realtimeRange,
            selectedMetrics,
            dashboardSummary,
            trendFilter,
            trendDevices,
            statisticsData,
            qualityFilter,
            qualityReport,
            cleaningTasks,
            reportFilter,
            reportTasks,
            users,
            showUserDialog,
            newUser,
            comparisonFilter,
            comparisonData,
            comparisonChartRefs,
            comparisonBarChart,
            alertFilter,
            thresholdConfigs,
            alertRecords,
            alertSummary,
            currentViolations,
            detecting,
            showThresholdDialog,
            alertPieChart,
            newThreshold,
            startLayoutEdit,
            savedLayouts,
            showLayoutDialog,
            newLayout,
            currentLayoutId,
            dashboardLayout,
            availableWidgets,
            realtimeChart,
            statsChart,
            trendChart,
            analysisChart,
            handleLogin,
            handleLogout,
            handleViewChange,
            loadDashboardData,
            refreshDashboard,
            loadRealtimeData,
            loadTrendData,
            loadAnalysisData,
            loadQualityReport,
            loadComparisonData,
            loadThresholds,
            createThreshold,
            toggleThreshold,
            deleteThreshold,
            detectAlerts,
            acknowledgeAlert,
            resolveAlert,
            loadLayouts,
            applyLayout,
            setDefaultLayout,
            deleteLayout,
            saveCurrentLayout,
            saveLayoutConfig,
            addWidget,
            removeWidget,
            resetLayout,
            loadCurrentLayoutToEditor,
            getWidgetType,
            generateReport,
            downloadReport,
            createUser,
            formatNumber,
            formatFileSize,
            getStatusType
        };
    }
});

app.use(ElementPlus);
app.mount('#app');
