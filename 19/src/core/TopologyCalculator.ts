import { Pipeline, Device, TopologyNode, TopologyPath, Point3D } from '../types'

export class TopologyCalculator {
  private pipelines: Map<string, Pipeline> = new Map()
  private devices: Map<string, Device> = new Map()
  private nodes: Map<string, TopologyNode> = new Map()
  private adjacencyList: Map<string, Map<string, number>> = new Map()
  private pipelineConnectionCache: Map<string, { startDevice: string | null; endDevice: string | null }> = new Map()
  private nodePositionCache: Map<string, string> = new Map()
  private readonly POSITION_THRESHOLD = 2.0
  private readonly POSITION_PRECISION = 2

  constructor(pipelines: Pipeline[] = [], devices: Device[] = []) {
    this.setData(pipelines, devices)
  }

  public setData(pipelines: Pipeline[], devices: Device[]) {
    this.pipelines.clear()
    this.devices.clear()
    this.nodes.clear()
    this.adjacencyList.clear()
    this.pipelineConnectionCache.clear()
    this.nodePositionCache.clear()

    pipelines.forEach(p => this.pipelines.set(p.id, p))
    devices.forEach(d => this.devices.set(d.id, d))

    this.buildTopology()
  }

  private buildTopology() {
    this.devices.forEach(device => {
      const node: TopologyNode = {
        id: device.id,
        type: 'device',
        position: device.position,
        connections: []
      }
      this.nodes.set(device.id, node)
      this.adjacencyList.set(device.id, new Map())
      this.nodePositionCache.set(this.getPositionKey(device.position), device.id)
    })

    const junctionMap = new Map<string, string>()
    let junctionCounter = 0

    this.pipelines.forEach(pipeline => {
      const startNodeId = this.findOrCreateJunction(
        pipeline.startPoint,
        junctionMap,
        junctionCounter
      )
      const endNodeId = this.findOrCreateJunction(
        pipeline.endPoint,
        junctionMap,
        junctionCounter
      )

      const distance = this.calculateDistance(pipeline.startPoint, pipeline.endPoint)

      this.addEdge(startNodeId, endNodeId, pipeline.id, distance)
      this.addEdge(endNodeId, startNodeId, pipeline.id, distance)

      this.pipelineConnectionCache.set(pipeline.id, {
        startDevice: this.devices.has(startNodeId) ? startNodeId : null,
        endDevice: this.devices.has(endNodeId) ? endNodeId : null
      })
    })
  }

  private getPositionKey(point: Point3D): string {
    return `${point.x.toFixed(this.POSITION_PRECISION)},${point.y.toFixed(this.POSITION_PRECISION)},${point.z.toFixed(this.POSITION_PRECISION)}`
  }

  private findOrCreateJunction(
    point: Point3D,
    junctionMap: Map<string, string>,
    junctionCounter: number
  ): string {
    const deviceId = this.findDeviceAtPosition(point)
    if (deviceId) {
      return deviceId
    }

    const key = this.getPositionKey(point)
    
    if (junctionMap.has(key)) {
      return junctionMap.get(key)!
    }

    const junctionId = `junction_${junctionCounter++}`
    junctionMap.set(key, junctionId)

    const node: TopologyNode = {
      id: junctionId,
      type: 'junction',
      position: point,
      connections: []
    }
    this.nodes.set(junctionId, node)
    this.adjacencyList.set(junctionId, new Map())

    return junctionId
  }

  private findDeviceAtPosition(point: Point3D): string | null {
    const cachedDevice = this.nodePositionCache.get(this.getPositionKey(point))
    if (cachedDevice && this.devices.has(cachedDevice)) {
      return cachedDevice
    }

    for (const device of this.devices.values()) {
      const distance = this.calculateDistance(point, device.position)
      if (distance < this.POSITION_THRESHOLD) {
        this.nodePositionCache.set(this.getPositionKey(point), device.id)
        return device.id
      }
    }
    return null
  }

