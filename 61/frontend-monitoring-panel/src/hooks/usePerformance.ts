import { useRef, useEffect, useCallback, useMemo, useState } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastCall = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCall.current

      if (timeSinceLastCall >= delay) {
        lastCall.current = now
        callbackRef.current(...args)
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          lastCall.current = Date.now()
          callbackRef.current(...args)
        }, delay - timeSinceLastCall)
      }
    },
    [delay]
  )
}

export function useBatchUpdate<T>(
  data: T[],
  batchSize: number = 50,
  interval: number = 100
): T[] {
  const [displayData, setDisplayData] = useState<T[]>([])
  const dataRef = useRef<T[]>([])
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (data.length === 0) {
      setDisplayData([])
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    let currentIndex = 0

    const updateBatch = () => {
      const nextIndex = Math.min(currentIndex + batchSize, dataRef.current.length)
      setDisplayData(dataRef.current.slice(0, nextIndex))
      currentIndex = nextIndex

      if (currentIndex < dataRef.current.length) {
        timeoutRef.current = setTimeout(updateBatch, interval)
      }
    }

    setDisplayData(dataRef.current.slice(0, batchSize))
    currentIndex = batchSize

    if (batchSize < data.length) {
      timeoutRef.current = setTimeout(updateBatch, interval)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [data.length, batchSize, interval])

  return displayData
}

export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const totalHeight = items.length * itemHeight

  const startIndex = useMemo(
    () => Math.max(0, Math.floor(scrollTop / itemHeight) - overscan),
    [scrollTop, itemHeight, overscan]
  )

  const endIndex = useMemo(
    () => Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan),
    [scrollTop, itemHeight, containerHeight, overscan, items.length]
  )

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  )

  const offsetY = useMemo(
    () => startIndex * itemHeight,
    [startIndex, itemHeight]
  )

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return {
    containerRef,
    handleScroll,
    visibleItems,
    totalHeight,
    offsetY,
    startIndex,
    endIndex
  }
}

export function useDataSubscription<T>(
  subscribe: (callback: (data: T) => void) => () => void,
  onData: (data: T) => void,
  throttleMs: number = 1000
) {
  const throttledOnData = useThrottle(onData, throttleMs)

  useEffect(() => {
    const unsubscribe = subscribe(throttledOnData)
    return unsubscribe
  }, [subscribe, throttledOnData])
}

export function useRequestAnimationFrame(callback: () => void) {
  const requestRef = useRef<number>()
  const previousTimeRef = useRef<number>()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const animate = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      callbackRef.current()
    }
    previousTimeRef.current = time
    requestRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate)
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current)
      }
    }
  }, [animate])
}
