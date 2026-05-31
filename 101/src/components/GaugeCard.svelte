<script lang="ts">
  export let title: string
  export let value: number
  export let unit: string = ''
  export let color: string = 'cyan'
  export let max: number = 100

  $: percentage = Math.min(100, (value / max) * 100)
  $: strokeDasharray = 2 * Math.PI * 45
  $: strokeDashoffset = strokeDasharray * (1 - percentage / 100)
  $: colorClass = color === 'cyan' ? '#00E5FF' : color === 'green' ? '#00E096' : color === 'yellow' ? '#FFB800' : '#FF3D71'
</script>

<div class="glow-panel p-4 text-center">
  <div class="relative inline-block w-24 h-24">
    <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#1A3A5C"
        stroke-width="6"
      />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke={colorClass}
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray={strokeDasharray}
        stroke-dashoffset={strokeDashoffset}
        style="filter: drop-shadow(0 0 4px {colorClass}); transition: stroke-dashoffset 0.5s ease-out;"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="data-value text-lg">{value.toFixed(1)}</span>
      <span class="text-xs text-gray-500">{unit}</span>
    </div>
  </div>
  <div class="label-text mt-2">{title}</div>
</div>
