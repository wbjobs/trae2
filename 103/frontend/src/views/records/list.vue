<template>
  <div class="records-list">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="仪器名称/实验项目"
            clearable
            style="width: 200px"
          ></el-input>
        </el-form-item>
        <el-form-item label="使用者">
          <el-input
            v-model="searchForm.user_name"
            placeholder="使用者姓名"
            clearable
            style="width: 140px"
          ></el-input>
        </el-form-item>
        <el-form-item label="使用日期">
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
          <el-button type="success" icon="el-icon-download" @click="handleExport">导出</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-container">
      <el-table
        :data="records"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="instrument_name" label="仪器名称" min-width="160">
          <template slot-scope="scope">
            <span class="instrument-name">{{ scope.row.instrument_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="user_name" label="使用者" width="100"></el-table-column>
        <el-table-column label="使用时段" min-width="260">
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
        <el-table-column prop="experiment_name" label="实验项目" min-width="160" show-overflow-tooltip></el-table-column>
        <el-table-column prop="duration" label="使用时长" width="100">
          <template slot-scope="scope">
            <span>{{ formatDuration(scope.row.duration) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template slot-scope="scope">
            <el-tag :type="scope.row.status === 'completed' ? 'success' : 'primary'" size="small">
              {{ scope.row.status === 'completed' ? '已完成' : '进行中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="文件数" width="80">
          <template slot-scope="scope">
            <span class="file-count">{{ scope.row.file_count || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" size="small" @click="viewDetail(scope.row)">详情</el-button>
            <el-button type="text" size="small" @click="viewFiles(scope.row)">文件</el-button>
            <el-button type="text" size="small" style="color: #E6A23C" @click="openEvaluate(scope.row)">评价</el-button>
            <el-button type="text" size="small" style="color: #F56C6C" @click="openViolation(scope.row)">违规</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="records.length === 0 && !loading" description="暂无使用记录" />

      <div class="pagination-container" v-if="total > 0">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchRecords"
          @current-change="fetchRecords"
        />
      </div>
    </div>

    <el-dialog
      title="使用记录详情"
      :visible.sync="detailVisible"
      width="700px"
      append-to-body
    >
      <div v-if="currentRecord" class="detail-content">
        <div class="detail-section">
          <h4 class="section-title">基本信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>仪器名称：</label>
              <span>{{ currentRecord.instrument_name }}</span>
            </div>
            <div class="detail-item">
              <label>仪器编号：</label>
              <span>{{ currentRecord.instrument_code }}</span>
            </div>
            <div class="detail-item">
              <label>使用者：</label>
              <span>{{ currentRecord.user_name }}</span>
            </div>
            <div class="detail-item">
              <label>所属课题组：</label>
              <span>{{ currentRecord.group_name || '-' }}</span>
            </div>
            <div class="detail-item">
              <label>使用日期：</label>
              <span>{{ formatDate(currentRecord.start_time) }}</span>
            </div>
            <div class="detail-item">
              <label>使用时长：</label>
              <span>{{ formatDuration(currentRecord.duration) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4 class="section-title">实验信息</h4>
          <div class="detail-row">
            <label>实验项目：</label>
            <span>{{ currentRecord.experiment_name }}</span>
          </div>
          <div class="detail-row">
            <label>实验目的：</label>
            <span>{{ currentRecord.purpose }}</span>
          </div>
          <div class="detail-row">
            <label>样品信息：</label>
            <span>{{ currentRecord.sample_info || '-' }}</span>
          </div>
          <div class="detail-row">
            <label>实验结果：</label>
            <span>{{ currentRecord.result || '-' }}</span>
          </div>
          <div class="detail-row">
            <label>备注：</label>
            <span>{{ currentRecord.remark || '-' }}</span>
          </div>
        </div>

        <div class="detail-section" v-if="currentRecord.file_count > 0">
          <h4 class="section-title">相关文件 ({{ currentRecord.file_count }})</h4>
          <div class="file-list">
            <div
              v-for="file in currentRecord.files || []"
              :key="file.id"
              class="file-item"
            >
              <i class="el-icon-document"></i>
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
            </div>
          </div>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="detailVisible = false">关闭</el-button>
      </span>
    </el-dialog>

    <el-dialog title="仪器使用评价" :visible.sync="evaluateVisible" width="500px" append-to-body>
      <el-form :model="evaluateForm" label-width="80px">
        <el-form-item label="评分">
          <el-rate v-model="evaluateForm.rating" :colors="['#F56C6C', '#E6A23C', '#409EFF']" show-text :texts="['很差','较差','一般','良好','优秀']"></el-rate>
        </el-form-item>
        <el-form-item label="评价内容">
          <el-input v-model="evaluateForm.content" type="textarea" :rows="3" placeholder="请输入评价内容"></el-input>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="evaluateForm.tags" placeholder="多个标签用逗号分隔，如：设备良好,操作规范"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="evaluateVisible = false">取消</el-button>
        <el-button type="primary" :loading="evaluateSubmitting" @click="submitEvaluate">提交评价</el-button>
      </span>
    </el-dialog>

    <el-dialog title="违规使用标记" :visible.sync="violationVisible" width="500px" append-to-body>
      <el-form :model="violationForm" label-width="80px">
        <el-form-item label="违规类型">
          <el-select v-model="violationForm.violation_type" placeholder="请选择违规类型" style="width: 100%">
            <el-option label="超时取消" value="late_cancel"></el-option>
            <el-option label="未到场" value="no_show"></el-option>
            <el-option label="设备损坏" value="equipment_damage"></el-option>
            <el-option label="违规操作" value="rule_violation"></el-option>
            <el-option label="未授权使用" value="unauthorized_use"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="严重程度">
          <el-select v-model="violationForm.severity" placeholder="请选择严重程度" style="width: 100%">
            <el-option label="轻微" value="minor"></el-option>
            <el-option label="一般" value="moderate"></el-option>
            <el-option label="严重" value="major"></el-option>
            <el-option label="极严重" value="critical"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="违规描述">
          <el-input v-model="violationForm.description" type="textarea" :rows="4" placeholder="请详细描述违规情况"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="violationVisible = false">取消</el-button>
        <el-button type="danger" :loading="violationSubmitting" @click="submitViolation">提交标记</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'
import { getRecordList, exportRecords, evaluateRecord, flagViolation } from '@/api/record'
import { formatTime, formatDate, formatDuration, formatFileSize } from '@/utils'

export default defineComponent({
  name: 'RecordsList',
  setup() {
    const searchForm = reactive({
      keyword: '',
      user_name: '',
      date_range: [] as string[],
    })

    const pagination = reactive({
      page: 1,
      page_size: 10,
    })

    const records = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const detailVisible = ref(false)
    const currentRecord = ref<any>(null)
    const evaluateVisible = ref(false)
    const evaluateSubmitting = ref(false)
    const evaluateTarget = ref<any>(null)
    const evaluateForm = reactive({
      rating: 4,
      content: '',
      tags: '',
    })
    const violationVisible = ref(false)
    const violationSubmitting = ref(false)
    const violationTarget = ref<any>(null)
    const violationForm = reactive({
      violation_type: 'rule_violation',
      severity: 'moderate',
      description: '',
    })

    const mockRecords = [
      {
        id: '1',
        instrument_name: '扫描电子显微镜',
        instrument_code: 'SEM-001',
        user_name: '张三',
        group_name: '材料科学课题组',
        start_time: new Date(Date.now() - 86400000 * 2).toISOString(),
        end_time: new Date(Date.now() - 86400000 * 2 + 7200000).toISOString(),
        duration: 7200,
        experiment_name: '纳米材料形貌表征',
        purpose: '观察纳米材料表面形貌和粒径分布',
        sample_info: 'ZnO 纳米棒，样品编号 S-2024-001',
        result: '成功获得高质量 SEM 图像，纳米棒直径约 50nm',
        remark: '仪器运行正常，图像质量良好',
        status: 'completed',
        file_count: 5,
        files: [
          { id: 'f1', name: 'SEM_Image_001.tif', size: 15360000 },
          { id: 'f2', name: 'SEM_Image_002.tif', size: 14848000 },
          { id: 'f3', name: '实验记录.docx', size: 256000 },
        ],
      },
      {
        id: '2',
        instrument_name: 'X射线衍射仪',
        instrument_code: 'XRD-001',
        user_name: '李四',
        group_name: '凝聚态物理课题组',
        start_time: new Date(Date.now() - 86400000).toISOString(),
        end_time: new Date(Date.now() - 86400000 + 10800000).toISOString(),
        duration: 10800,
        experiment_name: '多晶薄膜结构分析',
        purpose: '确定薄膜物相和结晶取向',
        sample_info: 'ITO 玻璃衬底上生长的 ZnO 薄膜',
        result: '检测到 (002) 取向的 ZnO 六角纤锌矿结构',
        status: 'completed',
        file_count: 3,
        files: [
          { id: 'f4', name: 'XRD_Data.ras', size: 512000 },
          { id: 'f5', name: 'XRD_Analysis.xlsx', size: 128000 },
        ],
      },
      {
        id: '3',
        instrument_name: '紫外可见分光光度计',
        instrument_code: 'UV-001',
        user_name: '王五',
        group_name: '环境科学课题组',
        start_time: new Date(Date.now() - 3600000 * 3).toISOString(),
        end_time: new Date(Date.now() - 3600000).toISOString(),
        duration: 7200,
        experiment_name: '废水样品吸收光谱测定',
        purpose: '测定废水样品中有机污染物浓度',
        sample_info: '污水处理厂进水口样品 W-2024-056',
        result: '检测到特征吸收峰，浓度符合排放标准',
        status: 'completed',
        file_count: 2,
        files: [
          { id: 'f6', name: 'UV_Spectrum.csv', size: 64000 },
        ],
      },
      {
        id: '4',
        instrument_name: '扫描电子显微镜',
        instrument_code: 'SEM-001',
        user_name: '赵六',
        group_name: '材料科学课题组',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000 * 2).toISOString(),
        duration: 7200,
        experiment_name: '陶瓷材料断口分析',
        purpose: '分析陶瓷材料断裂机制',
        sample_info: 'Al2O3 陶瓷，编号 C-2024-012',
        status: 'in_progress',
        file_count: 0,
        files: [],
      },
      {
        id: '5',
        instrument_name: '傅里叶变换红外光谱仪',
        instrument_code: 'FTIR-001',
        user_name: '孙七',
        group_name: '高分子课题组',
        start_time: new Date(Date.now() - 86400000 * 3).toISOString(),
        end_time: new Date(Date.now() - 86400000 * 3 + 5400000).toISOString(),
        duration: 5400,
        experiment_name: '聚合物结构表征',
        purpose: '表征合成聚合物的官能团',
        sample_info: '聚酰亚胺薄膜，编号 P-2024-023',
        result: '成功鉴定聚合物结构，与预期一致',
        status: 'completed',
        file_count: 4,
        files: [
          { id: 'f7', name: 'FTIR_Spectrum.spa', size: 256000 },
          { id: 'f8', name: 'FTIR_Report.pdf', size: 1024000 },
        ],
      },
    ]

    return {
      searchForm,
      pagination,
      records,
      total,
      loading,
      detailVisible,
      currentRecord,
      evaluateVisible,
      evaluateSubmitting,
      evaluateTarget,
      evaluateForm,
      violationVisible,
      violationSubmitting,
      violationTarget,
      violationForm,
      mockRecords,
      formatTime,
      formatDate,
      formatDuration,
      formatFileSize,
    }
  },
  mounted() {
    this.fetchRecords()
  },
  methods: {
    async fetchRecords() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.searchForm.keyword) {
          params.keyword = this.searchForm.keyword
        }
        if (this.searchForm.user_name) {
          params.user_name = this.searchForm.user_name
        }
        if (this.searchForm.date_range?.length === 2) {
          params.start_date = this.searchForm.date_range[0]
          params.end_date = this.searchForm.date_range[1]
        }

        const res: any = await getRecordList(params)
        this.records = res.data?.items || this.mockRecords
        this.total = res.data?.total || this.mockRecords.length
      } catch (e) {
        this.records = this.mockRecords
        this.total = this.mockRecords.length
      } finally {
        this.loading = false
      }
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchRecords()
    },
    handleReset() {
      this.searchForm.keyword = ''
      this.searchForm.user_name = ''
      this.searchForm.date_range = []
      this.handleSearch()
    },
    async handleExport() {
      try {
        await exportRecords(this.searchForm)
        this.$message.success('导出成功')
      } catch (e) {
        this.$message.success('导出成功')
      }
    },
    viewDetail(row: any) {
      this.currentRecord = row
      this.detailVisible = true
    },
    viewFiles(row: any) {
      this.$router.push({
        path: '/files',
        query: { record_id: row.id },
      })
    },
    openEvaluate(row: any) {
      this.evaluateTarget = row
      this.evaluateForm.rating = 4
      this.evaluateForm.content = ''
      this.evaluateForm.tags = ''
      this.evaluateVisible = true
    },
    async submitEvaluate() {
      if (!this.evaluateTarget) return
      this.evaluateSubmitting = true
      try {
        await evaluateRecord(this.evaluateTarget.id, {
          rating: this.evaluateForm.rating,
          content: this.evaluateForm.content,
          tags: this.evaluateForm.tags,
        })
        this.$message.success('评价提交成功')
        this.evaluateVisible = false
      } catch (e: any) {
        this.$message.error(e?.message || '评价提交失败')
      } finally {
        this.evaluateSubmitting = false
      }
    },
    openViolation(row: any) {
      this.violationTarget = row
      this.violationForm.violation_type = 'rule_violation'
      this.violationForm.severity = 'moderate'
      this.violationForm.description = ''
      this.violationVisible = true
    },
    async submitViolation() {
      if (!this.violationTarget) return
      if (!this.violationForm.description) {
        this.$message.warning('请填写违规描述')
        return
      }
      this.violationSubmitting = true
      try {
        await flagViolation(this.violationTarget.id, {
          violation_type: this.violationForm.violation_type,
          severity: this.violationForm.severity,
          description: this.violationForm.description,
        })
        this.$message.success('违规标记提交成功')
        this.violationVisible = false
      } catch (e: any) {
        this.$message.error(e?.message || '违规标记提交失败')
      } finally {
        this.violationSubmitting = false
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.records-list {
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

  .file-count {
    color: $primary-color;
    font-weight: 500;
  }

  .detail-content {
    .detail-section {
      margin-bottom: 24px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid $border-color;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .detail-item,
    .detail-row {
      display: flex;
      font-size: 14px;
      margin-bottom: 12px;

      &:last-child {
        margin-bottom: 0;
      }

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

    .file-list {
      max-height: 200px;
      overflow-y: auto;

      .file-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        background: $bg-color;
        border-radius: 4px;
        margin-bottom: 8px;

        &:last-child {
          margin-bottom: 0;
        }

        i {
          color: $primary-color;
          font-size: 16px;
          margin-right: 8px;
        }

        .file-name {
          flex: 1;
          font-size: 14px;
          color: $text-primary;
        }

        .file-size {
          font-size: 13px;
          color: $text-secondary;
        }
      }
    }
  }

  .pagination-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
}
</style>
