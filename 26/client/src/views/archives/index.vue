<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">档案管理</div>
      <div class="actions">
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建档案</el-button>
      </div>
    </div>

    <div class="card">
      <div class="search-bar">
        <el-input v-model="filters.keyword" placeholder="搜索作品名称" clearable style="width: 200px" @keyup.enter="fetchData" />
        <el-select v-model="filters.category" placeholder="分类" clearable style="width: 150px">
          <el-option label="漆器" value="漆器" />
          <el-option label="木雕" value="木雕" />
          <el-option label="金属工艺" value="金属工艺" />
          <el-option label="刺绣" value="刺绣" />
          <el-option label="陶瓷" value="陶瓷" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 150px">
          <el-option label="草稿" value="draft" />
          <el-option label="审核中" value="reviewing" />
          <el-option label="已通过" value="approved" />
          <el-option label="已拒绝" value="rejected" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="fetchData">搜索</el-button>
        <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="archiveNo" label="档案编号" width="140" />
        <el-table-column label="作品" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 12px">
              <el-image v-if="row.images" :src="JSON.parse(row.images)[0]" style="width: 50px; height: 50px" fit="cover" />
              <div>
                <div style="font-weight: 500">{{ row.name }}</div>
                <div style="color: #909399; font-size: 12px">{{ row.category }} · {{ row.craftType }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="artisanName" label="工匠" width="100" />
        <el-table-column prop="currentHolder" label="当前持有人" width="120" />
        <el-table-column label="估值" width="120">
          <template #default="{ row }">¥{{ Number(row.estimatedValue).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button type="primary" size="small" @click="viewDetail(row)">详情</el-button>
              <el-button type="success" size="small" @click="viewTrace(row)">溯源</el-button>
              <el-button size="small" @click="handleEdit(row)" v-if="row.status === 'draft'">编辑</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="fetchData"
        @size-change="fetchData"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑档案' : '新建档案'" width="700px" destroy-on-close>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="作品名称" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="form.category" style="width: 100%">
                <el-option label="漆器" value="漆器" />
                <el-option label="木雕" value="木雕" />
                <el-option label="金属工艺" value="金属工艺" />
                <el-option label="刺绣" value="刺绣" />
                <el-option label="陶瓷" value="陶瓷" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工艺类型">
              <el-input v-model="form.craftType" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="尺寸">
              <el-input v-model="form.dimensions" placeholder="如: 高35cm 口径12cm" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="重量">
              <el-input v-model="form.weight" placeholder="如: 1.2kg" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="估值(元)">
              <el-input-number v-model="form.estimatedValue" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="材料">
              <el-input v-model="form.materials" placeholder="如: 天然大漆、夏布、金箔" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="3" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="图片">
              <el-input v-model="form.imageUrl" placeholder="输入图片URL，多个用逗号分隔" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getArchives, createArchive, updateArchive } from '@/api/archives'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const router = useRouter()
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()
const tableData = ref([])

const filters = reactive({
  keyword: '',
  category: '',
  status: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const form = reactive({
  id: null,
  name: '',
  category: '',
  craftType: '',
  dimensions: '',
  weight: '',
  materials: '',
  description: '',
  estimatedValue: 0,
  imageUrl: ''
})

const rules = {
  name: [{ required: true, message: '请输入作品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }]
}

const statusType = { draft: 'info', reviewing: 'warning', approved: 'success', rejected: 'danger' }
const statusText = { draft: '草稿', reviewing: '审核中', approved: '已通过', rejected: '已拒绝' }

const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getArchives({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.category = ''
  filters.status = ''
  pagination.page = 1
  fetchData()
}

const handleCreate = () => {
  isEdit.value = false
  Object.keys(form).forEach(key => {
    form[key] = key === 'estimatedValue' ? 0 : ''
    form.id = null
  })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  form.imageUrl = row.images ? JSON.parse(row.images).join(',') : ''
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    const payload = { ...form }
    if (form.imageUrl) {
      payload.images = form.imageUrl.split(',').map(u => u.trim()).filter(u => u)
    }

    if (isEdit.value) {
      await updateArchive(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createArchive(payload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (err) {}
}

const viewDetail = (row) => router.push(`/archives/${row.id}`)
const viewTrace = (row) => router.push(`/traceability/${row.id}`)

onMounted(() => {
  fetchData()
})
</script>
