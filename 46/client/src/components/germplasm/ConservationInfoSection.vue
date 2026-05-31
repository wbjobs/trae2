<template>
  <el-card shadow="never" class="form-card">
    <template #header>
      <span class="section-title"><el-icon><Files /></el-icon> 保存与描述</span>
    </template>
    <el-row :gutter="24">
      <el-col :span="12">
        <el-form-item label="保存方式">
          <el-select v-model="form.conservation_method" placeholder="请选择保存方式" clearable style="width:100%">
            <el-option label="种子库保存" value="种子库保存" />
            <el-option label="田间保存" value="田间保存" />
            <el-option label="离体保存" value="离体保存" />
            <el-option label="基因库保存" value="基因库保存" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="保存地点">
          <el-input v-model="form.conservation_location" placeholder="请输入保存地点" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="生物学状态">
          <el-select v-model="form.biological_status" placeholder="请选择生物学状态" clearable style="width:100%">
            <el-option label="纯合" value="纯合" />
            <el-option label="杂合" value="杂合" />
            <el-option label="混合" value="混合" />
            <el-option label="未知" value="未知" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">有效</el-radio>
            <el-radio value="inactive">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-col>
      <el-col :span="24">
        <el-form-item label="描述说明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入描述信息" />
        </el-form-item>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
defineProps({
  form: { type: Object, required: true }
})
</script>

<style scoped>
.form-card {
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
