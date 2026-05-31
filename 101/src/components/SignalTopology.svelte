<script lang="ts">
  import type { TopologyNode, TopologyEdge } from '../../shared/types'

  export let nodes: TopologyNode[]
  export let edges: TopologyEdge[]

  const nodeColors: Record<string, string> = {
    active: '#00E096',
    standby: '#FFB800',
    offline: '#64748B',
    error: '#FF3D71',
    online: '#00E096',
  }

  function nc(status: string): string {
    return nodeColors[status] || '#64748B'
  }

  function ew(bandwidth: number, maxBandwidth: number): number {
    return Math.max(0.8, Math.min(6, (bandwidth / maxBandwidth) * 6))
  }

  const nodeMap = new Map<string, TopologyNode>()
  $: {
    nodeMap.clear()
    nodes.forEach((n) => nodeMap.set(n.id, n))
  }

  function bp(from: TopologyNode, to: TopologyNode): string {
    const sx = from.x + 70
    const sy = from.y + 22.5
    const ex = to.x
    const ey = to.y + 22.5
    const co = Math.min(Math.abs(ex - sx) * 0.4, 150)
    return `M${sx} ${sy}C${sx + co} ${sy},${ex - co} ${ey},${ex} ${ey}`
  }

  function ad(edge: TopologyEdge): number {
    const h = edge.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return (h % 10) * 0.2
  }

  $: sortedNodes = [...nodes].sort((a, b) => {
    if (a.type === 'router') return 0
    if (b.type === 'router') return 0
    if (a.type === 'source' && b.type !== 'source') return -1
    if (a.type !== 'source' && b.type === 'source') return 1
    return a.id.localeCompare(b.id)
  })

  $: activeEdges = edges.filter((e) => {
    const f = nodeMap.get(e.from)
    const t = nodeMap.get(e.to)
    return f && t
  }).map((e) => ({
    ...e,
    fromNode: nodeMap.get(e.from)!,
    toNode: nodeMap.get(e.to)!,
    path: bp(nodeMap.get(e.from)!, nodeMap.get(e.to)!),
    delay: ad(e),
    width: ew(e.bandwidth, e.maxBandwidth),
  }))
</script>

<div class="relative w-full h-full overflow-hidden rounded-lg" style="background: rgba(10,22,40,0.5); contain: strict;">
  <svg class="w-full h-full" viewBox="0 0 1100 620" preserveAspectRatio="xMidYMid meet">
    {#each activeEdges as edge (edge.id + '-line')}
      <g>
        <path
          d={edge.path}
          fill="none"
          stroke={edge.isActive ? '#0C3A5C' : '#1E293B'}
          stroke-width={edge.width + 4}
          stroke-linecap="round"
          opacity="0.3"
        />
        <path
          d={edge.path}
          fill="none"
          stroke={edge.isActive ? '#0099BB' : '#334155'}
          stroke-width={edge.width}
          stroke-linecap="round"
          opacity={edge.isActive ? 0.85 : 0.35}
        />
        {#if edge.isActive}
          <circle r="3" fill="#00E5FF" opacity="0.9">
            <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${edge.delay}s`}>
              <mpath href={`#p-${edge.id}`} />
            </animateMotion>
          </circle>
        {/if}
        <path id={`p-${edge.id}`} d={edge.path} fill="none" visibility="hidden" />
      </g>
    {/each}

    {#each sortedNodes as node (node.id)}
      <g transform={`translate(${node.x}, ${node.y})`}>
        <rect
          x="0"
          y="0"
          width="70"
          height="45"
          rx="4"
          fill={node.type === 'router' ? '#0F2847' : '#0C1E36'}
          stroke={nc(node.status)}
          stroke-width="1.5"
        />

        {#if node.type === 'router'}
          <circle cx="35" cy="22" r="8" fill="none" stroke={nc(node.status)} stroke-width="1" opacity="0.4" />
          <circle cx="35" cy="22" r="4" fill={nc(node.status)} opacity="0.6" />
        {/if}

        <text
          x="35"
          y="17"
          text-anchor="middle"
          fill={nc(node.status)}
          font-size="10"
          font-family="Orbitron, monospace"
          font-weight="600"
        >
          {node.id}
        </text>

        <text
          x="35"
          y="30"
          text-anchor="middle"
          fill="#94A3B8"
          font-size="8"
        >
          {node.type === 'source' ? '信号源' : node.type === 'target' ? '输出端' : '核心路由'}
        </text>

        <text
          x="35"
          y="56"
          text-anchor="middle"
          fill="#CBD5E1"
          font-size="9"
        >
          {node.label.slice(0, 9)}
        </text>

        <circle
          cx="62"
          cy="8"
          r="3.5"
          fill={nc(node.status)}
        >
          {#if node.status === 'error'}
            <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
          {/if}
        </circle>
      </g>
    {/each}

    <g transform="translate(40, 570)">
      <text x="0" y="0" fill="#64748B" font-size="10" font-family="Orbitron">图例：</text>
      <circle cx="60" cy="-3" r="4" fill="#00E096" />
      <text x="70" y="0" fill="#94A3B8" font-size="10">在线/正常</text>
      <circle cx="140" cy="-3" r="4" fill="#FFB800" />
      <text x="150" y="0" fill="#94A3B8" font-size="10">备机</text>
      <circle cx="200" cy="-3" r="4" fill="#FF3D71" />
      <text x="210" y="0" fill="#94A3B8" font-size="10">故障</text>
      <circle cx="260" cy="-3" r="4" fill="#64748B" />
      <text x="270" y="0" fill="#94A3B8" font-size="10">离线</text>
      <text x="400" y="0" fill="#00E5FF" font-size="10">● 流动粒子 = 活跃数据流</text>
    </g>
  </svg>
</div>
