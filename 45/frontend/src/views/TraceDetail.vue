<template>
  <div class="trace-detail">
    <div class="page-header">
      <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
      <h2 class="page-title">溯源详情 - {{ specimenNo }}</h2>
      <div class="header-actions">
        <el-button
          type="primary"
          :icon="Plus"
          v-if="userStore.hasPermission('admin', 'curator')"
          @click="showAddDialog = true"
        >
          添加记录
        </el-button>
      </div>
    </div>

    <el-row :gutter="20" v-if="fossil">
      <el-col :md="6">
        <el-card class="info-card">
          <h3>标本信息</h3>
          <div class="info-list">
            <div class="info-item">
              <span class="label">标本名称</span>
              <span class="value">{{ fossil.name }}</span>
            </div>
            <div class="info-item">
              <span class="label">分类</span>
              <span class="value">{{ getCategoryLabel(fossil.category) }}</span>
            </div>
            <div class="info-item">
              <span class="label">当前状态</span>
              <span class="value">
                <el-tag :type="getStatusType(fossil.status)" size="small">
                  {{ getStatusLabel(fossil.status) }}
                </el-tag>
              </span>
            </div>
            <div class="info-item">
              <span class="label">当前位置</span>
              <span class="value">{{ fossil.currentLocation }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :md="18">
        <el-card class="timeline-card">
          <template #header>
            <div class="card-header">
              <span>流转轨迹</span>
              <el-select
                v-model="filterType"
                placeholder="筛选类型"
                clearable
                size="small"
                style="width: 140px"
                @change="loadTraces"
              >
                <el-option
                  v-for="opt in TRACE_TYPE_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
          </template>

          <div v-loading="loading" class="timeline-wrapper">
            <el-timeline v-if="traces.length">
              <el-timeline-item
                v-for="trace in traces"
                :key="trace._id"
                :timestamp="formatDate(trace.timestamp)"
                :color="getTraceTypeColor(trace.type)"
              >
                <el-card class="trace-card" shadow="hover">
                  <div class="trace-header">
                    <el-tag
                      :color="getTraceTypeColor(trace.type)"
                      size="small"
                      effect="light"
                      style="color: #fff"
                    >
                      {{ getTraceTypeLabel(trace.type) }}
                    </el-tag>
                    <span class="trace-operator">{{ trace.operatorName }}</span>
                  </div>
                  <h4 class="trace-title">{{ trace.title }}</h4>
                  <p v-if="trace.description" class="trace-desc">{{ trace.description }}</p>
                  <div v-if="trace.fromLocation || trace.toLocation" class="trace-location">
                    <span class="label">位置：</span>
                    <span v-if="trace.fromLocation">{{ trace.fromLocation }}</span>
                    <el-icon v-if="trace.fromLocation && trace.toLocation" color="#409eff">
                      <ArrowRight />
                    </el-icon>
                    <span v-if="trace.toLocation" class="to-location">{{ trace.toLocation }}</span>
                  </div>
                  <div v-if="trace.fromStatus || trace.toStatus" class="trace-status">
                    <span class="label">状态：</span>
                    <el-tag v-if="trace.fromStatus" size="small">{{ getStatusLabel(trace.fromStatus) }}</el-tag>
                    <el-icon v-if="trace.fromStatus && trace.toStatus" color="#409eff">
                      <ArrowRight />
                    </el-icon>
                    <el-tag v-if="trace.toStatus" type="success" size="small">{{ getStatusLabel(trace.toStatus) }}</el-tag>
                  </div>
                  <div v-if="trace.metadata && Object.keys(trace.metadata).length" class="trace-meta">
                    <el-tag
                      v-for="(value, key) in trace.metadata"
                      :key="key"
                      size="small"
                      type="info"
                    >
                      {{ key }}: {{ value }}
                    </el-tag>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
            <div v-else class="empty-state">
              <el-icon size="48" color="#c0c4cc"><Document /></el-icon>
              <p>暂无流转记录</p>
            </div>
          </div>

          <div class="pagination">
            <el-pagination
              v-model:current-page="pagination.page"
              v-model:page-size="pagination.limit"
              :page-sizes="[10, 20, 50]"
              :total="pagination.total"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleSizeChange"
              @current-change="handlePageChange"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="showAddDialog"
      title="添加流转记录"
      width="500px"
    >
      <el-form :model="addForm" label-width="100px">
        <el-form-item label="类型" prop="type">
          <el-select v-model="addForm.type" placeholder="请选择类型" style="width: 100%">
            <el-option
              v-for="opt in TRACE_TYPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="addForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="addForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          />
        </el-form-item>
        <el-form-item label="原位置">
          <el-input v-model="addForm.fromLocation" placeholder="请输入原位置" />
        </el-form-item>
        <el-form-item label="新位置">
          <el-input v-model="addForm.toLocation" placeholder="请输入新位置" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAddTrace">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Plus, ArrowRight, Document } from '@element-plus/icons-vue';
import { getFossilBySpecimenNo } from '@/api/fossil';
import { getTraceBySpecimenNo, addTrace } from '@/api/trace';
import {
  TRACE_TYPE_OPTIONS,
  getCategoryLabel,
  getStatusLabel,
  getStatusType,
  getTraceTypeLabel,
  getTraceTypeColor
} from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import type { Fossil, Trace } from '@/types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const specimenNo = ref(route.params.specimenNo as string);
const loading = ref(false);
const submitting = ref(false);
const fossil = ref<Fossil | null>(null);
const traces = ref<Trace[]>([]);
const filterType = ref('');
const showAddDialog = ref(false);

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
});

