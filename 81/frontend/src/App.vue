<template>
  <el-container class="app-container">
    <el-header class="header">
      <div class="header-content">
        <h1 class="title">分布式节点状态遥测网关系统</h1>
        <div class="header-right">
          <span class="node-count" v-if="realtimeNodes.length > 0">
            监控节点: {{ realtimeNodes.length }}
          </span>
          <el-tag type="success" class="connection-status" v-if="wsConnected">
            WebSocket 已连接
          </el-tag>
          <el-tag type="danger" class="connection-status" v-else>
            WebSocket 未连接
          </el-tag>
        </div>
      </div>
    </el-header>
    <el-container>
      <el-aside width="200px" class="aside">
        <el-menu
          :default-active="$route.path"
          class="menu"
          router
        >
          <el-menu-item index="/">
            <el-icon><DataLine /></el-icon>
            <span>数据概览</span>
          </el-menu-item>
          <el-menu-item index="/nodes">
            <el-icon><Monitor /></el-icon>
            <span>节点列表</span>
          </el-menu-item>
          <el-menu-item index="/hot">
            <el-icon><TrendCharts /></el-icon>
            <span>热点节点</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { DataLine, Monitor, TrendCharts } from '@element-plus/icons-vue'

const wsConnected = ref(false)
const realtimeNodes = ref([])

let ws = null
let reconnectTimer = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 1000

function initWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.hostname}:3001`

  try {
    ws = new WebSocket(wsUrl)
  } catch (error) {
    console.error('WebSocket创建失败:', error)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    wsConnected.value = true
    reconnectAttempts = 0
    console.log('WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'heartbeat') {
        updateNodeInList(data.data)
      } else if (data.type === 'batch_heartbeat') {
        if (Array.isArray(data.data)) {
          for (const nodeData of data.data) {
            updateNodeInList(nodeData)
          }
        }
      } else if (data.type === 'snapshot') {
        if (Array.isArray(data.data) && data.data.length > 0) {
          realtimeNodes.value = data.data.map(node => ({
            nodeId: node.nodeId,
            groupId: node.groupId,
            region: node.region,
            cpu: node.cpu,
            memory: node.memory,
            bandwidth: node.bandwidth,
            uptime: node.uptime,
            status: node.status,
            lastUpdate: node.lastUpdate,
            timestamp: node.timestamp
          }))
        }
      }
    } catch (e) {
      console.error('WebSocket消息解析失败:', e)
    }
  }

  ws.onclose = () => {
    wsConnected.value = false
    ws = null
    scheduleReconnect()
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
  }
}

function updateNodeInList(nodeData) {
  const index = realtimeNodes.value.findIndex(n => n.nodeId === nodeData.nodeId)
  if (index >= 0) {
    const newList = [...realtimeNodes.value]
    newList[index] = {
      nodeId: nodeData.nodeId,
      groupId: nodeData.groupId,
      region: nodeData.region,
      cpu: nodeData.cpu,
      memory: nodeData.memory,
      bandwidth: nodeData.bandwidth,
      uptime: nodeData.uptime,
      status: nodeData.status,
      lastUpdate: nodeData.lastUpdate,
      timestamp: nodeData.timestamp
    }
    realtimeNodes.value = newList
  } else {
    realtimeNodes.value = [...realtimeNodes.value, {
      nodeId: nodeData.nodeId,
      groupId: nodeData.groupId,
      region: nodeData.region,
      cpu: nodeData.cpu,
      memory: nodeData.memory,
      bandwidth: nodeData.bandwidth,
      uptime: nodeData.uptime,
      status: nodeData.status,
      lastUpdate: nodeData.lastUpdate,
      timestamp: nodeData.timestamp
    }]
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('WebSocket重连次数已达上限，停止重连')
    return
  }

  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts)
  reconnectAttempts++

  console.log(`WebSocket将在${delay}ms后进行第${reconnectAttempts}次重连...`)
  reconnectTimer = setTimeout(() => {
    initWebSocket()
  }, delay)
}

onMounted(() => {
  initWebSocket()
})

onUnmounted(() => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
})

provide('realtimeNodes', realtimeNodes)
provide('wsConnected', wsConnected)
</script>

<style scoped>
.app-container {
  height: 100vh;
}

.header {
  background: linear-gradient(90deg, #409EFF 0%, #67C23A 100%);
  color: white;
  padding: 0 20px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

.title {
  margin: 0;
  font-size: 24px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-count {
  font-size: 14px;
  opacity: 0.9;
}

.connection-status {
  margin-left: 10px;
}

.aside {
  background-color: #f5f7fa;
  border-right: 1px solid #e4e7ed;
}

.menu {
  border-right: none;
}

.main {
  background-color: #f5f7fa;
  padding: 20px;
}
</style>
