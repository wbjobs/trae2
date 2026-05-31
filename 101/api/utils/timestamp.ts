export class MonotonicTimestamp {
  private lastTimestamp: number = 0
  private counter: number = 0

  now(): number {
    const current = Date.now()
    if (current > this.lastTimestamp) {
      this.lastTimestamp = current
      this.counter = 0
    } else {
      this.counter++
      this.lastTimestamp = this.lastTimestamp + 1
    }
    return this.lastTimestamp
  }

  nowISO(): string {
    return new Date(this.now()).toISOString()
  }

  nowDate(): Date {
    return new Date(this.now())
  }

  getPrevious(): number {
    return this.lastTimestamp
  }
}

export const timestamp = new MonotonicTimestamp()

export function sortByTime<T extends { time: string | number | Date }>(data: T[]): T[] {
  return [...data].sort((a, b) => {
    const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() :
                 a.time instanceof Date ? a.time.getTime() : a.time
    const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() :
                 b.time instanceof Date ? b.time.getTime() : b.time
    return timeA - timeB
  })
}

export function validateTimeOrder<T extends { time: string }>(data: T[]): boolean {
  for (let i = 1; i < data.length; i++) {
    const prev = new Date(data[i - 1].time).getTime()
    const curr = new Date(data[i].time).getTime()
    if (curr < prev) {
      console.warn(`[Timestamp] Time order violation at index ${i}: ${data[i - 1].time} > ${data[i].time}`)
      return false
    }
  }
  return true
}
