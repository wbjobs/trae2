<template>
  <div class="schedule-page">
    <div class="page-header mb-6">
      <h1 class="text-2xl font-bold text-text-primary mb-2">定时任务调度</h1>
      <p class="text-text-secondary">配置采集任务的自动启停时间规则</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card p-5">
        <h2 class="text-lg font-semibold text-text-primary mb-4">调度配置</h2>

        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 bg-bg-secondary rounded-lg">
            <div>
              <div class="text-text-primary font-medium">启用定时调度</div>
              <div class="text-sm text-text-secondary mt-1">按计划自动启停采集任务</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" v-model="schedule.enabled" @change="saveSchedule" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div>
            <label class="form-label">开始时间</label>
            <input
              v-model="schedule.start_time"
              type="time"
              class="form-input"
              :disabled="!schedule.enabled"
              @change="saveSchedule"
            />
          </div>

          <div>
            <label class="form-label">停止时间</label>
            <input
              v-model="schedule.stop_time"
              type="time"
              class="form-input"
              :disabled="!schedule.enabled"
              @change="saveSchedule"
            />
          </div>

          <div>
            <label class="form-label">生效日期</label>
            <div class="grid grid-cols-7 gap-2 mt-2">
              <button
                v-for="(day, idx) in weekdays"
                :key="idx"
                class="px-2 py-2 rounded-lg text-sm font-medium transition-all"
                :class="{
                  'bg-primary text-white': schedule.weekdays.includes(idx),
                  'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary': !schedule.weekdays.includes(idx)
                }"
                :disabled="!schedule.enabled"
                @click="toggleWeekday(idx)"
              >
                {{ day }}
              </button>
            </div>
          </div>

          <div>
            <label class="form-label">采集间隔 (毫秒)</label>
            <input
              v-model.number="schedule.interval_ms"
              type="number"
              min="1000"
              max="60000"
              step="1000"
              class="form-input"
              :disabled="!schedule.enabled"
              @change="saveSchedule"
            />
            <p class="text-xs text-text-secondary mt-1">建议 1000-60000ms</p>
          </div>
        </div>
      </div>

      <div>
        <div class="card p-5 mb-6">
          <h2 class="text-lg font-semibold text-text-primary mb-4">调度状态</h2>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">调度状态</span>
              <span class="status-badge" :class="schedule.enabled ? 'status-success' : 'status-info'">
                {{ schedule.enabled ? '已启用' : '已禁用' }}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-text-secondary">采集状态</span>
              <span class="status-badge" :class="hardwareStore.isCollecting ? 'status-warning' : 'status-info'">
                {{ hardwareStore.isCollecting ? '采集中' : '已停止' }}
              </span>
            </div>

            <div v-if="schedule.enabled" class="flex items-center justify-between">
              <span class="text-text-secondary">计划运行时段</span>
              <span class="text-text-primary font-medium">{{ schedule.start_time }} - {{ schedule.stop_time }}</span>
            </div>

            <div v-if="schedule.enabled" class="flex items-center justify-between">
              <span class="text-text-secondary">生效日</span>
              <span class="text-text-primary font-medium">{{ formatWeekdays(schedule.weekdays) }}</span>
            </div>

            <div v-if="nextAction" class="flex items-center justify-between">
              <span class="text-text-secondary">下次操作</span>
              <span class="text-primary font-medium">{{ nextAction }}</span>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <h2 class="text-lg font-semibold text-text-primary mb-4">手动控制</h2>
          <div class="space-y-3">
            <button
              class="btn btn-primary w-full"
              :disabled="hardwareStore.isCollecting"
              @click="startCollection"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              立即开始采集
            </button>
            <button
              class="btn btn-secondary w-full"
              :disabled="!hardwareStore.isCollecting"
              @click="stopCollection"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              立即停止采集
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-5 mt-6">
      <h2 class="text-lg font-semibold text-text-primary mb-4">调度日志</h2>
      <div v-if="scheduleLog.length === 0" class="text-center py-8 text-text-secondary">
        暂无调度日志
      </div>
      <div v-else class="space-y-2 max-h-60 overflow-y-auto">
        <div
          v-for="(log, idx) in scheduleLog.slice(-20).reverse()"
          :key="idx"
          class="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg"
        >
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="log.action === 'start' ? 'bg-success' : 'bg-error'"
          ></span>
          <span class="text-sm text-text-secondary">{{ log.time }}</span>
          <span class="text-sm text-text-primary font-medium">
            {{ log.action === 'start' ? '开始采集' : '停止采集' }}
          </span>
          <span class="text-xs text-text-secondary">{{ log.source }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useHardwareStore } from '@/stores/hardware'