  private addEdge(fromId: string, toId: string, pipelineId: string, distance: number) {
    const fromNode = this.nodes.get(fromId)
    if (fromNode && !fromNode.connections.includes(toId)) {
      fromNode.connections.push(toId)
    }

    const adjacency = this.adjacencyList.get(fromId)
    if (adjacency) {
      adjacency.set(toId, distance)
    }
  }

  private calculateDistance(p1: Point3D, p2: Point3D): number {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dz = p2.z - p1.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  public findShortestPath(startId: string, endId: string): TopologyPath | null {
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
      return null
    }

    if (startId === endId) {
      return { startId, endId, pipelineIds: [], distance: 0 }
    }

    const distances = new Map<string, number>()
    const previous = new Map<string, string | null>()
    const unvisited = new Set<string>()

    this.nodes.forEach((_, id) => {
      distances.set(id, Infinity)
      previous.set(id, null)
      unvisited.add(id)
    })

    distances.set(startId, 0)

    while (unvisited.size > 0) {
      let minDistance = Infinity
      let currentId: string | null = null

      for (const id of unvisited) {
        const dist = distances.get(id) || Infinity
        if (dist < minDistance) {
          minDistance = dist
          currentId = id
        }
      }

      if (currentId === null || currentId === endId || minDistance === Infinity) {
        break
      }

      unvisited.delete(currentId)

      const adjacency = this.adjacencyList.get(currentId)
      if (!adjacency) continue

      for (const [neighborId, distance] of adjacency) {
        if (!unvisited.has(neighborId)) continue

        const altDistance = (distances.get(currentId) || 0) + distance
        if (altDistance < (distances.get(neighborId) || Infinity)) {
          distances.set(neighborId, altDistance)
          previous.set(neighborId, currentId)
        }
      }
    }

    if ((distances.get(endId) || Infinity) === Infinity) {
      return null
    }

    const pipelineIds: string[] = []
    let currentId: string | null = endId
    const visited = new Set<string>()

    while (currentId !== null && currentId !== startId && !visited.has(currentId)) {
      visited.add(currentId)
      const prevId = previous.get(currentId)
      if (prevId) {
        const pipelineId = this.findPipelineBetween(prevId, currentId)
        if (pipelineId && !pipelineIds.includes(pipelineId)) {
          pipelineIds.unshift(pipelineId)
        }
      }
      currentId = prevId || null
    }

    return {
      startId,
      endId,
      pipelineIds,
      distance: distances.get(endId) || 0
    }
  }

  private findPipelineBetween(nodeId1: string, nodeId2: string): string | null {
    const node1 = this.nodes.get(nodeId1)
    const node2 = this.nodes.get(nodeId2)
    
    if (!node1 || !node2) return null

    for (const pipeline of this.pipelines.values()) {
      const startDist1 = this.calculateDistance(pipeline.startPoint, node1.position)
      const endDist1 = this.calculateDistance(pipeline.endPoint, node1.position)
      const startDist2 = this.calculateDistance(pipeline.startPoint, node2.position)
      const endDist2 = this.calculateDistance(pipeline.endPoint, node2.position)

      if ((startDist1 < this.POSITION_THRESHOLD && endDist2 < this.POSITION_THRESHOLD) || 
          (startDist2 < this.POSITION_THRESHOLD && endDist1 < this.POSITION_THRESHOLD)) {
        return pipeline.id
      }
    }

    return null
  }

