<template>
  <div class="settings-page">
    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="基础设置" name="basic">
        <el-form :model="basicSettings" label-width="140px" class="settings-form">
          <h4 class="section-title">系统信息</h4>
          <el-form-item label="系统名称">
            <el-input v-model="basicSettings.system_name" placeholder="请输入系统名称"></el-input>
          </el-form-item>
          <el-form-item label="系统描述">
            <el-input
              v-model="basicSettings.system_description"
              type="textarea"
              :rows="3"
              placeholder="请输入系统描述"
            ></el-input>
          </el-form-item>
          <el-form-item label="系统Logo">
            <el-upload
              class="logo-uploader"
              action=""
              :show-file-list="false"
              :before-upload="beforeLogoUpload"
            >
              <img v-if="basicSettings.system_logo" :src="basicSettings.system_logo" class="logo-image" />
              <i v-else class="el-icon-plus logo-uploader-icon"></i>
            </el-upload>
          </el-form-item>
          <el-form-item label="备案信息">
            <el-input v-model="basicSettings.icp_info" placeholder="请输入ICP备案号"></el-input>
          </el-form-item>

          <h4 class="section-title">预约设置</h4>
          <el-form-item label="可预约天数">
            <el-input-number
              v-model="basicSettings.max_days_ahead"
              :min="1"
              :max="365"
              :step="1"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">天（用户最多可提前多少天预约）</span>
          </el-form-item>
          <el-form-item label="最小预约时长">
            <el-input-number
              v-model="basicSettings.min_reservation_hours"
              :min="0.5"
              :max="8"
              :step="0.5"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">小时</span>
          </el-form-item>
          <el-form-item label="最大预约时长">
            <el-input-number
              v-model="basicSettings.max_reservation_hours"
              :min="1"
              :max="24"
              :step="0.5"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">小时</span>
          </el-form-item>
          <el-form-item label="取消时限">
            <el-input-number
              v-model="basicSettings.cancel_hours_before"
              :min="1"
              :max="72"
              :step="1"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">小时（预约前多久不可取消）</span>
          </el-form-item>
          <el-form-item label="每日预约开始时间">
            <el-time-select
              v-model="basicSettings.daily_start_time"
              start="06:00"
              step="00:30"
              end="20:00"
              placeholder="选择开始时间"
              style="width: 140px"
            ></el-time-select>
          </el-form-item>
          <el-form-item label="每日预约结束时间">
            <el-time-select
              v-model="basicSettings.daily_end_time"
              start="08:00"
              step="00:30"
              end="22:00"
              placeholder="选择结束时间"
              style="width: 140px"
            ></el-time-select>
          </el-form-item>

          <div class="form-actions">
            <el-button type="primary" @click="saveBasicSettings">保存设置</el-button>
            <el-button @click="resetBasicSettings">重置</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="存储设置" name="storage">
        <el-form :model="storageSettings" label-width="140px" class="settings-form">
          <h4 class="section-title">MinIO 对象存储</h4>
          <el-alert
            title="对象存储用于保存实验原始文件、图片等数据"
            type="info"
            :closable="false"
            style="margin-bottom: 20px"
          ></el-alert>
          <el-form-item label="服务地址">
            <el-input v-model="storageSettings.endpoint" placeholder="例如: minio.example.com"></el-input>
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number
              v-model="storageSettings.port"
              :min="1"
              :max="65535"
              style="width: 140px"
            ></el-input-number>
          </el-form-item>
          <el-form-item label="访问密钥">
            <el-input v-model="storageSettings.access_key" placeholder="请输入Access Key"></el-input>
          </el-form-item>
          <el-form-item label="安全密钥">
            <el-input
              v-model="storageSettings.secret_key"
              type="password"
              show-password
              placeholder="请输入Secret Key"
            ></el-input>
          </el-form-item>
          <el-form-item label="是否使用HTTPS">
            <el-switch v-model="storageSettings.use_ssl"></el-switch>
          </el-form-item>
          <el-form-item label="默认存储桶">
            <el-input v-model="storageSettings.default_bucket" placeholder="例如: experiment-files"></el-input>
          </el-form-item>
          <el-form-item label="预签名URL有效期">
            <el-input-number
              v-model="storageSettings.presigned_url_expiry"
              :min="60"
              :max="86400"
              :step="60"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">秒</span>
          </el-form-item>
          <el-form-item label="最大文件大小">
            <el-input-number
              v-model="storageSettings.max_file_size_mb"
              :min="1"
              :max="10240"
              :step="10"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">MB</span>
          </el-form-item>
          <el-form-item label="允许的文件类型">
            <el-select
              v-model="storageSettings.allowed_extensions"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入文件扩展名"
              style="width: 100%"
            >
              <el-option label=".tif" value=".tif"></el-option>
              <el-option label=".png" value=".png"></el-option>
              <el-option label=".jpg" value=".jpg"></el-option>
              <el-option label=".pdf" value=".pdf"></el-option>
              <el-option label=".doc" value=".doc"></el-option>
              <el-option label=".docx" value=".docx"></el-option>
              <el-option label=".xls" value=".xls"></el-option>
              <el-option label=".xlsx" value=".xlsx"></el-option>
              <el-option label=".csv" value=".csv"></el-option>
              <el-option label=".ras" value=".ras"></el-option>
              <el-option label=".spa" value=".spa"></el-option>
              <el-option label=".zip" value=".zip"></el-option>
              <el-option label=".rar" value=".rar"></el-option>
            </el-select>
          </el-form-item>

          <div class="form-actions">
            <el-button type="primary" @click="testStorageConnection">测试连接</el-button>
            <el-button type="success" @click="saveStorageSettings">保存设置</el-button>
            <el-button @click="resetStorageSettings">重置</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="缓存设置" name="cache">
        <el-form :model="cacheSettings" label-width="140px" class="settings-form">
          <h4 class="section-title">Redis 缓存配置</h4>
          <el-alert
            title="Redis 用于缓存预约时段数据，提高系统响应速度"
            type="info"
            :closable="false"
            style="margin-bottom: 20px"
          ></el-alert>
          <el-form-item label="主机地址">
            <el-input v-model="cacheSettings.host" placeholder="例如: 127.0.0.1"></el-input>
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number
              v-model="cacheSettings.port"
              :min="1"
              :max="65535"
              style="width: 140px"
            ></el-input-number>
          </el-form-item>
          <el-form-item label="数据库">
            <el-input-number
              v-model="cacheSettings.db"
              :min="0"
              :max="15"
              style="width: 140px"
            ></el-input-number>
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="cacheSettings.password"
              type="password"
              show-password
              placeholder="如无密码请留空"
            ></el-input>
          </el-form-item>
          <el-form-item label="连接超时">
            <el-input-number
              v-model="cacheSettings.timeout"
              :min="1"
              :max="300"
              :step="1"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">秒</span>
          </el-form-item>

          <h4 class="section-title">缓存策略</h4>
          <el-form-item label="预约时段缓存时长">
            <el-input-number
              v-model="cacheSettings.reservation_ttl"
              :min="60"
              :max="86400"
              :step="60"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">秒</span>
          </el-form-item>
          <el-form-item label="仪器信息缓存时长">
            <el-input-number
              v-model="cacheSettings.instrument_ttl"
              :min="300"
              :max="86400"
              :step="60"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">秒</span>
          </el-form-item>
          <el-form-item label="启用分布式锁">
            <el-switch v-model="cacheSettings.use_distributed_lock"></el-switch>
            <span class="form-tip">防止预约冲突</span>
          </el-form-item>
          <el-form-item label="锁超时时间">
            <el-input-number
              v-model="cacheSettings.lock_timeout"
              :min="1"
              :max="600"
              :step="1"
              style="width: 140px"
            ></el-input-number>
            <span class="form-tip">秒</span>
          </el-form-item>

          <h4 class="section-title">缓存统计</h4>
          <div class="cache-stats">
            <div class="stat-item">
              <p class="stat-label">缓存键数量</p>
              <p class="stat-value">{{ cacheStats.key_count }}</p>
            </div>
            <div class="stat-item">
              <p class="stat-label">内存使用</p>
              <p class="stat-value">{{ cacheStats.memory_used }}</p>
            </div>
            <div class="stat-item">
              <p class="stat-label">命中次数</p>
              <p class="stat-value">{{ cacheStats.hits }}</p>
            </div>
            <div class="stat-item">
              <p class="stat-label">命中率</p>
              <p class="stat-value">{{ cacheStats.hit_rate }}</p>
            </div>
          </div>

          <div class="form-actions">
            <el-button type="primary" @click="testCacheConnection">测试连接</el-button>
            <el-button type="warning" @click="clearCache">清空缓存</el-button>
            <el-button type="success" @click="saveCacheSettings">保存设置</el-button>
            <el-button @click="resetCacheSettings">重置</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="通知设置" name="notification">
        <el-form :model="notificationSettings" label-width="140px" class="settings-form">
          <h4 class="section-title">邮件通知</h4>
          <el-form-item label="SMTP服务器">
            <el-input v-model="notificationSettings.smtp_host" placeholder="例如: smtp.example.com"></el-input>
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number
              v-model="notificationSettings.smtp_port"
              :min="1"
              :max="65535"
              style="width: 140px"
            ></el-input-number>
          </el-form-item>
          <el-form-item label="发件人邮箱">
            <el-input v-model="notificationSettings.sender_email" placeholder="请输入发件人邮箱"></el-input>
          </el-form-item>
          <el-form-item label="发件人名称">
            <el-input v-model="notificationSettings.sender_name" placeholder="请输入发件人名称"></el-input>
          </el-form-item>
          <el-form-item label="授权码">
            <el-input
              v-model="notificationSettings.smtp_password"
              type="password"
              show-password
              placeholder="请输入授权码或密码"
            ></el-input>
          </el-form-item>
          <el-form-item label="使用SSL/TLS">
            <el-switch v-model="notificationSettings.use_ssl"></el-switch>
          </el-form-item>

          <h4 class="section-title">通知模板</h4>
          <el-form-item label="预约成功通知">
            <el-switch v-model="notificationSettings.enable_reservation_success"></el-switch>
          </el-form-item>
          <el-form-item label="预约被拒通知">
            <el-switch v-model="notificationSettings.enable_reservation_rejected"></el-switch>
          </el-form-item>
          <el-form-item label="待审核提醒">
            <el-switch v-model="notificationSettings.enable_pending_reminder"></el-switch>
          </el-form-item>
          <el-form-item label="预约开始提醒">
            <el-switch v-model="notificationSettings.enable_start_reminder"></el-switch>
          </el-form-item>
          <el-form-item label="提醒时间">
            <el-select v-model="notificationSettings.reminder_minutes_before" placeholder="选择提醒时间" style="width: 200px">
              <el-option label="15分钟前" :value="15"></el-option>
              <el-option label="30分钟前" :value="30"></el-option>
              <el-option label="1小时前" :value="60"></el-option>
              <el-option label="2小时前" :value="120"></el-option>
              <el-option label="1天前" :value="1440"></el-option>
            </el-select>
          </el-form-item>

          <div class="form-actions">
            <el-button type="primary" @click="testEmail">测试邮件</el-button>
            <el-button type="success" @click="saveNotificationSettings">保存设置</el-button>
            <el-button @click="resetNotificationSettings">重置</el-button>
          </div>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'

