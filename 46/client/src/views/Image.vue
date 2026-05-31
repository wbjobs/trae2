<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">田间影像管理</h1>
      <div>
        <el-button type="primary" @click="showUpload = true">
          <el-icon><Upload /></el-icon> 上传影像
        </el-button>
        <el-button @click="loadData">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-select v-model="filters.image_type" placeholder="影像类型" clearable style="width: 160px" @change="handleSearch">
        <el-option label="田间照片" value="field_photo" />
        <el-option label="生长状态" value="growth_state" />
        <el-option label="病虫害" value="disease" />
        <el-option label="果实特写" value="fruit_closeup" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-input v-model="filters.germplasm_id" placeholder="种质ID" clearable style="width: 140px" @keyup.enter="handleSearch" @clear="handleSearch" />
    </div>

    <div class="image-stats">
      <el-statistic title="影像总数" :value="stats.total || 0" />
      <el-statistic title="存储占用" :value="formatSize(stats.totalSize)" />
      <el-tag v-for="t in stats.byType" :key="t.image_type" class="tag-margin" type="info">
        {{ t.image_type }}: {{ t.count }}
      </el-tag>
    </div>

    <div v-if="tableData.length" class="image-grid-large">
      <div class="image-card" v-for="img in tableData" :key="img.id">
        <div class="image-thumb" @click="previewImage(img)">
          <img :src="`/uploads/${img.filepath}`" :alt="img.original_name" />
          <div class="image-overlay">
            <el-icon :size="28"><ZoomIn /></el-icon>
          </div>
        </div>
        <div class="image-info">
          <div class="image-name" :title="img.original_name">{{ img.original_name }}</div>
          <div class="image-meta">
            <el-tag size="small" type="success">{{ img.image_type }}</el-tag>
            <span>{{ formatSize(img.size) }}</span>
          </div>
          <div class="image-meta" v-if="img.germplasm_name" style="color:#409eff;">
            <el-icon><Collection /></el-icon> {{ img.germplasm_name }}
          </div>
          <div class="image-meta" v-if="img.shoot_date">
            <el-icon><Calendar /></el-icon> {{ img.shoot_date }}
          </div>
          <div class="image-actions">
            <el-button link type="primary" size="small" @click="showEditDialog(img)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(img)">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state" v-loading="loading">
      <el-icon class="icon"><Picture /></el-icon>
      <div class="text">暂无田间影像</div>
    </div>

    <div style="margin-top: 20px; text-align: right;">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[12, 24, 48, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>

    <el-dialog v-model="showUpload" title="上传田间影像" width="600px">
      <el-upload
        drag
        multiple
        :auto-upload="false"
        :file-list="fileList"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        accept="image/*"
      >
        <div class="upload-area">
          <el-icon class="icon"><UploadFilled /></el-icon>
          <div class="text">点击或拖拽图片到此区域上传</div>
          <div class="hint">支持 JPG、PNG、GIF、BMP、WebP 格式，单文件最大 20MB，一次最多 20 张</div>
        </div>
      </el-upload>
      <el-form :model="uploadForm" label-width="100px" style="margin-top:16px;">
        <el-form-item label="关联种质">
          <el-select
            v-model="uploadForm.germplasm_id"
            filterable
            remote
            :remote-method="searchGermplasm"
            :loading="germplasmLoading"
            placeholder="输入资源编号搜索"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="g in germplasmOptions"
              :key="g.id"
              :label="`${g.resource_no} - ${g.name}`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="拍摄日期">
          <el-date-picker v-model="uploadForm.shoot_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="拍摄地点">
          <el-input v-model="uploadForm.shoot_location" placeholder="请输入拍摄地点" />
        </el-form-item>
        <el-form-item label="影像类型">
          <el-select v-model="uploadForm.image_type" style="width:100%">
            <el-option label="田间照片" value="field_photo" />
            <el-option label="生长状态" value="growth_state" />
            <el-option label="病虫害" value="disease" />
            <el-option label="果实特写" value="fruit_closeup" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="拍摄人">
          <el-input v-model="uploadForm.photographer" placeholder="请输入拍摄人" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="uploadForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUpload = false">取消</el-button>
        <el-button type="primary" @click="handleUpload" :loading="uploading">确认上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="编辑影像信息" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="影像类型">
          <el-select v-model="editForm.image_type" style="width:100%">
            <el-option label="田间照片" value="field_photo" />
            <el-option label="生长状态" value="growth_state" />
            <el-option label="病虫害" value="disease" />
            <el-option label="果实特写" value="fruit_closeup" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="拍摄日期">
          <el-date-picker v-model="editForm.shoot_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="拍摄地点">
          <el-input v-model="editForm.shoot_location" />
        </el-form-item>
        <el-form-item label="拍摄人">
          <el-input v-model="editForm.photographer" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="editSubmitting">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPreview" title="影像预览" width="800px">
      <img v-if="previewImg" :src="`/uploads/${previewImg.filepath}`" style="width:100%;max-height:70vh;object-fit:contain;" />
      <div v-if="previewImg" style="margin-top:12px;color:#606266;font-size:13px;">
        <div>文件名: {{ previewImg.original_name }}</div>
        <div>大小: {{ formatSize(previewImg.size) }}</div>
        <div>类型: {{ previewImg.image_type }}</div>
        <div>上传时间: {{ previewImg.created_at }}</div>
        <div v-if="previewImg.description">描述: {{ previewImg.description }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'

const loading = ref(false)
const tableData = ref([])
const stats = ref({})
const filters = ref({ image_type: '', germplasm_id: '' })
const pagination = ref({ page: 1, pageSize: 24, total: 0 })

const showUpload = ref(false)
const uploading = ref(false)
const fileList = ref([])
const uploadForm = ref({
  germplasm_id: null, shoot_date: '', shoot_location: '',
  image_type: 'field_photo', photographer: '', description: ''
})
const germplasmLoading = ref(false)
const germplasmOptions = ref([])

const showEdit = ref(false)
const editSubmitting = ref(false)
const editForm = ref({})
const currentEditId = ref(null)

const showPreview = ref(false)
const previewImg = ref(null)

async function loadData() {
  loading.value = true
  try {
    const [listRes, statsRes] = await Promise.all([
      api.image.list({
        ...filters.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize
      }),
      api.image.stats()
    ])
    tableData.value = listRes.data.list
    pagination.value.total = listRes.data.total
    stats.value = statsRes.data || {}
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

async function searchGermplasm(keyword) {
  if (!keyword) return
  germplasmLoading.value = true
  try {
    const res = await api.germplasm.list({ keyword, pageSize: 20 })
    germplasmOptions.value = res.data.list
  } catch (e) {
    console.error(e)
  } finally {
    germplasmLoading.value = false
  }
}

function handleFileChange(file) {
  fileList.value.push(file.raw)
}

function handleFileRemove(file) {
  fileList.value = fileList.value.filter(f => f.uid !== file.uid)
}

async function handleUpload() {
  if (fileList.value.length === 0) {
    ElMessage.warning('请选择要上传的文件')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    fileList.value.forEach(f => formData.append('files', f))
    if (uploadForm.value.germplasm_id) formData.append('germplasm_id', uploadForm.value.germplasm_id)
    if (uploadForm.value.shoot_date) formData.append('shoot_date', uploadForm.value.shoot_date)
    if (uploadForm.value.shoot_location) formData.append('shoot_location', uploadForm.value.shoot_location)
    formData.append('image_type', uploadForm.value.image_type)
    if (uploadForm.value.photographer) formData.append('photographer', uploadForm.value.photographer)
    if (uploadForm.value.description) formData.append('description', uploadForm.value.description)

    await api.image.upload(formData)
    ElMessage.success('上传成功')
    showUpload.value = false
    fileList.value = []
    uploadForm.value = { germplasm_id: null, shoot_date: '', shoot_location: '', image_type: 'field_photo', photographer: '', description: '' }
    loadData()
  } catch (e) {
    console.error(e)
  } finally {
    uploading.value = false
  }
}

function previewImage(img) {
  previewImg.value = img
  showPreview.value = true
}

function showEditDialog(img) {
  currentEditId.value = img.id
  editForm.value = {
    shoot_date: img.shoot_date,
    shoot_location: img.shoot_location,
    image_type: img.image_type,
    photographer: img.photographer,
    description: img.description
  }
  showEdit.value = true
}

async function handleEditSubmit() {
  editSubmitting.value = true
  try {
    await api.image.update(currentEditId.value, editForm.value)
    ElMessage.success('更新成功')
    showEdit.value = false
    loadData()
  } catch (e) {
    console.error(e)
  } finally {
    editSubmitting.value = false
  }
}

async function handleDelete(img) {
  try {
    await ElMessageBox.confirm(`确定删除影像 "${img.original_name}" 吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.image.delete(img.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

function formatSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

onMounted(loadData)
</script>

<style scoped>
.image-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  background: #fff;
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.image-stats :deep(.el-statistic) {
  margin-right: 16px;
}

.image-stats :deep(.el-statistic__head) {
  color: #909399;
  font-size: 13px;
}

.image-stats :deep(.el-statistic__content) {
  font-size: 22px;
  font-weight: 700;
}

.image-grid-large {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.image-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.image-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
}

.image-thumb {
  position: relative;
  cursor: pointer;
  overflow: hidden;
}

.image-thumb img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
  transition: transform 0.3s;
}

.image-thumb:hover img {
  transform: scale(1.05);
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.3s;
}

.image-thumb:hover .image-overlay {
  opacity: 1;
}

.image-info {
  padding: 12px;
}

.image-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.image-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.image-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
</style>
