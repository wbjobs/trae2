<script lang="ts">
  import { onMount } from 'svelte'
  import { signals } from '../store/ws'
  import SignalCard from '../components/SignalCard.svelte'
  import LineChart from '../components/LineChart.svelte'
  import type { SignalSource, TimeSeriesDataPoint } from '../../shared/types'

  let selectedSignal: SignalSource | null = null
  let bandwidthHistory: TimeSeriesDataPoint[] = []
  let latencyHistory: TimeSeriesDataPoint[] = []
  let lossHistory: TimeSeriesDataPoint[] = []
  let searchQuery: string = ''
  let statusFilter: string = 'all'

  $: currentSignals = $signals

  $: filteredSignals = currentSignals.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  async function selectSignal(signal: SignalSource) {
    selectedSignal = signal
    try {
      const [bw, lat, loss] = await Promise.all([
        fetch(`/api/timeseries/query?measurement=bandwidth&signalId=${signal.id}&startTime=1&endTime=2`).then((r) => r.json()),
        fetch(`/api/timeseries/query?measurement=latency&signalId=${signal.id}&startTime=1&endTime=2`).then((r) => r.json()),
        fetch(`/api/timeseries/query?measurement=packetLoss&signalId=${signal.id}&startTime=1&endTime=2`).then((r) => r.json()),
      ])
      bandwidthHistory = bw.values || []
      latencyHistory = lat.values || []
      lossHistory = loss.values || []
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  $: if (selectedSignal && currentSignals.length > 0) {
    const current = currentSignals.find((s) => s.id === selectedSignal!.id)
    if (current) {
      selectedSignal = current
      if (bandwidthHistory.length > 0) {
        bandwidthHistory = [...bandwidthHistory.slice(1), { time: new Date().toISOString(), value: current.bandwidth }]
        latencyHistory = [...latencyHistory.slice(1), { time: new Date().toISOString(), value: current.latency }]
        lossHistory = [...lossHistory.slice(1), { time: new Date().toISOString(), value: current.packetLoss }]
      }
    }
  }

  const statusOptions = [
    { value: 'all', label: '全部' },
    { value: 'active', label: '在线' },
    { value: 'standby', label: '备机' },
    { value: 'offline', label: '离线' },
    { value: 'error', label: '故障' },
  ]

  const protocolLabels: Record<string, string> = {
    ST2110: 'SMPTE ST 2110',
    SDI: 'SDI',
    NDI: 'NDI',
  }

  const typeLabels: Record<string, string> = {
    video: '视频',
    audio: '音频',
    data: '数据',
  }
</script>

<div class="space-y-4 animate-fade-in">
  <div class="glow-panel p-4">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">📡 信号流实时监控</h2>
      <div class="flex items-center gap-3">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="搜索信号名称或ID..."
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none w-56"
        />
        <select
          bind:value={statusFilter}
          class="bg-deep-blue border border-panel-border rounded px-3 py-1.5 text-sm text-white focus:border-cyber-cyan focus:outline-none"
        >
          {#each statusOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto pr-2">
      {#each filteredSignals as signal (signal.id)}
        <SignalCard
          {signal}
          selected={selectedSignal?.id === signal.id}
          on:click={() => selectSignal(signal)}
        />
      {:else}
        <div class="col-span-4 text-center py-12 text-gray-500">
          未找到匹配的信号源
        </div>
      {/each}
    </div>
  </div>

  {#if selectedSignal}
    <div class="grid grid-cols-3 gap-4">
      <div class="glow-panel p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">📋 信号详情</h2>
          <span
            class="status-dot"
            class:status-dot-active={selectedSignal.status === 'active'}
            class:status-dot-standby={selectedSignal.status === 'standby'}
            class:status-dot-offline={selectedSignal.status === 'offline'}
            class:status-dot-error={selectedSignal.status === 'error'}
          ></span>
        </div>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">信号ID</span>
            <span class="font-mono text-cyber-cyan">{selectedSignal.id}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">信号名称</span>
            <span class="font-medium">{selectedSignal.name}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">信号类型</span>
            <span>{typeLabels[selectedSignal.type]}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">传输协议</span>
            <span>{protocolLabels[selectedSignal.protocol]}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">当前带宽</span>
            <span class="data-value">{selectedSignal.bandwidth.toFixed(2)} Gbps</span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">当前延迟</span>
            <span class="data-value" class:text-signal-yellow={selectedSignal.latency > 50}>
              {selectedSignal.latency.toFixed(1)} ms
            </span>
          </div>
          <div class="flex justify-between py-1 border-b border-panel-border">
            <span class="text-gray-500">丢包率</span>
            <span class="data-value" class:text-alert-red={selectedSignal.packetLoss > 0.1}>
              {selectedSignal.packetLoss.toFixed(4)} %
            </span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-gray-500">连接目标</span>
            <span>{selectedSignal.targetIds.length} 个</span>
          </div>
        </div>
      </div>

      <div class="glow-panel p-4">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">📊 带宽曲线</h2>
        <LineChart data={bandwidthHistory} color="#00E5FF" height={110} />
        <div class="text-xs text-gray-500 text-center mt-1 mb-3">Gbps</div>

        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">📈 延迟曲线</h2>
        <LineChart data={latencyHistory} color="#FFB800" height={110} />
        <div class="text-xs text-gray-500 text-center mt-1">ms</div>
      </div>

      <div class="glow-panel p-4">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">📉 丢包率曲线</h2>
        <LineChart data={lossHistory} color="#FF3D71" height={110} />
        <div class="text-xs text-gray-500 text-center mt-1 mb-3">%</div>

        <div class="p-3 bg-deep-blue-lighter/50 rounded border border-panel-border">
          <div class="text-xs text-gray-500 mb-2">采集任务信息</div>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-gray-500">采集频率</span>
              <span>2 Hz</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">采集协议</span>
              <span>IP / SDI</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">解析标准</span>
              <span>SMPTE ST 2110</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">任务状态</span>
              <span class="text-signal-green">采集中</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
