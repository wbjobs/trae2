<template>
  <div class="dashboard">
    <div class="stat-cards">
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="stat-card stat-blue">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">可用仪器</p>
                <p class="stat-value">{{ stats.availableInstruments }}</p>
                <p class="stat-change">
                  <i class="el-icon-top"></i> 较上周 +5%
                </p>
              </div>
              <div class="stat-icon">
                <i class="el-icon-microphone"></i>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card stat-green">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">待处理预约</p>
                <p class="stat-value">{{ stats.pendingReservations }}</p>
                <p class="stat-change">
                  <i class="el-icon-time"></i> {{ stats.pendingToday }} 个今日待办
                </p>
              </div>
              <div class="stat-icon">
                <i class="el-icon-document"></i>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card stat-orange">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">本月使用时长</p>
                <p class="stat-value">{{ stats.monthlyUsage }}h</p>
                <p class="stat-change">
                  <i class="el-icon-top"></i> 较上月 +12%
                </p>
              </div>
              <div class="stat-icon">
                <i class="el-icon-timer"></i>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card stat-purple">
            <div class="stat-content">
              <div class="stat-info">
                <p class="stat-label">文件总数</p>
                <p class="stat-value">{{ stats.totalFiles }}</p>
                <p class="stat-change">
                  <i class="el-icon-document"></i> 本月新增 {{ stats.newFiles }} 个
                </p>
              </div>
              <div class="stat-icon">
                <i class="el-icon-folder-opened"></i>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <el-row :gutter="20" class="content-row">
      <el-col :span="16">
        <div class="card-container">
          <div class="card-header">
            <h3>仪器使用率统计</h3>
            <el-radio-group v-model="chartPeriod" size="small" @change="fetchChartData">
              <el-radio-button label="week">本周</el-radio-button>
              <el-radio-button label="month">本月</el-radio-button>
              <el-radio-button label="year">全年</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="chartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="card-container">
          <div class="card-header">
            <h3>我的预约</h3>
            <el-button type="text" @click="$router.push('/my-reservations')">查看全部</el-button>
          </div>
          <div class="reservation-list">
            <div v-for="item in myReservations" :key="item.id" class="reservation-item">
              <div class="item-header">
                <span class="item-title">{{ item.instrument_name }}</span>
                <el-tag :type="getStatusType(item.status)" size="small">
                  {{ item.status | reservationStatusFilter }}
                </el-tag>
              </div>
              <div class="item-time">
                <i class="el-icon-time"></i>
                {{ formatDate(item.start_time) }} {{ formatTime(item.start_time, 'HH:mm') }}-{{ formatTime(item.end_time, 'HH:mm') }}
              </div>
            </div>
            <el-empty v-if="myReservations.length === 0" description="暂无预约" :image-size="80" />
          </div>
        </div>
        <div class="card-container mt20">
          <div class="card-header">
            <h3>最新通知</h3>
          </div>
          <div class="notification-list">
            <div v-for="item in latestNotifications" :key="item.id" class="notification-item">
              <div class="item-dot" :class="{ unread: !item.is_read }"></div>
              <div class="item-content">
                <p class="item-title">{{ item.title }}</p>
                <p class="item-time">{{ formatTime(item.created_at) }}</p>
              </div>
            </div>
            <el-empty v-if="latestNotifications.length === 0" description="暂无通知" :image-size="80" />
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="content-row">
      <el-col :span="24">
        <div class="card-container">
          <div class="card-header">
            <h3>仪器状态概览</h3>
          </div>
          <div class="instruments-grid">
            <div
              v-for="item in instruments"
              :key="item.id"
              class="instrument-card"
              @click="goToCalendar(item.id)"
            >
              <div class="instrument-avatar">
                <i class="el-icon-microphone"></i>
              </div>
              <div class="instrument-info">
                <h4 class="instrument-name">{{ item.name }}</h4>
                <p class="instrument-model">{{ item.model }}</p>
              </div>
              <div class="instrument-status">
                <span class="status-dot" :class="item.status"></span>
                <span>{{ item.status | instrumentStatusFilter }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, onMounted, ref, reactive, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getInstrumentList } from '@/api/instrument'
import { getReservationList } from '@/api/reservation'
import { getNotificationList } from '@/api/notification'
import { formatTime, formatDate } from '@/utils'