import { useAppStore } from '@/stores/app'
import type { ScheduleConfig } from '@/types'

const hardwareStore = useHardwareStore()
const appStore = useAppStore()

const weekdays = ['一', '二', '三', '四', '五', '六', '日']

const schedule = reactive<ScheduleConfig>({
  enabled: false,
  start_time: '08:00',
  stop_time: '20:00',
  weekdays: [0, 1, 2, 3, 4],
  interval_ms: 5000,
})

const scheduleLog = ref<Array<{ time: string; action: 'start' | 'stop'; source: string }>>([])
let schedulerTimer: number | null = null

const nextAction = computed(() => {
  if (!schedule.enabled) return null
  const now = new Date()
  const [startH, startM] = schedule.start_time.split(':').map(Number)
  const [stopH, stopM] = schedule.stop_time.split(':').map(Number)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const stopMinutes = stopH * 60 + stopM

  if (nowMinutes < startMinutes) {
    return `今天 ${schedule.start_time} 开始`
  } else if (nowMinutes < stopMinutes) {
    return `今天 ${schedule.stop_time} 停止`
  } else {
    return `明天 ${schedule.start_time} 开始`
  }
})

onMounted(() => {
  loadSchedule()
  schedulerTimer = window.setInterval(checkSchedule, 30000)
})

onUnmounted(() => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
  }
})

function loadSchedule() {
  try {
    const saved = localStorage.getItem('schedule-config')
    if (saved) {
      const parsed = JSON.parse(saved)
      Object.assign(schedule, parsed)
      if (schedule.enabled) {
        checkSchedule()
      }
    }
  } catch (error) {
    console.error('Load schedule error:', error)
  }
}

function saveSchedule() {
  try {
    localStorage.setItem('schedule-config', JSON.stringify(schedule))
    appStore.success('调度配置已保存')
  } catch (error) {
    appStore.error('保存调度配置失败')
  }
}

function toggleWeekday(idx: number) {
  const pos = schedule.weekdays.indexOf(idx)
  if (pos >= 0) {
    schedule.weekdays.splice(pos, 1)
  } else {
    schedule.weekdays.push(idx)
  }
  schedule.weekdays.sort()
  saveSchedule()
}

function checkSchedule() {
  if (!schedule.enabled) return

  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7

  if (!schedule.weekdays.includes(dayOfWeek)) return

  const [startH, startM] = schedule.start_time.split(':').map(Number)
  const [stopH, stopM] = schedule.stop_time.split(':').map(Number)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const stopMinutes = stopH * 60 + stopM

  const inScheduleWindow = nowMinutes >= startMinutes && nowMinutes < stopMinutes

  if (inScheduleWindow && !hardwareStore.isCollecting) {
    hardwareStore.startAutoCollect(schedule.interval_ms)
    addLog('start', '定时调度')
  } else if (!inScheduleWindow && hardwareStore.isCollecting) {
    hardwareStore.stopAutoCollect()
    addLog('stop', '定时调度')
  }
}

function startCollection() {
  hardwareStore.startAutoCollect(schedule.interval_ms)
  addLog('start', '手动')
  appStore.success('采集已开始')
}

function stopCollection() {
  hardwareStore.stopAutoCollect()
  addLog('stop', '手动')
  appStore.info('采集已停止')
}

function addLog(action: 'start' | 'stop', source: string) {
  scheduleLog.value.push({
    time: new Date().toLocaleString('zh-CN'),
    action,
    source,
  })
}

function formatWeekdays(days: number[]): string {
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  return days.map(d => names[d]).join('、')
}
</script>

<style scoped>
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-tertiary, #2d3748);
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--primary, #6366f1);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(22px);
}
</style>
