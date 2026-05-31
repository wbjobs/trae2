<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">性状观测记录</h1>
      <div>
        <el-button type="primary" @click="goToNew">
          <el-icon><Plus /></el-icon> 新增性状记录
        </el-button>
        <el-button @click="loadData">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-input v-model="filters.germplasm_id" placeholder="搜索种质ID" clearable style="width: 180px" @keyup.enter="handleSearch" @clear="handleSearch" />
      <el-select v-model="filters.trait_category" placeholder="性状类别" clearable style="width: 160px" @change="handleSearch">
        <el-option label="农艺性状" value="农艺性状" />
        <el-option label="产量性状" value="产量性状" />
        <el-option label="品质性状" value="品质性状" />
        <el-option label="抗性性状" value="抗性性状" />
        <el-option label="生育期" value="生育期" />
        <el-option label="形态特征" value="形态特征" />
        <el-option label="其他" value="其他" />
      </el-select>
      <el-select v-model="filters.growth_stage" placeholder="生育期阶段" clearable style="width: 160px" @change="handleSearch">
        <el-option label="苗期" value="苗期" />
        <el-option label="分蘖期" value="分蘖期" />
        <el-option label="拔节期" value="拔节期" />
        <el-option label="抽穗期" value="抽穗期" />
        <el-option label="开花期" value="开花期" />
        <el-option label="灌浆期" value="灌浆期" />
        <el-option label="成熟期" value="成熟期" />
      </el-select>
      <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <el-table :data="tableData" stripe style="width: 100%" v-loading="loading">
      <el-table-column label="种质资源" min-width="200">
        <template #default="{ row }">
          <el-link type="primary" @click="goToGermplasm(row.germplasm_id)">
            {{ row.resource_no }} - {{ row.germplasm_name }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="trait_name" label="性状名称" min-width="140" />
      <el-table-column prop="trait_category" label="类别" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.trait_category" size="small" type="success">{{ row.trait_category }}</el-tag>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="性状值" min-width="140">
        <template #default="{ row }">
          <span style="font-weight:600;">{{ row.trait_value }}</span>
          <span v-if="row.trait_unit" style="color:#909399;"> {{ row.trait_unit }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="growth_stage" label="生育期" width="100" />
      <el-table-column prop="observation_date" label="观测日期" width="120" />
      <el-table-column prop="observer" label="观测人" width="100" />
      <el-table-column label="环境" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.environment" size="small" type="info">{{ row.environment }}</el-tag>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="field_location" label="田间位置" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" size="small" @click="handleDelete(row)">
            <el-icon><Delete /></el-icon> 删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 20px; text-align: right;">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'

const router = useRouter()
const loading = ref(false)
const tableData = ref([])
const filters = ref({ germplasm_id: '', trait_category: '', growth_stage: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })

async function loadData() {
  loading.value = true
  try {
    const res = await api.trait.list({
      ...filters.value,
      page: pagination.value.page,
      pageSize: pagination.value.pageSize
    })
    tableData.value = res.data.list
    pagination.value.total = res.data.total
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.value.page = 1
  loadData()
}

function goToNew() {
  router.push('/trait/new')
}

function goToGermplasm(id) {
  router.push(`/germplasm/detail/${id}`)
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除性状记录 "${row.trait_name}" 吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.trait.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

onMounted(loadData)
</script>
