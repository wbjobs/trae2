<script lang="ts">
  import { onMount } from 'svelte'
  import LineChart from '../components/LineChart.svelte'
  import type { SignalSource, TimeSeriesDataPoint } from '../../shared/types'

  let signals: SignalSource[] = []
  let selectedSignalId: string = 'all'
  let selectedMeasurement: string = 'bandwidth'
  let timeRange: string = '1h'
  let aggregation: string = 'mean'
  let chartData: TimeSeriesDataPoint[] = []
  let loading: boolean = false
  let stats = {
    total: 0,
    avg: 0,
    max: 0,
    min: 0,
  }

  onMount(async () => {
    try {
      signals = await fetch('/api/signals').then((r) => r.json())
    } catch (e) {
      console.error('Failed to load signals:', e)
    }
    await queryData()
  })

  async function queryData() {
    loading = true
    try {
      const params = new URLSearchParams({
        measurement: selectedMeasurement,
        startTime: timeRange,
        endTime: 'now',
        aggregation,
        groupBy: '1m',
      })
      if (selectedSignalId !== 'all') {
        params.append('signalId', selectedSignalId)
      }
      const res = await fetch(`/api/timeseries/query?${params.toString()}`)
      const data = await res.json()
      chartData = data.values || []

      if (chartData.length > 0) {
        const values = chartData.map((d) => d.value)
        stats = {
          total: chartData.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          max: Math.max(...values),
          min: Math.min(...values),
        }
      } else {
        stats = { total: 0, avg: 0, max: 0, min: 0 }
      }
    } catch (e) {
      console.error('Query failed:', e)
    } finally {
      loading = false
    }
  }

  const measurementOptions = [
    { value: 'bandwidth', label: '带宽', unit: 'Gbps', color: '#00E5FF' },
    { value: 'latency', label: '延迟', unit: 'ms', color: '#FFB800' },
    { value: 'packetLoss', label: '丢包率', unit: '%', color: '#FF3D71' },
  ]

  const timeRangeOptions = [
    { value: '1h', label: '最近 1 小时' },
    { value: '6h', label: '最近 6 小时' },
    { value: '24h', label: '最近 24 小时' },
    { value: '7d', label: '最近 7 天' },
  ]

  const aggregationOptions = [
    { value: 'mean', label: '平均值' },
    { value: 'max', label: '最大值' },
    { value: 'min', label: '最小值' },
    { value: 'sum', label: '累计值' },
  ]

  $: currentMeasurement = measurementOptions.find((m) => m.value === selectedMeasurement)
  $: selectedColor = currentMeasurement?.color || '#00E5FF'
  $: selectedUnit = currentMeasurement?.unit || ''

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('zh-CN')
    } catch {
      return iso
    }
  }

  let hoveredPoint: TimeSeriesDataPoint | null = null

  const logEntries: string[] = [
    '2026-05-28T16:30:00 [INFO] signal_status S001 bandwidth=12.5 Gbps',
    '2026-05-28T16:30:00 [INFO] signal_status S002 bandwidth=12.3 Gbps',
    '2026-05-28T16:30:00 [WARN] alert_events S009 packet_loss=5.2% exceed threshold',
    '2026-05-28T16:29:58 [INFO] route_operations R001 switch from S004 to S001',
    '2026-05-28T16:29:55 [INFO] system_metrics collector_worker cpu=12.5%',
    '2026-05-28T16:29:55 [INFO] system_metrics routing_worker cpu=8.2%',
    '2026-05-28T16:29:55 [INFO] system_metrics interceptor_worker cpu=5.1%',
    '2026-05-28T16:29:50 [INFO] signal_status S005 latency=25ms',
    '2026-05-28T16:29:45 [INFO] route_operations R003 auto-switch S012 -> S002',
    '2026-05-28T16:29:40 [INFO] signal_status S003 bandwidth=15.8 Gbps',
  ]
</script>

