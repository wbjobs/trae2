<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">资源分布热力图</h1>
      <div>
        <el-select
          v-model="filters.classification_id"
          placeholder="选择分类筛选"
          clearable
          style="width: 200px; margin-right: 12px"
          @change="loadHeatmapData"
        >
          <el-option
            v-for="c in classificationOptions"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
        <el-button type="primary" @click="loadHeatmapData">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">有位置信息的资源</div>
          <div class="stat-value">{{ stats.total_with_location || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">热力图区域数</div>
          <div class="stat-value">{{ stats.total_heat_points || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">最大密度</div>
          <div class="stat-value highlight">{{ stats.max_density || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">平均密度</div>
          <div class="stat-value">{{ stats.avg_density || 0 }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="16">
        <el-card shadow="never" class="map-card">
          <template #header>
            <span class="section-title">地理分布热力图</span>
          </template>
          <div class="map-container">
            <div ref="mapRef" class="map"></div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="density-card">
          <template #header>
            <span class="section-title">密度分布 TOP 20</span>
          </template>
          <div class="density-list">
            <div
              v-for="(item, index) in topDensityAreas"
              :key="index"
              class="density-item"
            >
              <div class="density-rank">{{ index + 1 }}</div>
              <div class="density-info">
                <div class="density-coords">
                  [{{ item.lat.toFixed(1) }}, {{ item.lng.toFixed(1) }}]
                </div>
                <div class="density-tags">
                  <el-tag
                    v-for="cls in item.classifications.slice(0, 2)"
                    :key="cls"
                    size="small"
                    type="success"
                    effect="light"
                  >
                    {{ cls }}
                  </el-tag>
                </div>
              </div>
              <div class="density-count">
                <el-tag :type="getDensityTagType(item.count)" size="small">
                  {{ item.count }} 个
                </el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="region-card" style="margin-top: 16px">
      <template #header>
        <span class="section-title">按来源地区分布</span>
      </template>
      <el-table :data="regionData" stripe size="small" max-height="400">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="region" label="来源地区" />
        <el-table-column prop="count" label="资源数量" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.count > 5 ? 'success' : 'info'" size="small">
              {{ row.count }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="classification_count" label="涉及分类" width="100" align="center" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '@/api'

const mapRef = ref(null)
let map = null
let heatmapLayer = null

const classificationOptions = ref([])
const filters = ref({ classification_id: null })
const stats = ref({})
const topDensityAreas = ref([])
const regionData = ref([])

function getDensityTagType(count) {
  if (count >= 10) return 'danger'
  if (count >= 5) return 'warning'
  return 'success'
}

async function loadClassifications() {
  try {
    const res = await api.classification.flat()
    classificationOptions.value = res.data || []
  } catch (e) {
    console.error(e)
  }
}

async function loadHeatmapData() {
  try {
    const params = {}
    if (filters.value.classification_id) {
      params.classification_id = filters.value.classification_id
    }

    const [heatmapRes, regionRes] = await Promise.all([
      api.analytics.distributionHeatmap(params),
      api.analytics.distributionByRegion()
    ])

    stats.value = heatmapRes.data.stats || {}
    topDensityAreas.value = (heatmapRes.data.heatmap || []).slice(0, 20)
    regionData.value = regionRes.data || []

    updateHeatmap(heatmapRes.data.heatmap || [], heatmapRes.data.raw_points || [])
  } catch (e) {
    console.error(e)
  }
}

function initMap() {
  if (!mapRef.value) return

  map = new window.L.map(mapRef.value, {
    center: [35.8617, 104.1954],
    zoom: 4,
    minZoom: 3,
    maxZoom: 18
  })

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)

  heatmapLayer = window.L.heatLayer([], {
    radius: 25,
    blur: 15,
    maxZoom: 10,
    max: 1.0,
    gradient: {
      0.2: 'blue',
      0.4: 'cyan',
      0.6: 'lime',
      0.8: 'yellow',
      1.0: 'red'
    }
  }).addTo(map)
}

function updateHeatmap(heatmapData, rawPoints) {
  if (!map || !heatmapLayer) return

  const maxCount = heatmapData.length > 0 ? heatmapData[0].count : 1
  const heatPoints = heatmapData.map(item => [
    item.lat,
    item.lng,
    item.count / maxCount
  ])

  heatmapLayer.setLatLngs(heatPoints)

  rawPoints.forEach(point => {
    if (point.origin_latitude && point.origin_longitude) {
      const marker = window.L.circleMarker(
        [point.origin_latitude, point.origin_longitude],
        {
          radius: 5,
          fillColor: '#409eff',
          color: '#fff',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.6
        }
      ).addTo(map)

      marker.bindPopup(`
        <div style="font-size: 12px">
          <strong>${point.resource_no || ''}</strong><br/>
          ${point.name || ''}<br/>
          ${point.origin || ''}<br/>
          <small>${point.classification_name || '未分类'}</small>
        </div>
      `)
    }
  })

  if (rawPoints.length > 0 && rawPoints[0].origin_latitude) {
    const bounds = rawPoints
      .filter(p => p.origin_latitude && p.origin_longitude)
      .map(p => [p.origin_latitude, p.origin_longitude])
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }
}

function loadLeafletScript() {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve()
      return
    }

    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet'
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(cssLink)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const heatScript = document.createElement('script')
      heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
      heatScript.onload = resolve
      heatScript.onerror = reject
      document.head.appendChild(heatScript)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  await loadLeafletScript()
  initMap()
  loadClassifications()
  loadHeatmapData()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.stat-value.highlight {
  color: #f56c6c;
}

.map-card {
  min-height: 500px;
}

.map-container {
  width: 100%;
  height: 500px;
  border-radius: 4px;
  overflow: hidden;
}

.map {
  width: 100%;
  height: 100%;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.density-card {
  max-height: 550px;
}

.density-list {
  max-height: 460px;
  overflow-y: auto;
}

.density-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
}

.density-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  margin-right: 12px;
  flex-shrink: 0;
}

.density-item:nth-child(1) .density-rank { background: #f56c6c; }
.density-item:nth-child(2) .density-rank { background: #e6a23c; }
.density-item:nth-child(3) .density-rank { background: #67c23a; }

.density-info {
  flex: 1;
  min-width: 0;
}

.density-coords {
  font-size: 13px;
  color: #303133;
  font-family: 'Consolas', monospace;
  margin-bottom: 4px;
}

.density-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.density-count {
  flex-shrink: 0;
}

.region-card {
  margin-top: 16px;
}
</style>
