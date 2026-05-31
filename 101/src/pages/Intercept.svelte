<script lang="ts">
  import { onMount } from 'svelte'
  import { alerts } from '../store/ws'
  import AlertItem from '../components/AlertItem.svelte'
  import type { AlertRule, AlertEvent, AlertType, AlertAction, Severity } from '../../shared/types'

  let rules: AlertRule[] = []
  let showAddModal: boolean = false
  let editingRule: AlertRule | null = null
  let typeFilter: string = 'all'
  let resolvedFilter: string = 'all'

  $: currentAlerts = $alerts

  $: filteredAlerts = currentAlerts.filter((a: AlertEvent) => {
    const matchType = typeFilter === 'all' || a.type === typeFilter
    const matchResolved = resolvedFilter === 'all' ||
      (resolvedFilter === 'unresolved' && !a.resolved) ||
      (resolvedFilter === 'resolved' && a.resolved)
    return matchType && matchResolved
  })

  $: unresolvedCount = currentAlerts.filter((a: AlertEvent) => !a.resolved).length
  $: criticalCount = currentAlerts.filter((a: AlertEvent) => a.severity === 'critical' && !a.resolved).length

  onMount(async () => {
    try {
      const res = await fetch('/api/alerts/rules')
      rules = await res.json()
    } catch (e) {
      console.error('Failed to load rules:', e)
    }
  })

  const typeOptions = [
    { value: 'all', label: '全部类型' },
    { value: 'black_frame', label: '黑帧检测' },
    { value: 'freeze_frame', label: '静帧检测' },
    { value: 'silence', label: '静音检测' },
    { value: 'bandwidth_anomaly', label: '带宽异常' },
    { value: 'latency_anomaly', label: '延迟异常' },
    { value: 'packet_loss', label: '丢包率告警' },
  ]

  const typeLabels: Record<AlertType, string> = {
    black_frame: '黑帧检测',
    freeze_frame: '静帧检测',
    silence: '静音检测',
    bandwidth_anomaly: '带宽异常',
    latency_anomaly: '延迟异常',
    packet_loss: '丢包率告警',
  }

  const actionLabels: Record<AlertAction, string> = {
    alert: '仅告警',
    switch: '自动切换',
    alert_and_switch: '告警并切换',
  }

  let newRule: Omit<AlertRule, 'id'> = {
    name: '',
    type: 'black_frame',
    threshold: 5,
    duration: 3,
    severity: 'warning',
    enabled: true,
    action: 'alert',
  }

  async function toggleRule(rule: AlertRule) {
    try {
      const updated = await fetch(`/api/alerts/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      }).then((r) => r.json())
      const idx = rules.findIndex((r) => r.id === rule.id)
      if (idx >= 0) rules[idx] = updated
    } catch (e) {
      console.error('Toggle failed:', e)
    }
  }

  async function saveRule() {
    if (!newRule.name.trim()) return
    try {
      if (editingRule) {
        const updated = await fetch(`/api/alerts/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRule),
        }).then((r) => r.json())
        const idx = rules.findIndex((r) => r.id === editingRule!.id)
        if (idx >= 0) rules[idx] = updated
      } else {
        const created = await fetch('/api/alerts/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRule),
        }).then((r) => r.json())
        rules.push(created)
      }
      closeModal()
    } catch (e) {
      console.error('Save failed:', e)
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('确定删除此规则?')) return
    try {
      await fetch(`/api/alerts/rules/${id}`, { method: 'DELETE' })
      rules = rules.filter((r) => r.id !== id)
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  async function resolveAlert(id: string) {
    try {
      await fetch(`/api/alerts/events/${id}/resolve`, { method: 'PUT' })
    } catch (e) {
      console.error('Resolve failed:', e)
    }
  }

  function openAddModal() {
    editingRule = null
    newRule = { name: '', type: 'black_frame', threshold: 5, duration: 3, severity: 'warning', enabled: true, action: 'alert' }
    showAddModal = true
  }

  function openEditModal(rule: AlertRule) {
    editingRule = rule
    newRule = { ...rule }
    showAddModal = true
  }

  function closeModal() {
    showAddModal = false
    editingRule = null
  }

  function getUnit(type: AlertType): string {
    switch (type) {
      case 'black_frame':
      case 'freeze_frame':
        return '帧'
      case 'silence':
        return 'dB'
      case 'bandwidth_anomaly':
        return '%'
      case 'latency_anomaly':
        return 'ms'
      case 'packet_loss':
        return '%'
      default:
        return ''
    }
  }
</script>

<div class="space-y-4 animate-fade-in">
  <div class="grid grid-cols-4 gap-4">
    <div class="glow-panel p-4 text-center">
      <div class="data-value text-3xl">{rules.length}</div>
      <div class="label-text mt-1">检测规则</div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="data-value text-3xl">{unresolvedCount}</div>
      <div class="label-text mt-1">未处理告警</div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="data-value text-3xl text-alert-red">{criticalCount}</div>
      <div class="label-text mt-1">严重告警</div>
    </div>
    <div class="glow-panel p-4 text-center">
      <div class="data-value text-3xl text-signal-green">{Math.max(0, rules.filter((r) => r.enabled).length)}</div>
      <div class="label-text mt-1">启用中规则</div>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div class="glow-panel p-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">🛡️ 异常检测规则</h2>
        <button on:click={openAddModal} class="cyber-btn text-sm">+ 新建规则</button>
      </div>

      <div class="space-y-3 max-h-[420px] overflow-y-auto pr-2">
        {#each rules as rule (rule.id)}
          <div
            class="p-3 bg-deep-blue-lighter/30 rounded border border-panel-border transition-all hover:border-cyber-cyan/50"
            class:opacity-50={!rule.enabled}
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span
                  class="px-2 py-0.5 text-xs rounded font-medium {rule.severity === 'critical' ? 'bg-alert-red/20 text-alert-red' : rule.severity === 'warning' ? 'bg-signal-yellow/20 text-signal-yellow' : 'bg-cyber-cyan/20 text-cyber-cyan'}"
                >
                  {rule.severity === 'critical' ? '严重' : rule.severity === 'warning' ? '警告' : '提示'}
                </span>
                <span class="font-medium text-white">{rule.name}</span>
              </div>
              <label class="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  on:change={() => toggleRule(rule)}
                  class="sr-only"
                />
                <div
                  class="w-10 h-5 rounded-full transition-colors"
                  class:bg-cyber-cyan={rule.enabled}
                  class:bg-gray-600={!rule.enabled}
                >
                  <div
                    class="w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5"
                    style="transform: translateX({rule.enabled ? 22 : 2}px);"
                  ></div>
                </div>
              </label>
            </div>
            <div class="grid grid-cols-4 gap-2 text-xs text-gray-400 mb-3">
              <div>
                <span class="text-gray-500">类型：</span>
                <span class="text-white">{typeLabels[rule.type]}</span>
              </div>
              <div>
                <span class="text-gray-500">阈值：</span>
                <span class="text-cyber-cyan">{rule.threshold} {getUnit(rule.type)}</span>
              </div>
              <div>
                <span class="text-gray-500">持续：</span>
                <span class="text-white">{rule.duration}s</span>
              </div>
              <div>
                <span class="text-gray-500">动作：</span>
                <span class="text-signal-green">{actionLabels[rule.action]}</span>
              </div>
            </div>
            <div class="flex gap-2 justify-end">
              <button
                on:click={() => openEditModal(rule)}
                class="text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors"
              >
                编辑
              </button>
              <button
                on:click={() => deleteRule(rule.id)}
                class="text-xs text-alert-red hover:text-alert-red/80 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="glow-panel p-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-cyber-cyan text-sm font-semibold tracking-wider">⚠️ 异常事件列表</h2>
        <div class="flex gap-2">
          <select
            bind:value={typeFilter}
            class="bg-deep-blue border border-panel-border rounded px-2 py-1 text-xs text-white focus:border-cyber-cyan focus:outline-none"
          >
            {#each typeOptions as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <select
            bind:value={resolvedFilter}
            class="bg-deep-blue border border-panel-border rounded px-2 py-1 text-xs text-white focus:border-cyber-cyan focus:outline-none"
          >
            <option value="all">全部状态</option>
            <option value="unresolved">未处理</option>
            <option value="resolved">已处理</option>
          </select>
        </div>
      </div>

      <div class="space-y-2 max-h-[420px] overflow-y-auto pr-2">
        {#each filteredAlerts as alert (alert.id)}
          <div class="relative">
            <AlertItem {alert} />
            {#if !alert.resolved}
              <button
                on:click={() => resolveAlert(alert.id)}
                class="absolute right-3 top-3 text-xs text-signal-green hover:underline"
              >
                标记已处理
              </button>
            {/if}
          </div>
        {:else}
          <div class="text-center py-12 text-gray-500 text-sm">
            <div class="text-4xl mb-3">✅</div>
            暂无异常事件
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if showAddModal}
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div class="glow-panel p-6 w-[480px] animate-slide-up">
        <h3 class="font-display text-cyber-cyan text-lg font-semibold mb-4">
          {editingRule ? '编辑规则' : '新建检测规则'}
        </h3>
        <div class="space-y-4">
          <div>
            <label for="rule-name" class="label-text block mb-1">规则名称</label>
            <input
              id="rule-name"
              type="text"
              bind:value={newRule.name}
              class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
              placeholder="输入规则名称"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="rule-type" class="label-text block mb-1">检测类型</label>
              <select
                id="rule-type"
                bind:value={newRule.type}
                class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
              >
                {#each Object.entries(typeLabels) as [value, label] (value)}
                  <option value={value}>{label}</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="rule-severity" class="label-text block mb-1">严重等级</label>
              <select
                id="rule-severity"
                bind:value={newRule.severity}
                class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
              >
                <option value="info">提示</option>
                <option value="warning">警告</option>
                <option value="critical">严重</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="rule-threshold" class="label-text block mb-1">阈值 ({getUnit(newRule.type)})</label>
              <input
                id="rule-threshold"
                type="number"
                bind:value={newRule.threshold}
                step="0.1"
                class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
              />
            </div>
            <div>
              <label for="rule-duration" class="label-text block mb-1">持续时间 (秒)</label>
              <input
                id="rule-duration"
                type="number"
                bind:value={newRule.duration}
                min="1"
                class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label for="rule-action" class="label-text block mb-1">触发动作</label>
            <select
              id="rule-action"
              bind:value={newRule.action}
              class="w-full bg-deep-blue border border-panel-border rounded px-3 py-2 text-white focus:border-cyber-cyan focus:outline-none"
            >
              {#each Object.entries(actionLabels) as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button on:click={saveRule} class="cyber-btn flex-1">
            💾 保存
          </button>
          <button on:click={closeModal} class="cyber-btn flex-1 opacity-60">
            取消
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
