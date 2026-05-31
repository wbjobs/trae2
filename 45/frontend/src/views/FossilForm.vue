<template>
  <div class="fossil-form">
    <div class="page-header">
      <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
      <h2 class="page-title">{{ isEdit ? '编辑标本' : '新建标本' }}</h2>
    </div>

    <el-card class="form-card">
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
      >
        <el-row :gutter="20">
          <el-col :md="12">
            <el-form-item label="标本编号" prop="specimenNo">
              <el-input v-model="formData.specimenNo" placeholder="请输入标本编号" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="标本名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入标本名称" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="拉丁学名">
              <el-input v-model="formData.scientificName" placeholder="请输入拉丁学名" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="formData.category" placeholder="请选择分类" style="width: 100%">
                <el-option
                  v-for="opt in CATEGORY_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="地质年代">
              <el-input v-model="formData.geologicalPeriod" placeholder="如：白垩纪晚期" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="地质年龄">
              <el-input v-model="formData.geologicalAge" placeholder="如：约6800万年前" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="发现地点">
              <el-input v-model="formData.discoveryLocation" placeholder="请输入发现地点" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="发现日期">
              <el-date-picker
                v-model="formData.discoveryDate"
                type="date"
                placeholder="选择日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="发现者">
              <el-input v-model="formData.discoverer" placeholder="请输入发现者" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="formData.status" placeholder="请选择状态" style="width: 100%">
                <el-option
                  v-for="opt in STATUS_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="当前位置" prop="currentLocation">
              <el-input v-model="formData.currentLocation" placeholder="请输入当前位置" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="存储条件">
              <el-input v-model="formData.storageCondition" placeholder="请输入存储条件" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="获取方式">
              <el-input v-model="formData.acquisitionMethod" placeholder="如：考古发掘、捐赠" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="获取日期">
              <el-date-picker
                v-model="formData.acquisitionDate"
                type="date"
                placeholder="选择日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :md="6">
            <el-form-item label="长度">
              <el-input-number v-model="formData.dimensions.length" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="6">
            <el-form-item label="宽度">
              <el-input-number v-model="formData.dimensions.width" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="6">
            <el-form-item label="高度">
              <el-input-number v-model="formData.dimensions.height" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="6">
            <el-form-item label="重量">
              <el-input-number v-model="formData.dimensions.weight" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="单位">
              <el-input v-model="formData.dimensions.unit" placeholder="如：cm, kg" />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="保存状况">
              <el-input v-model="formData.preservationStatus" placeholder="请输入保存状况" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="特征描述">
              <el-input
                v-model="formData.features"
                type="textarea"
                :rows="3"
                placeholder="请输入特征描述"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="详细描述" prop="description">
              <el-input
                v-model="formData.description"
                type="textarea"
                :rows="4"
                placeholder="请输入详细描述"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="标签">
              <el-select
                v-model="formData.tags"
                multiple
                filterable
                allow-create
                placeholder="输入标签后按回车添加"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input
                v-model="formData.remarks"
                type="textarea"
                :rows="2"
                placeholder="请输入备注信息"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="三维模型">
              <div class="model-upload">
                <el-upload
                  :action="uploadAction"
                  :headers="uploadHeaders"
                  :show-file-list="true"
                  :file-list="modelFileList"
                  :on-success="handleUploadSuccess"
                  :on-remove="handleUploadRemove"
                  :before-upload="beforeUpload"
                  accept=".glb,.gltf,.ply,.obj,.3ds,.stl,.fbx"
                  :limit="5"
                  :http-request="customUpload"
                >
                  <el-button type="primary" :icon="Upload" :loading="uploading">
                    上传模型文件
                  </el-button>
                  <template #tip>
                    <div class="el-upload__tip">
                      支持 .glb, .gltf, .ply, .obj, .3ds, .stl, .fbx 格式，单个文件最大 500MB。
                      大文件自动启用分片上传，支持断点续传。
                    </div>
                  </template>
                </el-upload>
                <div v-if="chunkUploadInfo.show" class="chunk-progress">
                  <div class="progress-header">
                    <span>{{ chunkUploadInfo.fileName }}</span>
                    <span class="progress-text">{{ chunkUploadInfo.progress }}% ({{ chunkUploadInfo.current }}/{{ chunkUploadInfo.total }} 分片)</span>
                  </div>
                  <el-progress 
                    :percentage="chunkUploadInfo.progress" 
                    :status="chunkUploadInfo.status === 'failed' ? 'exception' : undefined"
                    :stroke-width="12"
                  />
                  <div class="progress-actions">
                    <el-button 
                      size="small" 
                      type="danger" 
                      @click="cancelChunkUpload"
                      :disabled="chunkUploadInfo.status === 'merging'"
                    >
                      取消上传
                    </el-button>
                  </div>
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '创建标本' }}
          </el-button>
          <el-button @click="goBack">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadFile, type UploadRequestOptions } from 'element-plus';
import { ArrowLeft, Upload } from '@element-plus/icons-vue';
import { getFossil, createFossil, updateFossil } from '@/api/fossil';
import { uploadModel, uploadModelChunked, cancelChunkUpload as cancelChunkUploadApi, CHUNK_SIZE } from '@/api/storage';
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import type { Fossil, ModelFile } from '@/types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const isEdit = computed(() => !!route.params.id);
const submitting = ref(false);
const uploading = ref(false);
const modelFileList = ref<UploadFile[]>([]);
const currentUploadId = ref<string | null>(null);

