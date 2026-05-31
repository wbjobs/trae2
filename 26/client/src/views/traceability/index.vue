<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">溯源查询</div>
    </div>

    <div class="card" v-if="!selectedArchive">
      <el-alert title="请选择要查询的作品档案" type="info" :closable="false" style="margin-bottom: 20px" />
      <el-input v-model="searchKeyword" placeholder="输入档案编号或作品名称搜索" size="large" clearable @keyup.enter="searchArchives">
        <template #append>
          <el-button :icon="Search" @click="searchArchives">搜索</el-button>
        </template>
      </el-input>

      <el-table :data="archives" v-loading="loading" style="margin-top: 20px" @row-click="selectArchive">
        <el-table-column prop="archiveNo" label="档案编号" width="140" />
        <el-table-column label="作品" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 12px">
              <el-image v-if="row.images" :src="JSON.parse(row.images)[0]" style="width: 50px; height: 50px" fit="cover" />
              <div>
                <div style="font-weight: 500">{{ row.name }}</div>
                <div style="color: #909399; font-size: 12px">{{ row.category }} · {{ row.artisanName }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="currentHolder" label="当前持有人" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click.stop="selectArchive(row)">查询</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-else>
      <div class="card chain-header">
        <div>
          <el-button :icon="ArrowLeft" @click="selectedArchive = null" style="margin-right: 12px">返回</el-button>
          <span class="title">{{ selectedArchive.name }}</span>
          <el-tag type="info" style="margin-left: 12px">{{ selectedArchive.archiveNo }}</el-tag>
        </div>
        <div>
          <el-tag :type="chainValid ? 'success' : 'danger'">
            <el-icon><Link /></el-icon> {{ chainValid ? '溯源链完整' : '数据异常' }}
          </el-tag>
        </div>
      </div>

      <el-row :gutter="20">
        <el-col :span="8">
          <div class="card">
            <div class="card-header"><span class="title">基本信息</span></div>
            <div class="info-item"><span class="label">作品名称</span><span class="value">{{ selectedArchive.name }}</span></div>
            <div class="info-item"><span class="label">分类</span><span class="value">{{ selectedArchive.category }}</span></div>
            <div class="info-item"><span class="label">工匠</span><span class="value">{{ selectedArchive.artisanName }}</span></div>
            <div class="info-item"><span class="label">当前持有人</span><span class="value">{{ selectedArchive.currentHolder }}</span></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="title">数据统计</span></div>
            <div class="stat-item" v-for="(item, key) in stats" :key="key">
              <span class="stat-label">{{ item.label }}</span>
              <span class="stat-value">{{ item.value }}</span>
            </div>
          </div>
        </el-col>

        <el-col :span="16">
          <div class="card">
            <div class="card-header">
              <span class="title">溯源区块链</span>
              <div class="legend">
                <span class="legend-item"><i class="dot craft"></i>工序</span>
                <span class="legend-item"><i class="dot transfer"></i>流转</span>
                <span class="legend-item"><i class="dot signature"></i>签章</span>
                <span class="legend-item"><i class="dot material"></i>物料</span>
              </div>
            </div>
            <div class="chain-container">
              <div class="chain-scroll">
                <div
                  v-for="(block, index) in chain"
                  :key="block.id"
                  class="chain-block"
                  :class="block.type"
                >
                  <div class="block-header">
                    <el-tag size="small" :type="blockTypeMap[block.type].tag">
                      {{ blockTypeMap[block.type].label }}
                    </el-tag>
                    <span class="block-index">#{{ index }}</span>
                  </div>
                  <div class="block-title">{{ block.title }}</div>
                  <div class="block-desc">{{ block.description }}</div>
                  <div class="block-meta">
                    <span>{{ block.actor }}</span>
                    <span>{{ formatDate(block.date) }}</span>
                  </div>
                  <div class="block-hash">
                    <div><span class="label">Hash</span> <span class="value">{{ block.hash }}</span></div>
                    <div v-if="block.prevHash"><span class="label">Prev</span> <span class="value">{{ block.prevHash }}</span></div>
                  </div>
                </div>
                <div v-if="chain.length === 0" class="empty">暂无溯源数据</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><span class="title">时间线</span></div>
            <el-timeline>
              <el-timeline-item
                v-for="item in timeline"
                :key="item.id"
                :timestamp="formatDate(item.date)"
                :type="blockTypeMap[item.type].color"
                placement="top"
              >
                <el-card shadow="hover" size="small">
                  <div class="timeline-title">
                    <el-tag size="small" :type="blockTypeMap[item.type].tag">{{ blockTypeMap[item.type].label }}</el-tag>
                    <span>{{ item.title }}</span>
                  </div>
                  <div class="timeline-desc">{{ item.description }}</div>
                  <div class="timeline-meta">
                    <span>操作人: {{ item.actor }}</span>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getArchives } from '@/api/archives'
