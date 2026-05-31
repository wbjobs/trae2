<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">新增性状观测记录</h1>
      <el-button @click="$router.back()">
        <el-icon><Back /></el-icon> 返回
      </el-button>
    </div>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="130px"
      class="form-container"
      v-loading="loading"
    >
      <el-card shadow="never" class="form-card">
        <template #header>
          <span class="section-title"><el-icon><Collection /></el-icon> 关联种质资源</span>
        </template>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="种质资源" prop="germplasm_id">
              <el-select
                v-model="form.germplasm_id"
                filterable
                remote
                :remote-method="searchGermplasm"
                :loading="germplasmLoading"
                placeholder="输入资源编号或名称搜索"
                style="width: 100%"
                clearable
              >
                <el-option
                  v-for="g in germplasmOptions"
                  :key="g.id"
                  :label="`${g.resource_no} - ${g.name}${g.english_name ? ' (' + g.english_name + ')' : ''}`"
                  :value="g.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="form-card">
        <template #header>
          <span class="section-title"><el-icon><EditPen /></el-icon> 性状信息</span>
        </template>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="性状名称" prop="trait_name">
              <el-input v-model="form.trait_name" placeholder="如：株高、穗长、千粒重等" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="性状类别" prop="trait_category">
              <el-select v-model="form.trait_category" placeholder="请选择性状类别" clearable style="width:100%">
                <el-option label="农艺性状" value="农艺性状" />
                <el-option label="产量性状" value="产量性状" />
                <el-option label="品质性状" value="品质性状" />
                <el-option label="抗性性状" value="抗性性状" />
                <el-option label="生育期" value="生育期" />
                <el-option label="形态特征" value="形态特征" />
                <el-option label="生理生化" value="生理生化" />
                <el-option label="分子标记" value="分子标记" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="性状值" prop="trait_value">
              <el-input v-model="form.trait_value" placeholder="请输入观测值" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="form.trait_unit" placeholder="如：cm、g、%、天等" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生育期阶段">
              <el-select v-model="form.growth_stage" placeholder="请选择生育期" clearable style="width:100%">
                <el-option label="苗期" value="苗期" />
                <el-option label="分蘖期" value="分蘖期" />
                <el-option label="拔节期" value="拔节期" />
                <el-option label="抽穗期" value="抽穗期" />
                <el-option label="开花期" value="开花期" />
                <el-option label="灌浆期" value="灌浆期" />
                <el-option label="成熟期" value="成熟期" />
                <el-option label="全生育期" value="全生育期" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="观测日期">
              <el-date-picker v-model="form.observation_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="form-card">
        <template #header>
          <span class="section-title"><el-icon><Location /></el-icon> 观测环境与位置</span>
        </template>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="观测人">
              <el-input v-model="form.observer" placeholder="请输入观测人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="环境条件">
              <el-select v-model="form.environment" placeholder="请选择环境" clearable style="width:100%">
                <el-option label="大田" value="大田" />
                <el-option label="温室" value="温室" />
                <el-option label="盆栽" value="盆栽" />
                <el-option label="水培" value="水培" />
                <el-option label="实验室" value="实验室" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="田间位置">
              <el-input v-model="form.field_location" placeholder="如：A区-3号圃-第5行" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度">
              <el-input v-model="form.latitude" placeholder="纬度" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经度">
              <el-input v-model="form.longitude" placeholder="经度" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="地理定位">
              <div style="display:flex;gap:12px;">
                <el-input v-model="geoKeyword" placeholder="输入地点搜索地理位置" style="flex:1" />
                <el-button type="primary" @click="searchGeo" :loading="geoLoading">
                  <el-icon><Search /></el-icon> 搜索
                </el-button>
              </div>
              <div v-if="geoResults.length" style="margin-top:10px;">
                <el-radio-group v-model="selectedGeoIdx" @change="applyGeo">
                  <el-radio v-for="(r, i) in geoResults" :key="i" :label="i" style="display:block;margin-bottom:6px;">
                    {{ r.display_name }}
                    <span style="color:#909399;font-size:12px;margin-left:6px;">[{{ r.latitude }}, {{ r.longitude }}]</span>
                  </el-radio>
                </el-radio-group>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="请输入备注信息" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <div class="form-actions">
        <el-button @click="$router.back()">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          提交记录
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

const route = useRoute()
const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const submitting = ref(false)
const germplasmLoading = ref(false)
const germplasmOptions = ref([])
const geoKeyword = ref('')
const geoLoading = ref(false)
const geoResults = ref([])
const selectedGeoIdx = ref(null)

const form = ref({
  germplasm_id: null,
  trait_name: '',
  trait_category: '',
  trait_value: '',
  trait_unit: '',
  observation_date: '',
  observer: '',
  field_location: '',
  latitude: '',
  longitude: '',
  growth_stage: '',
  environment: '',
  notes: ''
})

const rules = {
  germplasm_id: [{ required: true, message: '请选择种质资源', trigger: 'change' }],
  trait_name: [{ required: true, message: '请输入性状名称', trigger: 'blur' }],
  trait_value: [{ required: true, message: '请输入性状值', trigger: 'blur' }]
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

async function searchGeo() {
  if (!geoKeyword.value.trim()) return
  geoLoading.value = true
  try {
    const res = await api.geolocation.search({ q: geoKeyword.value, limit: 5 })
    geoResults.value = res.data || []
  } catch (e) { console.error(e) }
  finally { geoLoading.value = false }
}

function applyGeo(idx) {
  const r = geoResults.value[idx]
  if (r) {
    form.value.latitude = r.latitude
    form.value.longitude = r.longitude
    form.value.field_location = r.display_name
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
    await api.trait.create({ ...form.value })
    ElMessage.success('性状记录提交成功')
    router.push('/trait')
  } catch (e) {
    console.error(e)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (route.query.germplasm_id) {
    form.value.germplasm_id = parseInt(route.query.germplasm_id)
  }
})
</script>

<style scoped>
.form-container { max-width: 1100px; }
.form-card { margin-bottom: 16px; border: 1px solid #ebeef5; }
.section-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
</style>
