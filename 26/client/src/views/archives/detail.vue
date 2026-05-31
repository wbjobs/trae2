<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <el-button :icon="ArrowLeft" @click="$router.back()" style="margin-right: 12px">返回</el-button>
        <span class="title">{{ archive?.name || '档案详情' }}</span>
      </div>
      <div>
        <el-button type="primary" :icon="Connection" @click="$router.push(`/traceability/${archiveId}`)">查看溯源链</el-button>
        <el-button v-if="archive?.status === 'draft'" :icon="Edit" @click="handleEdit">编辑</el-button>
      </div>
    </div>

    <el-row :gutter="20" v-if="archive">
      <el-col :span="16">
        <div class="card">
          <div class="card-header"><span class="title">基本信息</span></div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="档案编号">{{ archive.archiveNo }}</el-descriptions-item>
            <el-descriptions-item label="作品名称">{{ archive.name }}</el-descriptions-item>
            <el-descriptions-item label="分类">{{ archive.category }}</el-descriptions-item>
            <el-descriptions-item label="工艺类型">{{ archive.craftType }}</el-descriptions-item>
            <el-descriptions-item label="尺寸">{{ archive.dimensions }}</el-descriptions-item>
            <el-descriptions-item label="重量">{{ archive.weight }}</el-descriptions-item>
            <el-descriptions-item label="创作日期">{{ formatDate(archive.creationDate) }}</el-descriptions-item>
            <el-descriptions-item label="估值">¥{{ Number(archive.estimatedValue).toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="工匠">{{ archive.artisanName }}</el-descriptions-item>
            <el-descriptions-item label="当前持有人">{{ archive.currentHolder }}</el-descriptions-item>
            <el-descriptions-item label="当前位置">{{ archive.currentLocation }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType[archive.status]">{{ statusText[archive.status] }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="使用材料" :span="2">{{ archive.materials }}</el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">{{ archive.description }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="title">制作工序</span>
            <el-button type="primary" size="small" :icon="Plus" @click="stepDialogVisible = true">添加工序</el-button>
          </div>
          <el-timeline>
            <el-timeline-item
              v-for="(step, index) in archive.craftSteps"
              :key="step.id"
              :timestamp="formatDate(step.startTime)"
              placement="top"
            >
              <el-card shadow="hover">
                <div class="step-header">
                  <el-tag type="primary">工序{{ step.stepNo }}</el-tag>
                  <span class="step-name">{{ step.stepName }}</span>
                  <span class="step-artisan">{{ step.artisanName }}</span>
                </div>
                <p class="step-desc">{{ step.description }}</p>
                <div class="step-meta">
                  <span v-if="step.environment"><el-icon><Sunny /></el-icon> {{ step.environment }}</span>
                  <span v-if="step.qualityCheck" style="color: #67c23a"><el-icon><CircleCheck /></el-icon> 已质检</span>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>

        <div class="card">
          <div class="card-header"><span class="title">物料使用</span></div>
          <el-table :data="archive.materialUsages">
            <el-table-column prop="materialName" label="物料名称" />
            <el-table-column label="数量">
              <template #default="{ row }">{{ row.quantity }}{{ row.unit }}</template>
            </el-table-column>
            <el-table-column prop="usageReason" label="用途" />
            <el-table-column prop="usageDate" label="使用日期">
              <template #default="{ row }">{{ formatDate(row.usageDate) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="card">
          <div class="card-header"><span class="title">流转记录</span></div>
          <el-table :data="archive.transfers">
            <el-table-column prop="transferNo" label="流转单号" width="140" />
            <el-table-column prop="transferType" label="类型" width="100" />
            <el-table-column label="流转">
              <template #default="{ row }">{{ row.fromParty }} → {{ row.toParty }}</template>
            </el-table-column>
            <el-table-column prop="transferDate" label="日期" width="180">
              <template #default="{ row }">{{ formatDate(row.transferDate) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="transferStatusType[row.status]">{{ transferStatusText[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="card">
          <div class="card-header"><span class="title">作品图片</span></div>
          <el-image-viewer v-if="showViewer" :url-list="imageList" @close="showViewer = false" />
          <div class="image-grid">
            <div v-for="(img, i) in imageList" :key="i" class="image-item" @click="showViewer = true; viewerIndex = i">
              <el-image :src="img" fit="cover" style="width: 100%; height: 100%" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="title">区块信息</span></div>
          <div class="hash-info">
            <div class="hash-item">
              <span class="label">当前哈希</span>
              <span class="value mono">{{ archive.hash }}</span>
            </div>
            <div class="hash-item" v-if="archive.prevHash">
              <span class="label">前序哈希</span>
              <span class="value mono">{{ archive.prevHash }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="stepDialogVisible" title="添加工序" width="500px">
      <el-form :model="stepForm" ref="stepFormRef" label-width="100px">
        <el-form-item label="工序号" prop="stepNo">
          <el-input-number v-model="stepForm.stepNo" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工序名称" prop="stepName">
          <el-input v-model="stepForm.stepName" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="stepForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addStep">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getArchive, addCraftStep } from '@/api/archives'
import { ArrowLeft, Connection, Edit, Plus, Sunny, CircleCheck } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const route = useRoute()
const archiveId = route.params.id
const archive = ref(null)
const showViewer = ref(false)
const viewerIndex = ref(0)
const stepDialogVisible = ref(false)
const stepFormRef = ref()
const stepForm = reactive({ stepNo: 1, stepName: '', description: '' })

const statusType = { draft: 'info', reviewing: 'warning', approved: 'success', rejected: 'danger' }
const statusText = { draft: '草稿', reviewing: '审核中', approved: '已通过', rejected: '已拒绝' }
const transferStatusType = { pending: 'warning', in_transit: 'primary', delivered: 'success', confirmed: 'success', cancelled: 'info' }
const transferStatusText = { pending: '待发货', in_transit: '运输中', delivered: '已送达', confirmed: '已确认', cancelled: '已取消' }

const imageList = computed(() => {
  if (!archive.value?.images) return []
  return JSON.parse(archive.value.images)
})

const formatDate = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const fetchData = async () => {
  const res = await getArchive(archiveId)
  if (res.code === 200) archive.value = res.data
}

const addStep = async () => {
  try {
    await stepFormRef.value.validate()
    await addCraftStep(archiveId, stepForm)
    ElMessage.success('工序添加成功')
    stepDialogVisible.value = false
    fetchData()
  } catch (err) {}
}

const handleEdit = () => {
  ElMessage.info('请返回列表页编辑')
}

onMounted(() => {
  fetchData()
})
</script>

<style lang="scss" scoped>
.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  .step-name {
    font-size: 16px;
    font-weight: 600;
  }

  .step-artisan {
    margin-left: auto;
    color: #909399;
    font-size: 13px;
  }
}

.step-desc {
  color: #606266;
  margin-bottom: 12px;
}

.step-meta {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #909399;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;

  .image-item {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
  }
}

.hash-info {
  .hash-item {
    padding: 12px 0;
    border-bottom: 1px solid #eee;

    &:last-child {
      border-bottom: none;
    }

    .label {
      display: block;
      color: #909399;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .value.mono {
      font-family: monospace;
      font-size: 12px;
      word-break: break-all;
      color: #409eff;
    }
  }
}
</style>
