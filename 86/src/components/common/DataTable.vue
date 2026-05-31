<template>
  <div class="data-table">
    <div v-if="title" class="card-header mb-4">
      <h3 class="card-title">{{ title }}</h3>
      <slot name="actions"></slot>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b" :style="{ borderColor: 'var(--border-color)' }">
            <th
              v-for="column in columns"
              :key="column.key"
              class="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"
              :style="{ color: 'var(--text-muted)' }"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="index"
            class="border-b transition-colors hover:bg-hover"
            :style="{ borderColor: 'var(--border-color)' }"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              class="py-3 px-4 text-sm"
              :style="{ color: 'var(--text-secondary)' }"
            >
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ formatValue(row[column.key], column) }}
              </slot>
            </td>
          </tr>
          <tr v-if="data.length === 0">
            <td
              :colspan="columns.length"
              class="py-8 text-center text-muted"
            >
              暂无数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHardwareStore } from '@/stores/hardware'

const props = defineProps<{
  title?: string
  columns: Array<{
    key: string
    label: string
    format?: 'bytes' | 'percentage' | 'number' | 'date' | 'status'
  }>
  data: any[]
}>()

const hardwareStore = useHardwareStore()

function formatValue(value: any, column: any): string {
  if (value === null || value === undefined) return '-'

  switch (column.format) {
    case 'bytes':
      return hardwareStore.formatBytes(value as number)
    case 'percentage':
      return `${(value as number).toFixed(1)}%`
    case 'number':
      return (value as number).toLocaleString()
    case 'date':
      return new Date(value as string).toLocaleString()
    case 'status':
      return value
    default:
      return String(value)
  }
}
</script>

<style scoped>
.data-table {
  background: var(--bg-card);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--border-color);
  padding: 20px;
}

tr:hover {
  background: rgba(74, 158, 255, 0.05);
}
</style>
