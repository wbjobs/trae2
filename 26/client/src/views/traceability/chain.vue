<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <el-button :icon="ArrowLeft" @click="$router.back()">返回列表</el-button>
        <span class="title" style="margin-left: 12px">溯源链详情</span>
      </div>
    </div>

    <div class="card" v-if="archive">
      <div class="chain-header-info">
        <div class="archive-info">
          <h2>{{ archive.name }}</h2>
          <p>{{ archive.archiveNo }} · {{ archive.category }} · {{ archive.artisanName }}</p>
        </div>
        <el-alert
          :title="verifyResult?.message || '链数据验证中...'"
          :type="verifyResult?.isValid ? 'success' : 'error'"
          :closable="false"
        />
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="title">区块结构</span></div>
      <div ref="chainChartRef" class="chain-chart"></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="title">区块详情</span></div>
      <el-table :data="blocks" v-loading="loading">
        <el-table-column label="区块" width="80">
          <template #default="{ $index }">#{{ $index }}</template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeMap[row.type]?.tag">{{ typeMap[row.type]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内容">
          <template #default="{ row }">
            <div class="block-content">
              <div class="block-type">{{ row.data.type }}</div>
              <div class="block-data">{{ JSON.stringify(row.data).slice(0, 80) }}...</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="哈希" width="300">
          <template #default="{ row }">
            <span class="mono">{{ row.hash }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.timestamp) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import { getArchive } from '@/api/archives'
import { getChain, verifyChain } from '@/api/traceability'
import { ArrowLeft } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const route = useRoute()
const archiveId = route.params.id
const archive = ref(null)
const blocks = ref([])
const verifyResult = ref(null)
const loading = ref(false)
const chainChartRef = ref()

const typeMap = {
  genesis: { label: '创世', tag: 'primary', color: '#409eff' },
  craft: { label: '工序', tag: 'primary', color: '#667eea' },
  transfer: { label: '流转', tag: 'success', color: '#67c23a' },
  signature: { label: '签章', tag: 'warning', color: '#e6a23c' }
}

const formatDate = (ts) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss')

const initChart = () => {
  if (!chainChartRef.value || blocks.value.length === 0) return

  const chart = echarts.init(chainChartRef.value)

  const nodes = blocks.value.map((block, index) => ({
    id: index.toString(),
    name: `${typeMap[block.type]?.label || '区块'} #${index}`,
    symbolSize: 50,
    itemStyle: { color: typeMap[block.type]?.color || '#909399' },
    label: { show: true, fontSize: 12 }
  }))

  const links = blocks.value.slice(1).map((_, index) => ({
    source: index.toString(),
    target: (index + 1).toString(),
    lineStyle: { color: '#409eff', width: 2, type: 'solid' }
  }))

  chart.setOption({
    tooltip: {
      formatter: (params) => {
        if (params.dataType === 'node') {
          const block = blocks.value[parseInt(params.data.id)]
          return `
            <div style="max-width: 300px">
              <strong>${params.data.name}</strong><br/>
              类型: ${block.type}<br/>
              数据: ${JSON.stringify(block.data).slice(0, 100)}...<br/>
              哈希: ${block.hash.slice(0, 20)}...
            </div>
          `
        }
        return ''
      }
    },
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links: links,
      roam: true,
      force: {
        repulsion: 400,
        edgeLength: 120,
        gravity: 0.1
      },
      label: { position: 'right', formatter: '{b}' },
      edgeLabel: { show: true, formatter: 'prev →', fontSize: 10, color: '#909399' },
      lineStyle: { curveness: 0.2 }
    }]
  })

  window.addEventListener('resize', () => chart.resize())
}

const fetchData = async () => {
  loading.value = true
  try {
    const [archiveRes, chainRes, verifyRes] = await Promise.all([
      getArchive(archiveId),
      getChain(archiveId),
      verifyChain(archiveId)
    ])

    if (archiveRes.code === 200) archive.value = archiveRes.data
    if (chainRes.code === 200) blocks.value = chainRes.data
    if (verifyRes.code === 200) verifyResult.value = verifyRes.data

    await nextTick()
    initChart()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style lang="scss" scoped>
.chain-header-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;

  .archive-info h2 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  .archive-info p {
    margin: 0;
    color: #909399;
  }
}

.chain-chart {
  height: 400px;
}

.block-content {
  .block-type {
    font-weight: 500;
    margin-bottom: 4px;
  }

  .block-data {
    font-family: monospace;
    font-size: 12px;
    color: #909399;
  }
}

.mono {
  font-family: monospace;
  font-size: 12px;
  color: #409eff;
}
</style>
