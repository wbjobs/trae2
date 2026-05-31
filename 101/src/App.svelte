<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Router from 'svelte-spa-router'
  import { alerts, connected, connect, disconnect } from './store/ws'
  import type { AlertEvent } from '../shared/types'
  import Dashboard from './pages/Dashboard.svelte'
  import Routing from './pages/Routing.svelte'
  import Status from './pages/Status.svelte'
  import Intercept from './pages/Intercept.svelte'
  import Timeseries from './pages/Timeseries.svelte'

  const routes = {
    '/': Dashboard,
    '/routing': Routing,
    '/status': Status,
    '/intercept': Intercept,
    '/timeseries': Timeseries,
  }

  onMount(() => {
    connect()
  })

  onDestroy(() => {
    disconnect()
  })

  const navItems = [
    { path: '/', label: '调度大屏', icon: '📺' },
    { path: '/routing', label: '路由调度', icon: '🔄' },
    { path: '/status', label: '状态采集', icon: '📊' },
    { path: '/intercept', label: '异常拦截', icon: '🛡️' },
    { path: '/timeseries', label: '时序数据', icon: '📈' },
  ]

  let activeRoute: string = '/'
  let currentTime: string = new Date().toLocaleString('zh-CN')

  setInterval(() => {
    currentTime = new Date().toLocaleString('zh-CN')
  }, 1000)

  $: currentAlerts = $alerts
  $: unresolvedCount = currentAlerts.filter((a: AlertEvent) => !a.resolved).length
</script>

<div class="min-h-screen bg-deep-blue grid-bg">
  <header class="glow-panel border-b border-panel-border px-6 py-3 flex items-center justify-between">
    <div class="flex items-center gap-6">
      <h1 class="font-display text-xl font-bold text-cyber-cyan tracking-wider">
        ⚡ 广电信号流调度监控系统
      </h1>
      <nav class="flex gap-2">
        {#each navItems as item}
          <a
            href="#{item.path}"
            class="px-4 py-2 rounded text-sm font-medium transition-all duration-300 hover:bg-deep-blue-lighter"
            class:bg-deep-blue-lighter={activeRoute === item.path}
            class:text-cyber-cyan={activeRoute === item.path}
            class:text-gray-400={activeRoute !== item.path}
            on:click={() => (activeRoute = item.path)}
          >
            <span class="mr-2">{item.icon}</span>
            {item.label}
            {#if item.path === '/intercept' && unresolvedCount > 0}
              <span class="ml-2 px-1.5 py-0.5 bg-alert-red text-white text-xs rounded-full animate-pulse">
                {unresolvedCount}
              </span>
            {/if}
          </a>
        {/each}
      </nav>
    </div>
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-2">
        <span
          class="status-dot"
          class:status-dot-active={$connected}
          class:status-dot-offline={!$connected}
        ></span>
        <span class="text-xs text-gray-400">
          {$connected ? '实时连接' : '连接中断'}
        </span>
      </div>
      <div class="font-display text-cyber-cyan text-sm">{currentTime}</div>
    </div>
  </header>

  <main class="p-4">
    <Router {routes} on:routeLoaded={(e: CustomEvent<{ location: string }>) => (activeRoute = e.detail.location)} />
  </main>
</div>
