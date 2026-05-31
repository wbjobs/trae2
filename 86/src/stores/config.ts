import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppConfig, ConfigFile, ReporterConfig } from '@/types'

export const useConfigStore = defineStore('config', () => {
  const currentConfig = ref<AppConfig | null>(null)
  const configFiles = ref<ConfigFile[]>([])
  const currentConfigPath = ref<string | null>(null)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  const hasConfig = computed(() => currentConfig.value !== null)

  const enabledDevices = computed(() => {
    return currentConfig.value?.devices.filter(d => d.enabled) || []
  })

  const enabledRules = computed(() => {
    return currentConfig.value?.collection_rules.filter(r => r.enabled) || []
  })

  const enabledReporters = computed(() => {
    return currentConfig.value?.reporters.filter(r => r.enabled) || []
  })

  async function loadConfig(configPath: string) {
    try {
      isLoading.value = true
      lastError.value = null
      const success = await window.configAPI.load(configPath)
      if (success) {
        await fetchCurrentConfig()
        currentConfigPath.value = configPath
      }
      return success
    } catch (error: any) {
      lastError.value = error.message || '加载配置失败'
      console.error('[ConfigStore] Load error:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function loadConfigFromJson(jsonString: string) {
    try {
      isLoading.value = true
      lastError.value = null
      const success = await window.configAPI.loadFromJson(jsonString)
      if (success) {
        await fetchCurrentConfig()
      }
      return success
    } catch (error: any) {
      lastError.value = error.message || '加载配置失败'
      console.error('[ConfigStore] Load from JSON error:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function fetchCurrentConfig() {
    try {
      const json = await window.configAPI.get()
      currentConfig.value = JSON.parse(json)
      return currentConfig.value
    } catch (error: any) {
      console.error('[ConfigStore] Fetch error:', error)
      throw error
    }
  }

  async function listConfigs(dirPath: string) {
    try {
      configFiles.value = await window.configAPI.listConfigs(dirPath)
      return configFiles.value
    } catch (error: any) {
      console.error('[ConfigStore] List error:', error)
      throw error
    }
  }

  async function readConfigFile(filePath: string) {
    try {
      return await window.configAPI.readFile(filePath)
    } catch (error: any) {
      console.error('[ConfigStore] Read file error:', error)
      throw error
    }
  }

  async function writeConfigFile(filePath: string, content: string) {
    try {
      return await window.configAPI.writeFile(filePath, content)
    } catch (error: any) {
      console.error('[ConfigStore] Write file error:', error)
      throw error
    }
  }

  async function batchImport(sourceDir: string, targetDir: string) {
    try {
      isLoading.value = true
      const result = await window.configAPI.batchImport(sourceDir, targetDir || 'configs')
      await listConfigs(targetDir || 'configs')
      return result
    } catch (error: any) {
      lastError.value = error.message || '批量导入失败'
      console.error('[ConfigStore] Batch import error:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function batchExport(configDir: string) {
    try {
      isLoading.value = true
      return await window.configAPI.batchExport(configDir || 'configs')
    } catch (error: any) {
      lastError.value = error.message || '批量导出失败'
      console.error('[ConfigStore] Batch export error:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function exportToFile(targetPath: string, configs: Array<{ name: string; content: string }>) {
    try {
      return await window.configAPI.exportToFile(targetPath, configs)
    } catch (error: any) {
      lastError.value = error.message || '导出失败'
      console.error('[ConfigStore] Export to file error:', error)
      throw error
    }
  }

  function createDefaultConfig(): AppConfig {
    return {
      app_name: 'hardware-monitor',
      app_version: '1.0.0',
      device_id: `device-${Date.now()}`,
      devices: [],
      collection_rules: [
        {
          rule_id: 'default-rule',
          name: '默认采集规则',
          enabled: true,
          hardware_types: ['Cpu', 'Memory', 'Disk', 'Network'],
          collection_interval_ms: 5000,
          timeout_ms: 30000,
          max_retries: 3,
          filters: [],
          aggregate: true,
        },
      ],
      reporters: [],
      logging: {
        level: 'info',
        max_file_size_mb: 10,
        max_files: 5,
        console_output: true,
      },
      extra: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  function createReporterConfig(endpointUrl: string, authToken?: string, encryptionKey?: string): ReporterConfig {
    return {
      reporter_id: `reporter-${Date.now()}`,
      name: '数据上报配置',
      enabled: true,
      endpoint_url: endpointUrl,
      auth_token: authToken,
      encryption_key: encryptionKey,
      batch_size: 100,
      max_interval_ms: 30000,
      retry_count: 3,
      retry_interval_ms: 5000,
      timeout_ms: 10000,
      use_tls: endpointUrl.startsWith('https://'),
      headers: {},
    }
  }

  async function generateEncryptionKey() {
    try {
      return await window.encryptionAPI.generateKey()
    } catch (error: any) {
      console.error('[ConfigStore] Generate key error:', error)
      throw error
    }
  }

  function clearError() {
    lastError.value = null
  }

  return {
    currentConfig,
    configFiles,
    currentConfigPath,
    isLoading,
    lastError,
    hasConfig,
    enabledDevices,
    enabledRules,
    enabledReporters,
    loadConfig,
    loadConfigFromJson,
    fetchCurrentConfig,
    listConfigs,
    readConfigFile,
    writeConfigFile,
    batchImport,
    batchExport,
    exportToFile,
    createDefaultConfig,
    createReporterConfig,
    generateEncryptionKey,
    clearError,
  }
})