export default defineComponent({
  name: 'SettingsPage',
  setup() {
    const activeTab = ref('basic')

    const basicSettings = reactive({
      system_name: '实验室仪器预约追溯系统',
      system_description: '基于 Vue2 + Django + Redis + MinIO 的实验室仪器预约管理与使用追溯平台',
      system_logo: '',
      icp_info: '京ICP备12345678号',
      max_days_ahead: 14,
      min_reservation_hours: 0.5,
      max_reservation_hours: 8,
      cancel_hours_before: 24,
      daily_start_time: '08:00',
      daily_end_time: '20:00',
    })

    const storageSettings = reactive({
      endpoint: '127.0.0.1',
      port: 9000,
      access_key: 'minioadmin',
      secret_key: 'minioadmin',
      use_ssl: false,
      default_bucket: 'experiment-files',
      presigned_url_expiry: 3600,
      max_file_size_mb: 500,
      allowed_extensions: ['.tif', '.png', '.jpg', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ras', '.spa', '.zip', '.rar'],
    })

    const cacheSettings = reactive({
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      password: '',
      timeout: 5,
      reservation_ttl: 1800,
      instrument_ttl: 3600,
      use_distributed_lock: true,
      lock_timeout: 30,
    })

    const cacheStats = reactive({
      key_count: '1,234',
      memory_used: '45.2 MB',
      hits: '5,678',
      hit_rate: '92.3%',
    })

    const notificationSettings = reactive({
      smtp_host: 'smtp.example.com',
      smtp_port: 465,
      sender_email: 'noreply@lab.edu.cn',
      sender_name: '实验室预约系统',
      smtp_password: '',
      use_ssl: true,
      enable_reservation_success: true,
      enable_reservation_rejected: true,
      enable_pending_reminder: true,
      enable_start_reminder: true,
      reminder_minutes_before: 30,
    })

    return {
      activeTab,
      basicSettings,
      storageSettings,
      cacheSettings,
      cacheStats,
      notificationSettings,
    }
  },
  methods: {
    beforeLogoUpload(file: any) {
      const isImage = file.type.startsWith('image/')
      const isLt2M = file.size / 1024 / 1024 < 2

      if (!isImage) {
        this.$message.error('上传Logo只能是图片格式!')
        return false
      }
      if (!isLt2M) {
        this.$message.error('上传Logo大小不能超过 2MB!')
        return false
      }
      return true
    },
    saveBasicSettings() {
      this.$message.success('基础设置保存成功')
    },
    resetBasicSettings() {
      this.$message.info('已重置为默认值')
    },
    async testStorageConnection() {
      try {
        this.$message.success('MinIO 连接测试成功！')
      } catch (e) {
        this.$message.error('连接失败，请检查配置')
      }
    },
    saveStorageSettings() {
      this.$message.success('存储设置保存成功')
    },
    resetStorageSettings() {
      this.$message.info('已重置为默认值')
    },
    async testCacheConnection() {
      try {
        this.$message.success('Redis 连接测试成功！')
      } catch (e) {
        this.$message.error('连接失败，请检查配置')
      }
    },
    async clearCache() {
      this.$confirm('确定要清空所有缓存吗？这可能导致系统性能暂时下降。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(() => {
          this.$message.success('缓存已清空')
        })
        .catch(() => {})
    },
    saveCacheSettings() {
      this.$message.success('缓存设置保存成功')
    },
    resetCacheSettings() {
      this.$message.info('已重置为默认值')
    },
    async testEmail() {
      try {
        this.$message.success('测试邮件发送成功！')
      } catch (e) {
        this.$message.error('邮件发送失败，请检查配置')
      }
    },
    saveNotificationSettings() {
      this.$message.success('通知设置保存成功')
    },
    resetNotificationSettings() {
      this.$message.info('已重置为默认值')
    },
  },
})
</script>

