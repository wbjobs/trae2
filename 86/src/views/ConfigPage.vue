<template>
  <div class="config-page">
    <div class="page-header mb-6">
      <h1 class="text-2xl font-bold text-text-primary mb-2">配置管理</h1>
      <p class="text-text-secondary">管理硬件采集配置、设备规则和上报策略</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1">
        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text-primary">配置文件列表</h2>
            <button class="btn btn-primary btn-sm" @click="createNewConfig">
              + 新建
            </button>
          </div>
          
          <div v-if="configStore.isLoading" class="text-center py-8 text-text-secondary">
            <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
            加载中...
          </div>
          
          <div v-else-if="configStore.configFiles.length === 0" class="text-center py-8 text-text-secondary">
            暂无配置文件
          </div>
          
          <div v-else class="space-y-2 max-h-96 overflow-y-auto">
            <div
              v-for="file in configStore.configFiles"
              :key="file.path"
              class="config-file-item p-3 rounded-lg cursor-pointer transition-all"
              :class="{
                'bg-primary/20 border border-primary': currentConfigPath === file.path,
                'bg-bg-secondary hover:bg-bg-tertiary border border-transparent': currentConfigPath !== file.path
              }"
              @click="loadConfigFile(file.path)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <svg class="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="text-text-primary text-sm font-medium truncate">{{ file.name }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button 
                    class="p-1 hover:bg-bg-tertiary rounded" 
                    @click.stop="editConfigFile(file.path)"
                    title="编辑"
                  >
                    <svg class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button 
                    class="p-1 hover:bg-bg-tertiary rounded" 
                    @click.stop="deleteConfigFile(file.path)"
                    title="删除"
                  >
                    <svg class="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-border">
            <button class="btn btn-secondary w-full mb-2" @click="refreshConfigList">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新列表
            </button>
            <button class="btn btn-primary w-full mb-2" @click="handleBatchImport">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              批量导入
            </button>
            <button class="btn btn-secondary w-full" @click="handleBatchExport">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              批量导出
            </button>
          </div>
        </div>
      </div>

      <div class="lg:col-span-2">
        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text-primary">
              {{ isEditing ? '编辑配置' : '当前配置' }}
            </h2>
            <div class="flex items-center gap-2">
              <button v-if="isEditing" class="btn btn-secondary btn-sm" @click="cancelEdit">
                取消
              </button>
              <button v-if="isEditing" class="btn btn-primary btn-sm" @click="saveConfig">
                保存
              </button>
              <button v-else-if="configStore.currentConfig" class="btn btn-secondary btn-sm" @click="startEdit">
                编辑
              </button>
            </div>
          </div>

          <div v-if="!configStore.currentConfig && !isEditing" class="text-center py-16 text-text-secondary">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="mb-4">请选择或创建一个配置文件</p>
            <button class="btn btn-primary" @click="createNewConfig">
              + 创建新配置
            </button>
          </div>

          <div v-else-if="isEditing" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="form-label">应用名称</label>
                <input 
                  v-model="editConfig.app_name" 
                  type="text" 
                  class="form-input"
                  placeholder="hardware-monitor"
                />
              </div>
              <div>
                <label class="form-label">版本</label>
                <input 
                  v-model="editConfig.app_version" 
                  type="text" 
                  class="form-input"
                  placeholder="1.0.0"
                />
              </div>
              <div>
                <label class="form-label">设备ID</label>
                <input 
                  v-model="editConfig.device_id" 
                  type="text" 
                  class="form-input"
                  placeholder="device-xxx"
                />
              </div>
            </div>

            <div class="border border-border rounded-lg p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-medium text-text-primary">采集规则</h3>
                <button class="btn btn-primary btn-sm" @click="addCollectionRule">
                  + 添加规则
                </button>
              </div>
              
              <div v-if="editConfig.collection_rules.length === 0" class="text-center py-4 text-text-secondary text-sm">
                暂无采集规则
              </div>
              
              <div v-else class="space-y-3">
                <div 
                  v-for="(rule, index) in editConfig.collection_rules" 
                  :key="rule.rule_id"
                  class="bg-bg-secondary rounded-lg p-4"
                >
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label class="form-label text-xs">规则ID</label>
                      <input v-model="rule.rule_id" type="text" class="form-input form-input-sm" />
                    </div>
                    <div>
                      <label class="form-label text-xs">名称</label>
                      <input v-model="rule.name" type="text" class="form-input form-input-sm" />
                    </div>
                    <div>
                      <label class="form-label text-xs">采集间隔 (ms)</label>
                      <input v-model.number="rule.collection_interval_ms" type="number" class="form-input form-input-sm" />
                    </div>
                    <div>
                      <label class="form-label text-xs">超时 (ms)</label>
                      <input v-model.number="rule.timeout_ms" type="number" class="form-input form-input-sm" />
                    </div>
                  </div>
                  
                  <div class="mt-3 flex items-center gap-4">
                    <label class="flex items-center gap-2">
                      <input type="checkbox" v-model="rule.enabled" class="form-checkbox" />
                      <span class="text-sm text-text-secondary">启用</span>
                    </label>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" v-model="rule.aggregate" class="form-checkbox" />
                      <span class="text-sm text-text-secondary">聚合</span>
                    </label>
                    <div class="flex-1"></div>
                    <button class="text-error hover:text-error/80 text-sm" @click="removeCollectionRule(index)">
                      删除
                    </button>
                  </div>

                  <div class="mt-3">
                    <label class="form-label text-xs">硬件类型</label>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <label 
                        v-for="ht in hardwareTypes" 
                        :key="ht"
                        class="flex items-center gap-1 px-2 py-1 bg-bg-tertiary rounded text-sm"
                      >
                        <input 
                          type="checkbox" 
                          :value="ht" 
                          v-model="rule.hardware_types"
                          class="form-checkbox form-checkbox-sm"
                        />
                        {{ ht }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="border border-border rounded-lg p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-medium text-text-primary">设备配置</h3>
                <button class="btn btn-primary btn-sm" @click="addDevice">
                  + 添加设备
                </button>
              </div>
              
              <div v-if="editConfig.devices.length === 0" class="text-center py-4 text-text-secondary text-sm">
                暂无设备配置
              </div>
              
              <div v-else class="space-y-3">
                <div 
                  v-for="(device, index) in editConfig.devices" 
                  :key="device.device_id"
                  class="bg-bg-secondary rounded-lg p-4"
                >
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label class="form-label text-xs">设备ID</label>
                      <input v-model="device.device_id" type="text" class="form-input form-input-sm" />
                    </div>
                    <div>
                      <label class="form-label text-xs">名称</label>
                      <input v-model="device.name" type="text" class="form-input form-input-sm" />
                    </div>
                    <div>
                      <label class="form-label text-xs">硬件类型</label>
                      <select v-model="device.hardware_type" class="form-input form-input-sm">
                        <option v-for="ht in hardwareTypes" :key="ht" :value="ht">{{ ht }}</option>
                      </select>
                    </div>
                  </div>
                  <div class="mt-3 flex items-center gap-4">
                    <label class="flex items-center gap-2">
                      <input type="checkbox" v-model="device.enabled" class="form-checkbox" />
                      <span class="text-sm text-text-secondary">启用</span>
                    </label>
                    <div>
                      <label class="form-label text-xs inline mr-2">轮询间隔 (ms)</label>
                      <input v-model.number="device.poll_interval_ms" type="number" class="form-input form-input-sm w-24 inline" />
                    </div>
                    <div class="flex-1"></div>
                    <button class="text-error hover:text-error/80 text-sm" @click="removeDevice(index)">
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="border border-border rounded-lg p-4">
              <h3 class="font-medium text-text-primary mb-4">日志配置</h3>
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label class="form-label">日志级别</label>
                  <select v-model="editConfig.logging.level" class="form-input">
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">最大文件大小 (MB)</label>
                  <input v-model.number="editConfig.logging.max_file_size_mb" type="number" class="form-input" />
                </div>
                <div>
                  <label class="form-label">最大文件数</label>
                  <input v-model.number="editConfig.logging.max_files" type="number" class="form-input" />
                </div>
                <div class="flex items-end">
                  <label class="flex items-center gap-2">
                    <input type="checkbox" v-model="editConfig.logging.console_output" class="form-checkbox" />
                    <span class="text-sm text-text-secondary">控制台输出</span>
                  </label>
                </div>
              </div>
            </div>

            <div v-if="editConfig.reporters && editConfig.reporters.length > 0" class="border border-border rounded-lg p-4">
              <h3 class="font-medium text-text-primary mb-4">上报配置</h3>
              <div class="space-y-3">
                <div 
                  v-for="reporter in editConfig.reporters" 
                  :key="reporter.reporter_id"
                  class="bg-bg-secondary rounded-lg p-4"
                >
                  <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2">
                      <input type="checkbox" v-model="reporter.enabled" class="form-checkbox" />
                      <span class="text-sm font-medium text-text-primary">{{ reporter.name }}</span>
                    </label>
                    <span class="text-xs text-text-secondary">{{ reporter.endpoint_url }}</span>
                    <span class="text-xs px-2 py-0.5 rounded" :class="reporter.use_tls ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'">
                      {{ reporter.use_tls ? 'HTTPS' : 'HTTP' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="configStore.currentConfig" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">应用名称</div>
                <div class="text-text-primary font-medium">{{ configStore.currentConfig.app_name }}</div>
              </div>
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">版本</div>
                <div class="text-text-primary font-medium">{{ configStore.currentConfig.app_version }}</div>
              </div>
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">设备ID</div>
                <div class="text-text-primary font-medium truncate" :title="configStore.currentConfig.device_id">
                  {{ configStore.currentConfig.device_id }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">采集规则</div>
                <div class="text-text-primary font-medium">{{ configStore.enabledRules.length }} / {{ configStore.currentConfig.collection_rules.length }} 启用</div>
              </div>
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">设备配置</div>
                <div class="text-text-primary font-medium">{{ configStore.enabledDevices.length }} / {{ configStore.currentConfig.devices.length }} 启用</div>
              </div>
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">上报配置</div>
                <div class="text-text-primary font-medium">{{ configStore.enabledReporters.length }} / {{ configStore.currentConfig.reporters.length }} 启用</div>
              </div>
              <div class="stat-card-small">
                <div class="text-text-secondary text-sm">日志级别</div>
                <div class="text-text-primary font-medium uppercase">{{ configStore.currentConfig.logging.level }}</div>
              </div>
            </div>

            <div>
              <h3 class="font-medium text-text-primary mb-3">采集规则</h3>
              <div class="overflow-hidden border border-border rounded-lg">
                <table class="w-full">
                  <thead class="bg-bg-secondary">
                    <tr>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">名称</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">硬件类型</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">间隔</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">状态</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    <tr v-for="rule in configStore.currentConfig.collection_rules" :key="rule.rule_id">
                      <td class="px-4 py-3 text-sm text-text-primary">{{ rule.name }}</td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{{ rule.hardware_types.join(', ') }}</td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{{ rule.collection_interval_ms }}ms</td>
                      <td class="px-4 py-3">
                        <span class="status-badge" :class="rule.enabled ? 'status-success' : 'status-error'">
                          {{ rule.enabled ? '启用' : '禁用' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="configStore.currentConfig.devices.length > 0">
              <h3 class="font-medium text-text-primary mb-3">设备配置</h3>
              <div class="overflow-hidden border border-border rounded-lg">
                <table class="w-full">
                  <thead class="bg-bg-secondary">
                    <tr>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">设备ID</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">名称</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">类型</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">轮询间隔</th>
                      <th class="text-left px-4 py-3 text-sm font-medium text-text-secondary">状态</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    <tr v-for="device in configStore.currentConfig.devices" :key="device.device_id">
                      <td class="px-4 py-3 text-sm text-text-primary font-mono">{{ device.device_id }}</td>
                      <td class="px-4 py-3 text-sm text-text-primary">{{ device.name }}</td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{{ device.hardware_type }}</td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{{ device.poll_interval_ms }}ms</td>
                      <td class="px-4 py-3">
                        <span class="status-badge" :class="device.enabled ? 'status-success' : 'status-error'">
                          {{ device.enabled ? '启用' : '禁用' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
      <div class="modal-content">
        <h3 class="text-lg font-semibold text-text-primary mb-4">保存配置</h3>
        <div class="space-y-4">
          <div>
            <label class="form-label">文件名</label>
            <input 
              v-model="saveFileName" 
              type="text" 
              class="form-input"
              placeholder="config.json"
            />
          </div>
          <div>
            <label class="form-label">保存路径</label>
            <div class="flex gap-2">
              <input 
                v-model="saveFilePath" 
                type="text" 
                class="form-input flex-1"
                placeholder="configs/"
              />
              <button class="btn btn-secondary" @click="browsePath">浏览</button>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="btn btn-secondary" @click="showSaveDialog = false">取消</button>
          <button class="btn btn-primary" @click="confirmSave">确认保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useConfigStore } from '@/stores/config'
import type { AppConfig, CollectionRule, DeviceConfig } from '@/types'

const appStore = useAppStore()
const configStore = useConfigStore()

const isEditing = ref(false)
const editConfig = reactive<AppConfig>(configStore.createDefaultConfig())
const showSaveDialog = ref(false)
const saveFileName = ref('')
const saveFilePath = ref('configs/')

const hardwareTypes = ['Cpu', 'Memory', 'Disk', 'Network', 'Motherboard', 'Sensor', 'ExternalDevice']

const currentConfigPath = computed(() => configStore.currentConfigPath)

onMounted(async () => {
  try {
    await configStore.listConfigs('configs')
  } catch (error) {
    console.error('Load configs error:', error)
  }
})

async function loadConfigFile(path: string) {
  try {
    await configStore.loadConfig(path)
    appStore.success(`已加载配置: ${path}`)
  } catch (error: any) {
    appStore.error(`加载配置失败: ${error.message}`)
  }
}

function createNewConfig() {
  const newConfig = configStore.createDefaultConfig()
  Object.assign(editConfig, newConfig)
  isEditing.value = true
}

function startEdit() {
  if (configStore.currentConfig) {
    Object.assign(editConfig, JSON.parse(JSON.stringify(configStore.currentConfig)))
    isEditing.value = true
  }
}

function cancelEdit() {
  isEditing.value = false
}

function saveConfig() {
  showSaveDialog.value = true
  saveFileName.value = `${editConfig.app_name}-${Date.now()}.json`
}

async function confirmSave() {
  try {
    const fullPath = `${saveFilePath.value}${saveFileName.value}`
    const content = JSON.stringify(editConfig, null, 2)
    await configStore.writeConfigFile(fullPath, content)
    await configStore.loadConfig(fullPath)
    isEditing.value = false
    showSaveDialog.value = false
    appStore.success(`配置已保存: ${fullPath}`)
    await configStore.listConfigs('configs')
  } catch (error: any) {
    appStore.error(`保存失败: ${error.message}`)
  }
}

async function refreshConfigList() {
  try {
    await configStore.listConfigs('configs')
    appStore.success('列表已刷新')
  } catch (error: any) {
    appStore.error(`刷新失败: ${error.message}`)
  }
}

async function editConfigFile(path: string) {
  try {
    const content = await configStore.readConfigFile(path)
    const config = JSON.parse(content)
    Object.assign(editConfig, config)
    isEditing.value = true
  } catch (error: any) {
    appStore.error(`读取配置失败: ${error.message}`)
  }
}

async function deleteConfigFile(path: string) {
  if (!confirm(`确定要删除配置文件: ${path} ?`)) return
  try {
    await window.configAPI.deleteFile(path)
    appStore.success('配置已删除')
    await configStore.listConfigs('configs')
    if (configStore.currentConfigPath === path) {
      configStore.currentConfigPath = null
    }
  } catch (error: any) {
    appStore.error(`删除失败: ${error.message}`)
  }
}

function addCollectionRule() {
  const newRule: CollectionRule = {
    rule_id: `rule-${Date.now()}`,
    name: '新采集规则',
    enabled: true,
    hardware_types: ['Cpu', 'Memory'],
    collection_interval_ms: 5000,
    timeout_ms: 30000,
    max_retries: 3,
    filters: [],
    aggregate: true,
  }
  editConfig.collection_rules.push(newRule)
}

function removeCollectionRule(index: number) {
  editConfig.collection_rules.splice(index, 1)
}

function addDevice() {
  const newDevice: DeviceConfig = {
    device_id: `device-${Date.now()}`,
    name: '新设备',
    hardware_type: 'Cpu',
    enabled: true,
    poll_interval_ms: 1000,
    settings: {},
  }
  editConfig.devices.push(newDevice)
}

function removeDevice(index: number) {
  editConfig.devices.splice(index, 1)
}

function browsePath() {
  appStore.info('请手动输入保存路径')
}

async function handleBatchImport() {
  try {
    const sourceDir = prompt('请输入导入源目录路径:', 'configs-import')
    if (!sourceDir) return
    const result = await configStore.batchImport(sourceDir, 'configs')
    if (result.errors.length > 0) {
      appStore.warning(`导入完成: ${result.total} 个成功, ${result.errors.length} 个失败`)
    } else {
      appStore.success(`成功导入 ${result.total} 个配置文件`)
    }
  } catch (error: any) {
    appStore.error(`批量导入失败: ${error.message}`)
  }
}

async function handleBatchExport() {
  try {
    const configs = await configStore.batchExport('configs')
    if (configs.length === 0) {
      appStore.info('没有可导出的配置文件')
      return
    }
    const targetPath = prompt('请输入导出目标目录路径:', 'configs-export')
    if (!targetPath) return
    const result = await configStore.exportToFile(targetPath, configs)
    appStore.success(`已导出 ${result.count} 个配置文件到 ${result.dir}`)
  } catch (error: any) {
    appStore.error(`批量导出失败: ${error.message}`)
  }
}
</script>

<style scoped>
.config-page {
  min-height: 100%;
}

.stat-card-small {
  @apply bg-bg-secondary rounded-lg p-4;
}
</style>
