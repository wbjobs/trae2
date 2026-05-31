import type { AsyncComponentLoader, Component } from 'vue'
import { defineAsyncComponent, h } from 'vue'
import RouteLoading from '@/components/RouteLoading.vue'
import RouteError from '@/components/RouteError.vue'

interface LazyLoadOptions {
  loadingComponent?: Component
  errorComponent?: Component
  delay?: number
  timeout?: number
}

export function lazyLoadView(
  loader: AsyncComponentLoader,
  options: LazyLoadOptions = {}
) {
  const {
    loadingComponent = RouteLoading,
    errorComponent = RouteError,
    delay = 200,
    timeout = 10000
  } = options

  return defineAsyncComponent({
    loader,
    loadingComponent,
    errorComponent,
    delay,
    timeout,
    suspensible: true,
    onError(error, retry) {
      console.error('Component load error:', error)
      if (error.message.includes('fetch') || error.message.includes('network')) {
        retry()
      }
    }
  })
}

export function lazyLoadComponent(
  loader: AsyncComponentLoader,
  options: LazyLoadOptions = {}
) {
  const {
    delay = 100,
    timeout = 5000
  } = options

  return defineAsyncComponent({
    loader,
    delay,
    timeout,
    suspensible: true
  })
}

export function createAsyncLoaderWithFallback(
  loader: AsyncComponentLoader,
  fallback: Component
) {
  return defineAsyncComponent({
    loader,
    loadingComponent: {
      render() {
        return h('div', { class: 'async-loading' })
      }
    },
    errorComponent: fallback,
    suspensible: true
  })
}
