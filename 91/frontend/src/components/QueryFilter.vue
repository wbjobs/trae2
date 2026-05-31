<template>
  <div class="query-filter">
    <el-form :model="form" inline @submit.prevent>
      <el-form-item label="设备">
        <el-select
          v-model="form.deviceId"
          placeholder="请选择设备"
          clearable
          style="width: 200px"
        >
          <el-option
            v-for="device in devices"
            :key="device.id"
            :label="device.name"
            :value="device.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="时间范围">
        <el-date-picker
          v-model="form.timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 380px"
        />
      </el-form-item>

      <el-form-item label="信令类型">
        <el-select
          v-model="form.signalingTypes"
          multiple
          placeholder="请选择信令类型"
          collapse-tags
          clearable
          style="width: 260px"
        >
          <el-option
            v-for="type in signalingTypes"
            :key="type"
            :label="type"
            :value="type"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="状态">
        <el-select
          v-model="form.status"
          placeholder="全部状态"
          clearable
          style="width: 140px"
        >
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="处理中" value="pending" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSearch" :loading="loading">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import type { Device, SignalingType } from '@/types'

const props = defineProps<{
  devices: Device[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'search', params: any): void
  (e: 'reset'): void
}>()

const signalingTypes: SignalingType[] = ['SIP', 'H.323', 'MGCP', 'MEGACO', 'SCTP', 'Diameter', 'RADIUS', 'Other']

const form = reactive({
  deviceId: '',
  timeRange: [] as string[],
  signalingTypes: [] as SignalingType[],
  status: ''
})

function handleSearch() {
  const params: any = {}
  if (form.deviceId) params.deviceId = form.deviceId
  if (form.timeRange && form.timeRange.length === 2) {
    params.startTime = form.timeRange[0]
    params.endTime = form.timeRange[1]
  }
  if (form.signalingTypes.length > 0) params.signalingTypes = form.signalingTypes
  if (form.status) params.status = form.status
  emit('search', params)
}

function handleReset() {
  form.deviceId = ''
  form.timeRange = []
  form.signalingTypes = []
  form.status = ''
  emit('reset')
}

watch(
  () => props.devices,
  (newDevices) => {
    if (newDevices.length > 0 && !form.deviceId) {
      // 默认不选中，保持为空
    }
  }
)
</script>

<style scoped>
.query-filter {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  color: #8b9aae;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper),
:deep(.el-date-editor) {
  background-color: #001e36;
  border-color: #1f2d3d;
  box-shadow: none;
}

:deep(.el-input__wrapper:hover),
:deep(.el-select__wrapper:hover),
:deep(.el-date-editor:hover) {
  border-color: #409eff;
}

:deep(.el-input__inner),
:deep(.el-select__placeholder) {
  color: #b9c0cc;
}

:deep(.el-input__placeholder) {
  color: #5a6a7d;
}

:deep(.el-date-editor .el-range-separator) {
  color: #8b9aae;
}
</style>