  public getConnectedComponents(): string[][] {
    const visited = new Set<string>()
    const components: string[][] = []

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const component = this.bfs(nodeId, visited)
        if (component.length > 1) {
          components.push(component)
        }
      }
    }

    return components
  }

  private bfs(startId: string, visited: Set<string>): string[] {
    const queue = [startId]
    const component: string[] = []

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue

      visited.add(currentId)
      component.push(currentId)

      const node = this.nodes.get(currentId)
      if (node) {
        for (const connId of node.connections) {
          if (!visited.has(connId)) {
            queue.push(connId)
          }
        }
      }
    }

    return component
  }

  public getDeviceConnections(deviceId: string): {
    connectedDevices: string[]
    connectedPipelines: string[]
  } {
    const device = this.devices.get(deviceId)
    if (!device) {
      return { connectedDevices: [], connectedPipelines: [] }
    }

    const node = this.nodes.get(deviceId)
    if (!node) {
      return { connectedDevices: [], connectedPipelines: device.connectedPipelines }
    }

    const connectedDevices: string[] = []
    const visited = new Set<string>()

    const findConnectedDevices = (nodeId: string, depth: number = 0) => {
      if (depth > 10 || visited.has(nodeId)) return
      visited.add(nodeId)

      const currentNode = this.nodes.get(nodeId)
      if (!currentNode) return

      for (const connId of currentNode.connections) {
        if (this.devices.has(connId) && connId !== deviceId && !connectedDevices.includes(connId)) {
          connectedDevices.push(connId)
        }
        if (!this.devices.has(connId)) {
          findConnectedDevices(connId, depth + 1)
        }
      }
    }

    findConnectedDevices(deviceId)

    return {
      connectedDevices,
      connectedPipelines: device.connectedPipelines
    }
  }

  public getPipelineConnections(pipelineId: string): {
    startDevice: string | null
    endDevice: string | null
  } {
    const cached = this.pipelineConnectionCache.get(pipelineId)
    if (cached) {
      return cached
    }

    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) {
      return { startDevice: null, endDevice: null }
    }

    const startDevice = this.findDeviceAtPosition(pipeline.startPoint)
    const endDevice = this.findDeviceAtPosition(pipeline.endPoint)
    
    const result = { startDevice, endDevice }
    this.pipelineConnectionCache.set(pipelineId, result)
    return result
  }

  public getAllNodes(): TopologyNode[] {
    return Array.from(this.nodes.values())
  }

  public getDeviceNodes(): TopologyNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === 'device')
  }

  public getJunctionNodes(): TopologyNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === 'junction')
  }

  public calculatePipelineLength(pipelineId: string): number {
    const pipeline = this.pipelines.get(pipelineId)
    if (!pipeline) return 0
    return this.calculateDistance(pipeline.startPoint, pipeline.endPoint)
  }

  public getNetworkStats(): {
    totalPipelines: number
    totalDevices: number
    totalNodes: number
    totalLength: number
    connectedComponents: number
  } {
    let totalLength = 0
    for (const p of this.pipelines.values()) {
      totalLength += this.calculateDistance(p.startPoint, p.endPoint)
    }

    return {
      totalPipelines: this.pipelines.size,
      totalDevices: this.devices.size,
      totalNodes: this.nodes.size,
      totalLength,
      connectedComponents: this.getConnectedComponents().length
    }
  }

  public findIsolatedDevices(): string[] {
    const isolated: string[] = []
    
    for (const deviceId of this.devices.keys()) {
      const node = this.nodes.get(deviceId)
      if (!node || node.connections.length === 0) {
        isolated.push(deviceId)
      }
    }

    return isolated
  }

  public findReachableDevices(startDeviceId: string): string[] {
    const visited = new Set<string>()
    const reachable: string[] = []
    const queue = [startDeviceId]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue

      visited.add(currentId)
      
      if (currentId !== startDeviceId && this.devices.has(currentId)) {
        reachable.push(currentId)
      }

      const node = this.nodes.get(currentId)
      if (node) {
        for (const connId of node.connections) {
          if (!visited.has(connId)) {
            queue.push(connId)
          }
        }
      }
    }

    return reachable
  }

  public hasConnection(deviceId1: string, deviceId2: string): boolean {
    const reachable = this.findReachableDevices(deviceId1)
    return reachable.includes(deviceId2)
  }

  public getNodeById(nodeId: string): TopologyNode | undefined {
    return this.nodes.get(nodeId)
  }

  public getPipelineById(pipelineId: string): Pipeline | undefined {
    return this.pipelines.get(pipelineId)
  }

  public getDeviceById(deviceId: string): Device | undefined {
    return this.devices.get(deviceId)
  }

  public getAdjacencyList(): Map<string, Map<string, number>> {
    return new Map(this.adjacencyList)
  }

  public clearCache() {
    this.pipelineConnectionCache.clear()
    this.nodePositionCache.clear()
  }
}