<div class="space-y-4 animate-fade-in">
  <div class="glow-panel p-4">
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="label-text">测量项</span>
        <select
          bind:value={selectedMeasurement}
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none"
        >
          {#each measurementOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="label-text">信号源</span>
        <select
          bind:value={selectedSignalId}
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none min-w-[180px]"
        >
          <option value="all">全部信号（聚合）</option>
          {#each signals as s (s.id)}
            <option value={s.id}>{s.name} ({s.id})</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="label-text">时间范围</span>
        <select
          bind:value={timeRange}
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none"
        >
          {#each timeRangeOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="label-text">聚合方式</span>
        <select
          bind:value={aggregation}
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none"
        >
          {#each aggregationOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <button on:click={queryData} class="cyber-btn text-sm">
        🔍 查询
      </button>
    </div>
  </div>

  <div class="grid grid-cols-4 gap-4">
    <div class="glow-panel p-4 text-center">
      <div class="label-text mb-1">数据点</div>
      <div class="data-value text-2xl">{stats.total}</div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="label-text mb-1">平均值</div>
      <div class="data-value text-2xl">{stats.avg.toFixed(2)} <span class="text-sm text-gray-500">{selectedUnit}</span></div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="label-text mb-1">最大值</div>
      <div class="data-value text-2xl text-signal-yellow">{stats.max.toFixed(2)} <span class="text-sm text-gray-500">{selectedUnit}</span></div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="label-text mb-1">最小值</div>
      <div class="data-value text-2xl text-signal-green">{stats.min.toFixed(2)} <span class="text-sm text-gray-500">{selectedUnit}</span></div>
    </div>
  </div>

  <div class="glow-panel p-4">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">
        📈 {currentMeasurement?.label}时序曲线
      </h2>
      {#if hoveredPoint !== null}
        <span class="text-sm text-gray-400">
          {formatTime((hoveredPoint as TimeSeriesDataPoint).time)} · <span class="data-value">{(hoveredPoint as TimeSeriesDataPoint).value.toFixed(2)}</span> {selectedUnit}
        </span>
      {/if}
    </div>

    {#if loading}
      <div class="h-[400px] flex items-center justify-center">
        <div class="text-cyber-cyan animate-pulse">⏳ 加载中...</div>
      </div>
    {:else if chartData.length > 0}
      <LineChart data={chartData} color={selectedColor} height={400} />
    {:else}
      <div class="h-[400px] flex items-center justify-center text-gray-500">
        <div class="text-center">
          <div class="text-4xl mb-3">📊</div>
          <div>暂无数据，点击查询按钮获取数据</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div class="glow-panel p-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">⚙️ 存储策略</h2>
      <div class="space-y-3">
        <div class="flex justify-between items-center py-2 border-b border-panel-border">
          <span class="text-gray-400 text-sm">数据保留周期</span>
          <span class="text-white">90 天</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-panel-border">
          <span class="text-gray-400 text-sm">原始数据精度</span>
          <span class="text-white">2 秒</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-panel-border">
          <span class="text-gray-400 text-sm">1 小时降采样</span>
          <span class="text-white">1 分钟精度 · 保留 30 天</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-panel-border">
          <span class="text-gray-400 text-sm">1 天降采样</span>
          <span class="text-white">1 小时精度 · 保留 90 天</span>
        </div>
        <div class="flex justify-between items-center py-2">
          <span class="text-gray-400 text-sm">存储配额</span>
          <span class="text-cyber-cyan">45.2 GB / 100 GB</span>
        </div>
      </div>
    </div>

    <div class="glow-panel p-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">💾 运行日志</h2>
      <div class="font-mono text-xs bg-black/30 rounded p-3 h-[240px] overflow-y-auto space-y-1">
        {#each logEntries as line}
          <div class="flex gap-2">
            <span class="text-gray-600">{line.slice(0, 19)}</span>
            <span
              class={line.includes('[WARN]') ? 'text-signal-yellow' : line.includes('[ERROR]') ? 'text-alert-red' : 'text-signal-green'}
            >
              {line.slice(20, 26)}
            </span>
            <span class="text-gray-300">{line.slice(27)}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
