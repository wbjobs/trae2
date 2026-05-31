<template>
  <el-icon v-if="isLoaded" :size="size" :color="color" :class="className">
    <component :is="iconComponent" />
  </el-icon>
  <span v-else ref="placeholderRef" :style="{ width: size + 'px', height: size + 'px', display: 'inline-block' }"></span>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import type { Component } from 'vue'

const props = defineProps<{
  name: string
  size?: number
  color?: string
  className?: string
}>()

const placeholderRef = ref<HTMLElement>()
const isVisible = ref(false)
const isLoaded = ref(false)
const iconComponent = shallowRef<Component | null>(null)

const iconMap: Record<string, () => Promise<Component>> = {
  Monitor: () => import('@element-plus/icons-vue').then(m => m.Monitor),
  Search: () => import('@element-plus/icons-vue').then(m => m.Search),
  Cpu: () => import('@element-plus/icons-vue').then(m => m.Cpu),
  DataAnalysis: () => import('@element-plus/icons-vue').then(m => m.DataAnalysis),
  Bell: () => import('@element-plus/icons-vue').then(m => m.Bell),
  CircleCheck: () => import('@element-plus/icons-vue').then(m => m.CircleCheck),
  Warning: () => import('@element-plus/icons-vue').then(m => m.Warning),
  ArrowRight: () => import('@element-plus/icons-vue').then(m => m.ArrowRight),
  Menu: () => import('@element-plus/icons-vue').then(m => m.Menu),
  Close: () => import('@element-plus/icons-vue').then(m => m.Close),
  Refresh: () => import('@element-plus/icons-vue').then(m => m.Refresh),
  Setting: () => import('@element-plus/icons-vue').then(m => m.Setting),
  User: () => import('@element-plus/icons-vue').then(m => m.User),
  Lock: () => import('@element-plus/icons-vue').then(m => m.Lock),
  Edit: () => import('@element-plus/icons-vue').then(m => m.Edit),
  Delete: () => import('@element-plus/icons-vue').then(m => m.Delete),
  Plus: () => import('@element-plus/icons-vue').then(m => m.Plus),
  Minus: () => import('@element-plus/icons-vue').then(m => m.Minus),
  Upload: () => import('@element-plus/icons-vue').then(m => m.Upload),
  Download: () => import('@element-plus/icons-vue').then(m => m.Download),
  View: () => import('@element-plus/icons-vue').then(m => m.View)
}

let observer: ReturnType<typeof useIntersectionObserver> | null = null

async function loadIcon() {
  const loader = iconMap[props.name]
  if (loader) {
    try {
      iconComponent.value = await loader()
      isLoaded.value = true
    } catch (error) {
      console.warn(`Icon ${props.name} load failed:`, error)
    }
  }
}

onMounted(() => {
  if (placeholderRef.value) {
    observer = useIntersectionObserver(
      placeholderRef,
      ([{ isIntersecting }]) => {
        if (isIntersecting && !isVisible.value) {
          isVisible.value = true
          loadIcon()
          observer?.stop()
        }
      },
      { threshold: 0.1 }
    )
  }
})

onBeforeUnmount(() => {
  observer?.stop()
})

watch(() => props.name, () => {
  if (isVisible.value) {
    loadIcon()
  }
})
</script>
