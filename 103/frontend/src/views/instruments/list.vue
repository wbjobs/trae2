<template>
  <div class="instrument-list">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="仪器名称/型号/编号"
            clearable
            style="width: 240px"
          ></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 160px">
            <el-option label="可用" value="available"></el-option>
            <el-option label="使用中" value="in_use"></el-option>
            <el-option label="维护中" value="maintenance"></el-option>
            <el-option label="不可用" value="unavailable"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="searchForm.category" placeholder="全部分类" clearable style="width: 160px">
            <el-option label="电子显微镜" value="microscope"></el-option>
            <el-option label="光谱仪" value="spectrometer"></el-option>
            <el-option label="色谱仪" value="chromatograph"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="el-icon-search" @click="handleSearch">搜索</el-button>
          <el-button icon="el-icon-refresh" @click="handleReset">重置</el-button>
          <el-button
            v-if="isAdmin"
            type="success"
            icon="el-icon-plus"
            @click="handleAdd"
          >添加仪器</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="instruments-grid">
      <div
        v-for="item in instruments"
        :key="item.id"
        class="instrument-card"
        :class="item.status"
      >
        <div class="card-header">
          <div class="instrument-avatar">
            <i class="el-icon-microphone"></i>
          </div>
          <el-tag :type="getStatusType(item.status)" effect="dark" size="small">
            {{ item.status | instrumentStatusFilter }}
          </el-tag>
        </div>
        <div class="card-body">
          <h4 class="instrument-name">{{ item.name }}</h4>
          <p class="instrument-model">{{ item.model }}</p>
          <div class="instrument-info">
            <div class="info-item">
              <i class="el-icon-goods"></i>
              <span>{{ item.code }}</span>
            </div>
            <div class="info-item">
              <i class="el-icon-location-outline"></i>
              <span>{{ item.location }}</span>
            </div>
            <div class="info-item">
              <i class="el-icon-office-building"></i>
              <span>{{ item.manufacturer }}</span>
            </div>
          </div>
          <p class="instrument-desc" v-if="item.description">
            {{ item.description }}
          </p>
        </div>
        <div class="card-footer">
          <el-button
            type="primary"
            size="small"
            :disabled="item.status !== 'available'"
            @click="goToCalendar(item.id)"
          >
            立即预约
          </el-button>
          <el-button size="small" @click="viewDetail(item)">查看详情</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="instruments.length === 0 && !loading" description="暂无仪器数据" />

    <div class="pagination-container" v-if="total > 0">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[12, 24, 48]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchInstruments"
        @current-change="fetchInstruments"
      />
    </div>

    <el-dialog
      title="仪器详情"
      :visible.sync="detailVisible"
      width="600px"
      append-to-body
    >
      <div v-if="currentInstrument" class="detail-content">
        <div class="detail-row">
          <label>仪器名称：</label>
          <span>{{ currentInstrument.name }}</span>
        </div>
        <div class="detail-row">
          <label>仪器编号：</label>
          <span>{{ currentInstrument.code }}</span>
        </div>
        <div class="detail-row">
          <label>型号：</label>
          <span>{{ currentInstrument.model }}</span>
        </div>
        <div class="detail-row">
          <label>生产厂商：</label>
          <span>{{ currentInstrument.manufacturer }}</span>
        </div>
        <div class="detail-row">
          <label>放置位置：</label>
          <span>{{ currentInstrument.location }}</span>
        </div>
        <div class="detail-row">
          <label>当前状态：</label>
          <el-tag :type="getStatusType(currentInstrument.status)">
            {{ currentInstrument.status | instrumentStatusFilter }}
          </el-tag>
        </div>
        <div class="detail-row" v-if="currentInstrument.description">
          <label>仪器描述：</label>
          <span>{{ currentInstrument.description }}</span>
        </div>
        <div class="detail-row">
          <label>是否需要审核：</label>
          <span>{{ currentInstrument.requires_approval ? '是' : '否' }}</span>
        </div>
        <div class="detail-row">
          <label>每日最大使用时长：</label>
          <span>{{ currentInstrument.daily_max_hours }} 小时</span>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="currentInstrument?.status !== 'available'"
          @click="goToCalendar(currentInstrument?.id); detailVisible = false"
        >立即预约</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref, onMounted, computed } from 'vue'
import { getInstrumentList } from '@/api/instrument'
import { mapGetters } from 'vuex'

