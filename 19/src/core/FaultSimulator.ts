import { Pipeline, Device, TopologyPath } from '../types'
import { TopologyCalculator } from './TopologyCalculator'

export type FaultType = 'leak' | 'blockage' | 'burst' | 'pressure_loss' | 'contamination'

export interface FaultEvent {
  id: string
  type: FaultType
  pipelineId: string
  severity: number
  startTime: number
  duration: number
  affectedArea: number
  description: string
}

export interface FaultConsequence {
  affectedPipelines: string[]
  affectedDevices: string[]
  isolationPoint: string | null
  affectedArea: number
  estimatedRepairTime: number
}

export interface SimulationResult {
  fault: FaultEvent
  consequences: FaultConsequence
  timeline: Array<{
    time: number
    event: string
    affectedPipelines?: string[]
    affectedDevices?: string[]
  }>
  recommendedActions: string[]
}

export class FaultSimulator {
  private topologyCalculator: TopologyCalculator
  private pipelines: Map<string, Pipeline> = new Map()
  private devices: Map<string, Device> = new Map()
  private activeFaults: Map<string, FaultEvent> = new Map()
  private onFaultUpdateCallback: ((faults: FaultEvent[]) => void) | null = null
  private onConsequenceUpdateCallback: ((consequences: FaultConsequence[]) => void) | null = null

  constructor(topologyCalculator: TopologyCalculator) {
    this.topologyCalculator = topologyCalculator
  }

  public setData(pipelines: Pipeline[], devices: Device[]) {
    this.pipelines.clear()
    this.devices.clear()
    pipelines.forEach(p => this.pipelines.set(p.id, p))
    devices.forEach(d => this.devices.set(d.id, d))
  }

  public createFault(
    pipelineId: string,
    type: FaultType,
    severity: number = 0.5
  ): FaultEvent {
    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`)
    }

    const faultDescriptions: Record<FaultType, string> = {
      leak: '管线泄漏',
      blockage: '管线堵塞',
      burst: '管线爆裂',
      pressure_loss: '压力损失',
      contamination: '介质污染'
    }

    const fault: FaultEvent = {
      id: `fault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      pipelineId,
      severity,
      startTime: Date.now(),
      duration: this.calculateEstimatedDuration(type, severity),
      affectedArea: this.calculateAffectedArea(type, severity),
      description: `${pipeline.name}发生${faultDescriptions[type]}`
    }

    this.activeFaults.set(fault.id, fault)
    this.notifyFaultUpdate()

