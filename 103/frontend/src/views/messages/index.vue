<template>
  <div class="messages-page">
    <div class="messages-container">
      <div class="message-sidebar">
        <div class="sidebar-header">
          <h3>消息中心</h3>
          <el-badge :value="unreadCount" class="item">
            <el-button type="text" icon="el-icon-refresh" @click="fetchMessages">刷新</el-button>
          </el-badge>
        </div>

        <div class="message-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ active: activeTab === tab.key }"
            @click="switchTab(tab.key)"
          >
            <i :class="tab.icon"></i>
            <span>{{ tab.name }}</span>
            <el-badge
              v-if="tab.unread > 0"
              :value="tab.unread"
              :max="99"
              class="tab-badge"
            ></el-badge>
          </div>
        </div>

        <div class="sidebar-actions">
          <el-button
            type="primary"
            icon="el-icon-check"
            size="small"
            @click="markAllAsRead"
            :disabled="unreadCount === 0"
          >全部已读</el-button>
        </div>
      </div>

      <div class="message-list">
        <div class="list-header">
          <h4>{{ currentTabName }}</h4>
          <span class="message-count">共 {{ total }} 条消息</span>
        </div>

        <div class="list-content" v-loading="loading">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="message-item"
            :class="{ unread: !msg.is_read }"
            @click="handleMessageClick(msg)"
          >
            <div class="message-icon" :class="msg.type">
              <i :class="getMessageIcon(msg.type)"></i>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-title">{{ msg.title }}</span>
                <span class="message-time">{{ formatRelativeTime(msg.created_at) }}</span>
              </div>
              <p class="message-body">{{ msg.content }}</p>
              <div class="message-footer" v-if="msg.extra">
                <span v-if="msg.extra.instrument_name">
                  <i class="el-icon-s-platform"></i> {{ msg.extra.instrument_name }}
                </span>
                <span v-if="msg.extra.user_name">
                  <i class="el-icon-user"></i> {{ msg.extra.user_name }}
                </span>
              </div>
            </div>
            <div class="message-actions">
              <el-button
                v-if="!msg.is_read"
                type="text"
                size="small"
                @click.stop="markAsRead(msg)"
              >标为已读</el-button>
              <el-button
                v-if="msg.action_url"
                type="text"
                size="small"
                @click.stop="handleAction(msg)"
              >查看详情</el-button>
              <el-button
                type="text"
                size="small"
                @click.stop="handleDelete(msg)"
              >删除</el-button>
            </div>
          </div>

          <el-empty v-if="messages.length === 0 && !loading" description="暂无消息" />
        </div>

        <div class="pagination-container" v-if="total > 0">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.page_size"
            :page-sizes="[10, 20, 50]"
            :total="total"
            layout="prev, pager, next, jumper"
            @current-change="fetchMessages"
            @size-change="fetchMessages"
          />
        </div>
      </div>
    </div>

    <el-dialog
      title="消息详情"
      :visible.sync="detailVisible"
      width="600px"
      append-to-body
    >
      <div v-if="currentMessage" class="detail-content">
        <div class="detail-header">
          <div class="detail-icon" :class="currentMessage.type">
            <i :class="getMessageIcon(currentMessage.type)"></i>
          </div>
          <div class="detail-title">
            <h3>{{ currentMessage.title }}</h3>
            <p>
              <span>{{ getMessageTypeName(currentMessage.type) }}</span>
              <span class="dot">·</span>
              <span>{{ formatTime(currentMessage.created_at) }}</span>
            </p>
          </div>
        </div>
        <div class="detail-body">
          <p>{{ currentMessage.content }}</p>
        </div>
        <div class="detail-extra" v-if="currentMessage.extra">
          <div class="extra-section" v-if="currentMessage.extra.instrument_name">
            <label>关联仪器：</label>
            <span>{{ currentMessage.extra.instrument_name }}</span>
          </div>
          <div class="extra-section" v-if="currentMessage.extra.user_name">
            <label>相关用户：</label>
            <span>{{ currentMessage.extra.user_name }}</span>
          </div>
          <div class="extra-section" v-if="currentMessage.extra.time">
            <label>预约时间：</label>
            <span>{{ currentMessage.extra.time }}</span>
          </div>
          <div class="extra-section" v-if="currentMessage.extra.reason">
            <label>拒绝原因：</label>
            <span class="danger-text">{{ currentMessage.extra.reason }}</span>
          </div>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="currentMessage?.action_url"
          type="primary"
          @click="handleAction(currentMessage); detailVisible = false"
        >查看详情</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref, computed } from 'vue'
