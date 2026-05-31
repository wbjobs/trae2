import request from './request'
import type { SignalingMessage, TraceQueryParams, PaginatedResult, ThroughputData, SignalingDistribution } from '@/types'

function convertTimestampToNumber(message: any): SignalingMessage {
  return {
    ...message,
    timestamp: typeof message.timestamp === 'string' 
      ? new Date(message.timestamp).getTime() 
      : Number(message.timestamp)
  }
}

function convertMessagesTimestamps(messages: any[]): SignalingMessage[] {
  return messages.map(convertTimestampToNumber)
}

export const signalingApi = {
  async getRealtimeMessages(): Promise<SignalingMessage[]> {
    const data = await request.get('/realtime')
    return convertMessagesTimestamps(Array.isArray(data) ? data : [])
  },

  async queryTrace(params: TraceQueryParams): Promise<PaginatedResult<SignalingMessage>> {
    const body: Record<string, any> = {}
    if (params.startTime) body.startTime = params.startTime
    if (params.endTime) body.endTime = params.endTime
    if (params.deviceId) body.deviceId = params.deviceId
    if (params.signalingTypes?.length === 1) body.signalingType = params.signalingTypes[0]
    if (params.status) body.protocol = params.status
    if (params.page !== undefined && params.pageSize !== undefined) {
      body.limit = params.pageSize
      body.offset = (params.page - 1) * params.pageSize
    }
    const result = await request.post('/trace', body)
    return {
      ...result,
      data: convertMessagesTimestamps(Array.isArray(result.data) ? result.data : [])
    }
  },

  getMetrics(interval: string = '1m', startTime?: string, endTime?: string): Promise<ThroughputData[]> {
    return request.get('/metrics', { params: { interval, startTime, endTime } })
  },

  getTypeDistribution(): Promise<SignalingDistribution[]> {
    return request.get('/types')
  },

  async getSignalingDetail(id: string): Promise<SignalingMessage> {
    const data = await request.get(`/signaling/${id}`)
    return convertTimestampToNumber(data)
  },

  async searchSignaling(keyword: string, filters?: Record<string, any>): Promise<SignalingMessage[]> {
    const data = await request.post('/search', { keyword, ...filters })
    return convertMessagesTimestamps(Array.isArray(data) ? data : [])
  }
}