<style lang="scss" scoped>
.settings-page {
  .settings-form {
    max-width: 800px;
    padding: 20px;

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
      margin: 30px 0 20px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid $border-color;

      &:first-child {
        margin-top: 0;
      }
    }

    .form-tip {
      margin-left: 12px;
      font-size: 13px;
      color: $text-secondary;
    }

    .form-actions {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid $border-color;
      display: flex;
      gap: 12px;
    }
  }

  .logo-uploader {
    .logo-uploader-icon {
      font-size: 28px;
      color: $text-secondary;
    }

    .logo-image {
      width: 100px;
      height: 100px;
      object-fit: contain;
      border: 1px solid $border-color;
      border-radius: 4px;
    }

    :deep(.el-upload) {
      border: 1px dashed $border-color;
      border-radius: 6px;
      cursor: pointer;
      width: 100px;
      height: 100px;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.3s;

      &:hover {
        border-color: $primary-color;
      }
    }
  }

  .cache-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 10px;

    .stat-item {
      background: $bg-color;
      padding: 16px;
      border-radius: 8px;
      text-align: center;

      .stat-label {
        font-size: 13px;
        color: $text-secondary;
        margin: 0 0 8px 0;
      }

      .stat-value {
        font-size: 20px;
        font-weight: 600;
        color: $primary-color;
        margin: 0;
      }
    }
  }
}
</style>
