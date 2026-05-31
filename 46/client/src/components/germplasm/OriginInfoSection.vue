<template>
  <el-card shadow="never" class="form-card">
    <template #header>
      <span class="section-title"><el-icon><Location /></el-icon> 来源信息</span>
    </template>
    <el-row :gutter="24">
      <el-col :span="12">
        <el-form-item label="来源地">
          <el-input v-model="form.origin" placeholder="请输入来源地" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="采集年份">
          <el-input-number v-model="form.year_collected" :min="1900" :max="2100" style="width:100%" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="采集人">
          <el-input v-model="form.collector" placeholder="请输入采集人" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="纬度">
          <el-input v-model="form.origin_latitude" placeholder="纬度" clearable />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="经度">
          <el-input v-model="form.origin_longitude" placeholder="经度" clearable />
        </el-form-item>
      </el-col>
      <el-col :span="24">
        <el-form-item label="来源地址">
          <el-input v-model="form.origin_address" placeholder="请输入详细地址或点击地图定位" />
        </el-form-item>
      </el-col>
      <el-col :span="24">
        <el-form-item label="地理定位">
          <div style="display:flex;gap:12px;align-items:center;">
            <el-input v-model="geoAddress" placeholder="输入地址搜索地理位置" style="flex:1" />
            <el-button type="primary" @click="searchLocation" :loading="geoLoading">
              <el-icon><Search /></el-icon> 搜索
            </el-button>
            <el-button @click="useCurrentLocation" :loading="locateLoading">
              <el-icon><Location /></el-icon> 获取当前位置
            </el-button>
          </div>
          <div v-if="geoResults.length" style="margin-top:12px;">
            <el-radio-group v-model="selectedGeoIndex" @change="applyGeoResult">
              <el-radio
                v-for="(r, idx) in geoResults"
                :key="idx"
                :label="idx"
                style="display:block;margin-bottom:8px;"
              >
                {{ r.display_name }}
                <span style="color:#909399;font-size:12px;margin-left:8px;">
                  [{{ r.latitude }}, {{ r.longitude }}]
                </span>
              </el-radio>
            </el-radio-group>
          </div>
        </el-form-item>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'

const props = defineProps({
  form: { type: Object, required: true }
})

const geoAddress = ref('')
const geoLoading = ref(false)
const locateLoading = ref(false)
const geoResults = ref([])
const selectedGeoIndex = ref(null)

async function searchLocation() {
  if (!geoAddress.value.trim()) return
  geoLoading.value = true
  try {
    const res = await api.geolocation.search({ q: geoAddress.value, limit: 5 })
    geoResults.value = res.data || []
    if (geoResults.value.length === 0) {
      ElMessage.info('未找到匹配的地址')
    }
  } catch (e) {
    console.error(e)
  } finally {
    geoLoading.value = false
  }
}

function applyGeoResult(idx) {
  const r = geoResults.value[idx]
  if (r) {
    props.form.origin_latitude = r.latitude
    props.form.origin_longitude = r.longitude
    props.form.origin_address = r.display_name
    props.form.origin = r.address?.state || r.address?.country || ''
  }
}

function useCurrentLocation() {
  locateLoading.value = true
  if (!navigator.geolocation) {
    ElMessage.error('浏览器不支持地理定位')
    locateLoading.value = false
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      props.form.origin_latitude = lat
      props.form.origin_longitude = lng
      try {
        const res = await api.geolocation.reverse({ lat, lng })
        props.form.origin_address = res.data?.display_name || ''
      } catch (e) { console.error(e) }
      locateLoading.value = false
    },
    () => {
      ElMessage.error('获取当前位置失败')
      locateLoading.value = false
    },
    { timeout: 10000 }
  )
}
</script>

<style scoped>
.form-card {
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
