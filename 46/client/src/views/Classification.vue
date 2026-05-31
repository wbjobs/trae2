<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">资源分类管理</h1>
      <el-button type="primary" @click="openAddDialog(null)">
        <el-icon><Plus /></el-icon> 新增顶级分类
      </el-button>
    </div>

    <div class="two-column-layout">
      <el-card shadow="never" class="tree-card">
        <template #header>
          <span style="font-weight:600;"><el-icon><Menu /></el-icon> 分类树</span>
        </template>
        <el-tree
          :data="treeData"
          :props="{ label: 'name', children: 'children' }"
          :default-expand-all="true"
          node-key="id"
          :expand-on-click-node="false"
          highlight-current
          ref="treeRef"
        >
          <template #default="{ node, data }">
            <span class="tree-node">
              <span>{{ node.label }}</span>
              <span class="tree-actions">
                <el-tag size="small" type="info" style="margin-left:6px;">{{ data.code || '—' }}</el-tag>
                <el-button link type="primary" size="small" @click.stop="openAddDialog(data)">
                  <el-icon><Plus /></el-icon>
                </el-button>
                <el-button link type="primary" size="small" @click.stop="openEditDialog(data)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button link type="danger" size="small" @click.stop="handleDelete(data)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </span>
            </span>
          </template>
        </el-tree>
      </el-card>

      <el-card shadow="never" class="list-card">
        <template #header>
          <span style="font-weight:600;"><el-icon><List /></el-icon> 分类列表</span>
        </template>
        <el-table :data="flatData" stripe size="small">
          <el-table-column prop="name" label="分类名称" min-width="150" />
          <el-table-column prop="code" label="分类编码" width="120" />
          <el-table-column prop="level" label="层级" width="70" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="parent_name" label="父级分类" width="120" />
          <el-table-column label="关联资源数" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" type="success">{{ row.germplasm_count || 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sort_order" label="排序" width="70" align="center" />
          <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
        </el-table>
      </el-card>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form :model="dialogForm" :rules="dialogRules" ref="dialogFormRef" label-width="100px">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="dialogForm.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="分类编码">
          <el-input v-model="dialogForm.code" placeholder="请输入分类编码" />
        </el-form-item>
        <el-form-item label="父级分类">
          <el-tree-select
            v-model="dialogForm.parent_id"
            :data="parentOptions"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            placeholder="无（顶级分类）"
            clearable
          />
        </el-form-item>
        <el-form-item label="层级">
          <el-input-number v-model="dialogForm.level" :min="1" :max="5" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dialogForm.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="dialogForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleDialogSubmit" :loading="dialogSubmitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'

const treeData = ref([])
const flatData = ref([])
const parentOptions = ref([])

const dialogVisible = ref(false)
const dialogTitle = ref('新增分类')
const dialogMode = ref('add')
const dialogSubmitting = ref(false)
const dialogFormRef = ref(null)
const dialogForm = ref({
  id: null, name: '', code: '', parent_id: null, level: 1, description: '', sort_order: 0
})

const dialogRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
}

async function loadData() {
  try {
    const [treeRes, flatRes] = await Promise.all([
      api.classification.tree(),
      api.classification.flat()
    ])
    treeData.value = treeRes.data || []
    parentOptions.value = treeRes.data || []

    const list = flatRes.data || []
    for (const item of list) {
      try {
        const detail = await api.classification.detail(item.id)
        item.germplasm_count = detail.data?.germplasm_count || 0
      } catch (e) {}
    }
    flatData.value = list
  } catch (e) {
    console.error(e)
  }
}

function openAddDialog(parent) {
  dialogMode.value = 'add'
  dialogTitle.value = '新增分类'
  dialogForm.value = {
    id: null,
    name: '',
    code: '',
    parent_id: parent?.id || null,
    level: (parent?.level || 0) + 1,
    description: '',
    sort_order: 0
  }
  dialogVisible.value = true
}

function openEditDialog(data) {
  dialogMode.value = 'edit'
  dialogTitle.value = '编辑分类'
  dialogForm.value = { ...data }
  dialogVisible.value = true
}

async function handleDialogSubmit() {
  if (!dialogFormRef.value) return
  try {
    await dialogFormRef.value.validate()
  } catch { return }

  dialogSubmitting.value = true
  try {
    if (dialogMode.value === 'add') {
      await api.classification.create({ ...dialogForm.value })
      ElMessage.success('分类创建成功')
    } else {
      await api.classification.update(dialogForm.value.id, { ...dialogForm.value })
      ElMessage.success('分类更新成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (e) {
    console.error(e)
  } finally {
    dialogSubmitting.value = false
  }
}

async function handleDelete(data) {
  try {
    await ElMessageBox.confirm(`确定删除分类 "${data.name}" 吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.classification.delete(data.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

onMounted(loadData)
</script>

<style scoped>
.two-column-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 16px;
  height: calc(100vh - 160px);
}

.tree-card, .list-card {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tree-card :deep(.el-card__body),
.list-card :deep(.el-card__body) {
  overflow-y: auto;
  flex: 1;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 8px;
}

.tree-actions {
  display: none;
}

.tree-node:hover .tree-actions {
  display: inline-flex;
}
</style>
