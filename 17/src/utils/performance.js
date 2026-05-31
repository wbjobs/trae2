export const performanceUtils = {
  debounce(fn, delay = 300) {
    let timer = null
    return function (...args) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        fn.apply(this, args)
        timer = null
      }, delay)
    }
  },

  throttle(fn, interval = 300) {
    let lastTime = 0
    let timer = null

    return function (...args) {
      const now = Date.now()
      const remaining = interval - (now - lastTime)

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        lastTime = now
        fn.apply(this, args)
      } else if (!timer) {
        timer = setTimeout(() => {
          lastTime = Date.now()
          timer = null
          fn.apply(this, args)
        }, remaining)
      }
    }
  },

  requestAnimationFrame(fn) {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      return window.requestAnimationFrame(fn)
    }
    return setTimeout(fn, 16)
  },

  cancelAnimationFrame(id) {
    if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(id)
    } else {
      clearTimeout(id)
    }
  },

  scheduleRender(renderFn, priority = 'normal') {
    const priorities = {
      high: 0,
      normal: 1,
      low: 2
    }

    return new Promise((resolve) => {
      const execute = () => {
        try {
          const result = renderFn()
          resolve(result)
        } catch (error) {
          console.error('Render error:', error)
          resolve(null)
        }
      }

      if (priority === 'high') {
        this.requestAnimationFrame(execute)
      } else if (priority === 'low') {
        setTimeout(execute, 100)
      } else {
        setTimeout(execute, 16)
      }
    })
  },

  batchProcess(items, processFn, batchSize = 50, onProgress) {
    return new Promise((resolve) => {
      let index = 0
      const results = []

      const processBatch = () => {
        const batch = items.slice(index, index + batchSize)
        const batchResults = batch.map(item => processFn(item))
        results.push(...batchResults)
        index += batchSize

        if (onProgress) {
          onProgress(Math.min(index, items.length), items.length)
        }

        if (index < items.length) {
          this.requestAnimationFrame(processBatch)
        } else {
          resolve(results)
        }
      }

      processBatch()
    })
  },

  createRenderScheduler(maxConcurrent = 2) {
    const queue = []
    let running = 0

    const runNext = () => {
      if (running >= maxConcurrent || queue.length === 0) return

      running++
      const task = queue.shift()

      Promise.resolve()
        .then(() => task.fn())
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          running--
          runNext()
        })
    }

    return {
      schedule(fn, priority = 'normal') {
        return new Promise((resolve, reject) => {
          const task = { fn, resolve, reject, priority }

          if (priority === 'high') {
            queue.unshift(task)
          } else {
            queue.push(task)
          }

          runNext()
        })
      },

      clear() {
        queue.length = 0
      },

      getQueueSize() {
        return queue.length
      }
    }
  },

  memoize(fn, keyFn) {
    const cache = new Map()

    return function (...args) {
      const key = keyFn ? keyFn(...args) : JSON.stringify(args)

      if (cache.has(key)) {
        return cache.get(key)
      }

      const result = fn.apply(this, args)
      cache.set(key, result)
      return result
    }
  },

  lazyInit(initFn) {
    let initialized = false
    let value = null

    return function (...args) {
      if (!initialized) {
        value = initFn.apply(this, args)
        initialized = true
      }
      return value
    }
  },

  virtualizeList(items, viewportSize, itemHeight, scrollTop) {
    const totalItems = items.length
    const totalHeight = totalItems * itemHeight

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5)
    const endIndex = Math.min(
      totalItems,
      Math.ceil((scrollTop + viewportSize) / itemHeight) + 5
    )

    const visibleItems = items.slice(startIndex, endIndex)

    return {
      items: visibleItems,
      startIndex,
      endIndex,
      offsetY: startIndex * itemHeight,
      totalHeight,
      isScrollable: totalHeight > viewportSize
    }
  },

  optimizeChartData(data, maxPoints = 2000) {
    if (!Array.isArray(data) || data.length <= maxPoints) {
      return data
    }

    const step = Math.ceil(data.length / maxPoints)
    const result = []

    for (let i = 0; i < data.length; i += step) {
      const chunk = data.slice(i, i + step)

      if (chunk.length === 0) continue

      result.push(chunk[Math.floor(chunk.length / 2)])
    }

    return result
  },

  measurePerformance(fn, label = 'function') {
    return async function (...args) {
      const startTime = performance.now()
      try {
        const result = await fn.apply(this, args)
        const endTime = performance.now()
        console.log(`[Performance] ${label} completed in ${(endTime - startTime).toFixed(2)}ms`)
        return result
      } catch (error) {
        const endTime = performance.now()
        console.log(`[Performance] ${label} failed after ${(endTime - startTime).toFixed(2)}ms`)
        throw error
      }
    }
  }
}

export default performanceUtils