export default defineComponent({
  name: 'Dashboard',
  filters: {
    reservationStatusFilter(status: string) {
      const statusMap: Record<string, string> = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已拒绝',
        cancelled: '已取消',
        completed: '已完成',
        in_progress: '进行中',
      }
      return statusMap[status] || status
    },
    instrumentStatusFilter(status: string) {
      const statusMap: Record<string, string> = {
        available: '可用',
        in_use: '使用中',
        maintenance: '维护中',
        unavailable: '不可用',
      }
      return statusMap[status] || status
    },
  },
  setup() {
    const chartRef = ref<HTMLElement | null>(null)
    const chartPeriod = ref('week')
    const chartInstance = ref<echarts.ECharts | null>(null)

    const stats = reactive({
      availableInstruments: 0,
      pendingReservations: 0,
      monthlyUsage: 0,
      totalFiles: 0,
      pendingToday: 0,
      newFiles: 0,
    })

    const myReservations = ref<any[]>([])
    const latestNotifications = ref<any[]>([])
    const instruments = ref<any[]>([])

    const mockInstruments = [
      { id: '1', name: '扫描电子显微镜', model: 'Hitachi SU8010', status: 'available' },
      { id: '2', name: '透射电子显微镜', model: 'FEI Tecnai G2', status: 'in_use' },
      { id: '3', name: 'X射线衍射仪', model: 'Bruker D8', status: 'available' },
      { id: '4', name: '核磁共振仪', model: 'Bruker 400MHz', status: 'maintenance' },
      { id: '5', name: '紫外可见分光光度计', model: 'Shimadzu UV-2600', status: 'available' },
      { id: '6', name: '傅里叶变换红外光谱仪', model: 'Thermo Nicolet iS50', status: 'available' },
    ]

    return {
      chartRef,
      chartPeriod,
      stats,
      myReservations,
      latestNotifications,
      instruments,
      mockInstruments,
      formatTime,
      formatDate,
      chartInstance,
    }
  },
  data() {
    return {
      loading: false,
    }
  },
  mounted() {
    this.loadDashboardData()
    this.initChart()
    window.addEventListener('resize', this.handleResize)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.handleResize)
    if (this.chartInstance) {
      this.chartInstance.dispose()
    }
  },
  methods: {
    getStatusType(status: string) {
      const typeMap: Record<string, string> = {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger',
        cancelled: 'info',
        completed: 'success',
        in_progress: 'primary',
      }
      return typeMap[status] || 'info'
    },
    goToCalendar(id: string) {
      this.$router.push(`/instruments/${id}/calendar')
    },
    handleResize() {
      this.chartInstance?.resize()
    },
    async loadDashboardData() {
      this.stats.availableInstruments = 15
      this.stats.pendingReservations = 8
      this.stats.monthlyUsage = 248
      this.stats.totalFiles = 328
      this.stats.pendingToday = 3
      this.stats.newFiles = 42

      this.instruments = this.mockInstruments

      try {
        const res1: any = await getReservationList({ page_size: 5 })
        this.myReservations = res1.data?.items || []

        const res2: any = await getNotificationList({ page_size: 5, is_read: false })
        this.latestNotifications = res2.data?.items || []
      } catch (e) {
        this.myReservations = [
          {
            id: '1',
            instrument_name: '扫描电子显微镜',
            status: 'approved',
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 3600000).toISOString(),
          },
          {
            id: '2',
            instrument_name: 'X射线衍射仪',
            status: 'pending',
            start_time: new Date(Date.now() + 86400000).toISOString(),
            end_time: new Date(Date.now() + 90000000).toISOString(),
          },
        ]
        this.latestNotifications = [
          {
            id: '1',
            title: '您的预约已通过审核',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: '2',
            title: '系统将于本周日进行维护',
            is_read: true,
            created_at: new Date(Date.now() - 86400000).toISOString(),
          },
        ]
      }
    },
    async fetchChartData() {
      this.initChart()
    },
    initChart() {
      this.$nextTick(() => {
        if (!this.chartRef) return

        if (this.chartInstance) {
          this.chartInstance.dispose()
        }

        this.chartInstance = echarts.init(this.chartRef as HTMLElement)

        const xData = this.chartPeriod === 'week'
          ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
          : this.chartPeriod === 'month'
          ? ['第1周', '第2周', '第3周', '第4周']
          : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

        const option = {
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e5e6eb',
            borderWidth: 1,
            textStyle: {
              color: '#1d2129',
            },
          },
          legend: {
            data: ['预约次数', '使用时长(h)'],
            top: 0,
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '15%',
            containLabel: true,
          },
          xAxis: {
            type: 'category',
            data: xData,
            axisLine: {
              lineStyle: {
                color: '#e5e6eb',
              },
            },
            axisLabel: {
              color: '#4e5969',
            },
          },
          yAxis: [
            {
              type: 'value',
              name: '预约次数',
              axisLine: {
                show: false,
              },
              axisTick: {
                show: false,
              },
              axisLabel: {
                color: '#86909c',
              },
              splitLine: {
                lineStyle: {
                  color: '#f2f3f5',
                },
              },
            },
            {
              type: 'value',
              name: '使用时长(h)',
              axisLine: {
                show: false,
              },
              axisTick: {
                show: false,
              },
              axisLabel: {
                color: '#86909c',
              },
              splitLine: {
                show: false,
              },
            },
          ],
          series: [
            {
              name: '预约次数',
              type: 'bar',
              data: [12, 19, 15, 22, 18, 8, 5],
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#165dff' },
                  { offset: 1, color: '#4080ff' },
                ]),
                borderRadius: [4, 4, 0, 0],
              },
              barWidth: 20,
            },
            {
              name: '使用时长(h)',
              type: 'line',
              yAxisIndex: 1,
              data: [48, 62, 55, 78, 60, 28, 18],
              smooth: true,
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                color: '#00b42a',
                width: 3,
              },
              itemStyle: {
                color: '#00b42a',
              },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(0, 180, 42, 0.3)' },
                  { offset: 1, color: 'rgba(0, 180, 42, 0.05)' },
                ]),
              },
            },
          ],
        }

        this.chartInstance.setOption(option)
      })
    },
  },
})
</script>

<style lang="scss" scoped>
.dashboard {
  .stat-cards {
    margin-bottom: 20px;
  }

  .stat-card {
    border-radius: 8px;
    padding: 20px;
    color: #fff;
    position: relative;
    overflow: hidden;
    transition: transform 0.3s;

    &:hover {
      transform: translateY(-4px);
    }

    &.stat-blue {
      background: linear-gradient(135deg, #165dff 0%, #4080ff 100%);
    }
    &.stat-green {
      background: linear-gradient(135deg, #00b42a 0%, #36cf5b 100%);
    }
    &.stat-orange {
      background: linear-gradient(135deg, #ff7d00 0%, #ff9a2e 100%);
    }
    &.stat-purple {
      background: linear-gradient(135deg, #722ed1 0%, #9254de 100%);
    }

    .stat-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-info {
      .stat-label {
        font-size: 14px;
        opacity: 0.9;
        margin: 0 0 8px 0;
      }
      .stat-value {
        font-size: 32px;
        font-weight: 600;
        margin: 0 0 8px 0;
      }
      .stat-change {
        font-size: 12px;
        opacity: 0.85;
        margin: 0;

        i {
          margin-right: 4px;
        }
      }
    }

    .stat-icon {
      font-size: 48px;
      opacity: 0.3;
    }
  }

  .content-row {
    margin-bottom: 0;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: $text-primary;
    }
  }

  .chart-container {
    height: 320px;
    width: 100%;
  }

  .mt20 {
    margin-top: 20px;
  }

  .reservation-list,
  .notification-list {
    .reservation-item,
    .notification-item {
      padding: 12px;
      border-radius: 8px;
      transition: background 0.2s;

      &:hover {
        background: $bg-color;
      }

      & + & {
        margin-top: 8px;
      }
    }

    .reservation-item {
      .item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .item-title {
          font-weight: 500;
          color: $text-primary;
        }
      }

      .item-time {
        font-size: 13px;
        color: $text-secondary;

        i {
          margin-right: 6px;
        }
      }
    }

    .notification-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;

      .item-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: $border-color;
        margin-top: 6px;
        flex-shrink: 0;

        &.unread {
          background: $danger-color;
        }
      }

      .item-content {
        flex: 1;
        min-width: 0;

        .item-title {
          font-size: 14px;
          color: $text-primary;
          margin: 0 0 4px 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-time {
          font-size: 12px;
          color: $text-secondary;
          margin: 0;
        }
      }
    }
  }

  .instruments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;

    .instrument-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: $bg-color-page;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(22, 93, 255, 0.05);
        transform: translateY(-2px);
      }

      .instrument-avatar {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(22, 93, 255, 0.1) 0%, rgba(64, 128, 255, 0.1) 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 24px;
        color: $primary-color;
        flex-shrink: 0;
      }

      .instrument-info {
        flex: 1;
        min-width: 0;

        .instrument-name {
          font-size: 15px;
          font-weight: 500;
          color: $text-primary;
          margin: 0 0 4px 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .instrument-model {
          font-size: 13px;
          color: $text-secondary;
          margin: 0;
        }
      }

      .instrument-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: $text-regular;

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;

          &.available {
            background: $success-color;
          }
          &.in_use {
            background: $primary-color;
          }
          &.maintenance {
            background: $warning-color;
          }
          &.unavailable {
            background: $danger-color;
          }
        }
      }
    }
  }
}
</style>