import { getTraceability, verifyChain } from '@/api/traceability'
import { Search, ArrowLeft, Link } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const loading = ref(false)
const searchKeyword = ref('')
const archives = ref([])
const selectedArchive = ref(null)
const traceData = ref(null)
const chainValid = ref(true)

const statusType = { draft: 'info', reviewing: 'warning', approved: 'success', rejected: 'danger' }
const statusText = { draft: '草稿', reviewing: '审核中', approved: '已通过', rejected: '已拒绝' }

const blockTypeMap = {
  archive: { label: '档案', tag: '', color: '' },
  craft: { label: '工序', tag: 'primary', color: 'primary' },
  transfer: { label: '流转', tag: 'success', color: 'success' },
  signature: { label: '签章', tag: 'warning', color: 'warning' },
  material: { label: '物料', tag: 'info', color: 'info' }
}

const chain = computed(() => traceData.value?.chain || [])
const timeline = computed(() => traceData.value?.timeline || [])

const stats = computed(() => [
  { label: '工序数', value: traceData.value?.stats?.craftSteps || 0 },
  { label: '流转数', value: traceData.value?.stats?.transfers || 0 },
  { label: '签章数', value: traceData.value?.stats?.signatures || 0 },
  { label: '物料使用', value: traceData.value?.stats?.materials || 0 },
  { label: '总节点数', value: traceData.value?.stats?.totalSteps || 0 }
])

const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm')

const searchArchives = async () => {
  loading.value = true
  try {
    const res = await getArchives({ keyword: searchKeyword.value, pageSize: 20 })
    if (res.code === 200) archives.value = res.data.list
  } finally {
    loading.value = false
  }
}

const selectArchive = async (row) => {
  selectedArchive.value = row
  const res = await getTraceability(row.id)
  if (res.code === 200) traceData.value = res.data

  const verifyRes = await verifyChain(row.id)
  if (verifyRes.code === 200) chainValid.value = verifyRes.data.isValid
}

onMounted(() => {
  searchArchives()
})
</script>

<style lang="scss" scoped>
.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #eee;

  .label { color: #909399; }
  .value { color: #303133; font-weight: 500; }
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #eee;

  .stat-label { color: #909399; }
  .stat-value { font-size: 20px; font-weight: 600; color: #409eff; }
}

.legend {
  display: flex;
  gap: 16px;
  font-size: 13px;

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #606266;

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;

      &.craft { background: #409eff; }
      &.transfer { background: #67c23a; }
      &.signature { background: #e6a23c; }
      &.material { background: #909399; }
    }
  }
}

.chain-container {
  overflow-x: auto;
  padding-bottom: 10px;

  .chain-scroll {
    display: flex;
    gap: 16px;
    min-width: max-content;
    padding: 20px 0;
  }
}

.chain-block {
  width: 280px;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  border: 2px solid #dcdfe6;
  position: relative;
  flex-shrink: 0;

  &.craft { border-color: #409eff; background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%); }
  &.transfer { border-color: #67c23a; background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%); }
  &.signature { border-color: #e6a23c; background: linear-gradient(135deg, #fdf6ec 0%, #faecd8 100%); }
  &.material { border-color: #909399; background: linear-gradient(135deg, #f4f4f5 0%, #e9e9eb 100%); }

  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .block-index {
      font-family: monospace;
      color: #909399;
      font-size: 12px;
    }
  }

  .block-title {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .block-desc {
    color: #606266;
    font-size: 13px;
    margin-bottom: 12px;
    min-height: 36px;
  }

  .block-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #909399;
    margin-bottom: 12px;
  }

  .block-hash {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;

    div {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;

      &:last-child { margin-bottom: 0; }

      .label { color: #909399; min-width: 40px; }
      .value {
        font-family: monospace;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #409eff;
      }
    }
  }
}

.timeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 500;
}

.timeline-desc {
  color: #606266;
  margin-bottom: 8px;
}

.timeline-meta {
  font-size: 12px;
  color: #909399;
}

.empty {
  padding: 40px;
  text-align: center;
  color: #909399;
}
</style>
