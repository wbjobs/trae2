<script lang="ts">
  import { onMount } from 'svelte'
  import { signals, routes } from '../store/ws'
  import SignalTopology from '../components/SignalTopology.svelte'
  import type {
    SignalSource,
    SignalTarget,
    RouteConfig,
    RouteHistory,
    TopologyNode,
    TopologyEdge,
  } from '../../shared/types'

  let targets: SignalTarget[] = []
  let history: RouteHistory[] = []
  let topologyNodes: TopologyNode[] = []
  let topologyEdges: TopologyEdge[] = []
  let selectedRoute: RouteConfig | null = null
  let selectedSourceId: string = ''
  let bandwidth: number = 0
  let switching: boolean = false

  $: currentSignals = $signals
  $: currentRoutes = $routes
  $: activeSources = currentSignals.filter((s) => s.status === 'active' || s.status === 'standby')

  onMount(async () => {
    try {
      const [targetsRes, historyRes, topoRes] = await Promise.all([
        fetch('/api/targets').then((r) => r.json()),
        fetch('/api/routes/history').then((r) => r.json()),
        fetch('/api/topology').then((r) => r.json()),
      ])
      targets = targetsRes
      history = historyRes
      topologyNodes = topoRes.nodes
      topologyEdges = topoRes.edges
    } catch (e) {
      console.error('Failed to load data:', e)
    }
  })

  function selectRoute(route: RouteConfig) {
    selectedRoute = route
    selectedSourceId = route.sourceId
    bandwidth = route.bandwidth
  }

  async function handleSwitch() {
    if (!selectedRoute || !selectedSourceId) return
    switching = true
    try {
      await fetch(`/api/routes/${selectedRoute.id}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: selectedRoute.id,
          newSourceId: selectedSourceId,
          reason: 'manual' as const,
        }),
      })
    } catch (e) {
      console.error('Switch failed:', e)
    }
    setTimeout(() => {
      switching = false
      selectedRoute = null
    }, 1000)
  }

  async function handleBandwidthUpdate() {
    if (!selectedRoute) return
    try {
      await fetch(`/api/routes/${selectedRoute.id}/bandwidth`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandwidth }),
      })
    } catch (e) {
      console.error('Update failed:', e)
    }
  }

  function getSourceName(id: string): string {
    return currentSignals.find((s) => s.id === id)?.name || id
  }

  function getTargetName(id: string): string {
    return targets.find((t) => t.id === id)?.name || id
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString('zh-CN')
    } catch {
      return iso
    }
  }

  const reasonLabels: Record<string, string> = {
    manual: '手动切换',
    emergency: '应急切换',
    'auto-failover': '自动故障转移',
  }
</script>

<div class="space-y-4 animate-fade-in">
  <div class="grid grid-cols-3 gap-4">
    <div class="glow-panel p-4 col-span-2">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">🔗 路由拓扑编辑</h2>
        <span class="label-text">点击连线进行编辑</span>
      </div>
      <div class="h-[350px]">
        <SignalTopology nodes={topologyNodes} edges={topologyEdges} />
      </div>
    </div>

    <div class="glow-panel p-4">
      <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider mb-3">🎛️ 路由切换操作</h2>
      {#if selectedRoute}
        <div class="space-y-4">
          <div class="p-3 bg-deep-blue-lighter/50 rounded border border-panel-border">
            <div class="text-xs text-gray-500 mb-1">当前路由</div>
            <div class="text-sm font-medium text-white">
              {getSourceName(selectedRoute.sourceId)} → {getTargetName(selectedRoute.targetId)}
            </div>
            <div class="text-xs text-cyber-cyan mt-1">
              带宽: {selectedRoute.bandwidth.toFixed(1)} Gbps · 优先级: {selectedRoute.priority}
            </div>
          </div>

          <div>
            <label for="source-select" class="label-text block mb-2">切换到信号源</label>
            <select
              id="source-select"
              bind:value={selectedSourceId}
              class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white text-sm focus:border-cyber-cyan focus:outline-none"
            >
              {#each activeSources as source (source.id)}
                <option value={source.id}>{source.name} ({source.id})</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="bandwidth-range" class="label-text block mb-2">带宽分配: {bandwidth.toFixed(1)} Gbps</label>
            <input
              id="bandwidth-range"
              type="range"
              bind:value={bandwidth}
              min="1"
              max="30"
              step="0.1"
              class="w-full accent-cyber-cyan"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 Gbps</span>
              <span>30 Gbps</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              on:click={handleSwitch}
              class="cyber-btn flex-1"
              disabled={switching}
            >
              {switching ? '切换中...' : '🔄 确认切换'}
            </button>
            <button
              on:click={handleBandwidthUpdate}
              class="cyber-btn flex-1"
            >
              📶 更新带宽
            </button>
          </div>

          <button
            on:click={() => (selectedRoute = null)}
            class="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors"
          >
            取消选择
          </button>
        </div>
      {:else}
        <div class="text-center py-12 text-gray-500">
          <div class="text-4xl mb-3">👆</div>
          <div class="text-sm">点击下方路由列表选择要切换的路由</div>
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div class="glow-panel p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">📋 路由配置列表</h2>
        <span class="label-text">共 {currentRoutes.length} 条路由</span>
      </div>
      <div class="overflow-auto max-h-[280px]">
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-500 uppercase sticky top-0 bg-deep-blue">
            <tr>
              <th class="text-left py-2 px-3">路由ID</th>
              <th class="text-left py-2 px-3">信号源</th>
              <th class="text-left py-2 px-3">目标</th>
              <th class="text-left py-2 px-3">带宽</th>
              <th class="text-left py-2 px-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {#each currentRoutes as route (route.id)}
              <tr
                class="border-t border-panel-border cursor-pointer transition-colors hover:bg-deep-blue-lighter/30 {selectedRoute?.id === route.id ? 'bg-cyber-cyan/10' : ''}"
                on:click={() => selectRoute(route)}
              >
                <td class="py-2 px-3 font-mono text-cyber-cyan text-xs">{route.id}</td>
                <td class="py-2 px-3">{getSourceName(route.sourceId)}</td>
                <td class="py-2 px-3">{getTargetName(route.targetId)}</td>
                <td class="py-2 px-3 font-mono">{route.bandwidth.toFixed(1)} G</td>
                <td class="py-2 px-3">
                  {#if route.isActive}
                    <span class="text-signal-green">● 活跃</span>
                  {:else}
                    <span class="text-gray-500">● 停用</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="glow-panel p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">📜 路由切换历史</h2>
        <span class="label-text">最近操作</span>
      </div>
      <div class="space-y-2 max-h-[280px] overflow-y-auto">
        {#each history as h (h.id)}
          <div class="p-3 bg-deep-blue-lighter/30 rounded border-l-2 border-cyber-cyan/50">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400 font-mono">{h.id}</span>
              <span class="text-xs px-2 py-0.5 bg-cyber-cyan/20 text-cyber-cyan rounded">
                {reasonLabels[h.reason]}
              </span>
            </div>
            <div class="text-sm text-white my-1">
              <span class="text-signal-yellow">{getSourceName(h.fromSourceId)}</span>
              <span class="mx-2 text-gray-500">→</span>
              <span class="text-signal-green">{getSourceName(h.toSourceId)}</span>
            </div>
            <div class="text-xs text-gray-500">
              操作人: {h.operator} · {formatTime(h.timestamp)}
            </div>
          </div>
        {:else}
          <div class="text-center py-8 text-gray-500 text-sm">暂无切换记录</div>
        {/each}
      </div>
    </div>
  </div>
</div>
