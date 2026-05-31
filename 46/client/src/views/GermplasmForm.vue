<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ isEdit ? '编辑种质资源' : '登记新种质资源' }}</h1>
      <el-button @click="$router.back()">
        <el-icon><Back /></el-icon> 返回
      </el-button>
    </div>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="140px"
      class="form-container"
      v-loading="loading"
    >
      <BasicInfoSection :form="form" :classification-tree="classificationTree" />
      <OriginInfoSection :form="form" />
      <ConservationInfoSection :form="form" />

      <div class="form-actions">
        <el-button @click="$router.back()">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '保存修改' : '提交登记' }}
        </el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import BasicInfoSection from '@/components/germplasm/BasicInfoSection.vue'
import OriginInfoSection from '@/components/germplasm/OriginInfoSection.vue'
import ConservationInfoSection from '@/components/germplasm/ConservationInfoSection.vue'

const route = useRoute()
const router = useRouter()
const formRef = ref(null)
const isEdit = ref(!!route.params.id)
const loading = ref(false)
const submitting = ref(false)
const classificationTree = ref([])

const form = ref({
  resource_no: '', name: '', english_name: '',
  classification_id: null, material_type: '', breeding_method: '',
  source: '', origin: '', origin_latitude: '', origin_longitude: '', origin_address: '',
  year_collected: null, collector: '',
  conservation_method: '', conservation_location: '',
  biological_status: '', description: '', status: 'active'
})

const rules = {
  name: [{ required: true, message: '请输入种质名称', trigger: 'blur' }]
}

async function loadClassifications() {
  try {
    const res = await api.classification.tree()
    classificationTree.value = res.data || []
  } catch (e) { console.error(e) }
}

async function loadDetail() {
  loading.value = true
  try {
    const res = await api.germplasm.detail(route.params.id)
    Object.assign(form.value, res.data)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请完善必填项')
    return
  }

  submitting.value = true
  try {
    const payload = { ...form.value }
    if (!payload.resource_no) delete payload.resource_no
    if (!payload.classification_id) payload.classification_id = null
    if (isEdit.value) {
      await api.germplasm.update(route.params.id, payload)
      ElMessage.success('种质资源更新成功')
    } else {
      await api.germplasm.create(payload)
      ElMessage.success('种质资源登记成功')
    }
    router.push('/germplasm')
  } catch (e) {
    console.error(e)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadClassifications()
  if (isEdit.value) loadDetail()
})
</script>

<style scoped>
.form-container {
  max-width: 1100px;
}

.form-actions {
  margin-top: 24px;
  text-align: right;
}
</style>