    return fault
  }

  private calculateEstimatedDuration(type: FaultType, severity: number): number {
    const baseDurations: Record<FaultType, number> = {
      leak: 1800000,
      blockage: 3600000,
      burst: 7200000,
      pressure_loss: 1200000,
      contamination: 5400000
    }
    return baseDurations[type] * (0.5 + severity * 0.5)
  }

  private calculateAffectedArea(type: FaultType, severity: number): number {
    const baseAreas: Record<FaultType, number> = {
      leak: 50,
      blockage: 80,
      burst: 200,
      pressure_loss: 100,
      contamination: 150
    }
    return baseAreas[type] * (0.3 + severity * 0.7)
  }

  public simulateFault(faultId: string): SimulationResult {
    const fault = this.activeFaults.get(faultId)
    if (!fault) {
      throw new Error(`Fault ${faultId} not found`)
    }

    const pipeline = this.pipelines.get(fault.pipelineId)
    if (!pipeline) {
      throw new Error(`Pipeline ${fault.pipelineId} not found`)
    }

    const consequences = this.calculateConsequences(fault)
    const timeline = this.buildTimeline(fault, consequences)
    const recommendedActions = this.generateRecommendations(fault, consequences)

    const result: SimulationResult = {
      fault,
      consequences,
      timeline,
      recommendedActions
    }

    this.notifyConsequenceUpdate([consequences])

    return result
  }

  private calculateConsequences(fault: FaultEvent): FaultConsequence {
    const pipeline = this.pipelines.get(fault.pipelineId)
    if (!pipeline) {
      return {
        affectedPipelines: [],
        affectedDevices: [],
        isolationPoint: null,
        affectedArea: 0,
        estimatedRepairTime: 0
      }
    }

    const connections = this.topologyCalculator.getPipelineConnections(fault.pipelineId)
    const affectedPipelines = new Set<string>([fault.pipelineId])
    const affectedDevices = new Set<string>()

    const exploreDownstream = (startPipelineId: string, visited: Set<string>) => {
      if (visited.has(startPipelineId)) return
      visited.add(startPipelineId)

      const connections = this.topologyCalculator.getPipelineConnections(startPipelineId)
      
      if (connections.endDevice) {
        affectedDevices.add(connections.endDevice)
        const device = this.devices.get(connections.endDevice)
        if (device) {
          device.connectedPipelines.forEach(pid => {
            if (pid !== startPipelineId && !affectedPipelines.has(pid)) {
              affectedPipelines.add(pid)
              exploreDownstream(pid, visited)
            }
          })
        }
      }

      if (connections.startDevice) {
        const device = this.devices.get(connections.startDevice)
        if (device) {
          const neighbors = this.topologyCalculator.getDeviceConnections(connections.startDevice)
          neighbors.connectedDevices.forEach(did => {
            if (!affectedDevices.has(did)) {
              affectedDevices.add(did)
            }
          })
        }
      }
    }

    exploreDownstream(fault.pipelineId, new Set())

    const allPipelines = this.topologyCalculator.getAllNodes()
    const faultNode = allPipelines.find(
      n => n.position.x === pipeline.startPoint.x && 
           n.position.y === pipeline.startPoint.y && 
           n.position.z === pipeline.startPoint.z
    )

    const isolationPoint = this.findIsolationPoint(fault.pipelineId, fault.type)

    return {
      affectedPipelines: Array.from(affectedPipelines),
      affectedDevices: Array.from(affectedDevices),
      isolationPoint,
      affectedArea: fault.affectedArea,
      estimatedRepairTime: fault.duration
    }
  }

  private findIsolationPoint(pipelineId: string, faultType: FaultType): string | null {
    const connections = this.topologyCalculator.getPipelineConnections(pipelineId)
    
    const checkDevice = (deviceId: string | null): string | null => {
      if (!deviceId) return null
      const device = this.devices.get(deviceId)
      if (device && (device.type === 'valve' || device.type === 'pump')) {
        return deviceId
      }
      return null
    }

    return checkDevice(connections.startDevice) || checkDevice(connections.endDevice)
  }

  private buildTimeline(fault: FaultEvent, consequences: FaultConsequence): Array<{
    time: number
    event: string
    affectedPipelines?: string[]
    affectedDevices?: string[]
  }> {
    const timeline: Array<{
      time: number
      event: string
      affectedPipelines?: string[]
      affectedDevices?: string[]
    }> = []

    const startTime = fault.startTime

    timeline.push({
      time: startTime,
      event: `检测到故障: ${fault.description}`
    })

    const detectionTime = startTime + 5 * 60 * 1000
    timeline.push({
      time: detectionTime,
      event: '系统自动检测并上报故障',
      affectedPipelines: [fault.pipelineId]
    })

    if (consequences.isolationPoint) {
      const isolationTime = detectionTime + 10 * 60 * 1000
      timeline.push({
        time: isolationTime,
        event: `建议关闭阀门: ${consequences.isolationPoint} 隔离故障区域`
      })
    }

    if (consequences.affectedPipelines.length > 1) {
      const spreadTime = startTime + 15 * 60 * 1000
      timeline.push({
        time: spreadTime,
        event: `故障影响扩散到 ${consequences.affectedPipelines.length} 条管线`,
        affectedPipelines: consequences.affectedPipelines
      })
    }

    if (consequences.affectedDevices.length > 0) {
      const deviceImpactTime = startTime + 20 * 60 * 1000
      timeline.push({
        time: deviceImpactTime,
        event: `${consequences.affectedDevices.length} 个设备受到影响`,
        affectedDevices: consequences.affectedDevices
      })
    }

    const repairStartTime = startTime + 30 * 60 * 1000
    timeline.push({
      time: repairStartTime,
      event: '维修人员抵达现场开始修复'
    })

    const repairCompleteTime = startTime + fault.duration
    timeline.push({
      time: repairCompleteTime,
      event: '预计修复完成时间'
    })

    return timeline
  }

  private generateRecommendations(fault: FaultEvent, consequences: FaultConsequence): string[] {
    const recommendations: string[] = []

    if (consequences.isolationPoint) {
      recommendations.push(`立即关闭阀门 ${consequences.isolationPoint} 隔离故障区域`)
    }

    const actionMap: Record<FaultType, string[]> = {
      leak: ['启动备用泵维持系统压力', '通知维修部门进行补漏', '监控泄漏点周边压力变化'],
      blockage: ['启用旁通管线', '派遣疏通设备前往现场', '降低上游流量防止压力过高'],
      burst: ['紧急关闭上下游阀门', '启动应急预案疏散人员', '通知消防和安全部门'],
      pressure_loss: ['检查上游供压设备状态', '排查管线泄漏点', '启动备用增压设备'],
      contamination: ['隔离受污染管段', '通知质检部门采样分析', '启动冲洗和消毒程序']
    }

    recommendations.push(...actionMap[fault.type])

    if (consequences.affectedDevices.length > 0) {
      recommendations.push(`评估 ${consequences.affectedDevices.length} 个受影响设备的状态`)
    }

    recommendations.push(`预计修复时间: ${Math.round(fault.duration / 3600000)} 小时`)

    return recommendations
  }

  public clearFault(faultId: string) {
    if (this.activeFaults.has(faultId)) {
      this.activeFaults.delete(faultId)
      this.notifyFaultUpdate()
    }
  }

  public clearAllFaults() {
    this.activeFaults.clear()
    this.notifyFaultUpdate()
  }

  public getActiveFaults(): FaultEvent[] {
    return Array.from(this.activeFaults.values())
  }

  public getFaultById(faultId: string): FaultEvent | undefined {
    return this.activeFaults.get(faultId)
  }

  public getFaultPipelineIds(): string[] {
    return Array.from(this.activeFaults.values()).map(f => f.pipelineId)
  }

  public setOnFaultUpdateCallback(callback: (faults: FaultEvent[]) => void) {
    this.onFaultUpdateCallback = callback
  }

  public setOnConsequenceUpdateCallback(callback: (consequences: FaultConsequence[]) => void) {
    this.onConsequenceUpdateCallback = callback
  }

  private notifyFaultUpdate() {
    if (this.onFaultUpdateCallback) {
      this.onFaultUpdateCallback(this.getActiveFaults())
    }
  }

  private notifyConsequenceUpdate(consequences: FaultConsequence[]) {
    if (this.onConsequenceUpdateCallback) {
      this.onConsequenceUpdateCallback(consequences)
    }
  }

  public getFaultTypeLabel(type: FaultType): string {
    const labels: Record<FaultType, string> = {
      leak: '泄漏',
      blockage: '堵塞',
      burst: '爆裂',
      pressure_loss: '压力损失',
      contamination: '污染'
    }
    return labels[type]
  }

  public getFaultSeverityColor(severity: number): string {
    if (severity >= 0.8) return '#ef4444'
    if (severity >= 0.5) return '#f59e0b'
    return '#22c55e'
  }

  public calculateAffectedPaths(pipelineId: string): TopologyPath[] {
    const paths: TopologyPath[] = []
    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) return paths

    const connections = this.topologyCalculator.getPipelineConnections(pipelineId)
    const startDevice = connections.startDevice
    const endDevice = connections.endDevice

    if (startDevice && endDevice) {
      const path = this.topologyCalculator.findShortestPath(startDevice, endDevice)
      if (path) paths.push(path)
    }

    return paths
  }
}
