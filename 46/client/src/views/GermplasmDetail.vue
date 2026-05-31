<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <h1 class="page-title">种质资源详情</h1>
      <div>
        <el-button @click="$router.back()">
          <el-icon><Back /></el-icon> 返回
        </el-button>
        <el-button type="primary" @click="goToEdit">
          <el-icon><Edit /></el-icon> 编辑
        </el-button>
      </div>
    </div>

    <template v-if="detail">
      <div class="detail-section">
        <div class="detail-section-title"><el-icon><InfoFilled /></el-icon> 基本信息</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="label">资源编号</span><span class="value">{{ detail.resource_no }}</span></div>
          <div class="detail-item"><span class="label">种质名称</span><span class="value">{{ detail.name }}</span></div>
          <div class="detail-item"><span class="label">英文名</span><span class="value">{{ detail.english_name || '-' }}</span></div>
          <div class="detail-item"><span class="label">资源分类</span>
            <el-tag v-if="detail.classification_name" type="success">{{ detail.classification_name }}</el-tag>
            <span v-else style="color:#c0c4cc">未分类</span>
          </div>
          <div class="detail-item"><span class="label">分类路径</span>
            <span v-if="detail.classification_path?.length">
              <el-tag v-for="(c, i) in detail.classification_path" :key="c.id" size="small" class="tag-margin" type="info">
                {{ c.name }}
              </el-tag>
            </span>
            <span v-else style="color:#c0c4cc">-</span>
          </div>
          <div class="detail-item"><span class="label">材料类型</span><span class="value">{{ detail.material_type || '-' }}</span></div>
          <div class="detail-item"><span class="label">选育方法</span><span class="value">{{ detail.breeding_method || '-' }}</span></div>
          <div class="detail-item"><span class="label">生物学状态</span><span class="value">{{ detail.biological_status || '-' }}</span></div>
          <div class="detail-item"><span class="label">状态</span>
            <el-tag :type="detail.status === 'active' ? 'success' : 'info'" size="small">
              {{ detail.status === 'active' ? '有效' : '停用' }}
            </el-tag>
          </div>
          <div class="detail-item" style="grid-column: span 2;"><span class="label">描述说明</span><span class="value">{{ detail.description || '-' }}</span></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title"><el-icon><Location /></el-icon> 来源信息</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="label">来源地</span><span class="value">{{ detail.origin || '-' }}</span></div>
          <div class="detail-item"><span class="label">采集年份</span><span class="value">{{ detail.year_collected || '-' }}</span></div>
          <div class="detail-item"><span class="label">采集人</span><span class="value">{{ detail.collector || '-' }}</span></div>
          <div class="detail-item"><span class="label">保存方式</span><span class="value">{{ detail.conservation_method || '-' }}</span></div>
          <div class="detail-item"><span class="label">保存地点</span><span class="value">{{ detail.conservation_location || '-' }}</span></div>
          <div class="detail-item"><span class="label">来源地址</span><span class="value">{{ detail.origin_address || '-' }}</span></div>
          <div class="detail-item" v-if="detail.origin_latitude && detail.origin_longitude">
            <span class="label">地理坐标</span>
            <el-link type="primary" :href="mapUrl" target="_blank">
              {{ detail.origin_latitude }}, {{ detail.origin_longitude }}
            </el-link>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title" style="justify-content:space-between;">
          <span><el-icon><Document /></el-icon> 性状观测记录 ({{ detail.traits?.length || 0 }})</span>
          <el-button size="small" type="primary" @click="goToNewTrait">
            <el-icon><Plus /></el-icon> 新增性状
          </el-button>
        </div>
        <el-table :data="detail.traits || []" size="small" v-if="detail.traits?.length">
          <el-table-column prop="trait_name" label="性状名称" />
          <el-table-column prop="trait_category" label="类别" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.trait_category" size="small">{{ row.trait_category }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="性状值">
            <template #default="{ row }">
              {{ row.trait_value }}<span v-if="row.trait_unit"> {{ row.trait_unit }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="growth_stage" label="生育期" width="100" />
          <el-table-column prop="observation_date" label="观测日期" width="120" />
          <el-table-column prop="observer" label="观测人" width="100" />
          <el-table-column prop="environment" label="环境" width="100" />
        </el-table>
        <el-empty v-else description="暂无性状观测记录" :image-size="80" />
      </div>

      <div class="detail-section">
        <div class="detail-section-title" style="justify-content:space-between;">
          <span><el-icon><Picture /></el-icon> 田间影像 ({{ detail.images?.length || 0 }})</span>
          <el-button size="small" type="primary" @click="showUpload = true">
            <el-icon><Upload /></el-icon> 上传影像
          </el-button>
        </div>
        <div class="image-grid" v-if="detail.images?.length">
          <div class="image-item" v-for="img in detail.images" :key="img.id" @click="previewImage(img)">
            <img :src="`/uploads/${img.filepath}`" :alt="img.original_name" />
            <div class="info">{{ img.original_name }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无田间影像" :image-size="80" />
      </div>
    </template>
    <el-empty v-else description="加载中..." :image-size="80" />

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
          <div class="hint">支持 JPG、PNG、GIF、BMP、WebP 格式，单文件最大 20MB</div>
        </div>
      </el-upload>
      <el-form :model="uploadForm" label-width="100px" style="margin-top:16px;">
        <el-form-item label="拍摄日期">
          <el-date-picker v-model="uploadForm.shoot_date" type="date" value-format="YYYY-MM-DD" />
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
        <el-form-item label="描述">
          <el-input v-model="uploadForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUpload = false">取消</el-button>
        <el-button type="primary" @click="handleUpload" :loading="uploading">确认上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPreview" title="影像预览" width="800px">
      <img v-if="previewImg" :src="`/uploads/${previewImg.filepath}`" style="width:100%;max-height:60vh;object-fit:contain;" />
      <div style="margin-top:12px;color:#606266;font-size:13px;">
        <div>文件名: {{ previewImg?.original_name }}</div>
        <div>大小: {{ formatSize(previewImg?.size) }}</div>
        <div>上传时间: {{ previewImg?.created_at }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const detail = ref(null)
const showUpload = ref(false)
const uploading = ref(false)
const fileList = ref([])
const uploadForm = ref({ shoot_date: '', shoot_location: '', image_type: 'field_photo', description: '' })
const showPreview = ref(false)
const previewImg = ref(null)

const mapUrl = computed(() => {
  if (!detail.value?.origin_latitude || !detail.value?.origin_longitude) return ''
  return `https://www.openstreetmap.org/?mlat=${detail.value.origin_latitude}&mlon=${detail.value.origin_longitude}#map=15/${detail.value.origin_latitude}/${detail.value.origin_longitude}`
})

async function loadDetail() {
  loading.value = true
  try {
    const res = await api.germplasm.detail(route.params.id)
    detail.value = res.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function goToEdit() {
  router.push(`/germplasm/edit/${route.params.id}`)
}

function goToNewTrait() {
  router.push(`/trait/new?germplasm_id=${route.params.id}`)
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
    formData.append('germplasm_id', route.params.id)
    if (uploadForm.value.shoot_date) formData.append('shoot_date', uploadForm.value.shoot_date)
    if (uploadForm.value.shoot_location) formData.append('shoot_location', uploadForm.value.shoot_location)
    formData.append('image_type', uploadForm.value.image_type)
    if (uploadForm.value.description) formData.append('description', uploadForm.value.description)

    await api.image.upload(formData)
    ElMessage.success('上传成功')
    showUpload.value = false
    fileList.value = []
    uploadForm.value = { shoot_date: '', shoot_location: '', image_type: 'field_photo', description: '' }
    loadDetail()
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

function formatSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

onMounted(loadDetail)
</script>
