<template>
  <div class="smart-search">
    <el-autocomplete
      v-model="searchKeyword"
      :fetch-suggestions="fetchSuggestions"
      :debounce="300"
      placeholder="搜索标本编号、名称、学名、标签..."
      class="search-input"
      clearable
      size="large"
      @select="handleSelect"
      @search="handleSearch"
    >
      <template #default="{ item }">
        <div class="suggestion-item">
          <div class="suggestion-main">
            <span class="specimen-no">{{ item.specimenNo }}</span>
            <span class="name">{{ item.name }}</span>
          </div>
          <el-tag size="small" type="info" class="category-tag">
            {{ getCategoryLabel(item.category) }}
          </el-tag>
        </div>
      </template>
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
      <template #append>
        <el-button :icon="Setting" @click="showAdvanced = !showAdvanced" />
      </template>
    </el-autocomplete>

    <el-card v-if="showAdvanced" class="advanced-search-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>高级检索</span>
          <el-button link type="primary" @click="resetAdvanced">重置</el-button>
        </div>
      </template>
      <el-form :model="advancedForm" class="advanced-form">
        <el-row :gutter="20">
          <el-col :md="8">
            <el-form-item label="分类">
              <el-select v-model="advancedForm.category" placeholder="全部" clearable style="width: 100%">
                <el-option
                  v-for="opt in CATEGORY_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8">
            <el-form-item label="状态">
              <el-select v-model="advancedForm.status" placeholder="全部" clearable style="width: 100%">
                <el-option
                  v-for="opt in STATUS_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8">
            <el-form-item label="地质年代">
              <el-input v-model="advancedForm.geologicalPeriod" placeholder="如：白垩纪" clearable />
            </el-form-item>
          </el-col>
          <el-col :md="8">
            <el-form-item label="发现地点">
              <el-input v-model="advancedForm.discoveryLocation" placeholder="如：辽宁" clearable />
            </el-form-item>
          </el-col>
          <el-col :md="8">
            <el-form-item label="发现日期">
              <el-date-picker
                v-model="advancedForm.dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :md="8">
            <el-form-item label="是否共享">
              <el-select v-model="advancedForm.isShared" placeholder="全部" clearable style="width: 100%">
                <el-option label="已共享" :value="true" />
                <el-option label="未共享" :value="false" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="标签">
              <el-select
                v-model="advancedForm.tags"
                multiple
                filterable
                allow-create
                placeholder="选择或输入标签"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :md="12">
            <el-form-item label="排序方式">
              <el-select v-model="advancedForm.sortBy" style="width: 100%">
                <el-option label="相关度" value="relevance" />
                <el-option label="最新创建" value="createdAt" />
                <el-option label="最新更新" value="updatedAt" />
                <el-option label="标本编号" value="specimenNo" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="primary" :loading="searching" @click="handleAdvancedSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="showAdvanced = false">收起</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { Search, Setting } from '@element-plus/icons-vue';
import { searchSuggestions, advancedSearch } from '@/api/fossil';
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from '@/utils/constants';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  (e: 'search', results: any): void;
  (e: 'select', item: any): void;
}>();

const searchKeyword = ref('');
const showAdvanced = ref(false);
const searching = ref(false);

const advancedForm = reactive({
  category: '',
  status: '',
  geologicalPeriod: '',
  discoveryLocation: '',
  dateRange: null as [Date, Date] | null,
  isShared: undefined as boolean | undefined,
  tags: [] as string[],
  sortBy: 'relevance',
  sortOrder: 'desc'
});

const getCategoryLabel = (value: string) => {
  const found = CATEGORY_OPTIONS.find(opt => opt.value === value);
  return found ? found.label : value;
};

const fetchSuggestions = async (query: string, callback: (items: any[]) => void) => {
  if (query.length < 2) {
    callback([]);
    return;
  }

  try {
    const res = await searchSuggestions(query);
    callback(res.data?.suggestions || []);
  } catch (error) {
    callback([]);
  }
};

const handleSelect = (item: any) => {
  emit('select', item);
};

const handleSearch = (keyword: string) => {
  if (!keyword || keyword.length < 2) return;
  emit('search', { keyword });
};

const resetAdvanced = () => {
  advancedForm.category = '';
  advancedForm.status = '';
  advancedForm.geologicalPeriod = '';
  advancedForm.discoveryLocation = '';
  advancedForm.dateRange = null;
  advancedForm.isShared = undefined;
  advancedForm.tags = [];
  advancedForm.sortBy = 'relevance';
  advancedForm.sortOrder = 'desc';
};

const handleAdvancedSearch = async () => {
  searching.value = true;
  try {
    const params: any = {
      keyword: searchKeyword.value,
      category: advancedForm.category,
      status: advancedForm.status,
      geologicalPeriod: advancedForm.geologicalPeriod,
      discoveryLocation: advancedForm.discoveryLocation,
      isShared: advancedForm.isShared,
      tags: advancedForm.tags.length > 0 ? advancedForm.tags : undefined,
      sortBy: advancedForm.sortBy,
      sortOrder: advancedForm.sortOrder
    };

    if (advancedForm.dateRange) {
      params.dateFrom = advancedForm.dateRange[0];
      params.dateTo = advancedForm.dateRange[1];
    }

    const res = await advancedSearch(params);
    emit('search', res.data);
    ElMessage.success(`找到 ${res.total} 条记录`);
  } catch (error) {
    ElMessage.error('搜索失败');
  } finally {
    searching.value = false;
  }
};

defineExpose({
  reset: resetAdvanced,
  clear: () => {
    searchKeyword.value = '';
    resetAdvanced();
  }
});
</script>

<style scoped lang="scss">
.smart-search {
  width: 100%;

  .search-input {
    width: 100%;

    :deep(.el-input__wrapper) {
      border-radius: 24px;
      padding: 6px 16px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    }
  }

  .suggestion-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .suggestion-main {
      flex: 1;
      overflow: hidden;

      .specimen-no {
        color: #409eff;
        font-weight: 600;
        margin-right: 12px;
      }

      .name {
        color: #303133;
      }
    }

    .category-tag {
      flex-shrink: 0;
    }
  }

  .advanced-search-card {
    margin-top: 16px;
    animation: slideDown 0.3s ease;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
    }

    .advanced-form {
      .el-form-item {
        margin-bottom: 16px;
      }
    }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
