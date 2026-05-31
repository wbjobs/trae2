<template>
  <div ref="chartRef" :style="{ width, height }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = defineProps<{
  option: EChartsOption
  width?: string
  height?: string
  theme?: 'dark' | 'light'
}>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

const defaultOption: EChartsOption = {
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0, 21, 41, 0.9)',
    borderColor: '#1f2d3d',
    textStyle: {
      color: '#b9c0cc'
    },
    axisPointer: {
      lineStyle: {
        color: '#409eff'
      }
    }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '10%',
    containLabel: true
  }
}

function initChart() {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value, props.theme || 'dark')
  updateChart()
}

function updateChart() {
  if (!chartInstance) return

  const mergedOption = {
    ...defaultOption,
    ...props.option
  }

  chartInstance.setOption(mergedOption, true)
}

function handleResize() {
  chartInstance?.resize()
}

watch(
  () => props.option,
  () => {
    nextTick(() => updateChart())
  },
  { deep: true }
)

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})

defineExpose({
  resize: handleResize
})
</script>

<script lang="ts">
export type { EChartsOption } from 'echarts'
</script>
