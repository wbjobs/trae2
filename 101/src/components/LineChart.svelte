<script lang="ts">
  export let data: Array<{ time: string; value: number }>
  export let color: string = '#00E5FF'
  export let height: number = 120

  $: maxValue = data.length > 0 ? Math.max(...data.map((d) => d.value)) * 1.1 : 100
  $: minValue = 0
  $: range = maxValue - minValue || 1

  function mapY(value: number): number {
    return height - ((value - minValue) / range) * (height - 10) - 5
  }

  function mapX(i: number): number {
    if (data.length <= 1) return 150
    return (i / (data.length - 1)) * 290 + 5
  }

  $: pathData = data.length > 1
    ? data.reduce((acc, d, i) => {
        const x = mapX(i)
        const y = mapY(d.value)
        return acc + (i === 0 ? `M${x} ${y}` : `L${x} ${y}`)
      }, '')
    : ''

  $: areaPath = pathData
    ? `${pathData}L${mapX(data.length - 1)} ${height}L5 ${height}Z`
    : ''
</script>

<div class="relative w-full" style="height: {height}px; contain: strict;">
  {#if data.length > 1}
    <svg class="w-full h-full" viewBox="0 0 300 {height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`lg-${color.slice(1)}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color={color} stop-opacity="0.2" />
          <stop offset="100%" stop-color={color} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#lg-${color.slice(1)})`} />
      <path
        d={pathData}
        fill="none"
        stroke={color}
        stroke-width="1.5"
      />
    </svg>
  {/if}
</div>
