<script lang="ts">
  import { onMount } from 'svelte'
  import { signals, alerts, kpi } from '../store/ws'
  import GaugeCard from '../components/GaugeCard.svelte'
  import SignalCard from '../components/SignalCard.svelte'
  import AlertItem from '../components/AlertItem.svelte'
  import SignalTopology from '../components/SignalTopology.svelte'
  import LineChart from '../components/LineChart.svelte'
  import type { TopologyNode, TopologyEdge, TimeSeriesDataPoint } from '../../shared/types'

  let topologyNodes: TopologyNode[] = []
  let topologyEdges: TopologyEdge[] = []
  let bandwidthHistory: TimeSeriesDataPoint[] = []
  let latencyHistory: TimeSeriesDataPoint[] = []

  $: currentKpi = $kpi
  $: currentSignals = $signals
  $: currentAlerts = $alerts

  onMount(async () => {
    try {
      const [topoRes, bwRes, latRes] = await Promise.all([
        fetch('/api/topology').then((r) => r.json()),
        fetch('/api/timeseries/query?measurement=bandwidth&signalId=S001&startTime=1&endTime=2').then((r) => r.json()),
        fetch('/api/timeseries/query?measurement=latency&signalId=S001&startTime=1&endTime=2').then((r) => r.json()),
      ])
      topologyNodes = topoRes.nodes
      topologyEdges = topoRes.edges
      bandwidthHistory = bwRes.values || []
      latencyHistory = latRes.values || []
    } catch (e) {
      console.error('Failed to load initial data:', e)
    }
  })

  let lastBwUpdate = 0
  let lastLatUpdate = 0

  $: if (currentSignals.length > 0 && bandwidthHistory.length > 0) {
    const now = Date.now()
    if (now - lastBwUpdate > 500) {
      lastBwUpdate = now
      const first = currentSignals[0]
      const last = bandwidthHistory[bandwidthHistory.length - 1]
      if (last && Math.abs(last.value - first.bandwidth) > 0.1) {
        bandwidthHistory = [...bandwidthHistory.slice(1), { time: new Date().toISOString(), value: first.bandwidth }]
      }
    }
  }

  $: if (currentSignals.length > 0 && latencyHistory.length > 0) {
    const now = Date.now()
    if (now - lastLatUpdate > 500) {
      lastLatUpdate = now
      const first = currentSignals[0]
      const last = latencyHistory[latencyHistory.length - 1]
      if (last && Math.abs(last.value - first.latency) > 0.1) {
        latencyHistory = [...latencyHistory.slice(1), { time: new Date().toISOString(), value: first.latency }]
      }
    }
  }

  $: activeSignals = currentSignals.filter((s) => s.status === 'active')
  $: recentAlerts = currentAlerts.slice(0, 5)
  $: alertScrollText = currentAlerts
    .filter((a) => !a.resolved)
    .slice(0, 10)
    .map((a) => `【${a.severity === 'critical' ? '严重' : '警告'}】${a.message}`)
    .join('   •   ')
</script>

<div class="space-y-4 animate-fade-in">
  <div class="grid grid-cols-6 gap-4">
    <GaugeCard title="信号总数" value={currentKpi.totalSignals} unit="路" color="cyan" max={30} />
    <GaugeCard title="活跃信号" value={currentKpi.activeSignals} unit="路" color="green" max={currentKpi.totalSignals || 1} />
    <GaugeCard title="平均带宽" value={currentKpi.averageBandwidth} unit="Gbps" color="cyan" max={30} />
    <GaugeCard title="平均延迟" value={currentKpi.averageLatency} unit="ms" color="yellow" max={200} />
    <GaugeCard title="异常告警" value={currentKpi.alertCount} unit="条" color="red" max={20} />
    <GaugeCard title="在线设备" value={currentKpi.onlineTargets} unit="台" color="green" max={10} />
  </div>

  <div class="grid grid-cols-3 gap-4">
    <div class="col-span-2 glow-panel p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">🔗 信号流拓扑图</h2>
        <span class="label-text">实时更新</span>
      </div>
      <div class="h-[400px]">
        <SignalTopology nodes={topologyNodes} edges={topologyEdges} />
      </div>
    </div>

    <div class="glow-panel p-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">📊 CCTV-1 带宽趋势</h2>
      <LineChart data={bandwidthHistory} color="#00E5FF" height={160} />
      <div class="text-xs text-gray-500 text-center mt-2">实时带宽 · Gbps</div>

      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mt-4 mb-3">📈 CCTV-1 延迟趋势</h2>
      <LineChart data={latencyHistory} color="#FFB800" height={160} />
      <div class="text-xs text-gray-500 text-center mt-2">实时延迟 · ms</div>
    </div>
  </div>

  <div class="grid grid-cols-3 gap-4">
    <div class="glow-panel p-4 col-span-2">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">📡 信号源状态矩阵</h2>
        <span class="label-text">共 {currentSignals.length} 路信号</span>
      </div>
      <div class="grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto pr-2">
        {#each currentSignals as signal (signal.id)}
          <SignalCard {signal} />
        {/each}
      </div>
    </div>

    <div class="glow-panel p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">⚠️ 最新异常</h2>
        <a href="#/intercept" class="text-xs text-cyber-cyan hover:underline">查看全部 →</a>
      </div>
      <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2">
        {#each recentAlerts as alert (alert.id)}
          <AlertItem {alert} />
        {:else}
          <div class="text-center py-8 text-gray-500 text-sm">暂无异常告警</div>
        {/each}
      </div>
    </div>
  </div>

  {#if alertScrollText}
    <div class="glow-panel py-2 px-4 border-l-4 border-alert-red bg-alert-red/5">
      <div class="flex items-center gap-4 overflow-hidden">
        <span class="text-alert-red font-semibold text-sm flex-shrink-0 animate-pulse">🚨 实时告警</span>
        <div class="overflow-hidden whitespace-nowrap flex-1">
          <span class="inline-block text-sm text-gray-300 animate-scroll-alert">
            {alertScrollText}
          </span>
        </div>
      </div>
    </div>
  {/if}
</div>
