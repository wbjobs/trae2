<template>
  <div class="fossil-detail">
    <div class="page-header">
      <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
      <h2 class="page-title">标本详情</h2>
      <div class="header-actions">
        <el-button
          type="primary"
          :icon="View"
          v-if="fossil?.modelFiles?.length"
          @click="goToViewer"
        >
          三维预览
        </el-button>
        <el-button
          type="warning"
          :icon="Edit"
          v-if="userStore.hasPermission('admin', 'curator')"
          @click="goToEdit"
        >
          编辑
        </el-button>
      </div>
    </div>

    <el-row :gutter="20" v-if="fossil">
      <el-col :md="16">
        <el-card class="detail-card">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="标本编号">
              {{ fossil.specimenNo }}
            </el-descriptions-item>
            <el-descriptions-item label="标本名称">
              {{ fossil.name }}
            </el-descriptions-item>
            <el-descriptions-item label="拉丁学名">
              {{ fossil.scientificName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="分类">
              <el-tag size="small">{{ getCategoryLabel(fossil.category) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="地质年代">
              {{ fossil.geologicalPeriod || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="地质年龄">
              {{ fossil.geologicalAge || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="发现地点">
              {{ fossil.discoveryLocation || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="发现日期">
              {{ fossil.discoveryDate ? formatDate(fossil.discoveryDate) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="发现者">
              {{ fossil.discoverer || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(fossil.status)" size="small">
                {{ getStatusLabel(fossil.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="当前位置">
              {{ fossil.currentLocation }}
            </el-descriptions-item>
            <el-descriptions-item label="存储条件">
              {{ fossil.storageCondition || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="获取方式">
              {{ fossil.acquisitionMethod || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="获取日期">
              {{ fossil.acquisitionDate ? formatDate(fossil.acquisitionDate) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="尺寸" :span="2">
              <span v-if="fossil.dimensions">
                {{ fossil.dimensions.length || '-' }} × {{ fossil.dimensions.width || '-' }} × {{ fossil.dimensions.height || '-' }} {{ fossil.dimensions.unit }}
                <span v-if="fossil.dimensions.weight">，重量：{{ fossil.dimensions.weight }} {{ fossil.dimensions.unit }}</span>
              </span>
              <span v-else>-</span>
            </el-descriptions-item>
            <el-descriptions-item label="保存状况" :span="2">
              {{ fossil.preservationStatus || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="特征描述" :span="2">
              {{ fossil.features || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="详细描述" :span="2">
              {{ fossil.description }}
            </el-descriptions-item>
            <el-descriptions-item label="标签" :span="2">
              <el-tag
                v-for="tag in fossil.tags"
                :key="tag"
                size="small"
                style="margin-right: 8px"
              >
                {{ tag }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">
              {{ fossil.remarks || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="创建人">
              {{ getUserName(fossil.createdBy) }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDate(fossil.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="更新人">
              {{ getUserName(fossil.updatedBy) }}
            </el-descriptions-item>
            <el-descriptions-item label="更新时间">
              {{ formatDate(fossil.updatedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :md="8">
        <el-card class="model-card">
          <template #header>
            <div class="card-header">
              <span>三维模型</span>
            </div>
          </template>
          <div v-if="fossil.modelFiles?.length" class="model-list">
            <div
              v-for="file in fossil.modelFiles"
              :key="file.fileId"
              class="model-item"
              @click="selectModel(file)"
              :class="{ active: selectedModel?.fileId === file.fileId }"
            >
              <el-icon size="24" color="#409eff"><Picture /></el-icon>
              <div class="model-info">
                <p class="model-name">{{ file.fileName }}</p>
                <p class="model-size">{{ formatFileSize(file.fileSize) }}</p>
              </div>
              <el-icon><ArrowRight /></el-icon>
            </div>
          </div>
          <div v-else class="model-empty">
            <el-icon size="48" color="#c0c4cc"><Picture /></el-icon>
            <p>暂无三维模型</p>
          </div>
        </el-card>

        <el-card class="model-card" style="margin-top: 20px">
          <template #header>
            <div class="card-header">
              <span>流转溯源</span>
              <el-button type="primary" text @click="goToTrace">查看全部</el-button>
            </div>
          </template>
          <el-timeline v-if="recentTraces.length">
            <el-timeline-item
              v-for="trace in recentTraces"
              :key="trace._id"
              :timestamp="formatDate(trace.timestamp)"
              :color="getTraceTypeColor(trace.type)"
            >
              <h4 style="margin: 0 0 4px; font-size: 14px">{{ trace.title }}</h4>
              <p style="margin: 0; color: #909399; font-size: 12px">{{ trace.operatorName }}</p>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="model-empty">
            <p style="margin: 0">暂无流转记录</p>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Edit, View, Picture, ArrowRight } from '@element-plus/icons-vue';
import { getFossil } from '@/api/fossil';
import { getFossilTraces } from '@/api/trace';
import { getCategoryLabel, getStatusLabel, getStatusType, getTraceTypeColor, formatFileSize } from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import type { Fossil, Trace, ModelFile } from '@/types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const fossil = ref<Fossil | null>(null);
const selectedModel = ref<ModelFile | null>(null);
const recentTraces = ref<Trace[]>([]);

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm');

const getUserName = (user: any) => {
  if (!user) return '-';
  return typeof user === 'string' ? '-' : user.realName || user.username || '-';
};

const goBack = () => router.back();
const goToEdit = () => router.push(`/fossil/edit/${fossil.value?._id}`);
const goToViewer = () => router.push(`/viewer/${fossil.value?._id}`);
const goToTrace = () => router.push(`/traces/${fossil.value?.specimenNo}`);

const selectModel = (file: ModelFile) => {
  selectedModel.value = file;
  router.push(`/viewer/${fossil.value?._id}`);
};

const loadFossil = async () => {
  const id = route.params.id as string;
  if (!id) return;
  try {
    const res = await getFossil(id);
    fossil.value = res.data?.fossil || null;
    if (fossil.value?.modelFiles?.length) {
      selectedModel.value = fossil.value.modelFiles[0];
    }
    loadTraces();
  } catch (err) {
    console.error('加载标本详情失败', err);
  }
};

const loadTraces = async () => {
  if (!fossil.value) return;
  try {
    const res = await getFossilTraces(fossil.value._id, { limit: 5 });
    recentTraces.value = res.data?.traces || [];
  } catch (err) {
    console.error('加载溯源记录失败', err);
  }
};

onMounted(() => {
  loadFossil();
});
</script>

<style scoped lang="scss">
.fossil-detail {
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

  .detail-card {
    :deep(.el-descriptions__label) {
      width: 120px;
      background: #fafafa;
    }
  }

  .model-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
    }
  }

  .model-list {
    .model-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;

      &:hover,
      &.active {
        background: #ecf5ff;
      }

      .model-info {
        flex: 1;
        min-width: 0;

        .model-name {
          margin: 0 0 4px;
          font-size: 14px;
          color: #303133;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .model-size {
          margin: 0;
          font-size: 12px;
          color: #909399;
        }
      }
    }
  }

  .model-empty {
    text-align: center;
    padding: 40px 20px;
    color: #909399;

    p {
      margin: 12px 0 0;
    }
  }

  :deep(.el-timeline-item__content) {
    padding-left: 8px;
  }
}
</style>
