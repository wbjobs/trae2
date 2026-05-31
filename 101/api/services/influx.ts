import { InfluxDB, Point } from '@influxdata/influxdb-client'

export class InfluxDBService {
  private client: InfluxDB | null = null
  private writeApi: ReturnType<InfluxDB['getWriteApi']> | null = null
  private queryApi: ReturnType<InfluxDB['getQueryApi']> | null = null
  private useMock: boolean = true

  constructor() {
    this.init()
  }

  private init() {
    try {
      const { InfluxDB } = require('@influxdata/influxdb-client')
      const url = process.env.INFLUXDB_URL || 'http://localhost:8086'
      const token = process.env.INFLUXDB_TOKEN || 'my-token'
      const org = process.env.INFLUXDB_ORG || 'my-org'
      const bucket = process.env.INFLUXDB_BUCKET || 'signal-monitor'

      const client = new InfluxDB({ url, token })
      this.client = client
      this.writeApi = client.getWriteApi(org, bucket)
      this.queryApi = client.getQueryApi(org)
      this.useMock = false
      console.log('[InfluxDB] Connected successfully')
    } catch (e: unknown) {
      console.log('[InfluxDB] Service not available, using mock mode')
      this.useMock = true
    }
  }

  async writePoint(point: Point) {
    if (this.useMock || !this.writeApi) {
      return
    }
    try {
      this.writeApi!.writePoint(point)
      await this.writeApi!.flush()
    } catch (e: unknown) {
      console.error('[InfluxDB] Write error:', e)
    }
  }

  async writePoints(points: Point[]) {
    if (this.useMock || !this.writeApi) {
      return
    }
    try {
      this.writeApi!.writePoints(points)
      await this.writeApi!.flush()
    } catch (e: unknown) {
      console.error('[InfluxDB] Write batch error:', e)
    }
  }

  async query(fluxQuery: string): Promise<any[]> {
    if (this.useMock || !this.queryApi) {
      return []
    }
    try {
      return await this.queryApi!.collectRows(fluxQuery)
    } catch (e: unknown) {
      console.error('[InfluxDB] Query error:', e)
      return []
    }
  }

  isMockMode(): boolean {
    return this.useMock
  }
}

export const influxService = new InfluxDBService()
