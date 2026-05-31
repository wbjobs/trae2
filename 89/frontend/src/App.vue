<template>
  <div class="app-container">
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-icon :size="32" color="#409EFF"><Location /></el-icon>
          <h1>3D GIS 空间地理矢量测绘可视化系统</h1>
        </div>
        <div class="header-right">
          <span class="coord-info">
            经度: {{ mouseCoord.lon.toFixed(6) }} |
            纬度: {{ mouseCoord.lat.toFixed(6) }} |
            高程: {{ mouseCoord.height.toFixed(2) }}m
          </span>
          <el-tag v-if="showPerformancePanel" type="info" class="fps-tag">
            FPS: {{ stats.fps.toFixed(0) }} | 三角面: {{ stats.triangles }}
          </el-tag>
        </div>
      </el-header>

      <el-container>
        <el-aside width="340px" class="sidebar">
          <el-tabs v-model="activeTab" type="border-card">
            <el-tab-pane label="图层控制" name="layers">
              <div class="control-section">
                <h3>矢量图层</h3>
                <div
                  v-for="layer in layerList"
                  :key="layer.id"
                  class="layer-item"
                >
                  <div class="layer-header">
                    <el-checkbox
                      v-model="layer.visible"
                      @change="toggleLayer(layer.id, $event)"
                    >
                      <span :style="{ color: layer.color }">●</span>
                      {{ layer.name }}
                    </el-checkbox>
                    <span class="layer-count">{{ layer.count }}</span>
                  </div>
                  <div class="layer-controls" v-if="layer.visible">
                    <span class="control-label">透明度:</span>
                    <el-slider
                      v-model="layer.opacity"
                      :min="0"
                      :max="1"
                      :step="0.1"
                      @change="setLayerOpacity(layer.id, layer.opacity)"
                      style="width: 120px"
                    />
                    <el-button-group size="small">
                      <el-button @click="isolateLayer(layer.id)" :icon="View" />
                      <el-button @click="zoomToLayer(layer.id)" :icon="ZoomIn" />
                    </el-button-group>
                  </div>
                </div>
                <el-button
                  type="text"
                  size="small"
                  @click="showAllLayers"
                  style="margin-top: 10px"
                >
                  显示全部
                </el-button>
              </div>

              <div class="control-section">
                <h3>显示选项</h3>
                <el-switch v-model="showTerrain" @change="toggleTerrain" active-text="地形">
                  地形
                </el-switch>
                <el-switch v-model="showGrid" @change="toggleGrid" active-text="网格">
                  网格
                </el-switch>
                <el-switch v-model="showAxes" @change="toggleAxes" active-text="坐标轴">
                  坐标轴
                </el-switch>
                <el-switch v-model="enableLOD" @change="toggleLOD" active-text="LOD优化">
                  LOD优化
                </el-switch>
                <el-switch v-model="enableFrustumCulling" @change="toggleFrustumCulling" active-text="视锥剔除">
                  视锥剔除
                </el-switch>
              </div>

              <div class="control-section">
                <h3>性能设置</h3>
                <el-select v-model="qualityLevel" @change="setQualityLevel" style="width: 100%">
                  <el-option label="极致画质" value="ultra" />
                  <el-option label="高清画质" value="high" />
                  <el-option label="均衡画质" value="medium" />
                  <el-option label="性能优先" value="low" />
                </el-select>
                <el-switch v-model="showPerformancePanel" style="margin-top: 10px" active-text="性能面板">
                  性能面板
                </el-switch>
              </div>

              <div class="control-section">
                <h3>数据导入</h3>
                <el-upload
                  :action="''"
                  :show-file-list="false"
                  :before-upload="handleGeoJsonUpload"
                  accept=".geojson,.json"
                >
                  <el-button type="primary" :icon="Upload" style="width: 100%">
                    导入 GeoJSON
                  </el-button>
                </el-upload>
                <el-button
                  type="success"
                  :icon="Refresh"
                  style="width: 100%; margin-top: 10px"
                  @click="loadFromDatabase"
                >
                  从数据库加载
                </el-button>
              </div>

              <div class="control-section">
                <h3>分页加载</h3>
                <el-form label-width="60px" size="small">
                  <el-form-item label="每页数量">
                    <el-input-number v-model="pageSize" :min="10" :max="500" />
                  </el-form-item>
                  <el-form-item label="过滤图层">
                    <el-select v-model="pageFilter.layerName" clearable style="width: 100%">
                      <el-option
                        v-for="layer in layerList"
                        :key="layer.id"
                        :label="layer.name"
                        :value="layer.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="loadPagedData" style="width: 100%">
                      分页加载
                    </el-button>
                  </el-form-item>
                </el-form>
                <div v-if="pageResult" class="page-info">
                  <p>第 {{ pageResult.page + 1 }} / {{ pageResult.totalPages }} 页</p>
                  <p>共 {{ pageResult.totalElements }} 条记录</p>
                  <el-pagination
                    layout="prev, pager, next"
                    :total="pageResult.totalElements"
                    :page-size="pageResult.size"
                    :current-page="pageResult.page + 1"
                    @current-change="goToPage"
                  />
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="地形剖面" name="profile">
              <div class="control-section">
                <h3>剖面分析</h3>
                <el-button
                  :type="profileMode ? 'danger' : 'primary'"
                  :icon="Connection"
                  style="width: 100%"
                  @click="toggleProfileMode"
                >
                  {{ profileMode ? '结束绘制' : '开始剖面分析' }}
                </el-button>
                <p v-if="profileMode" class="tip">
                  在地图上点击两点绘制剖面线
                </p>
              </div>

              <div class="control-section" v-if="profileData && profileData.length > 0">
                <h3>剖面统计</h3>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="水平距离">
                    {{ formatDistance(profileStats.distance) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="垂直高差">
                    {{ formatDistance(profileStats.elevationDiff) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最大高程">
                    {{ profileStats.maxElevation.toFixed(2) }}m
                  </el-descriptions-item>
                  <el-descriptions-item label="最小高程">
                    {{ profileStats.minElevation.toFixed(2) }}m
                  </el-descriptions-item>
                  <el-descriptions-item label="平均高程">
                    {{ profileStats.avgElevation.toFixed(2) }}m
                  </el-descriptions-item>
                  <el-descriptions-item label="平均坡度">
                    {{ profileStats.avgSlope.toFixed(2) }}°
                  </el-descriptions-item>
                </el-descriptions>

                <el-button
                  type="success"
                  :icon="Download"
                  style="width: 100%; margin-top: 15px"
                  @click="exportProfileSvg"
                >
                  导出剖面图 (SVG)
                </el-button>
              </div>

              <div class="control-section">
                <h3>采样设置</h3>
                <el-form label-width="80px" size="small">
                  <el-form-item label="采样点数">
                    <el-input-number v-model="sampleCount" :min="20" :max="500" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane label="测绘工具" name="survey">
              <div class="control-section">
                <h3>距离测量</h3>
                <el-button
                  :type="measureMode === 'distance' ? 'danger' : 'primary'"
                  :icon="Ruler"
                  style="width: 100%"
                  @click="startDistanceMeasure"
                >
                  {{ measureMode === 'distance' ? '测量中...' : '开始测距' }}
                </el-button>
                <p v-if="measureMode === 'distance'" class="tip">
                  点击地图上两点测量距离
                </p>
              </div>

              <div class="control-section">
                <h3>面积测量</h3>
                <el-button
                  :type="measureMode === 'area' ? 'danger' : 'primary'"
                  :icon="Grid"
                  style="width: 100%"
                  @click="startAreaMeasure"
                >
                  {{ measureMode === 'area' ? '测量中...' : '开始测面' }}
                </el-button>
                <el-button
                  v-if="measureMode === 'area'"
                  type="success"
                  :icon="Check"
                  style="width: 100%; margin-top: 10px"
                  @click="completeAreaMeasure"
                  :disabled="measurePoints < 3"
                >
                  完成测量 ({{ measurePoints }}/3+)
                </el-button>
                <p v-if="measureMode === 'area'" class="tip">
                  点击地图至少3个点，然后点击完成
                </p>
              </div>

              <div class="control-section">
                <h3>点位标注</h3>
                <el-button
                  :type="measureMode === 'annotation' ? 'danger' : 'primary'"
                  :icon="Place"
                  style="width: 100%"
                  @click="startAnnotation"
                >
                  {{ measureMode === 'annotation' ? '标注中...' : '添加标注' }}
                </el-button>
                <p v-if="measureMode === 'annotation'" class="tip">
                  点击地图添加标注点
                </p>
              </div>

              <div class="control-section">
                <el-button
                  type="warning"
                  :icon="Close"
                  style="width: 48%"
                  @click="cancelMeasure"
                >
                  取消
                </el-button>
                <el-button
                  type="info"
                  :icon="Delete"
                  style="width: 48%"
                  @click="clearMeasure"
                >
                  清除
                </el-button>
              </div>

              <div class="control-section" v-if="lastMeasureResult">
                <h3>测量结果</h3>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="类型">
                    {{ lastMeasureResult.type === 'distance' ? '距离' : '面积' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="结果">
                    <el-tag type="success" size="large">
                      {{ lastMeasureResult.formatted }}
                    </el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </div>
            </el-tab-pane>

            <el-tab-pane label="坐标转换" name="coordinate">
              <div class="control-section">
                <h3>坐标转换</h3>
                <el-form label-width="80px" size="small">
                  <el-form-item label="源坐标系">
                    <el-select v-model="coordForm.sourceSRID" style="width: 100%">
                      <el-option label="WGS84 (EPSG:4326)" :value="4326" />
                      <el-option label="Web Mercator (EPSG:3857)" :value="3857" />
                      <el-option label="CGCS2000 (EPSG:4490)" :value="4490" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="目标坐标系">
                    <el-select v-model="coordForm.targetSRID" style="width: 100%">
                      <el-option label="WGS84 (EPSG:4326)" :value="4326" />
                      <el-option label="Web Mercator (EPSG:3857)" :value="3857" />
                      <el-option label="CGCS2000 (EPSG:4490)" :value="4490" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="X / 经度">
                    <el-input-number v-model="coordForm.x" :precision="6" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="Y / 纬度">
                    <el-input-number v-model="coordForm.y" :precision="6" style="width: 100%" />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="transformCoordinate" style="width: 100%">
                      转换
                    </el-button>
                  </el-form-item>
                </el-form>

                <div v-if="coordResult" class="result-box">
                  <h4>转换结果:</h4>
                  <p>X: {{ coordResult.x.toFixed(6) }}</p>
                  <p>Y: {{ coordResult.y.toFixed(6) }}</p>
                  <p>SRID: {{ coordResult.srid }}</p>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="属性查询" name="query">
              <div class="control-section">
                <h3>空间查询</h3>
                <el-form label-width="80px" size="small">
                  <el-form-item label="查询半径">
                    <el-input-number v-model="queryRadius" :min="10" :max="50000" style="width: 100%" />
                    <span>米</span>
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="queryByRadius" style="width: 100%">
                      点击地图查询
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>

              <div class="control-section" v-if="queryResults.length > 0">
                <h3>查询结果 ({{ queryResults.length }})</h3>
                <div class="query-results">
                  <el-card
                    v-for="(result, index) in queryResults"
                    :key="index"
                    shadow="hover"
                    style="margin-bottom: 10px"
                    @click="flyToFeature(result)"
                  >
                    <h4>{{ result.name }}</h4>
                    <p>类型: {{ result.type }}</p>
                    <p>图层: {{ result.layerName }}</p>
                    <p v-if="result.properties">
                      {{ JSON.stringify(result.properties) }}
                    </p>
                  </el-card>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-aside>

        <el-main class="main-content">
          <div ref="sceneContainer" class="scene-container"></div>

          <div class="toolbar">
            <el-button-group>
              <el-tooltip content="重置视角">
                <el-button :icon="Refresh" circle @click="resetView" />
              </el-tooltip>
              <el-tooltip content="放大">
                <el-button :icon="ZoomIn" circle @click="zoomIn" />
              </el-tooltip>
              <el-tooltip content="缩小">
                <el-button :icon="ZoomOut" circle @click="zoomOut" />
              </el-tooltip>
              <el-tooltip content="俯视图">
                <el-button :icon="Top" circle @click="setTopView" />
              </el-tooltip>
              <el-tooltip content="正视图">
                <el-button :icon="Front" circle @click="setFrontView" />
              </el-tooltip>
            </el-button-group>
          </div>

          <div v-if="showPerformancePanel" class="performance-panel">
            <div class="perf-title">性能监控</div>
            <div class="perf-item">
              <span class="label">FPS:</span>
              <span :class="getFpsClass(stats.fps)">{{ stats.fps.toFixed(0) }}</span>
            </div>
            <div class="perf-item">
              <span class="label">绘图调用:</span>
              <span>{{ stats.calls }}</span>
            </div>
            <div class="perf-item">
              <span class="label">三角面:</span>
              <span>{{ formatNumber(stats.triangles) }}</span>
            </div>
            <div class="perf-item">
              <span class="label">顶点:</span>
              <span>{{ formatNumber(stats.points) }}</span>
            </div>
            <div class="perf-item">
              <span class="label">纹理:</span>
              <span>{{ stats.textures }}</span>
            </div>
            <div class="perf-item">
              <span class="label">当前画质:</span>
              <el-tag :type="getQualityTagType(stats.quality)" size="small">{{ stats.quality }}</el-tag>
            </div>
            <div class="perf-item">
              <span class="label">LOD层级:</span>
              <span>{{ stats.lodLevel }}</span>
            </div>
          </div>

          <div class="status-bar">
            <span>图层: {{ visibleLayerCount }} | </span>
            <span>对象: {{ totalObjects }} | </span>
            <span>模式: {{ modeText }} | </span>
            <span>LOD: {{ enableLOD ? '开' : '关' }}</span>
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Location, Ruler, Grid, Place, Upload, Refresh, Close, Delete, ZoomIn, ZoomOut, Top, Front, Connection, Download, View, Check } from '@element-plus/icons-vue'
import { Gis3dScene } from './core/Gis3dScene'
import { VectorRenderer } from './core/VectorRenderer'
import { SurveyMeasurement } from './core/SurveyMeasurement'
import { TerrainProfile } from './core/TerrainProfile'
import { parseGeoJson } from './utils/vectorParser'
import { transform, formatDistance, formatArea, wgs84ToLocal } from './utils/coordinateTransform'
import { vectorApi, annotationApi } from './api'

const sceneContainer = ref(null)
const activeTab = ref('layers')

let gisScene = null
let vectorRenderer = null
let surveyMeasurement = null
let terrainProfile = null
let profilePointCount = 0

const mouseCoord = reactive({
  lon: 116.4074,
  lat: 39.9042,
  height: 0
})

const showTerrain = ref(true)
const showGrid = ref(true)
const showAxes = ref(true)
const showPerformancePanel = ref(false)
const enableLOD = ref(true)
const enableFrustumCulling = ref(true)
const qualityLevel = ref('high')
const sampleCount = ref(100)

const layerList = ref([
  { id: 'landmark', name: '地标点', color: '#ff6b6b', count: 0, visible: true, opacity: 1.0 },
  { id: 'road', name: '道路', color: '#feca57', count: 0, visible: true, opacity: 1.0 },
  { id: 'district', name: '行政区', color: '#48dbfb', count: 0, visible: true, opacity: 1.0 },
  { id: 'transport', name: '交通设施', color: '#1dd1a1', count: 0, visible: true, opacity: 1.0 }
])

const profileMode = ref(false)
const profileData = ref([])
const profileStats = reactive({
  distance: 0,
  elevationDiff: 0,
  maxElevation: 0,
  minElevation: 0,
  avgElevation: 0,
  avgSlope: 0
})

const measureMode = ref(null)
const measurePoints = ref(0)
const lastMeasureResult = ref(null)

const coordForm = reactive({
  sourceSRID: 4326,
  targetSRID: 3857,
  x: 116.4074,
  y: 39.9042
})
const coordResult = ref(null)

const queryRadius = ref(1000)
const queryMode = ref(false)
const queryResults = ref([])

const totalObjects = ref(0)

const stats = reactive({
  fps: 0,
  calls: 0,
  triangles: 0,
  points: 0,
  textures: 0,
  quality: 'high',
  lodLevel: 0
})

const pageSize = ref(50)
const pageFilter = reactive({
  layerName: null,
  type: null
})
const pageResult = ref(null)

const visibleLayerCount = computed(() => {
  return layerList.value.filter(l => l.visible).length
})

const modeText = computed(() => {
  if (queryMode.value) return '空间查询'
  if (profileMode.value) return '剖面分析'
  switch (measureMode.value) {
    case 'distance': return '距离测量'
    case 'area': return '面积测量'
    case 'annotation': return '点位标注'
    default: return '浏览'
  }
})

const CENTER_LON = 116.4074
const CENTER_LAT = 39.9042

let statsInterval = null

onMounted(() => {
  initScene()
})

onUnmounted(() => {
  if (statsInterval) {
    clearInterval(statsInterval)
  }
  if (gisScene) {
    gisScene.dispose()
  }
})

function initScene() {
  if (!sceneContainer.value) return

  gisScene = new Gis3dScene(sceneContainer.value, {
    centerLon: CENTER_LON,
    centerLat: CENTER_LAT,
    terrainSize: 4000,
    terrainResolution: 20
  })

  vectorRenderer = new VectorRenderer(gisScene.scene, CENTER_LON, CENTER_LAT)
  surveyMeasurement = new SurveyMeasurement(gisScene.scene, CENTER_LON, CENTER_LAT)
  terrainProfile = new TerrainProfile(gisScene.scene, gisScene.terrainMesh, CENTER_LON, CENTER_LAT)

  gisScene.setOnMouseMove((coord) => {
    mouseCoord.lon = coord.lon
    mouseCoord.lat = coord.lat
    mouseCoord.height = coord.height
  })

  gisScene.setOnClick(handleSceneClick)

  surveyMeasurement.onMeasureComplete = (result) => {
    lastMeasureResult.value = result
    ElMessage.success(`测量完成: ${result.formatted}`)
    measureMode.value = null
    measurePoints.value = 0
  }

  terrainProfile.onProfileComplete = (data) => {
    profileData.value = data
    calculateProfileStats(data)
    profileMode.value = false
    profilePointCount = 0
    ElMessage.success('剖面分析完成')
  }

  statsInterval = setInterval(() => {
    if (gisScene) {
      const sceneStats = gisScene.getStats()
      Object.assign(stats, sceneStats)
    }
  }, 500)

  loadDemoData()
}

function handleSceneClick(coord) {
  if (queryMode.value) {
    executeQuery(coord.lon, coord.lat)
    queryMode.value = false
    return
  }

  if (profileMode.value) {
    handleProfileClick(coord)
    return
  }

  if (measureMode.value === 'annotation') {
    createAnnotation(coord)
    return
  }

  if (surveyMeasurement.isMeasuring) {
    surveyMeasurement.addPoint(coord.point, coord.lon, coord.lat, coord.height)
    measurePoints.value = surveyMeasurement.points.length

    if (measureMode.value === 'distance' && measurePoints.value >= 2) {
      measureMode.value = null
    }
  }
}

function handleProfileClick(coord) {
  profilePointCount++
  terrainProfile.addPoint(coord.point, coord.lon, coord.lat)

  if (profilePointCount >= 2) {
    terrainProfile.complete()
  }
}

function calculateProfileStats(data) {
  const elevations = data.map(d => d.elevation)
  const slopes = data.filter(d => d.slope !== undefined).map(d => d.slope)

  profileStats.distance = data[data.length - 1].distance
  profileStats.maxElevation = Math.max(...elevations)
  profileStats.minElevation = Math.min(...elevations)
  profileStats.elevationDiff = profileStats.maxElevation - profileStats.minElevation
  profileStats.avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length
  profileStats.avgSlope = slopes.length > 0
    ? slopes.reduce((a, b) => a + b, 0) / slopes.length
    : 0
}

function exportProfileSvg() {
  const svgContent = terrainProfile.generateProfileSvg(profileData.value)
  const blob = new Blob([svgContent], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `terrain-profile-${Date.now()}.svg`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('剖面图已导出')
}

function toggleLayer(layerId, visible) {
  if (gisScene && gisScene.layerManager) {
    gisScene.layerManager.setLayerVisible(layerId, visible)
    const layer = layerList.value.find(l => l.id === layerId)
    if (layer) {
      layer.visible = visible
    }
  }
}

function setLayerOpacity(layerId, opacity) {
  if (gisScene && gisScene.layerManager) {
    gisScene.layerManager.setLayerOpacity(layerId, opacity)
  }
}

function isolateLayer(layerId) {
  if (gisScene && gisScene.layerManager) {
    gisScene.layerManager.isolateLayer(layerId)
    layerList.value.forEach(layer => {
      layer.visible = layer.id === layerId
    })
  }
}

function showAllLayers() {
  if (gisScene && gisScene.layerManager) {
    layerList.value.forEach(layer => {
      layer.visible = true
      gisScene.layerManager.setLayerVisible(layer.id, true)
    })
  }
}

function zoomToLayer(layerId) {
  if (gisScene && gisScene.layerManager) {
    const bounds = gisScene.layerManager.getLayerBounds(layerId)
    if (bounds) {
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerZ = (bounds.minZ + bounds.maxZ) / 2
      const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
      gisScene.flyTo(centerX, size * 1.5, centerZ)
    }
  }
}

function toggleTerrain(visible) {
  if (gisScene && gisScene.terrainMesh) {
    gisScene.terrainMesh.visible = visible
  }
}

function toggleGrid(visible) {
  if (gisScene) {
    gisScene.scene.children.forEach(obj => {
      if (obj.type === 'GridHelper') {
        obj.visible = visible
      }
    })
  }
}

function toggleAxes(visible) {
  if (gisScene) {
    gisScene.scene.children.forEach(obj => {
      if (obj.type === 'AxesHelper') {
        obj.visible = visible
      }
    })
  }
}

function toggleLOD(enabled) {
  if (gisScene) {
    gisScene.lodEnabled = enabled
  }
}

function toggleFrustumCulling(enabled) {
  if (gisScene) {
    gisScene.frustumCullingEnabled = enabled
  }
}

function setQualityLevel(level) {
  if (gisScene) {
    gisScene.setQualityLevel(level)
  }
}

const vectorLayers = new Map()

async function loadDemoData() {
  try {
    const geoJson = await vectorApi.getAllAsGeoJson()

    if (geoJson && geoJson.features) {
      loadVectorData(geoJson)
    }
  } catch (e) {
    console.warn('从数据库加载失败，使用内置示例数据')
    loadLocalDemoData()
  }
}

function loadLocalDemoData() {
  const demoGeoJson = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: '天安门广场', layerName: 'landmark', category: 'landmark' }, geometry: { type: 'Point', coordinates: [116.397428, 39.90923] } },
      { type: 'Feature', properties: { name: '故宫博物院', layerName: 'landmark', category: 'tourist' }, geometry: { type: 'Point', coordinates: [116.397029, 39.916325] } },
      { type: 'Feature', properties: { name: '颐和园', layerName: 'landmark', category: 'tourist' }, geometry: { type: 'Point', coordinates: [116.278326, 39.999309] } },
      { type: 'Feature', properties: { name: '鸟巢体育场', layerName: 'landmark', category: 'stadium' }, geometry: { type: 'Point', coordinates: [116.396481, 39.992989] } },
      { type: 'Feature', properties: { name: '水立方', layerName: 'landmark', category: 'stadium' }, geometry: { type: 'Point', coordinates: [116.393863, 39.998546] } },
      { type: 'Feature', properties: { name: '北京西站', layerName: 'transport', category: 'station' }, geometry: { type: 'Point', coordinates: [116.321476, 39.894854] } },
      { type: 'Feature', properties: { name: '首都国际机场', layerName: 'transport', category: 'airport' }, geometry: { type: 'Point', coordinates: [116.603129, 40.075599] } },
      { type: 'Feature', properties: { name: '长安街', layerName: 'road', level: 'main' }, geometry: { type: 'LineString', coordinates: [[116.300000, 39.908823], [116.350000, 39.908823], [116.400000, 39.908823], [116.450000, 39.908823], [116.500000, 39.908823]] } },
      { type: 'Feature', properties: { name: '东城区', layerName: 'district', population: 850000 }, geometry: { type: 'Polygon', coordinates: [[[116.380000, 39.880000], [116.440000, 39.880000], [116.440000, 39.940000], [116.380000, 39.940000], [116.380000, 39.880000]]] } },
      { type: 'Feature', properties: { name: '西城区', layerName: 'district', population: 1100000 }, geometry: { type: 'Polygon', coordinates: [[[116.320000, 39.870000], [116.380000, 39.870000], [116.380000, 39.940000], [116.320000, 39.940000], [116.320000, 39.870000]]] } },
      { type: 'Feature', properties: { name: '海淀区', layerName: 'district', population: 3200000 }, geometry: { type: 'Polygon', coordinates: [[[116.200000, 39.900000], [116.350000, 39.900000], [116.350000, 40.100000], [116.200000, 40.100000], [116.200000, 39.900000]]] } },
      { type: 'Feature', properties: { name: '朝阳区', layerName: 'district', population: 3400000 }, geometry: { type: 'Polygon', coordinates: [[[116.420000, 39.800000], [116.600000, 39.800000], [116.600000, 40.050000], [116.420000, 40.050000], [116.420000, 39.800000]]] } }
    ]
  }

  loadVectorData(demoGeoJson)
}

function loadVectorData(geoJson) {
  const features = parseGeoJson(geoJson, CENTER_LON, CENTER_LAT)

  const layerMap = new Map()
  features.forEach(f => {
    const layerName = f.layerName || 'default'
    if (!layerMap.has(layerName)) {
      layerMap.set(layerName, [])
    }
    layerMap.get(layerName).push(f)
  })

  layerMap.forEach((layerFeatures, layerName) => {
    const objects = vectorRenderer.renderVectorData(layerFeatures, layerName)
    vectorLayers.set(layerName, objects)

    if (gisScene && gisScene.layerManager) {
      gisScene.layerManager.addLayer(layerName, objects, { color: getLayerColor(layerName) })
    } else {
      gisScene.addVectorLayer(layerName, objects)
    }

    const layerConfig = layerList.value.find(l => l.id === layerName)
    if (layerConfig) {
      layerConfig.count = layerFeatures.length
    } else {
      layerList.value.push({
        id: layerName,
        name: layerName,
        color: getLayerColor(layerName),
        count: layerFeatures.length,
        visible: true,
        opacity: 1.0
      })
    }

    totalObjects.value += objects.length
  })

  ElMessage.success(`加载了 ${features.length} 个矢量要素`)
}

function getLayerColor(layerName) {
  const colors = {
    landmark: '#ff6b6b',
    road: '#feca57',
    district: '#48dbfb',
    transport: '#1dd1a1',
    default: '#a29bfe'
  }
  return colors[layerName] || colors.default
}

async function loadFromDatabase() {
  try {
    if (gisScene && gisScene.layerManager) {
      layerList.value.forEach(layer => {
        gisScene.layerManager.removeLayer(layer.id)
      })
    } else {
      vectorLayers.forEach((_, layerId) => {
        gisScene.removeVectorLayer(layerId)
      })
    }
    vectorLayers.clear()
    totalObjects.value = 0

    const geoJson = await vectorApi.getAllAsGeoJson()

    if (geoJson && geoJson.features) {
      loadVectorData(geoJson)
    }
  } catch (e) {
    ElMessage.error('从数据库加载失败: ' + e.message)
  }
}

async function loadPagedData() {
  try {
    const filters = {}
    if (pageFilter.layerName) filters.layerName = pageFilter.layerName
    if (pageFilter.type) filters.type = pageFilter.type

    const result = await vectorApi.getAsGeoJsonWithFiltersPaged(
      filters, 0, pageSize.value, 'id', 'asc'
    )

    pageResult.value = result

    if (result.content) {
      loadVectorData({
        type: 'FeatureCollection',
        features: result.content
      })
    }
  } catch (e) {
    ElMessage.error('分页加载失败: ' + e.message)
  }
}

async function goToPage(page) {
  try {
    const filters = {}
    if (pageFilter.layerName) filters.layerName = pageFilter.layerName
    if (pageFilter.type) filters.type = pageFilter.type

    const result = await vectorApi.getAsGeoJsonWithFiltersPaged(
      filters, page - 1, pageSize.value, 'id', 'asc'
    )

    pageResult.value = result

    if (result.content) {
      loadVectorData({
        type: 'FeatureCollection',
        features: result.content
      })
    }
  } catch (e) {
    ElMessage.error('分页加载失败: ' + e.message)
  }
}

async function handleGeoJsonUpload(file) {
  try {
    const text = await file.text()
    const geoJson = JSON.parse(text)
    loadVectorData(geoJson)
  } catch (e) {
    ElMessage.error('导入失败: ' + e.message)
  }
  return false
}

function toggleProfileMode() {
  cancelMeasure()
  profileMode.value = !profileMode.value
  profilePointCount = 0
  profileData.value = []

  if (profileMode.value) {
    terrainProfile.start()
    ElMessage.info('在地图上点击两点绘制剖面线')
  } else {
    terrainProfile.cancel()
  }
}

function startDistanceMeasure() {
  cancelMeasure()
  measureMode.value = 'distance'
  measurePoints.value = 0
  surveyMeasurement.startDistanceMeasurement()
  ElMessage.info('点击地图上两点测量距离')
}

function startAreaMeasure() {
  cancelMeasure()
  measureMode.value = 'area'
  measurePoints.value = 0
  surveyMeasurement.startAreaMeasurement()
  ElMessage.info('点击地图至少3个点测量面积')
}

function completeAreaMeasure() {
  if (surveyMeasurement) {
    surveyMeasurement.completeAreaMeasurement()
    measureMode.value = null
    measurePoints.value = 0
  }
}

function startAnnotation() {
  cancelMeasure()
  measureMode.value = 'annotation'
  ElMessage.info('点击地图添加标注')
}

function cancelMeasure() {
  if (surveyMeasurement) {
    surveyMeasurement.cancel()
  }
  if (terrainProfile) {
    terrainProfile.cancel()
  }
  measureMode.value = null
  measurePoints.value = 0
  queryMode.value = false
  profileMode.value = false
  profilePointCount = 0
}

function clearMeasure() {
  if (surveyMeasurement) {
    surveyMeasurement.clear()
  }
  if (terrainProfile) {
    terrainProfile.clear()
    profileData.value = []
  }
  lastMeasureResult.value = null
}

function createAnnotation(coord) {
  ElMessageBox.prompt('请输入标注名称:', '添加标注', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /.+/,
    inputErrorMessage: '请输入标注名称'
  }).then(async ({ value }) => {
    if (surveyMeasurement) {
      surveyMeasurement.createAnnotation(coord.point, coord.lon, coord.lat, value, 'info')

      try {
        await annotationApi.createPoint(
          coord.lon, coord.lat, value, 'point',
          { height: coord.height },
          4326
        )
      } catch (e) {
        console.warn('保存标注到数据库失败')
      }

      ElMessage.success('标注已添加')
    }
  }).catch(() => {})
}

function transformCoordinate() {
  const result = transform(
    [coordForm.x, coordForm.y],
    coordForm.sourceSRID,
    coordForm.targetSRID
  )
  coordResult.value = {
    x: result[0],
    y: result[1],
    srid: coordForm.targetSRID
  }
  ElMessage.success('坐标转换完成')
}

function queryByRadius() {
  cancelMeasure()
  queryMode.value = true
  ElMessage.info('点击地图查询周边要素')
}

async function executeQuery(lon, lat) {
  try {
    const results = await vectorApi.getWithin(lon, lat, queryRadius.value, 4326)
    queryResults.value = results || []
    ElMessage.success(`查询到 ${queryResults.value.length} 个结果`)
  } catch (e) {
    ElMessage.error('查询失败')
  }
}

function flyToFeature(feature) {
  if (feature.geometry && feature.geometry.coordinates) {
    const coords = feature.geometry.type === 'Point'
      ? feature.geometry.coordinates
      : feature.geometry.coordinates[0][0]

    const local = wgs84ToLocal(coords[0], coords[1], CENTER_LON, CENTER_LAT)

    if (gisScene) {
      gisScene.flyTo(local.x, 500, local.y)
    }
  }
}

function resetView() {
  if (gisScene) {
    gisScene.camera.position.set(0, 1500, 2000)
    gisScene.controls.target.set(0, 0, 0)
  }
}

function zoomIn() {
  if (gisScene) {
    gisScene.controls.dollyIn(1.5)
  }
}

function zoomOut() {
  if (gisScene) {
    gisScene.controls.dollyOut(1.5)
  }
}

function setTopView() {
  if (gisScene) {
    gisScene.camera.position.set(0, 3000, 0.1)
    gisScene.controls.target.set(0, 0, 0)
  }
}

function setFrontView() {
  if (gisScene) {
    gisScene.camera.position.set(0, 500, 2000)
    gisScene.controls.target.set(0, 0, 0)
  }
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function getFpsClass(fps) {
  if (fps >= 55) return 'fps-good'
  if (fps >= 30) return 'fps-medium'
  return 'fps-bad'
}

function getQualityTagType(quality) {
  const types = {
    ultra: 'danger',
    high: 'success',
    medium: 'warning',
    low: 'info'
  }
  return types[quality] || 'info'
}
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
}

.header {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 60px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.coord-info {
  font-family: 'Consolas', monospace;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.15);
  padding: 8px 15px;
  border-radius: 20px;
}

.fps-tag {
  font-family: 'Consolas', monospace;
}

.sidebar {
  background: #f5f7fa;
  padding: 10px;
  overflow-y: auto;
}

.main-content {
  position: relative;
  padding: 0 !important;
  background: #1a1a2e;
}

.scene-container {
  width: 100%;
  height: 100%;
}

.control-section {
  margin-bottom: 20px;
}

.control-section h3 {
  margin: 10px 0;
  font-size: 14px;
  color: #303133;
  font-weight: 600;
  padding-left: 8px;
  border-left: 3px solid #409eff;
}

.layer-item {
  padding: 8px;
  background: white;
  border-radius: 6px;
  margin-bottom: 8px;
}

.layer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.layer-count {
  color: #909399;
  font-size: 12px;
  font-family: 'Consolas', monospace;
}

.layer-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}

