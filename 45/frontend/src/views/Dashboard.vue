<template>
  <div class="dashboard">
    <el-row :gutter="20" class="mb-20">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">标本总数</p>
              <p class="stat-value">{{ stats.total || 0 }}</p>
            </div>
            <div class="stat-icon blue">
              <el-icon><Collection /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">展览中</p>
              <p class="stat-value">{{ exhibitCount }}</p>
            </div>
            <div class="stat-icon green">
              <el-icon><Picture /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">研究中</p>
              <p class="stat-value">{{ researchCount }}</p>
            </div>
            <div class="stat-icon orange">
              <el-icon><Search /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">库房存储</p>
              <p class="stat-value">{{ storedCount }}</p>
            </div>
            <div class="stat-icon purple">
              <el-icon><Box /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :md="12" class="mb-20">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>分类统计</span>
            </div>
          </template>
          <div ref="categoryChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :md="12" class="mb-20">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>状态分布</span>
            </div>
          </template>
          <div ref="statusChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :md="12" class="mb-20">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>最近添加</span>
              <el-button type="primary" text @click="goToFossils">查看全部</el-button>
            </div>
          </template>
          <el-table :data="stats.recentAdded || []" style="width: 100%">
            <el-table-column prop="specimenNo" label="标本编号" width="140" />
            <el-table-column prop="name" label="标本名称" />
            <el-table-column prop="category" label="分类" width="120">
              <template #default="{ row }">
                <el-tag size="small">{{ getCategoryLabel(row.category) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :md="12" class="mb-20">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>快捷操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <div class="action-item" @click="goToCreate">
              <div class="action-icon blue">
                <el-icon><Plus /></el-icon>
              </div>
              <p>新建标本</p>
            </div>
            <div class="action-item" @click="goToFossils">
              <div class="action-icon green">
                <el-icon><List /></el-icon>
              </div>
              <p>标本列表</p>
            </div>
            <div class="action-item" @click="goToTraces">
              <div class="action-icon orange">
                <el-icon><Clock /></el-icon>
              </div>
              <p>流转记录</p>
            </div>
            <div class="action-item" @click="goToUsers" v-if="userStore.hasPermission('admin')">
              <div class="action-icon purple">
                <el-icon><User /></el-icon>
              </div>
              <p>用户管理</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { getFossilStats } from '@/api/fossil';
import { getCategoryLabel } from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';

const router = useRouter();
const userStore = useUserStore();
const categoryChartRef = ref<HTMLElement>();
const statusChartRef = ref<HTMLElement>();
const stats = ref<any>({});

const exhibitCount = computed(() => {
  return stats.value.statusStats?.find((s: any) => s._id === 'exhibiting')?.count || 0;
});

const researchCount = computed(() => {
  return stats.value.statusStats?.find((s: any) => s._id === 'researching')?.count || 0;
});

const storedCount = computed(() => {
  return stats.value.statusStats?.find((s: any) => s._id === 'stored')?.count || 0;
});

const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
};

const goToCreate = () => router.push('/fossil/new');
const goToFossils = () => router.push('/fossils');
const goToTraces = () => router.push('/traces');
const goToUsers = () => router.push('/users');

const initCategoryChart = () => {
  if (!categoryChartRef.value) return;
  const chart = echarts.init(categoryChartRef.value);
  const data = stats.value.categoryStats?.map((item: any) => ({
    name: getCategoryLabel(item._id),
    value: item.count
  })) || [];

  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 16, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data
    }]
  });
};

const initStatusChart = () => {
  if (!statusChartRef.value) return;
  const chart = echarts.init(statusChartRef.value);
  const data = stats.value.statusStats?.map((item: any) => ({
    name: getStatusLabel(item._id),
    value: item.count
  })) || [];

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.name),
      axisLabel: { interval: 0 }
    },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: data.map((d: any) => d.value),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#83bff6' },
          { offset: 1, color: '#188df0' }
        ])
      },
      barWidth: '50%'
    }]
  });
};

const getStatusLabel = (value: string) => {
  const map: Record<string, string> = {
    stored: '库房存储',
    exhibiting: '展览中',
    researching: '研究中',
    restoring: '修复中',
    transferred: '已外借'
  };
  return map[value] || value;
};

const loadStats = async () => {
  try {
    const res = await getFossilStats();
    stats.value = res.data || {};
    setTimeout(() => {
      initCategoryChart();
      initStatusChart();
    }, 100);
  } catch (err) {
    console.error('加载统计数据失败', err);
  }
};

onMounted(() => {
  loadStats();

  const handleResize = () => {
    if (categoryChartRef.value) {
      echarts.getInstanceByDom(categoryChartRef.value)?.resize();
    }
    if (statusChartRef.value) {
      echarts.getInstanceByDom(statusChartRef.value)?.resize();
    }
  };
  window.addEventListener('resize', handleResize);
});
</script>

<style scoped lang="scss">
.dashboard {
  .stat-card {
    border-radius: 8px;
    border: none;

    :deep(.el-card__body) {
      padding: 20px;
    }
  }

  .stat-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-label {
    font-size: 14px;
    color: #909399;
    margin: 0 0 8px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #303133;
    margin: 0;
  }

  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #fff;

    &.blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    &.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    &.orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    &.purple { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
  }

  .chart-card {
    :deep(.el-card__body) {
      padding: 20px;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }

  .chart-container {
    height: 300px;
    width: 100%;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 10px 0;
  }

  .action-item {
    text-align: center;
    cursor: pointer;
    padding: 16px 8px;
    border-radius: 8px;
    transition: all 0.3s;

    &:hover {
      background-color: #f5f7fa;
      transform: translateY(-2px);
    }

    p {
      margin: 8px 0 0;
      font-size: 13px;
      color: #606266;
    }
  }

  .action-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #fff;

    &.blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    &.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    &.orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    &.purple { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
  }
}

@media (max-width: 768px) {
  .dashboard {
    .quick-actions {
      grid-template-columns: repeat(2, 1fr);
    }
  }
}
</style>
