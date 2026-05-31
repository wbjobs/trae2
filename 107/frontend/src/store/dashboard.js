import { defineStore } from 'pinia'
import { ref } from 'vue'
import dayjs from 'dayjs'

export const useDashboardStore = defineStore('dashboard', () => {
  const timeRange = ref({
    start: dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD')
  })

  const selectedStation = ref('all')

  const stats = ref({
    totalPower: 0,
    todayPower: 0,
    efficiency: 0,
    lossRate: 0,
    onlineRate: 0,
    faultCount: 0
  })

  const powerTrend = ref([])
  const faultDistribution = ref([])
  const deviceStatus = ref([])
  const lossAnalysis = ref([])
  const inverterData = ref([])
  const panelData = ref([])

  const yoyMomData = ref({
    yoy: { current: 0, previous: 0, changeValue: 0, changeRate: 0, details: [] },
    mom: { current: 0, previous: 0, changeValue: 0, changeRate: 0, details: [] }
  })
  const faultGeoData = ref([])
  const currentLayout = ref(null)
  const savedLayouts = ref([])

  const loading = ref(false)

  const setTimeRange = (start, end) => {
    timeRange.value = { start, end }
  }

  const setSelectedStation = (station) => {
    selectedStation.value = station
  }

  const updateStats = (data) => {
    stats.value = { ...stats.value, ...data }
  }

  const updateYoYMoM = (data) => {
    yoyMomData.value = { ...yoyMomData.value, ...data }
  }

  const updateFaultGeo = (data) => {
    faultGeoData.value = data
  }

  const setCurrentLayout = (layout) => {
    currentLayout.value = layout
  }

  const setSavedLayouts = (layouts) => {
    savedLayouts.value = layouts
  }

  return {
    timeRange,
    selectedStation,
    stats,
    powerTrend,
    faultDistribution,
    deviceStatus,
    lossAnalysis,
    inverterData,
    panelData,
    yoyMomData,
    faultGeoData,
    currentLayout,
    savedLayouts,
    loading,
    setTimeRange,
    setSelectedStation,
    updateStats,
    updateYoYMoM,
    updateFaultGeo,
    setCurrentLayout,
    setSavedLayouts
  }
})