const chunkUploadInfo = reactive({
  show: false,
  fileName: '',
  progress: 0,
  current: 0,
  total: 0,
  status: '' as 'uploading' | 'merging' | 'failed' | ''
});

const uploadAction = '/api/storage/upload';
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${userStore.token}`
}));

const formData = reactive<any>({
  specimenNo: '',
  name: '',
  scientificName: '',
  category: '',
  geologicalPeriod: '',
  geologicalAge: '',
  discoveryLocation: '',
  discoveryDate: '',
  discoverer: '',
  status: 'stored',
  currentLocation: '',
  storageCondition: '',
  acquisitionMethod: '',
  acquisitionDate: '',
  dimensions: {
    length: undefined,
    width: undefined,
    height: undefined,
    weight: undefined,
    unit: 'cm'
  },
  preservationStatus: '',
  features: '',
  description: '',
  tags: [],
  remarks: '',
  modelFiles: []
});

const formRules: FormRules = {
  specimenNo: [{ required: true, message: '请输入标本编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入标本名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  currentLocation: [{ required: true, message: '请输入当前位置', trigger: 'blur' }],
  description: [{ required: true, message: '请输入详细描述', trigger: 'blur' }]
};

const goBack = () => router.back();

const beforeUpload = (file: File) => {
  const allowedTypes = ['.glb', '.gltf', '.ply', '.obj', '.3ds', '.stl', '.fbx'];
  const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedTypes.includes(fileExt)) {
    ElMessage.error('不支持的文件格式');
    return false;
  }
  if (file.size > 500 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 500MB');
    return false;
  }
  uploading.value = true;
  return true;
};

const customUpload = async (options: UploadRequestOptions) => {
  const { file, onSuccess, onError } = options;
  const fileObj = file as File;

  try {
    let result;

    if (fileObj.size > CHUNK_SIZE * 2) {
      chunkUploadInfo.show = true;
      chunkUploadInfo.fileName = fileObj.name;
      chunkUploadInfo.progress = 0;
      chunkUploadInfo.current = 0;
      chunkUploadInfo.total = Math.ceil(fileObj.size / CHUNK_SIZE);
      chunkUploadInfo.status = 'uploading';

      result = await uploadModelChunked(fileObj, (progress, current, total) => {
        chunkUploadInfo.progress = progress;
        chunkUploadInfo.current = current;
        chunkUploadInfo.total = total;
      });

      chunkUploadInfo.status = 'merging';
    } else {
      result = await uploadModel(fileObj, (progress) => {
        chunkUploadInfo.show = true;
        chunkUploadInfo.fileName = fileObj.name;
        chunkUploadInfo.progress = progress;
        chunkUploadInfo.status = 'uploading';
      });
    }

    chunkUploadInfo.show = false;
    uploading.value = false;

    if (onSuccess) {
      onSuccess({ status: 'success', data: result }, file as any);
    }

    formData.modelFiles.push(result);
    ElMessage.success('上传成功');
  } catch (error: any) {
    chunkUploadInfo.status = 'failed';
    uploading.value = false;
    ElMessage.error(error.message || '上传失败');
    if (onError) {
      onError(error);
    }
  }
};

const cancelChunkUpload = async () => {
  if (!currentUploadId.value) return;

  try {
    await cancelChunkUploadApi(currentUploadId.value);
    chunkUploadInfo.show = false;
    currentUploadId.value = null;
    uploading.value = false;
    ElMessage.info('上传已取消');
  } catch (error) {
    ElMessage.error('取消上传失败');
  }
};

const handleUploadSuccess = (response: any, file: UploadFile) => {
  uploading.value = false;
  if (response.status === 'success' && response.data) {
    formData.modelFiles.push(response.data);
    ElMessage.success('上传成功');
  } else {
    ElMessage.error(response.message || '上传失败');
  }
};

const handleUploadRemove = (file: UploadFile) => {
  const index = formData.modelFiles.findIndex((f: ModelFile) => f.fileId === file.response?.data?.fileId);
  if (index > -1) {
    formData.modelFiles.splice(index, 1);
  }
};

const loadFossil = async () => {
  const id = route.params.id as string;
  if (!id) return;
  try {
    const res = await getFossil(id);
    const fossil = res.data?.fossil;
    if (fossil) {
      Object.assign(formData, fossil);
      if (fossil.dimensions) {
        formData.dimensions = { ...fossil.dimensions };
      }
      formData.tags = fossil.tags || [];
      formData.modelFiles = fossil.modelFiles || [];
      modelFileList.value = formData.modelFiles.map((f: ModelFile) => ({
        name: f.fileName,
        size: f.fileSize,
        status: 'success',
        response: { data: f }
      }));
    }
  } catch (err) {
    console.error('加载标本信息失败', err);
  }
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      try {
        const data = { ...formData };
        if (isEdit.value) {
          await updateFossil(route.params.id as string, data);
          ElMessage.success('修改成功');
        } else {
          await createFossil(data);
          ElMessage.success('创建成功');
        }
        router.push('/fossils');
      } catch (err) {
      } finally {
        submitting.value = false;
      }
    }
  });
};

onMounted(() => {
  if (isEdit.value) {
    loadFossil();
  }
});
</script>

<style scoped lang="scss">
.fossil-form {
  .page-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;

    .page-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  .form-card {
    :deep(.el-card__body) {
      padding: 30px;
    }
  }

  .model-upload {
    width: 100%;
  }
}
</style>
