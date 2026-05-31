import { ref, watch, onMounted, onBeforeUnmount, type Ref } from 'vue'

interface LazyLoadOptions {
  threshold?: number
  rootMargin?: string
  root?: Element | null
  triggerOnce?: boolean
}

interface LazyLoadResult {
  isVisible: Ref<boolean>
  isLoaded: Ref<boolean>
  targetRef: Ref<HTMLElement | null>
  stop: () => void
}

export function useLazyLoad(options: LazyLoadOptions = {}): LazyLoadResult {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    root = null,
    triggerOnce = true
  } = options

  const isVisible = ref(false)
  const isLoaded = ref(false)
  const targetRef = ref<HTMLElement | null>(null)

  let observer: IntersectionObserver | null = null

  function stop() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  function handleIntersection(entries: IntersectionObserverEntry[]) {
    const [entry] = entries

    if (entry.isIntersecting) {
      isVisible.value = true
      isLoaded.value = true

      if (triggerOnce) {
        stop()
      }
    } else if (!triggerOnce) {
      isVisible.value = false
    }
  }

  onMounted(() => {
    if (!targetRef.value) return

    observer = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
      root
    })

    observer.observe(targetRef.value)
  })

  onBeforeUnmount(() => {
    stop()
  })

  return {
    isVisible,
    isLoaded,
    targetRef,
    stop
  }
}

export function useLazyComponent<T>(
  loader: () => Promise<T>,
  options: LazyLoadOptions = {}
) {
  const { isVisible, targetRef, stop } = useLazyLoad(options)
  const component = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function loadComponent() {
    if (loading.value || component.value) return

    loading.value = true
    error.value = null

    try {
      component.value = await loader()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to load component')
    } finally {
      loading.value = false
    }
  }

  watch(isVisible, (visible) => {
    if (visible && !component.value) {
      loadComponent()
    }
  }, { immediate: true })

  return {
    component,
    loading,
    error,
    isVisible,
    targetRef,
    load: loadComponent,
    stop
  }
}

export function useLazyImage(options: LazyLoadOptions & { placeholder?: string } = {}) {
  const { placeholder = '', ...lazyOptions } = options
  const { isVisible, targetRef, stop } = useLazyLoad(lazyOptions)
  const imageSrc = ref(placeholder)
  const isLoaded = ref(false)
  const error = ref<Error | null>(null)

  function loadImage(src: string) {
    if (!src || isLoaded.value) return

    const img = new Image()

    img.onload = () => {
      imageSrc.value = src
      isLoaded.value = true
    }

    img.onerror = () => {
      error.value = new Error('Failed to load image')
    }

    img.src = src
  }

  return {
    imageSrc,
    isLoaded,
    error,
    isVisible,
    targetRef,
    load: loadImage,
    stop
  }
}