.control-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  padding: 8px;
  background: #ecf5ff;
  border-radius: 4px;
}

.result-box {
  margin-top: 15px;
  padding: 15px;
  background: #f0f9eb;
  border-radius: 8px;
  border: 1px solid #e1f3d8;
}

.result-box h4 {
  margin: 0 0 10px 0;
  color: #67c23a;
}

.result-box p {
  margin: 5px 0;
  font-family: 'Consolas', monospace;
}

.toolbar {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 100;
}

.performance-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  min-width: 160px;
  z-index: 100;
}

.perf-title {
  font-weight: bold;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 13px;
}

.perf-item {
  display: flex;
  justify-content: space-between;
  margin: 6px 0;
}

.perf-item .label {
  color: #909399;
}

.fps-good {
  color: #67c23a;
  font-weight: bold;
}

.fps-medium {
  color: #e6a23c;
  font-weight: bold;
}

.fps-bad {
  color: #f56c6c;
  font-weight: bold;
}

.status-bar {
  position: absolute;
  bottom: 10px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 15px;
  border-radius: 20px;
  font-size: 12px;
  font-family: 'Consolas', monospace;
}

.query-results {
  max-height: 400px;
  overflow-y: auto;
}

.query-results :deep(.el-card) {
  cursor: pointer;
  transition: all 0.3s;
}

.query-results :deep(.el-card:hover) {
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
  transform: translateY(-2px);
}

.query-results h4 {
  margin: 0 0 5px 0;
  color: #409eff;
}

.query-results p {
  margin: 3px 0;
  font-size: 12px;
  color: #606266;
  word-break: break-all;
}

.page-info {
  margin-top: 10px;
  padding: 10px;
  background: #f4f4f5;
  border-radius: 6px;
}

.page-info p {
  margin: 4px 0;
  font-size: 12px;
  color: #606266;
}

:deep(.el-tabs__content) {
  padding: 10px 5px;
}

:deep(.el-switch) {
  display: block;
  margin: 8px 0;
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}

:deep(.el-pagination) {
  margin-top: 10px;
  justify-content: center;
}
</style>
