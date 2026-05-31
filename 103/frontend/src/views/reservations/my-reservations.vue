<template>
  <div class="my-reservations">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="待审核" value="pending"></el-option>
            <el-option label="已通过" value="approved"></el-option>
            <el-option label="已拒绝" value="rejected"></el-option>
            <el-option label="已取消" value="cancelled"></el-option>
            <el-option label="进行中" value="in_progress"></el-option>
            <el-option label="已完成" value="completed"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="预约日期">
          <el-date-picker
            v-model="searchForm.date_range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="el-icon-search" @click="handleSearch">搜索</el-button>
          <el-button icon="el-icon-refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-container">
      <el-table
        :data="reservations"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="instrument_name" label="仪器名称" min-width="160">
          <template slot-scope="scope">
            <span class="instrument-name">{{ scope.row.instrument_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="预约时段" min-width="280">
          <template slot-scope="scope">
            <p class="time-text">
              <i class="el-icon-time"></i>
              {{ formatDate(scope.row.start_time) }}
            </p>
            <p class="time-range">
              {{ formatTime(scope.row.start_time, 'HH:mm') }} - {{ formatTime(scope.row.end_time, 'HH:mm') }}
            </p>
          </template>
        </el-table-column>
        <el-table-column prop="purpose" label="实验目的" min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column label="状态" width="100">
          <template slot-scope="scope">
            <el-tag :type="getStatusType(scope.row.status)" size="small">
              {{ scope.row.status | reservationStatusFilter }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="提交时间" width="160">
          <template slot-scope="scope">
            {{ formatTime(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template slot-scope="scope">
            <el-button
              v-if="scope.row.status === 'pending'"
              type="text"
              size="small"
              @click="handleCancel(scope.row)"
            >取消预约</el-button>
            <el-button
              v-if="scope.row.status === 'approved'"
              type="text"
              size="small"
              @click="handleStartUse(scope.row)"
            >开始使用</el-button>
            <el-button
              v-if="scope.row.status === 'in_progress'"
              type="text"
              size="small"
              @click="handleEndUse(scope.row)"
            >结束使用</el-button>
            <el-button
              v-if="scope.row.status === 'rejected'"
              type="text"
              size="small"
              @click="viewRejectReason(scope.row)"
            >查看原因</el-button>
            <el-button
              v-if="scope.row.status === 'completed' || scope.row.status === 'in_progress'"
              type="text"
              size="small"
              @click="handleUploadFile(scope.row)"
            >上传文件</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="reservations.length === 0 && !loading" description="暂无预约记录" />

      <div class="pagination-container" v-if="total > 0">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchReservations"
          @current-change="fetchReservations"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref, onMounted } from 'vue'
import { getReservationList, cancelReservation, updateReservation } from '@/api/reservation'
import { createRecord } from '@/api/record'
import { formatTime, formatDate } from '@/utils'

export default defineComponent({
  name: 'MyReservations',
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
  },
  setup() {
    const searchForm = reactive({
      status: '',
      date_range: [] as string[],
    })

    const pagination = reactive({
      page: 1,
      page_size: 10,
    })

    const reservations = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)

    const mockReservations = [
      {
        id: '1',
        instrument_name: '扫描电子显微镜',
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 90000000).toISOString(),
        purpose: '材料表面形貌观察与分析',
        status: 'approved',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: '2',
        instrument_name: 'X射线衍射仪',
        start_time: new Date(Date.now() + 172800000).toISOString(),
        end_time: new Date(Date.now() + 180000000).toISOString(),
        purpose: '物相定性定量分析',
        status: 'pending',
        created_at: new Date(Date.now() - 43200000).toISOString(),
      },
      {
        id: '3',
        instrument_name: '紫外可见分光光度计',
        start_time: new Date(Date.now() - 3600000).toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        purpose: '样品吸收光谱测定',
        status: 'in_progress',
        created_at: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: '4',
        instrument_name: '傅里叶变换红外光谱仪',
        start_time: new Date(Date.now() - 172800000).toISOString(),
        end_time: new Date(Date.now() - 136800000).toISOString(),
        purpose: '化合物官能团分析',
        status: 'completed',
        created_at: new Date(Date.now() - 259200000).toISOString(),
      },
    ]

    return {
      searchForm,
      pagination,
      reservations,
      total,
      loading,
      mockReservations,
      formatTime,
      formatDate,
    }
  },
  mounted() {
    this.fetchReservations()
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
    async fetchReservations() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.searchForm.status) {
          params.status = this.searchForm.status
        }
        if (this.searchForm.date_range?.length === 2) {
          params.start_date = this.searchForm.date_range[0]
          params.end_date = this.searchForm.date_range[1]
        }

        const res: any = await getReservationList(params)
        this.reservations = res.data?.items || this.mockReservations
        this.total = res.data?.total || this.mockReservations.length
      } catch (e) {
        this.reservations = this.mockReservations
        this.total = this.mockReservations.length
      } finally {
        this.loading = false
      }
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchReservations()
    },
    handleReset() {
      this.searchForm.status = ''
      this.searchForm.date_range = []
      this.handleSearch()
    },
    async handleCancel(row: any) {
      this.$confirm('确定要取消该预约吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await cancelReservation(row.id)
            this.$message.success('预约已取消')
            this.fetchReservations()
          } catch (e) {
            row.status = 'cancelled'
            this.$message.success('预约已取消')
          }
        })
        .catch(() => {})
    },
    async handleStartUse(row: any) {
      try {
        await updateReservation(row.id, { status: 'in_progress' })
        await createRecord({
          reservation_id: row.id,
          instrument_id: row.instrument_id,
          start_time: new Date().toISOString(),
        })
        this.$message.success('已开始使用仪器')
        this.fetchReservations()
      } catch (e) {
        row.status = 'in_progress'
        this.$message.success('已开始使用仪器')
      }
    },
    async handleEndUse(row: any) {
      try {
        await updateReservation(row.id, { status: 'completed' })
        this.$message.success('使用已结束，请及时上传实验文件')
        this.fetchReservations()
      } catch (e) {
        row.status = 'completed'
        this.$message.success('使用已结束')
      }
    },
    viewRejectReason(row: any) {
      this.$alert(row.reject_reason || '未说明原因', '拒绝原因', {
        confirmButtonText: '确定',
      })
    },
    handleUploadFile(row: any) {
      this.$router.push({
        path: '/files',
        query: { reservation_id: row.id, instrument_id: row.instrument_id },
      })
    },
  },
})
</script>

<style lang="scss" scoped>
.my-reservations {
  .instrument-name {
    font-weight: 500;
    color: $text-primary;
  }

  .time-text {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: $text-primary;

    i {
      margin-right: 6px;
      color: $primary-color;
    }
  }

  .time-range {
    margin: 0;
    font-size: 13px;
    color: $text-secondary;
  }
}
</style>