const addForm = reactive({
  type: '',
  title: '',
  description: '',
  fromLocation: '',
  toLocation: ''
});

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss');

const goBack = () => router.back();

const loadFossil = async () => {
  if (!specimenNo.value) return;
  try {
    const res = await getFossilBySpecimenNo(specimenNo.value);
    fossil.value = res.data?.fossil || null;
  } catch (err) {
    console.error('加载标本信息失败', err);
  }
};

const loadTraces = async () => {
  if (!specimenNo.value) return;
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      limit: pagination.limit,
      sort: 'asc'
    };
    if (filterType.value) params.type = filterType.value;

    const res = await getTraceBySpecimenNo(specimenNo.value, params);
    traces.value = res.data?.traces || [];
    pagination.total = res.total || 0;

    traces.value.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt).getTime();
      const timeB = new Date(b.timestamp || b.createdAt).getTime();
      return timeA - timeB;
    });
  } catch (err) {
    console.error('加载溯源记录失败', err);
  } finally {
    loading.value = false;
  }
};

const handleSizeChange = (size: number) => {
  pagination.limit = size;
  pagination.page = 1;
  loadTraces();
};

const handlePageChange = (page: number) => {
  pagination.page = page;
  loadTraces();
};

const handleAddTrace = async () => {
  if (!addForm.type || !addForm.title) {
    ElMessage.warning('请填写类型和标题');
    return;
  }
  if (!fossil.value) return;

  submitting.value = true;
  try {
    await addTrace({
      fossilId: fossil.value._id,
      ...addForm
    });
    ElMessage.success('添加成功');
    showAddDialog.value = false;
    addForm.type = '';
    addForm.title = '';
    addForm.description = '';
    addForm.fromLocation = '';
    addForm.toLocation = '';
    loadTraces();
  } catch (err) {
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  loadFossil();
  loadTraces();
});
</script>

<style scoped lang="scss">
.trace-detail {
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

  .info-card {
    h3 {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 600;
    }
  }

  .info-list {
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;

      .label {
        color: #909399;
        font-size: 13px;
      }

      .value {
        color: #303133;
        font-size: 13px;
        max-width: 60%;
        text-align: right;
        word-break: break-all;
      }
    }
  }

  .timeline-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
    }
  }

  .timeline-wrapper {
    min-height: 400px;
  }

  .trace-card {
    margin-bottom: 8px;

    :deep(.el-card__body) {
      padding: 16px;
    }
  }

  .trace-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .trace-operator {
      font-size: 12px;
      color: #909399;
    }
  }

  .trace-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 500;
    color: #303133;
  }

  .trace-desc {
    margin: 0 0 8px;
    font-size: 13px;
    color: #606266;
  }

  .trace-location,
  .trace-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 13px;

    .label {
      color: #909399;
    }

    .to-location {
      color: #67c23a;
    }
  }

  .trace-meta {
    margin-top: 8px;

    :deep(.el-tag) {
      margin-right: 8px;
    }
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #909399;

    p {
      margin: 12px 0 0;
    }
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
}
</style>
