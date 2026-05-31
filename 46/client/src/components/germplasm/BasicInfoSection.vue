<template>
  <el-card shadow="never" class="form-card">
    <template #header>
      <span class="section-title"><el-icon><InfoFilled /></el-icon> 基本信息</span>
    </template>
    <el-row :gutter="24">
      <el-col :span="12">
        <el-form-item label="资源编号" prop="resource_no">
          <el-input v-model="form.resource_no" placeholder="系统自动生成，可手动指定" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="种质名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入种质名称" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="英文名">
          <el-input v-model="form.english_name" placeholder="English Name" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="资源分类" prop="classification_id">
          <el-tree-select
            v-model="form.classification_id"
            :data="classificationTree"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            placeholder="请选择分类"
            clearable
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="材料类型">
          <el-select v-model="form.material_type" placeholder="请选择材料类型" clearable style="width:100%">
            <el-option label="地方品种" value="地方品种" />
            <el-option label="育成品种" value="育成品种" />
            <el-option label="野生材料" value="野生材料" />
            <el-option label="突变体" value="突变体" />
            <el-option label="杂交后代" value="杂交后代" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="选育方法">
          <el-input v-model="form.breeding_method" placeholder="请输入选育方法" />
        </el-form-item>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
defineProps({
  form: { type: Object, required: true },
  classificationTree: { type: Array, default: () => [] }
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
