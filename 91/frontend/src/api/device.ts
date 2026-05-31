import request from './request'
import type { Device } from '@/types'

export const deviceApi = {
  getDeviceList(): Promise<Device[]> {
    return request.get('/devices')
  }
}
