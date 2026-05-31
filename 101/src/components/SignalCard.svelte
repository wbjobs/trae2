<script lang="ts">
  import type { SignalSource } from '../../shared/types'

  export let signal: SignalSource
  export let selected: boolean = false

  const statusColors: Record<string, string> = {
    active: 'status-dot-active',
    standby: 'status-dot-standby',
    offline: 'status-dot-offline',
    error: 'status-dot-error',
  }

  const statusLabels: Record<string, string> = {
    active: '在线',
    standby: '备机',
    offline: '离线',
    error: '故障',
  }

  const typeIcons: Record<string, string> = {
    video: '🎬',
    audio: '🔊',
    data: '📡',
  }
</script>

<div
  class="glow-panel p-3 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
  class:ring-2={selected}
  class:ring-cyber-cyan={selected}
>
  <div class="flex items-start justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-lg">{typeIcons[signal.type]}</span>
      <div>
        <div class="font-medium text-sm text-white truncate max-w-[140px]">{signal.name}</div>
        <div class="text-xs text-gray-500">{signal.id} · {signal.protocol}</div>
      </div>
    </div>
    <div class="flex items-center gap-1">
      <span class="status-dot {statusColors[signal.status]}"></span>
      <span class="text-xs text-gray-400">{statusLabels[signal.status]}</span>
    </div>
  </div>
  {#if signal.status === 'active'}
    <div class="grid grid-cols-3 gap-2 text-center mt-2 pt-2 border-t border-panel-border">
      <div>
        <div class="data-value text-xs">{signal.bandwidth.toFixed(1)}</div>
        <div class="text-[10px] text-gray-500">带宽 Gbps</div>
      </div>
      <div>
        <div class="data-value text-xs">{signal.latency.toFixed(0)}</div>
        <div class="text-[10px] text-gray-500">延迟 ms</div>
      </div>
      <div>
        <div class="data-value text-xs" class:text-alert-red={signal.packetLoss > 0.5}>
          {signal.packetLoss.toFixed(3)}
        </div>
        <div class="text-[10px] text-gray-500">丢包率 %</div>
      </div>
    </div>
  {/if}
</div>
