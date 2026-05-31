<template>
  <div class="trace-list">
    <div class="page-header">
      <h2 class="page-title">流转溯源</h2>
    </div>

    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="标本编号">
          <el-input
            v-model="searchForm.specimenNo"
            placeholder="请输入标本编号"
            clearable
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="searchForm.type" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="opt in TRACE_TYPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker
            v-model="searchForm.startDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker
            v-model="searchForm.endDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table
        :data="traces"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="specimenNo" label="标本编号" width="140" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag
              :color="getTraceTypeColor(row.type)"
              size="small"
              effect="light"
              style="color: #fff"
            >
              {{ getTraceTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="操作内容" min-width="180" />
        <el-table-column prop="operatorName" label="操作人" width="120" />
        <el-table-column label="位置变化" min-width="200">
          <template #default="{ row }">
            <template v-if="row.fromLocation || row.toLocation">
              <span v-if="row.fromLocation">{{ row.fromLocation }}</span>
              <el-icon v-if="row.fromLocation && row.toLocation" color="#409eff">
                <ArrowRight />
              </el-icon>
              <span v-if="row.toLocation">{{ row.toLocation }}</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态变化" width="180">
          <template #default="{ row }">
            <template v-if="row.fromStatus || row.toStatus">
              <el-tag v-if="row.fromStatus" size="small">{{ getStatusLabel(row.fromStatus) }}</el-tag>
              <el-icon v-if="row.fromStatus && row.toStatus" color="#409eff">
                <ArrowRight />
              </el-icon>
              <el-tag v-if="row.toStatus" type="success" size="small">{{ getStatusLabel(row.toStatus) }}</el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="timestamp" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="goToDetail(row.specimenNo)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@element-plus/icons-vue';
import { getTraces } from '@/api/trace';
import { TRACE_TYPE_OPTIONS, getTraceTypeLabel, getTraceTypeColor, getStatusLabel } from '@/utils/constants';
import dayjs from 'dayjs';
import type { Trace } from '@/types';

const router = useRouter();
const loading = ref(false);
const traces = ref<Trace[]>([]);

const searchForm = reactive({
  specimenNo: '',
  type: '',
  startDate: '',
  endDate: ''
});

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
});

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm');

const goToDetail = (specimenNo: string) => router.push(`/traces/${specimenNo}`);

const loadTraces = async () => {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      limit: pagination.limit
    };
    if (searchForm.type) params.type = searchForm.type;
    if (searchForm.startDate) params.startDate = searchForm.startDate;
    if (searchForm.endDate) params.endDate = searchForm.endDate;

    const res = await getTraces(params);
    traces.value = res.data?.traces || [];
    pagination.total = res.total || 0;
  } catch (err) {
    console.error('加载流转记录失败', err);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  pagination.page = 1;
  loadTraces();
};

const handleReset = () => {
  searchForm.specimenNo = '';
  searchForm.type = '';
  searchForm.startDate = '';
  searchForm.endDate = '';
  pagination.page = 1;
  loadTraces();
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

onMounted(() => {
  loadTraces();
});
</script>

<style scoped lang="scss">
.trace-list {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .page-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  .search-card {
    margin-bottom: 20px;
  }

  .table-card {
    .pagination {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }
  }
}
</style>
