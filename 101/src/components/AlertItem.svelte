<script lang="ts">
  import type { AlertEvent } from '../../shared/types'

  export let alert: AlertEvent

  const severityColors: Record<string, string> = {
    critical: 'bg-alert-red/20 border-alert-red text-alert-red',
    warning: 'bg-signal-yellow/20 border-signal-yellow text-signal-yellow',
    info: 'bg-cyber-cyan/20 border-cyber-cyan text-cyber-cyan',
  }

  const severityLabels: Record<string, string> = {
    critical: '严重',
    warning: '警告',
    info: '提示',
  }

  const typeLabels: Record<string, string> = {
    black_frame: '黑帧检测',
    freeze_frame: '静帧检测',
    silence: '静音检测',
    bandwidth_anomaly: '带宽异常',
    latency_anomaly: '延迟异常',
    packet_loss: '丢包率告警',
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return iso
    }
  }
</script>

<div
  class="glow-panel px-3 py-2 border-l-4 flex items-center justify-between transition-all duration-300 hover:bg-deep-blue-lighter/50"
  class:opacity-50={alert.resolved}
>
  <div class="flex items-center gap-3 flex-1">
    <span
      class="px-2 py-0.5 text-xs font-medium rounded border {severityColors[alert.severity]}"
    >
      {severityLabels[alert.severity]}
    </span>
    <div>
      <div class="text-sm font-medium text-white">
        {alert.message}
      </div>
      <div class="text-xs text-gray-500">
        {typeLabels[alert.type]} · 当前值: {alert.value} · 阈值: {alert.threshold} · {formatTime(alert.timestamp)}
      </div>
    </div>
  </div>
  {#if alert.resolved}
    <span class="text-xs text-signal-green bg-signal-green/20 px-2 py-0.5 rounded">已处理</span>
  {:else}
    <span class="text-xs text-alert-red animate-pulse">待处理</span>
  {/if}
</div>
