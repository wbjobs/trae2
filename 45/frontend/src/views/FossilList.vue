<template>
  <div class="fossil-list">
    <div class="page-header">
      <h2 class="page-title">标本档案</h2>
      <div class="header-actions">
        <el-button
          type="primary"
          :icon="Plus"
          v-if="userStore.hasPermission('admin', 'curator')"
          @click="goToCreate"
        >
          新建标本
        </el-button>
      </div>
    </div>

    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.search"
            placeholder="搜索编号、名称、描述"
            clearable
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="searchForm.category" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="opt in CATEGORY_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="opt in STATUS_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table
        :data="fossils"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="specimenNo" label="标本编号" width="140" />
        <el-table-column prop="name" label="标本名称" min-width="150" />
        <el-table-column prop="category" label="分类" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ getCategoryLabel(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="geologicalPeriod" label="地质年代" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="currentLocation" label="当前位置" min-width="120" />
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="goToDetail(row._id)">
              详情
            </el-button>
            <el-button
              type="primary"
              text
              size="small"
              @click="goToViewer(row._id)"
              v-if="row.modelFiles?.length"
            >
              预览
            </el-button>
            <el-button
              type="warning"
              text
              size="small"
              @click="goToEdit(row._id)"
              v-if="userStore.hasPermission('admin', 'curator')"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              text
              size="small"
              @click="handleDelete(row)"
              v-if="userStore.hasPermission('admin')"
            >
              删除
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getFossils, deleteFossil } from '@/api/fossil';
import { CATEGORY_OPTIONS, STATUS_OPTIONS, getCategoryLabel, getStatusLabel, getStatusType } from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import type { Fossil } from '@/types';

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const fossils = ref<Fossil[]>([]);

const searchForm = reactive({
  search: '',
  category: '',
  status: ''
});

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
});

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm');

const goToCreate = () => router.push('/fossil/new');
const goToDetail = (id: string) => router.push(`/fossils/${id}`);
const goToViewer = (id: string) => router.push(`/viewer/${id}`);
const goToEdit = (id: string) => router.push(`/fossil/edit/${id}`);

const loadFossils = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      ...searchForm
    };
    const res = await getFossils(params);
    fossils.value = res.data?.fossils || [];
    pagination.total = res.total || 0;
  } catch (err) {
    console.error('加载标本列表失败', err);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  pagination.page = 1;
  loadFossils();
};

const handleReset = () => {
  searchForm.search = '';
  searchForm.category = '';
  searchForm.status = '';
  pagination.page = 1;
  loadFossils();
};

const handleSizeChange = (size: number) => {
  pagination.limit = size;
  pagination.page = 1;
  loadFossils();
};

const handlePageChange = (page: number) => {
  pagination.page = page;
  loadFossils();
};

const handleDelete = (row: Fossil) => {
  ElMessageBox.confirm(`确定要删除标本"${row.name}"吗？此操作不可恢复。`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteFossil(row._id);
      ElMessage.success('删除成功');
      loadFossils();
    } catch (err) {
    }
  });
};

onMounted(() => {
  loadFossils();
});
</script>

<style scoped lang="scss">
.fossil-list {
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
