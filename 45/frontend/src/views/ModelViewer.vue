<template>
  <div class="model-viewer-page">
    <div class="page-header">
      <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
      <h2 class="page-title">三维模型预览 - {{ fossil?.name || '' }}</h2>
      <div class="header-right">
        <el-tag v-if="fossil" :type="getStatusType(fossil.status)">
          {{ getStatusLabel(fossil.status) }}
        </el-tag>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :md="18">
        <el-card class="viewer-card">
          <FossilViewer
            :model-url="currentModelUrl"
            :auto-rotate="true"
            style="height: 600px"
          />
        </el-card>
      </el-col>

      <el-col :md="6">
        <el-card class="info-card">
          <h3>模型信息</h3>
          <div class="info-list">
            <div class="info-item">
              <span class="label">标本编号</span>
              <span class="value">{{ fossil?.specimenNo }}</span>
            </div>
            <div class="info-item">
              <span class="label">拉丁学名</span>
              <span class="value">{{ fossil?.scientificName || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">分类</span>
              <span class="value">{{ fossil ? getCategoryLabel(fossil.category) : '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">地质年代</span>
              <span class="value">{{ fossil?.geologicalPeriod || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">发现地点</span>
              <span class="value">{{ fossil?.discoveryLocation || '-' }}</span>
            </div>
          </div>

          <div class="model-files" v-if="fossil?.modelFiles?.length">
            <h4>模型文件</h4>
            <el-radio-group v-model="selectedFileId" size="small">
              <el-radio
                v-for="file in fossil.modelFiles"
                :key="file.fileId"
                :label="file.fileId"
                border
              >
                {{ file.fileName }}
              </el-radio>
            </el-radio-group>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import FossilViewer from '@/components/FossilViewer.vue';
import { getFossil } from '@/api/fossil';
import { getCategoryLabel, getStatusLabel, getStatusType } from '@/utils/constants';
import type { Fossil } from '@/types';

const route = useRoute();
const router = useRouter();
const fossil = ref<Fossil | null>(null);
const selectedFileId = ref('');

const currentModelUrl = computed(() => {
  if (!fossil.value?.modelFiles?.length) return '';
  const selectedFile = fossil.value.modelFiles.find(f => f.fileId === selectedFileId.value);
  return selectedFile?.url || fossil.value.modelFiles[0]?.url || '';
});

const goBack = () => {
  router.back();
};

const loadFossil = async () => {
  const id = route.params.id as string;
  if (!id) return;
  try {
    const res = await getFossil(id);
    fossil.value = res.data?.fossil || null;
    if (fossil.value?.modelFiles?.length) {
      selectedFileId.value = fossil.value.modelFiles[0].fileId;
    }
  } catch (err) {
    console.error('加载标本信息失败', err);
  }
};

onMounted(() => {
  loadFossil();
});
</script>

<style scoped lang="scss">
.model-viewer-page {
  .page-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;

    .page-title {
      flex: 1;
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  .viewer-card {
    :deep(.el-card__body) {
      padding: 0;
    }
  }

  .info-card {
    h3 {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 600;
    }

    h4 {
      margin: 20px 0 12px;
      font-size: 14px;
      font-weight: 600;
    }
  }

  .info-list {
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;

      .label {
        color: #909399;
        font-size: 13px;
      }

      .value {
        color: #303133;
        font-size: 13px;
        text-align: right;
        max-width: 60%;
        word-break: break-all;
      }
    }
  }
}
</style>
