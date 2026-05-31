import dayjs from 'dayjs'

export function formatTime(time: string | Date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!time) return ''
  return dayjs(time).format(format)
}

export function formatDate(time: string | Date, format = 'YYYY-MM-DD') {
  if (!time) return ''
  return dayjs(time).format(format)
}

export function formatFileSize(size: number): string {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let fileSize = size
  while (fileSize >= 1024 && index < units.length - 1) {
    fileSize /= 1024
    index++
  }
  return `${fileSize.toFixed(2)} ${units[index]}`
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function debounce(func: Function, wait: number): Function {
  let timeout: any = null
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

export function throttle(func: Function, wait: number): Function {
  let previous = 0
  return function (this: any, ...args: any[]) {
    const now = Date.now()
    if (now - previous > wait) {
      previous = now
      func.apply(this, args)
    }
  }
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function getDuration(start: string | Date, end: string | Date): string {
  const diff = dayjs(end).diff(dayjs(start), 'minute')
  const hours = Math.floor(diff / 60)
  const minutes = diff % 60
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}
