import { Point3D, TopologyPath } from '../types'
import { SceneLoader } from './SceneLoader'

export interface RoamingWaypoint {
  position: Point3D
  lookAt?: Point3D
  duration: number
  pauseTime: number
}

export interface RoamingPath {
  id: string
  name: string
  waypoints: RoamingWaypoint[]
  totalDuration: number
}

export interface RoamingState {
  isPlaying: boolean
  isPaused: boolean
  currentWaypointIndex: number
  progress: number
  currentPosition: Point3D
  speed: number
  loop: boolean
}

export class PathRoaming {
  private sceneLoader: SceneLoader
  private roamingPaths: Map<string, RoamingPath> = new Map()
  private currentPathId: string | null = null
  private currentState: RoamingState | null = null
  private animationFrameId: number | null = null
  private lastTime: number = 0
  private waypointPauseTimer: number = 0
  private onStateChangeCallback: ((state: RoamingState | null) => void | null = null
  private onWaypointReachedCallback: ((index: number, waypoint: RoamingWaypoint) => void | null = null
  private onPathCompleteCallback: ((pathId: string) => void | null = null

  constructor(sceneLoader: SceneLoader) {
    this.sceneLoader = sceneLoader
    this.initializeDefaultPaths()
  }

  private initializeDefaultPaths() {
    const mainPipelinePath: RoamingPath = {
      id: 'main_pipeline',
      name: '主管线巡检路径',
      waypoints: [
      { position: { x: 0, y: 15, z: 50 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 5000, pauseTime: 2000 },
      { position: { x: 30, y: 15, z: 30 }, lookAt: { x: 25, y: 0, z: 0 }, duration: 4000, pauseTime: 1500 },
      { position: { x: 50, y: 12, z: 10 }, lookAt: { x: 45, y: 0, z: 0 }, duration: 4000, pauseTime: 1500 },
      { position: { x: 40, y: 15, z: -20 }, lookAt: { x: 35, y: 0, z: 0 }, duration: 4500, pauseTime: 2000 },
      { position: { x: 10, y: 18, z: -40 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 4000, pauseTime: 2000 },
      { position: { x: -20, y: 15, z: -30 }, lookAt: { x: -15, y: 0, z: 0 }, duration: 4000, pauseTime: 1500 },
      { position: { x: -40, y: 15, z: -10 }, lookAt: { x: -35, y: 0, z: 0 }, duration: 4000, pauseTime: 2000 },
      { position: { x: 0, y: 20, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 5000, pauseTime: 3000 }
    ],
    totalDuration: 0
  }

  const equipmentAreaPath: RoamingPath = {
    id: 'equipment_area',
    name: '设备区巡检路径',
    waypoints: [
      { position: { x: 0, y: 18, z: 60 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 3000, pauseTime: 2000 },
      { position: { x: 25, y: 15, z: 45 }, lookAt: { x: 20, y: 0, z: 30 }, duration: 3500, pauseTime: 1500 },
      { position: { x: 35, y: 12, z: 25 }, lookAt: { x: 30, y: 0, z: 20 }, duration: 3500, pauseTime: 2500 },
      { position: { x: 20, y: 18, z: 5 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 3000, pauseTime: 2000 },
      { position: { x: -15, y: 15, z: 45 }, lookAt: { x: -10, y: 0, z: 40 }, duration: 3500, pauseTime: 1500 },
      { position: { x: -30, y: 12, z: 30 }, lookAt: { x: -25, y: 0, z: 25 }, duration: 3500, pauseTime: 2500 },
      { position: { x: 0, y: 20, z: 40 }, lookAt: { x: 0, y: 0, z: 0 }, duration: 4000, pauseTime: 3000 }
    ],
    totalDuration: 0
  }

  this.roamingPaths.set(mainPipelinePath.id, mainPipelinePath)
  this.roamingPaths.set(equipmentAreaPath.id, equipmentAreaPath)
  }

  public getAvailablePaths(): Array<{ id: string; name: string }> {
    return Array.from(this.roamingPaths.values()).map(p => ({
      id: p.id,
      name: p.name
    }))
  }

  public startRoaming(pathId: string, loop: boolean = false): boolean {
    const path = this.roamingPaths.get(pathId)
    if (!path || path.waypoints.length < 2) {
      return false
    }

    this.stopRoaming()
    this.currentPathId = pathId

    this.currentState = {
      isPlaying: true,
      isPaused: false,
      currentWaypointIndex: 0,
      progress: 0,
      currentPosition: { ...path.waypoints[0].position },
      speed: 1,
      loop
    }

    this.sceneLoader.setControlsEnabled(false)
    this.sceneLoader.setCameraPosition(path.waypoints[0].position)
    
    if (path.waypoints[0].lookAt) {
      this.sceneLoader.setCameraLookAt(path.waypoints[0].lookAt)
    }

    this.waypointPauseTimer = path.waypoints[0].pauseTime
    this.lastTime = performance.now()
    this.animate()
    this.notifyStateChange()

    return true
  }

  public stopRoaming() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.currentState = null
    this.currentPathId = null
    this.sceneLoader.setControlsEnabled(true)
    this.notifyStateChange()
  }

  public pauseRoaming() {
    if (this.currentState && this.currentState.isPlaying) {
      this.currentState.isPaused = true
      this.notifyStateChange()
    }
  }

  public resumeRoaming() {
    if (this.currentState && this.currentState.isPaused) {
      this.currentState.isPaused = false
      this.lastTime = performance.now()
      this.animate()
      this.notifyStateChange()
    }
  }

  public setSpeed(speed: number) {
    if (this.currentState) {
      this.currentState.speed = Math.max(0.25, Math.min(4, speed))
      this.notifyStateChange()
    }
  }

  public getState(): RoamingState | null {
    return this.currentState
  }

  public getCurrentPath(): RoamingPath | null {
    return this.currentPathId ? this.roamingPaths.get(this.currentPathId) ?? null : null
  }

  public addCustomPath(path: RoamingPath) {
    this.roamingPaths.set(path.id, path)
  }

  public removePath(pathId: string) {
    if (this.currentPathId === pathId) {
      this.stopRoaming()
    }
    this.roamingPaths.delete(pathId)
  }

  private animate = () => {
    if (!this.currentState || !this.currentState.isPlaying || this.currentState.isPaused) {
      return
    }

    const path = this.roamingPaths.get(this.currentPathId!)
    if (!path) {
      this.stopRoaming()
      return
    }

    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastTime) * this.currentState.speed
    this.lastTime = currentTime

    if (this.waypointPauseTimer > 0) {
      this.waypointPauseTimer -= deltaTime
      if (this.waypointPauseTimer = 0) {
        this.currentState.currentWaypointIndex++
        if (this.currentState.currentWaypointIndex >= path.waypoints.length) {
          if (this.currentState.loop) {
            this.currentState.currentWaypointIndex = 0
            this.waypointPauseTimer = path.waypoints[0].pauseTime
          } else {
            this.onPathCompleteCallback?.(this.currentPathId!)
            this.stopRoaming()
            return
          }
        }
        this.notifyWaypointReached()
      }
      this.animationFrameId = requestAnimationFrame(this.animate)
      return
    }

    const currentIndex = this.currentState.currentWaypointIndex
    const nextIndex = (currentIndex + 1) % path.waypoints.length
    const currentWaypoint = path.waypoints[currentIndex]
    const nextWaypoint = path.waypoints[nextIndex]

    const distance = this.calculateDistance(
      currentWaypoint.position,
      nextWaypoint.position
    )

    const progressDelta = (deltaTime / currentWaypoint.duration) * this.currentState.speed
    this.currentState.progress = Math.min(1, this.currentState.progress + progressDelta)

    const newPosition = this.interpolatePosition(
      currentWaypoint.position,
      nextWaypoint.position,
      this.currentState.progress
    )

    this.currentState.currentPosition = newPosition
    this.sceneLoader.setCameraPosition(newPosition)

    if (nextWaypoint.lookAt) {
      this.sceneLoader.setCameraLookAt(nextWaypoint.lookAt)
    } else if (currentWaypoint.lookAt) {
      this.sceneLoader.setCameraLookAt(currentWaypoint.lookAt)
    }

    if (this.currentState.progress >= 1) {
      this.currentState.progress = 0
      this.waypointPauseTimer = nextWaypoint.pauseTime
      this.notifyWaypointReached()
    }

    this.notifyStateChange()
    this.animationFrameId = requestAnimationFrame(this.animate)
  }

  private calculateDistance(a: Point3D, b: Point3D): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  private interpolatePosition(
    start: Point3D,
    end: Point3D,
    progress: number
  ): Point3D {
    const easeProgress = this.easeInOutCubic(progress)
    return {
      x: start.x + (end.x - start.x) * easeProgress,
      y: start.y + (end.y - start.y) * easeProgress,
      z: start.z + (end.z - start.z) * easeProgress
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  private notifyWaypointReached() {
    if (!this.currentState) {
      return
    }
    const path = this.roamingPaths.get(this.currentPathId!)
    if (!path) {
      return
    }
    const waypoint = path.waypoints[this.currentState.currentWaypointIndex]
    this.onWaypointReachedCallback?.(this.currentState.currentWaypointIndex, waypoint)
  }

  private notifyStateChange() {
    this.onStateChangeCallback?.(this.currentState)
  }

  public setOnStateChangeCallback(callback: (state: RoamingState | null) => void) {
    this.onStateChangeCallback = callback
  }

  public setOnWaypointReachedCallback(callback: (index: number, waypoint: RoamingWaypoint) => void) {
    this.onWaypointReachedCallback = callback
  }

  public setOnPathCompleteCallback(callback: (pathId: string) => void) {
    this.onPathCompleteCallback = callback
  }

  public createPathFromDevices(deviceIds: string[], name: string): string {
    const pathId = `custom_${Date.now()}`
    const waypoints: RoamingWaypoint[] = []

    const cameraHeight = 15
    const duration = 3000
    const pauseTime = 1500

    deviceIds.forEach((deviceId, index) => {
      const device = this.sceneLoader.getDeviceById(deviceId)
      if (device) {
        waypoints.push({
          position: {
            x: device.position.x,
            y: device.position.y + cameraHeight,
            z: device.position.z
          },
          lookAt: { ...device.position },
          duration,
          pauseTime: index === 0 ? 2000 : pauseTime
        })
      }
    })

    if (waypoints.length >= 2) {
      const path: RoamingPath = {
        id: pathId,
        name: name || `自定义路径_${Date.now()}`,
        waypoints,
        totalDuration: 0
      }
      this.roamingPaths.set(pathId, path)
      return pathId
    }

    return ''
  }

  public getProgress(): { id: string; name: string } | null {
    if (!this.currentState) {
      return null
    }
    const path = this.getCurrentPath()
    if (!path) {
      return null
    }
    return { id: path.id, name: path.name }
  }
}