export default defineComponent({
  name: 'InstrumentList',
  filters: {
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
  computed: {
    ...mapGetters(['roles']),
    isAdmin() {
      return this.roles.includes('super_admin') || this.roles.includes('lab_admin')
    },
  },
  setup() {
    const searchForm = reactive({
      keyword: '',
      status: '',
      category: '',
    })

    const pagination = reactive({
      page: 1,
      page_size: 12,
    })

    const instruments = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const detailVisible = ref(false)
    const currentInstrument = ref<any>(null)

    const mockInstruments = [
      {
        id: '1',
        name: '扫描电子显微镜',
        code: 'SEM-001',
        model: 'Hitachi SU8010',
        manufacturer: 'Hitachi',
        location: 'A楼101室',
        status: 'available',
        description: '高分辨率场发射扫描电子显微镜，适用于材料表面形貌观察。',
        requires_approval: true,
        daily_max_hours: 8,
      },
      {
        id: '2',
        name: '透射电子显微镜',
        code: 'TEM-001',
        model: 'FEI Tecnai G2',
        manufacturer: 'FEI',
        location: 'A楼102室',
        status: 'in_use',
        description: '200kV场发射透射电子显微镜。',
        requires_approval: true,
        daily_max_hours: 6,
      },
      {
        id: '3',
        name: 'X射线衍射仪',
        code: 'XRD-001',
        model: 'Bruker D8',
        manufacturer: 'Bruker',
        location: 'B楼201室',
        status: 'available',
        description: 'X射线多晶衍射仪，用于物相定性和定量分析。',
        requires_approval: false,
        daily_max_hours: 12,
      },
      {
        id: '4',
        name: '核磁共振仪',
        code: 'NMR-001',
        model: 'Bruker 400MHz',
        manufacturer: 'Bruker',
        location: 'B楼202室',
        status: 'maintenance',
        description: '400MHz核磁共振波谱仪。',
        requires_approval: true,
        daily_max_hours: 8,
      },
      {
        id: '5',
        name: '紫外可见分光光度计',
        code: 'UV-001',
        model: 'Shimadzu UV-2600',
        manufacturer: 'Shimadzu',
        location: 'C楼301室',
        status: 'available',
        description: '紫外可见近红外分光光度计。',
        requires_approval: false,
        daily_max_hours: 24,
      },
      {
        id: '6',
        name: '傅里叶变换红外光谱仪',
        code: 'FTIR-001',
        model: 'Thermo Nicolet iS50',
        manufacturer: 'Thermo',
        location: 'C楼302室',
        status: 'available',
        description: '傅里叶变换红外光谱仪，配备多种附件。',
        requires_approval: false,
        daily_max_hours: 12,
      },
    ]

    return {
      searchForm,
      pagination,
      instruments,
      total,
      loading,
      detailVisible,
      currentInstrument,
      mockInstruments,
    }
  },
  mounted() {
    this.fetchInstruments()
  },
  methods: {
    getStatusType(status: string) {
      const typeMap: Record<string, string> = {
        available: 'success',
        in_use: 'primary',
        maintenance: 'warning',
        unavailable: 'danger',
      }
      return typeMap[status] || 'info'
    },
    async fetchInstruments() {
      this.loading = true
      try {
        const res: any = await getInstrumentList({
          ...this.searchForm,
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        })
        this.instruments = res.data?.items || this.mockInstruments
        this.total = res.data?.total || this.mockInstruments.length
      } catch (e) {
        this.instruments = this.mockInstruments
        this.total = this.mockInstruments.length
      } finally {
        this.loading = false
      }
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchInstruments()
    },
    handleReset() {
      this.searchForm.keyword = ''
      this.searchForm.status = ''
      this.searchForm.category = ''
      this.handleSearch()
    },
    goToCalendar(id: string) {
      this.$router.push(`/instruments/${id}/calendar`)
    },
    viewDetail(item: any) {
      this.currentInstrument = item
      this.detailVisible = true
    },
    handleAdd() {
      this.$message.info('添加仪器功能开发中')
    },
  },
})
</script>

<style lang="scss" scoped>
.instrument-list {
  .instruments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
  }

  .instrument-card {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
    transition: all 0.3s;
    display: flex;
    flex-direction: column;

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }

    &.in_use {
      border-top: 3px solid $primary-color;
    }
    &.available {
      border-top: 3px solid $success-color;
    }
    &.maintenance {
      border-top: 3px solid $warning-color;
    }
    &.unavailable {
      border-top: 3px solid $danger-color;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 20px 0;

      .instrument-avatar {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(22, 93, 255, 0.1) 0%, rgba(64, 128, 255, 0.1) 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 28px;
        color: $primary-color;
      }
    }

    .card-body {
      padding: 16px 20px;
      flex: 1;

      .instrument-name {
        font-size: 16px;
        font-weight: 600;
        color: $text-primary;
        margin: 0 0 4px 0;
      }

      .instrument-model {
        font-size: 13px;
        color: $text-secondary;
        margin: 0 0 12px 0;
      }

      .instrument-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;

        .info-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: $text-regular;

          i {
            color: $text-secondary;
          }
        }
      }

      .instrument-desc {
        font-size: 13px;
        color: $text-secondary;
        margin: 0;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    }

    .card-footer {
      display: flex;
      gap: 10px;
      padding: 16px 20px 20px;
      border-top: 1px solid $border-color;

      .el-button {
        flex: 1;
      }
    }
  }

  .pagination-container {
    display: flex;
    justify-content: flex-end;
  }

  .detail-content {
    .detail-row {
      display: flex;
      margin-bottom: 16px;
      font-size: 14px;

      label {
        width: 100px;
        color: $text-secondary;
        margin: 0;
        flex-shrink: 0;
      }

      span {
        color: $text-primary;
        flex: 1;
      }
    }
  }
}
</style>