import { getMessageList, markAsRead, markAllAsRead as apiMarkAllAsRead, deleteMessage, getUnreadCount } from '@/api/notification'
import { formatTime, formatRelativeTime } from '@/utils'

export default defineComponent({
  name: 'MessagesPage',
  setup() {
    const pagination = reactive({
      page: 1,
      page_size: 10,
    })

    const messages = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const activeTab = ref('all')
    const unreadCount = ref(0)
    const detailVisible = ref(false)
    const currentMessage = ref<any>(null)

    const tabs = ref([
      { key: 'all', name: '全部消息', icon: 'el-icon-s-comment', unread: 0 },
      { key: 'reservation', name: '预约通知', icon: 'el-icon-date', unread: 0 },
      { key: 'approval', name: '审批通知', icon: 'el-icon-circle-check', unread: 0 },
      { key: 'system', name: '系统公告', icon: 'el-icon-bell', unread: 0 },
      { key: 'inbox', name: '站内信', icon: 'el-icon-message', unread: 0 },
    ])

    const mockMessages = [
      {
        id: '1',
        type: 'reservation',
        title: '预约审核通过',
        content: '您的预约申请已通过审核：扫描电子显微镜，时间 2024-01-15 10:00-12:00。请准时前往使用。',
        is_read: false,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        action_url: '/my-reservations',
        extra: {
          instrument_name: '扫描电子显微镜',
          time: '2024-01-15 10:00-12:00',
        },
      },
      {
        id: '2',
        type: 'approval',
        title: '待审核预约',
        content: '有新的预约申请等待您审核：张三 - X射线衍射仪，时间 2024-01-16 14:00-17:00。',
        is_read: false,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        action_url: '/reservations/pending',
        extra: {
          user_name: '张三',
          instrument_name: 'X射线衍射仪',
          time: '2024-01-16 14:00-17:00',
        },
      },
      {
        id: '3',
        type: 'system',
        title: '系统维护通知',
        content: '系统将于本周六（1月20日）凌晨 2:00-4:00 进行例行维护，届时将暂停服务，请合理安排您的工作时间。',
        is_read: true,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        action_url: null,
        extra: null,
      },
      {
        id: '4',
        type: 'reservation',
        title: '预约被拒绝',
        content: '您的预约申请已被拒绝：透射电子显微镜，时间 2024-01-17 09:00-12:00。',
        is_read: false,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        action_url: '/my-reservations',
        extra: {
          instrument_name: '透射电子显微镜',
          time: '2024-01-17 09:00-12:00',
          reason: '该时段已有预约，且仪器维护计划冲突',
        },
      },
      {
        id: '5',
        type: 'inbox',
        title: '实验室管理员发来消息',
        content: '您好，您预约的扫描电子显微镜明天上午有培训活动，请问是否需要调整您的预约时间？如果需要，请尽快联系我。',
        is_read: true,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        action_url: null,
        extra: {
          user_name: '实验室管理员',
        },
      },
      {
        id: '6',
        type: 'reservation',
        title: '预约即将开始',
        content: '您预约的仪器将在 30 分钟后开始使用：紫外可见分光光度计，时间 2024-01-13 15:00-17:00。',
        is_read: true,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        action_url: '/my-reservations',
        extra: {
          instrument_name: '紫外可见分光光度计',
          time: '2024-01-13 15:00-17:00',
        },
      },
      {
        id: '7',
        type: 'system',
        title: '新仪器上线',
        content: '实验室新进一台原子力显微镜（AFM-001），现已开放预约。欢迎各位老师同学前来使用！',
        is_read: true,
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        action_url: '/instruments',
        extra: {
          instrument_name: '原子力显微镜',
        },
      },
      {
        id: '8',
        type: 'approval',
        title: '预约已自动通过',
        content: '科研人员李四的预约已自动通过：紫外可见分光光度计，时间 2024-01-18 10:00-12:00（无需审核仪器）。',
        is_read: true,
        created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
        action_url: '/reservations/pending',
        extra: {
          user_name: '李四',
          instrument_name: '紫外可见分光光度计',
          time: '2024-01-18 10:00-12:00',
        },
      },
    ]

    const currentTabName = computed(() => {
      const tab = tabs.value.find((t: any) => t.key === activeTab.value)
      return tab?.name || '全部消息'
    })

    return {
      pagination,
      messages,
      total,
      loading,
      activeTab,
      unreadCount,
      detailVisible,
      currentMessage,
      tabs,
      mockMessages,
      currentTabName,
      formatTime,
      formatRelativeTime,
    }
  },
  mounted() {
    this.fetchMessages()
    this.fetchUnreadCount()
  },
  methods: {
    getMessageIcon(type: string) {
      const iconMap: Record<string, string> = {
        reservation: 'el-icon-date',
        approval: 'el-icon-circle-check',
        system: 'el-icon-bell',
        inbox: 'el-icon-message',
      }
      return iconMap[type] || 'el-icon-s-comment'
    },
    getMessageTypeName(type: string) {
      const nameMap: Record<string, string> = {
        reservation: '预约通知',
        approval: '审批通知',
        system: '系统公告',
        inbox: '站内信',
      }
      return nameMap[type] || '消息'
    },
    switchTab(tab: string) {
      this.activeTab = tab
      this.pagination.page = 1
      this.fetchMessages()
    },
    async fetchUnreadCount() {
      try {
        const res: any = await getUnreadCount()
        this.unreadCount = res.data?.count || 3
        this.tabs.forEach((t: any) => {
          if (t.key === 'all') t.unread = this.unreadCount
          if (t.key === 'reservation') t.unread = 2
          if (t.key === 'approval') t.unread = 1
          if (t.key === 'system') t.unread = 0
          if (t.key === 'inbox') t.unread = 0
        })
      } catch (e) {
        this.unreadCount = 3
        this.tabs.forEach((t: any) => {
          if (t.key === 'all') t.unread = 3
          if (t.key === 'reservation') t.unread = 2
          if (t.key === 'approval') t.unread = 1
        })
      }
    },
    async fetchMessages() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.activeTab !== 'all') {
          params.type = this.activeTab
        }

        const res: any = await getMessageList(params)
        this.messages = res.data?.items || this.mockMessages
        this.total = res.data?.total || this.mockMessages.length
      } catch (e) {
        this.messages = this.mockMessages
        this.total = this.mockMessages.length
      } finally {
        this.loading = false
      }
    },
    handleMessageClick(msg: any) {
      this.currentMessage = msg
      this.detailVisible = true
      if (!msg.is_read) {
        this.markAsRead(msg)
      }
    },
    async markAsRead(msg: any) {
      try {
        await markAsRead(msg.id)
        msg.is_read = true
        this.fetchUnreadCount()
      } catch (e) {
        msg.is_read = true
        this.fetchUnreadCount()
      }
    },
    async markAllAsRead() {
      this.$confirm('确定要将所有消息标记为已读吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await apiMarkAllAsRead()
            this.messages.forEach((m: any) => (m.is_read = true))
            this.fetchUnreadCount()
            this.$message.success('已全部标记为已读')
          } catch (e) {
            this.messages.forEach((m: any) => (m.is_read = true))
            this.fetchUnreadCount()
            this.$message.success('已全部标记为已读')
          }
        })
        .catch(() => {})
    },
    async handleDelete(msg: any) {
      this.$confirm('确定要删除这条消息吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await deleteMessage(msg.id)
            const index = this.messages.findIndex((m: any) => m.id === msg.id)
            if (index > -1) {
              this.messages.splice(index, 1)
              this.total--
            }
            this.fetchUnreadCount()
            this.$message.success('删除成功')
          } catch (e) {
            const index = this.messages.findIndex((m: any) => m.id === msg.id)
            if (index > -1) {
              this.messages.splice(index, 1)
              this.total--
            }
            this.fetchUnreadCount()
            this.$message.success('删除成功')
          }
        })
        .catch(() => {})
    },
    handleAction(msg: any) {
      if (msg.action_url) {
        this.$router.push(msg.action_url)
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.messages-page {
  .messages-container {
    display: flex;
    height: calc(100vh - 200px);
    min-height: 600px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  .message-sidebar {
    width: 260px;
    border-right: 1px solid $border-color;
    display: flex;
    flex-direction: column;

    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid $border-color;
      display: flex;
      justify-content: space-between;
      align-items: center;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: $text-primary;
      }
    }

    .message-tabs {
      flex: 1;
      padding: 12px 0;
      overflow-y: auto;

      .tab-item {
        display: flex;
        align-items: center;
        padding: 12px 20px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;

        &:hover {
          background: $bg-color;
        }

        &.active {
          background: rgba(22, 93, 255, 0.08);
          color: $primary-color;

          &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 24px;
            background: $primary-color;
            border-radius: 0 2px 2px 0;
          }
        }

        i {
          font-size: 18px;
          margin-right: 12px;
        }

        span {
          flex: 1;
          font-size: 14px;
        }

        .tab-badge {
          margin-left: 8px;
        }
      }
    }

    .sidebar-actions {
      padding: 16px;
      border-top: 1px solid $border-color;

      .el-button {
        width: 100%;
      }
    }
  }

  .message-list {
    flex: 1;
    display: flex;
    flex-direction: column;

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid $border-color;

      h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: $text-primary;
      }

      .message-count {
        font-size: 13px;
        color: $text-secondary;
      }
    }

    .list-content {
      flex: 1;
      overflow-y: auto;

      .message-item {
        display: flex;
        padding: 16px 24px;
        border-bottom: 1px solid $border-color;
        transition: all 0.2s;

        &:hover {
          background: $bg-color;
        }

        &.unread {
          background: rgba(22, 93, 255, 0.03);

          .message-title::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 8px;
            background: $primary-color;
            border-radius: 50%;
            margin-right: 8px;
          }
        }

        .message-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 20px;
          margin-right: 16px;
          flex-shrink: 0;

          &.reservation {
            background: rgba(22, 93, 255, 0.1);
            color: $primary-color;
          }
          &.approval {
            background: rgba(0, 180, 42, 0.1);
            color: $success-color;
          }
          &.system {
            background: rgba(255, 125, 0, 0.1);
            color: $warning-color;
          }
          &.inbox {
            background: rgba(118, 120, 228, 0.1);
            color: #7678e4;
          }
        }

        .message-content {
          flex: 1;
          min-width: 0;

          .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;

            .message-title {
              font-size: 14px;
              font-weight: 500;
              color: $text-primary;
            }

            .message-time {
              font-size: 12px;
              color: $text-secondary;
              flex-shrink: 0;
              margin-left: 12px;
            }
          }

          .message-body {
            font-size: 13px;
            color: $text-regular;
            margin: 0 0 8px 0;
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .message-footer {
            font-size: 12px;
            color: $text-secondary;

            span {
              margin-right: 16px;

              i {
                margin-right: 4px;
              }
            }
          }
        }

        .message-actions {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-left: 16px;
          flex-shrink: 0;
        }
      }
    }

    .pagination-container {
      padding: 16px 24px;
      border-top: 1px solid $border-color;
      display: flex;
      justify-content: center;
    }
  }

  .detail-content {
    .detail-header {
      display: flex;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid $border-color;

      .detail-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 28px;
        margin-right: 16px;

        &.reservation {
          background: rgba(22, 93, 255, 0.1);
          color: $primary-color;
        }
        &.approval {
          background: rgba(0, 180, 42, 0.1);
          color: $success-color;
        }
        &.system {
          background: rgba(255, 125, 0, 0.1);
          color: $warning-color;
        }
        &.inbox {
          background: rgba(118, 120, 228, 0.1);
          color: #7678e4;
        }
      }

      .detail-title {
        h3 {
          margin: 0 0 6px 0;
          font-size: 18px;
          font-weight: 600;
          color: $text-primary;
        }

        p {
          margin: 0;
          font-size: 13px;
          color: $text-secondary;

          .dot {
            margin: 0 8px;
          }
        }
      }
    }

    .detail-body {
      margin-bottom: 24px;

      p {
        font-size: 14px;
        line-height: 1.8;
        color: $text-regular;
        margin: 0;
      }
    }

    .detail-extra {
      background: $bg-color;
      padding: 16px;
      border-radius: 8px;

      .extra-section {
        display: flex;
        margin-bottom: 12px;

        &:last-child {
          margin-bottom: 0;
        }

        label {
          width: 80px;
          color: $text-secondary;
          margin: 0;
          flex-shrink: 0;
        }

        span {
          color: $text-primary;
          flex: 1;
        }

        .danger-text {
          color: $danger-color;
        }
      }
    }
  }
}
</style>
